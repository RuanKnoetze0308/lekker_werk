import { requireApiContext } from "@/server/auth/guards";
import { listNotifications, markAllRead } from "@/server/services/notification.service";
import { ok, route } from "@/server/http/route";

export const GET = route(async () => {
  const ctx = await requireApiContext("dashboard:view");
  return ok(await listNotifications(ctx));
});

export const POST = route(async () => {
  const ctx = await requireApiContext("dashboard:view");
  await markAllRead(ctx);
  return ok({ read: true });
});
