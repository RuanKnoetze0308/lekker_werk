<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# LekkerWerk project rules

- **API catalog is mandatory.** `docs/api/API_CATALOG.md` lists every operation that touches the database as a future endpoint (it will be handed over to build a standalone API, e.g. Azure Functions). Any change that adds or changes a service function, route, table or job updates that file in the same change (method/path, auth + permission, body, response, tables read/written, transaction notes) and adds a changelog line.
- **One clocking engine.** Every clock-in method goes through `processClock()` in `server/clocking/clocking.service.ts`. New hardware = new `credential_kind` (or a new identity resolver in `identity.ts`) + an adapter; never put attendance rules in an adapter.
- **`clock_events` is append-only** (DB trigger). Corrections are new events. Attendance is derived (`recomputeDay`).
- **Tenancy:** `companyId` comes from the session / device key / webhook secret, never from request input.
- **Demo data** only via `npm run demo:seed` / `npm run demo:clean` (tracked in `demo_data_registry`). Don't hard-code sample data in app code.
- **Node 20+** is required (Next 16). Scripts run with `node --conditions=react-server --import tsx` (see package.json).
