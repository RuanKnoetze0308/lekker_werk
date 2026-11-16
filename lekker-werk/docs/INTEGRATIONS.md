# Building an integration

Everything around a connector already exists: the catalog cards, the connect form, encrypted
credential storage, the sync queue, retries, error display, the "Send to …" button on a locked pay
period, export history and audit entries. A connector is only the part that talks to the other
system. There are two ways to write it. Pick one per system; you can mix them.

| | Option A: in this codebase (TypeScript) | Option B: in your own backend (e.g. .NET) |
|---|---|---|
| You write | one file in `server/integrations/providers/` | three HTTP endpoints per system |
| Switch it on | add one line to `server/integrations/registry.ts` | set `INTEGRATION_BRIDGE_URL` + `INTEGRATION_BRIDGE_SECRET` |
| Good for | simple REST APIs | OAuth flows, vendor SDKs, anything you'd rather keep in C# |

A system shows as **Available** on the Integrations page as soon as either is in place. Until then
it shows **Coming soon** with an "I need this one" button.

## The contract (same for both options)

A connector does up to three things (`server/integrations/types.ts`):

| Operation | When it runs | Input | Output |
|---|---|---|---|
| `testConnection` | "Test connection" button | settings | nothing, or an error |
| `fetchHours` (import) | sync job, every N minutes | settings, `from`, `to` | `NormalizedHours[]` |
| `pushHours` (export) | Payroll → locked period → "Send to …" | settings, `HoursExport` | `{ accepted, reference? }` |

Leave out the direction a system doesn't need. Payroll systems (Sage, Xero, QuickBooks, SimplePay,
PaySpace) only need `pushHours`; ERPs (Syspro, Odoo) only need `fetchHours`.

**Settings** are what the customer typed into the connect form:

```jsonc
{
  "config":      { "tenant": "abc123" },        // non-secret fields
  "credentials": { "apiKey": "…" }              // secret fields, decrypted for this call only
}
```

The field names come from `lib/integration-catalog.ts` (`configFields` / `credentialFields`). To
ask the customer for a different field, change it there; the form updates itself.

**`NormalizedHours`** (import), one row per employee per day:

```jsonc
{
  "externalRecordId": "TS-1001",       // the other system's id; same id again = update, not duplicate
  "externalEmployeeRef": "EMP-007",    // must equal the employee number in LekkerWerk
  "workDate": "2026-11-16",
  "hours": 7.5,
  "raw": { }                           // optional, the original row, kept for troubleshooting
}
```

**`HoursExport`** (export), the frozen totals of one locked pay period:

```jsonc
{
  "periodId": "0193…",                 // use as the idempotency key: sending twice must not double-pay
  "periodStart": "2026-10-01",
  "periodEnd": "2026-10-31",
  "company": { "id": "01a1…", "name": "The Web Daddy" },
  "lines": [
    { "employeeNumber": "EMP-007", "employeeName": "Johan Botha", "payCode": "NORMAL",   "hours": 168,  "days": 0 },
    { "employeeNumber": "EMP-007", "employeeName": "Johan Botha", "payCode": "OVERTIME", "hours": 6.5,  "days": 0 },
    { "employeeNumber": "EMP-007", "employeeName": "Johan Botha", "payCode": "LEAVE_ANNUAL", "hours": 16, "days": 2 }
  ]
}
```

Pay codes: `NORMAL`, `OVERTIME`, `SUNDAY`, `PUBLIC_HOLIDAY_WORKED`, `PUBLIC_HOLIDAY`,
`CLOSURE_PAID`, `CLOSURE_UNPAID`, `ABSENT`, and `LEAVE_<code>` per leave type
(`server/attendance/paycodes.ts`). Map them to the other system's codes inside the connector.

---

## Option A: a connector in this codebase

