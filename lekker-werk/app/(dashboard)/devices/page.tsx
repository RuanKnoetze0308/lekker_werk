import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/dashboard/ui";
import { DEVICE_KIND_LABEL } from "@/lib/device-labels";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/time";
import { requirePageContext } from "@/server/auth/guards";
import { listDevices } from "@/server/devices/device.service";
import { listLocations } from "@/server/services/location.service";
import { AddDeviceButton, DeviceActions } from "./_components/DeviceForms";

export const metadata = { title: "Clock devices · LekkerWerk" };

const MODE_LABEL = {
  CLOCK_IN: "In only",
  CLOCK_OUT: "Out only",
  BREAK_START: "Break start",
  BREAK_END: "Break end",
} as const;

export default async function DevicesPage() {
  const ctx = await requirePageContext("devices:manage");
  const [devices, locations] = await Promise.all([listDevices(ctx), listLocations(ctx)]);

  return (
    <>
      <PageHeader
        title="Clock devices"
        description="RFID and NFC readers, biometric scanners and kiosks. Each device is tied to one location and has its own API key; employees identify themselves with the card, tag, PIN or fingerprint issued on their profile."
        actions={<AddDeviceButton locations={locations.map((l) => ({ id: l.id, name: l.name }))} />}
      />

      <Card flush>
        {devices.length === 0 ? (
          <EmptyState
            title="No devices yet"
            hint="Add a device, then give its API key to the installer. Any terminal that can send an HTTPS request works."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Device</Th>
                <Th>Location</Th>
                <Th>Mode</Th>
                <Th>Status</Th>
                <Th>Last seen</Th>
                <Th className="text-right">Punches (24h)</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id}>
                  <Td>
                    <p className="font-medium">{d.name}</p>
                    <p className="text-xs text-muted">
                      {DEVICE_KIND_LABEL[d.kind]} · key {d.keyHint}…{d.serialNumber ? ` · S/N ${d.serialNumber}` : ""}
                    </p>
                  </Td>
                  <Td>{d.locationName}</Td>
                  <Td className="text-muted">{d.fixedAction ? MODE_LABEL[d.fixedAction] : "Tap in / tap out"}</Td>
                  <Td>
                    {!d.enabled ? (
                      <Badge tone="red">disabled</Badge>
                    ) : d.online ? (
                      <Badge tone="green">online</Badge>
                    ) : (
                      <Badge tone="gray">{d.lastSeenAt ? "offline" : "never connected"}</Badge>
                    )}
                  </Td>
                  <Td className="text-muted">{d.lastSeenAt ? formatDateTime(d.lastSeenAt, d.timezone) : "—"}</Td>
                  <Td className="text-right">{d.punches24h}</Td>
                  <Td className="text-right">
                    <DeviceActions id={d.id} name={d.name} enabled={d.enabled} canSimulate={env.simulatorsEnabled} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="Connecting a device" className="mt-6">
        <div className="flex flex-col gap-3 text-sm text-muted">
          <p>
            Terminals send each tap to{" "}
            <code className="rounded bg-soft-surface px-1.5 py-0.5 text-ink">
              POST {env.appUrl}/api/device/v1/punches
            </code>{" "}
            with the header{" "}
            <code className="rounded bg-soft-surface px-1.5 py-0.5 text-ink">
              Authorization: Bearer &lt;device key&gt;
            </code>
            . A device that was offline sends its stored taps in one batch, with the time each one happened.
          </p>
          <pre className="overflow-x-auto rounded-[12px] bg-ink p-4 text-xs leading-relaxed text-white">{`{
  "punches": [
    { "punchId": "reader7-000123", "credential": { "kind": "RFID_CARD", "value": "04A21F9C" },
      "capturedAt": "2026-10-10T06:58:12Z" }
  ]
}`}</pre>
          <p>Full reference: docs/api/API_CATALOG.md → Device API.</p>
        </div>
      </Card>
    </>
  );
}
