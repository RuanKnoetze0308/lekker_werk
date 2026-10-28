/**
 * Grants or revokes LekkerWerk platform access (SUPER_ADMIN: the System portal, every tenant).
 * This is the only way to become a super admin, so it needs database access, not a web login.
 *
 *   npm run platform:admin -- list
 *   npm run platform:admin -- grant you@thewebdaddy.co.za     # the account must already exist
 *   npm run platform:admin -- revoke you@thewebdaddy.co.za    # back to COMPANY_ADMIN, signed out
 *
 * On Railway: `railway run npm run platform:admin -- grant ...` (uses the service's DATABASE_URL).
 */
import { loadEnv } from "./_env";

async function main() {
  loadEnv(".env.local", { optional: true });
  const { eq } = await import("drizzle-orm");
  const { db } = await import("@/db/client");
  const { sessions, users } = await import("@/db/schema");
  const { isPlatformEmail, PLATFORM_EMAIL_DOMAIN } = await import("@/lib/platform");
  const { audit } = await import("@/server/services/audit.service");

  const [command, rawEmail] = process.argv.slice(2);
  const email = rawEmail?.trim().toLowerCase();

  if (command === "list") {
    const rows = await db
      .select({ email: users.email, status: users.status, lastLoginAt: users.lastLoginAt })
      .from(users)
      .where(eq(users.role, "SUPER_ADMIN"));
    for (const r of rows) {
      console.log(`${r.email}  ${r.status}  last login: ${r.lastLoginAt?.toISOString() ?? "never"}`);
    }
    if (!rows.length) console.log("No super admins.");
    return;
  }

  if ((command !== "grant" && command !== "revoke") || !email) {
    console.error("Usage: npm run platform:admin -- list | grant <email> | revoke <email>");
    process.exit(1);
  }

  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    console.error(`No account with email ${email}. Sign up first, then grant.`);
    process.exit(1);
  }

  if (command === "grant") {
    if (!isPlatformEmail(email)) {
      console.error(`Only @${PLATFORM_EMAIL_DOMAIN} accounts can be platform admins.`);
      process.exit(1);
    }
    if (user.role === "SUPER_ADMIN") return console.log(`${email} is already a super admin.`);
    await db.update(users).set({ role: "SUPER_ADMIN" }).where(eq(users.id, user.id));
    await audit({ userId: user.id, companyId: user.companyId }, "platform.promoted", "user", user.id, { from: user.role, via: "cli" });
    console.log(`${email} is now a super admin.`);
    return;
  }

  if (user.role !== "SUPER_ADMIN") return console.log(`${email} is not a super admin.`);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ role: "COMPANY_ADMIN" }).where(eq(users.id, user.id));
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    await audit({ userId: user.id, companyId: user.companyId }, "platform.demoted", "user", user.id, { via: "cli" }, tx);
  });
  console.log(`${email} is no longer a super admin and has been signed out everywhere.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