1. Copy `server/integrations/providers/_template.ts` to e.g. `sage.ts` and fill in the functions.
2. Register it in `server/integrations/registry.ts`:

   ```ts
   import { sageProvider } from "./providers/sage";
   const native = { CUSTOM_API: customApiProvider, ODOO: odooProvider, SAGE: sageProvider };
   ```

3. `npm run dev`, open Integrations → Sage → Connect → **Test connection**.

Rules:

- A URL the customer types must go through `assertPublicHttpsUrl` + `publicFetch` (`lib/ssrf.ts`).
  They block internal addresses and redirects. A fixed vendor URL can use plain `fetch`.
- Throw `AppError` with a message the customer can act on ("Sage rejected the API key"). Never
  put a secret in an error message: it is stored in `integrations.last_error` and shown on screen.
- `pushHours` must be idempotent per `periodId`.

A brand-new system (not one of the eight in the catalog) also needs: a value in the
`integration_provider` enum (`db/schema/enums.ts` → `npm run db:generate` → `npm run migrate`), the
same value in `integrationSchema` (`lib/schemas/settings.ts`), and an entry in
`lib/integration-catalog.ts`.

---

## Option B: your own backend (the bridge)

Set two environment variables on LekkerWerk:

```bash
INTEGRATION_BRIDGE_URL=https://integrations.example.com   # http://localhost:5080 is allowed in development only
INTEGRATION_BRIDGE_SECRET=<32+ random characters>
```

Every system **without** a native connector is now forwarded to your backend
(`server/integrations/bridge.ts`). Native connectors (Odoo, Custom API) keep working as before.

### Endpoints your backend implements

`{provider}` is lower-case: `sage`, `xero`, `quickbooks`, `simplepay`, `payspace`, `syspro`.

| Request | Body | Success response (200) |
|---|---|---|
| `POST /v1/{provider}/test` | `{ config, credentials }` | anything (body ignored) |
| `POST /v1/{provider}/hours/import` | `{ config, credentials, from, to }` (`from`/`to` are ISO timestamps) | `{ "records": NormalizedHours[] }` |
| `POST /v1/{provider}/hours/export` | `{ config, credentials, export: HoursExport }` | `{ "accepted": 42, "reference": "BATCH-9" }` |

Errors: respond with a 4xx/5xx status and `{ "message": "what the customer should know" }`.
`401`/`403` is shown as a credentials problem; anything else as an integration error. The message
appears on the Integrations page, so keep secrets out of it. Rows in `records` that are missing
`externalEmployeeRef`, a `YYYY-MM-DD` `workDate` or a numeric `hours` are skipped.

LekkerWerk waits 30 seconds per call. For a slow system, accept the export, return a `reference`,
and finish the work in the background.

### Verifying that a request really came from LekkerWerk

Every request carries:

```
X-LekkerWerk-Timestamp: 1794819000                      (unix seconds)
X-LekkerWerk-Signature: sha256=<hex HMAC-SHA256(secret, "<timestamp>.<raw request body>")>
```

Reject the request if the signature doesn't match or the timestamp is more than 5 minutes old.
Compute the HMAC over the **raw bytes** of the body, before any JSON parsing.

### Minimal .NET example

