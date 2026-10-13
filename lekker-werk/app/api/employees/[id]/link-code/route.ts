import { z } from "zod";
import { requireApiContext } from "@/server/auth/guards";
import { generateLinkCode, revokeCommunicationAccount } from "@/server/services/employee.service";
import { listChannels } from "@/server/services/company.service";
import { ok, parseBody, route } from "@/server/http/route";

const body = z.object({ channel: z.enum(["TELEGRAM", "WHATSAPP"]) });

/** Returns the one-time code plus a ready-to-share deep link for the chosen channel. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const ctx = await requireApiContext("employees:write");
  const { channel } = await parseBody(req, body);
  const { code, expiresAt } = await generateLinkCode(ctx, z.uuid().parse((await params).id), channel);

  const ch = (await listChannels(ctx)).find((c) => c.channel === channel);
  const handle = ch?.publicHandle?.replace(/^@/, "");
  const link = !handle
    ? null
    : channel === "TELEGRAM"
      ? `https://t.me/${handle}?start=LINK_${code}`
      : `https://wa.me/${handle.replace(/\D/g, "")}?text=${encodeURIComponent(`LINK ${code}`)}`;
  return ok({ code, expiresAt, link });
});

/** Revoke a linked chat account (employee changed phone, left, etc.). */
export const DELETE = route<{ id: string }>(async (req) => {
  const ctx = await requireApiContext("employees:write");
  const { accountId } = await parseBody(req, z.object({ accountId: z.uuid() }));
  await revokeCommunicationAccount(ctx, accountId);
  return ok({ revoked: true });
});
