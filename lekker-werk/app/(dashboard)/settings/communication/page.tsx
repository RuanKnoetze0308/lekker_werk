import { Card } from "@/components/dashboard/ui";
import { env } from "@/lib/env";
import { requirePageContext } from "@/server/auth/guards";
import { listChannels } from "@/server/services/company.service";
import { listEmployees } from "@/server/services/employee.service";
import { listLocations } from "@/server/services/location.service";
import { listQrCodes } from "@/server/services/qr.service";
import { ChannelForm } from "../_components/ChannelForm";
import { ChatSimulator } from "../_components/ChatSimulator";

export const metadata = { title: "Communication · LekkerWerk" };

export default async function CommunicationSettingsPage() {
  const ctx = await requirePageContext("settings:manage");
  const channels = await listChannels(ctx);
  const tg = channels.find((c) => c.channel === "TELEGRAM");
  const wa = channels.find((c) => c.channel === "WHATSAPP");

  const sim = env.simulatorsEnabled
    ? await Promise.all([
        listEmployees(ctx, { status: "ACTIVE", page: 1, pageSize: 100 }),
        listQrCodes(ctx),
        listLocations(ctx),
      ])
    : null;

  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {tg && (
          <Card title={`Telegram${tg.isDefault ? " · default" : ""}`}>
            <ChannelForm channel="TELEGRAM" state={tg} />
          </Card>
        )}
        {wa && (
          <Card title={`WhatsApp${wa.isDefault ? " · default" : ""}`}>
            <ChannelForm channel="WHATSAPP" state={wa} />
          </Card>
        )}
      </div>

      {sim && (
        <Card title="Chat simulator" className="mt-6">
          <p className="mb-4 text-sm text-muted">
            Try the employee experience without a phone or a live bot. Messages run through the real Telegram/WhatsApp
            conversation and clock-in logic and are saved like any other clocking. Not available in production.
          </p>
          <ChatSimulator
            employees={sim[0].rows.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName} · ${e.locationName}` }))}
            qrCodes={sim[1]
              .filter((q) => q.enabled)
              .map((q) => {
                const loc = sim[2].find((l) => l.id === q.locationId);
                return {
                  id: q.id,
                  label: q.label,
                  locationName: q.locationName,
                  latitude: loc?.latitude ?? null,
                  longitude: loc?.longitude ?? null,
                };
              })}
          />
        </Card>
      )}
    </>
  );
}
