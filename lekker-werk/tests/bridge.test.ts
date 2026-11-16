import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bridgeConfigured, bridgeProvider, signBridgeRequest } from "@/server/integrations/bridge";

const SECRET = "s".repeat(40);

function configure(url = "https://bridge.example.com", secret = SECRET) {
  vi.stubEnv("INTEGRATION_BRIDGE_URL", url);
  vi.stubEnv("INTEGRATION_BRIDGE_SECRET", secret);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("integration bridge", () => {
  it("signs '<timestamp>.<body>' with HMAC-SHA256 (the contract in docs/INTEGRATIONS.md)", () => {
    const expected = createHmac("sha256", "secret").update('1794819000.{"a":1}').digest("hex");
    expect(signBridgeRequest("secret", "1794819000", '{"a":1}')).toBe(expected);
    expect(signBridgeRequest("secret", "1794819001", '{"a":1}')).not.toBe(expected);
  });

  it("is off unless both the URL and the secret are set", () => {
    expect(bridgeConfigured()).toBe(false);
    vi.stubEnv("INTEGRATION_BRIDGE_URL", "https://bridge.example.com");
    expect(bridgeConfigured()).toBe(false);
    configure();
    expect(bridgeConfigured()).toBe(true);
  });

  it("posts a signed request to /v1/{provider}/hours/export and returns the result", async () => {
    configure("https://bridge.example.com/api/");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ accepted: 2, reference: "B-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const payload = {
      periodId: "p1",
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      company: { id: "c1", name: "Acme" },
      lines: [
        { employeeNumber: "E1", employeeName: "A", payCode: "NORMAL", hours: 160, days: 0 },
        { employeeNumber: "E1", employeeName: "A", payCode: "OVERTIME", hours: 4, days: 0 },
      ],
    };
    const out = await bridgeProvider("SAGE").pushHours!({ config: { tenant: "t" }, credentials: { apiKey: "k" } }, payload);
    expect(out).toEqual({ accepted: 2, reference: "B-1" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://bridge.example.com/api/v1/sage/hours/export");
    const headers = init.headers as Record<string, string>;
    const body = String(init.body);
    expect(JSON.parse(body)).toEqual({ config: { tenant: "t" }, credentials: { apiKey: "k" }, export: payload });
    expect(headers["x-lekkerwerk-signature"]).toBe(`sha256=${signBridgeRequest(SECRET, headers["x-lekkerwerk-timestamp"], body)}`);
  });

  it("drops malformed import rows instead of storing them", async () => {
    configure();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            records: [
              { externalRecordId: "1", externalEmployeeRef: "E1", workDate: "2026-11-16", hours: 8 },
              { externalEmployeeRef: "E2", workDate: "16/11/2026", hours: 8 },
              { externalEmployeeRef: "E3", workDate: "2026-11-16", hours: "lots" },
              { workDate: "2026-11-16", hours: 8 },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const rows = await bridgeProvider("SYSPRO").fetchHours!({ config: {}, credentials: {} }, { from: new Date(0), to: new Date() });
    expect(rows).toEqual([{ externalRecordId: "1", externalEmployeeRef: "E1", workDate: "2026-11-16", hours: 8, raw: undefined }]);
  });

  it("passes the backend's message on and maps 401 to a credentials error", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "Sage rejected the API key" }), { status: 401 })));
    await expect(bridgeProvider("SAGE").testConnection({ config: {}, credentials: {} })).rejects.toMatchObject({
      status: 401,
      code: "INTEGRATION_AUTH",
      message: "Sage rejected the API key",
    });
  });

  it("refuses a plain-http bridge that isn't on this machine, and a short secret", async () => {
    configure("http://bridge.example.com");
    await expect(bridgeProvider("SAGE").testConnection({ config: {}, credentials: {} })).rejects.toMatchObject({ code: "SERVER_MISCONFIGURED" });
    configure("https://bridge.example.com", "short");
    await expect(bridgeProvider("SAGE").testConnection({ config: {}, credentials: {} })).rejects.toMatchObject({ code: "SERVER_MISCONFIGURED" });
  });
});
