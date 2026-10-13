import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { locations, managerLocations, managers, users } from "@/db/schema";
import type { z } from "zod";
import type { userCreateSchema } from "@/lib/schemas/workforce";
import { hashPassword } from "@/lib/crypto";
import { assertCan, type AuthContext } from "../auth/context";
import { Errors } from "../errors";
import { audit } from "./audit.service";

export async function listUsers(ctx: AuthContext) {
  assertCan(ctx, "users:manage");
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(eq(users.companyId, ctx.companyId))
    .orderBy(asc(users.name));
  return rows;
}

export async function listManagerUsers(ctx: AuthContext) {
  assertCan(ctx, "employees:read");
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(
      and(eq(users.companyId, ctx.companyId), eq(users.role, "MANAGER"), eq(users.status, "ACTIVE")),
    )
    .orderBy(asc(users.name));
}

export async function createUser(ctx: AuthContext, input: z.infer<typeof userCreateSchema>) {
  assertCan(ctx, "users:manage");
  const dupe = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email));
  if (dupe.length) throw Errors.conflict("A user with this email already exists.");

  if (input.locationIds.length) {
    const valid = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(inArray(locations.id, input.locationIds), eq(locations.companyId, ctx.companyId)));
    if (valid.length !== input.locationIds.length) throw Errors.invalid("Invalid location selected.");
  }

  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        companyId: ctx.companyId,
        email: input.email,
        name: input.name,
        role: input.role,
        passwordHash,
      })
      .returning({ id: users.id });

    if (input.role === "MANAGER") {
      const [m] = await tx
        .insert(managers)
        .values({ companyId: ctx.companyId, userId: user.id })
        .returning();
      if (input.locationIds.length) {
        await tx.insert(managerLocations).values(
          input.locationIds.map((locationId) => ({
            managerId: m.id,
            locationId,
            companyId: ctx.companyId,
          })),
        );
      }
    }
    await audit(ctx, "user.created", "user", user.id, { role: input.role }, tx);
    return user;
  });
}

export async function setUserStatus(ctx: AuthContext, userId: string, active: boolean) {
  assertCan(ctx, "users:manage");
  if (userId === ctx.userId) throw Errors.invalid("You cannot deactivate your own account.");
  const res = await db
    .update(users)
    .set({ status: active ? "ACTIVE" : "INACTIVE" })
    .where(and(eq(users.id, userId), eq(users.companyId, ctx.companyId)))
    .returning({ id: users.id });
  if (!res.length) throw Errors.notFound("User");
  await audit(ctx, "user.updated", "user", userId, { active });
}
