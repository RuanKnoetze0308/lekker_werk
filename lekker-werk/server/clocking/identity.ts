import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { communicationAccounts, employeeCredentials } from "@/db/schema";
import { hashCredential } from "../devices/credential-hash";
import type { ClockIdentity, RejectionReasonCode } from "./types";

export interface ResolvedIdentity {
  employeeId: string;
  communicationAccountId: string | null;
  credentialId: string | null;
}

type Resolver<K extends ClockIdentity["kind"]> = (
  companyId: string,
  identity: Extract<ClockIdentity, { kind: K }>,
) => Promise<ResolvedIdentity | RejectionReasonCode>;

/**
 * One resolver per identity kind. Every resolver is tenant-scoped: an identity can only ever
 * resolve to an employee of the company the request was authenticated for.
 */
const resolvers: { [K in ClockIdentity["kind"]]: Resolver<K> } = {
  async EMPLOYEE(_companyId, identity) {
    // Company ownership is checked by the engine right after (it loads the employee anyway).
    return { employeeId: identity.employeeId, communicationAccountId: null, credentialId: null };
  },

  async CHAT(companyId, identity) {
    const [acct] = await db
      .select({ id: communicationAccounts.id, employeeId: communicationAccounts.employeeId })
      .from(communicationAccounts)
      .where(
        and(
          eq(communicationAccounts.companyId, companyId),
          eq(communicationAccounts.channel, identity.channel),
          eq(communicationAccounts.externalId, identity.externalId),
          isNull(communicationAccounts.revokedAt),
        ),
      );
    if (!acct) return "ACCOUNT_NOT_LINKED";
    return { employeeId: acct.employeeId, communicationAccountId: acct.id, credentialId: null };
  },

  async CREDENTIAL(companyId, identity) {
    const [cred] = await db
      .select({ id: employeeCredentials.id, employeeId: employeeCredentials.employeeId })
      .from(employeeCredentials)
      .where(
        and(
          eq(employeeCredentials.companyId, companyId),
          eq(employeeCredentials.kind, identity.credentialKind),
          eq(employeeCredentials.valueHash, hashCredential(companyId, identity.credentialKind, identity.value)),
          isNull(employeeCredentials.revokedAt),
        ),
      );
    if (!cred) return "CREDENTIAL_UNKNOWN";
    return { employeeId: cred.employeeId, communicationAccountId: null, credentialId: cred.id };
  },
};

export function resolveIdentity(companyId: string, identity: ClockIdentity) {
  const resolve = resolvers[identity.kind] as Resolver<typeof identity.kind>;
  return resolve(companyId, identity as never);
}