```csharp
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();
var secret = builder.Configuration["LekkerWerk:BridgeSecret"]
    ?? throw new InvalidOperationException("LekkerWerk:BridgeSecret is not set");

// Signature check for every /v1 request.
app.Use(async (ctx, next) =>
{
    if (!ctx.Request.Path.StartsWithSegments("/v1")) { await next(); return; }

    ctx.Request.EnableBuffering();
    using var reader = new StreamReader(ctx.Request.Body, Encoding.UTF8, leaveOpen: true);
    var body = await reader.ReadToEndAsync();
    ctx.Request.Body.Position = 0;

    var timestamp = ctx.Request.Headers["X-LekkerWerk-Timestamp"].ToString();
    var signature = ctx.Request.Headers["X-LekkerWerk-Signature"].ToString();
    var expected = "sha256=" + Convert.ToHexString(
        HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes($"{timestamp}.{body}"))
    ).ToLowerInvariant();

    var fresh = long.TryParse(timestamp, out var ts)
        && Math.Abs(DateTimeOffset.UtcNow.ToUnixTimeSeconds() - ts) <= 300;
    var match = CryptographicOperations.FixedTimeEquals(
        Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(signature));

    if (!fresh || !match)
    {
        ctx.Response.StatusCode = 401;
        await ctx.Response.WriteAsJsonAsync(new { message = "Bad signature." });
        return;
    }
    await next();
});

app.MapPost("/v1/{provider}/test", async (string provider, BridgeRequest req) =>
{
    // e.g. call the provider's "who am I" endpoint with req.Credentials["apiKey"]
    return Results.Ok(new { ok = true });
});

app.MapPost("/v1/{provider}/hours/export", async (string provider, ExportRequest req) =>
{
    // Map req.Export.Lines to the provider's pay-run / timesheet API here.
    // Use req.Export.PeriodId as the idempotency key.
    return Results.Ok(new { accepted = req.Export.Lines.Count, reference = $"{provider}-{req.Export.PeriodId}" });
});

app.MapPost("/v1/{provider}/hours/import", async (string provider, ImportRequest req) =>
{
    var records = new List<NormalizedHours>(); // fill from the ERP between req.From and req.To
    return Results.Ok(new { records });
});

app.Run();

record BridgeRequest(Dictionary<string, string> Config, Dictionary<string, string> Credentials);
record ImportRequest(Dictionary<string, string> Config, Dictionary<string, string> Credentials, DateTimeOffset From, DateTimeOffset To);
record ExportRequest(Dictionary<string, string> Config, Dictionary<string, string> Credentials, HoursExport Export);
record HoursExport(string PeriodId, string PeriodStart, string PeriodEnd, Company Company, List<PayrollLine> Lines);
record Company(string Id, string Name);
record PayrollLine(string EmployeeNumber, string EmployeeName, string PayCode, decimal Hours, decimal Days);
record NormalizedHours(string ExternalRecordId, string ExternalEmployeeRef, string WorkDate, decimal Hours);
```

ASP.NET Core binds the camelCase JSON to these records by default.

### Security notes for the bridge

- The customer's credentials for the other system are in the request body. Run the backend on
  **https** (LekkerWerk refuses plain http in production), don't log request bodies, and keep the
  shared secret in a secret store.
- LekkerWerk still stores those credentials encrypted (AES-256-GCM) and never returns them to the
  browser. If your backend runs its own OAuth flow and keeps its own tokens, have the customer
  enter only an account id in the form and store nothing sensitive in LekkerWerk.
- Rotate the secret by changing it on both sides at the same time.

---

## Trying it without a real system

- **Import:** connect **Custom API** to any https endpoint that returns
  `[{ "id": "1", "employee_number": "EMP-007", "date": "2026-11-16", "hours": 8 }]`, press
  **Sync now**, then run the worker once: `node scripts/cron.mjs sync`.
- **Export:** start the .NET sample on `http://localhost:5080`, set the two bridge variables in
  `.env.local`, restart `npm run dev`, connect Sage with any values, lock a pay period under
  Payroll and press **Send to Sage**. The export appears in the period's history and in the audit log.

## Where things are

| What | File |
|---|---|
| Contract types | `server/integrations/types.ts` |
| Which connector handles which system | `server/integrations/registry.ts` |
| Connector template | `server/integrations/providers/_template.ts` |
| Working examples | `server/integrations/providers/custom-api.ts`, `odoo.ts` |
| Bridge client + signature | `server/integrations/bridge.ts` |
| Form fields per system | `lib/integration-catalog.ts` |
| Save / test / sync / push logic | `server/services/integration.service.ts` |
| Pay period payload | `server/time/payroll.service.ts` → `buildPayPeriodExport` |
