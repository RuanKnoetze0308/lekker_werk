# LekkerWerk

Multi-tenant workforce clocking SaaS. Employees clock in through WhatsApp or Telegram; businesses manage locations, employees, attendance, QR codes, integrations and reports from one dashboard.

Stack: Next.js 16 (App Router) · TypeScript · Tailwind v4 · PostgreSQL 18 · Drizzle ORM.

## First run

```bash
npm install                      # Node 20+ (Next 16)
cp .env.example .env.local       # then fill in the values
createdb lekkerwerk
npm run migrate                  # creates all tables (db/migrations)
npm run demo:seed                # optional: demo company data (npm run demo:clean removes it)
npm run dev -- -p 3001
```

Tests: `npm test` (unit), `npm run test:integration` (uses the local database and demo data).

Telegram on localhost: connect the bot under Settings → Communication, then run `npm run telegram:poll`.

Background jobs: `node scripts/cron.mjs maintenance` (hourly) and `node scripts/cron.mjs sync` (every 15 min), with `APP_URL` and `CRON_SECRET` set.

Release: see [docs/DEPLOY_RAILWAY.md](docs/DEPLOY_RAILWAY.md). Every database operation is listed as a future API endpoint in [docs/api/API_CATALOG.md](docs/api/API_CATALOG.md).

## Where things live

| Path | What |
| --- | --- |
| `db/schema/*` | Database schema, one file per domain (tenancy, people, channels, clocking, integrations, system) |
| `server/services/*` | Business logic: Authentication, Company, Location, Employee, Attendance, QR, Integration, Notification, Reporting… |
| `server/clocking/` | **Clocking engine**: the only code that writes clock events (validation + state machine) |
| `server/channels/` | Messaging layer. `messaging.service.ts` is channel-agnostic; `telegram/` and `whatsapp/` are thin adapters |
| `server/integrations/` | Provider interface + registry (Custom API, Odoo; others stubbed). Add an ERP = one file |
| `server/auth/`, `server/http/` | Sessions, roles/permissions, guards, API wrapper (CSRF, rate limit, errors) |
| `app/api/*` | HTTP API (thin: validate → call service) |
| `app/(marketing)/` | Public homepage + login/signup modals |
| `app/(dashboard)/*` | Authenticated app: dashboard, employees, attendance, schedules, locations, qr-codes, integrations, reports, settings |
| `components/ui`, `components/dashboard` | Shared UI primitives |
| `lib/` | Pure helpers and schemas shared by client and server (`lib/schemas`, `time`, `geo`, `crypto`) |

## Key rules

- Every request resolves an `AuthContext` from the session; `companyId` and location scope never come from the client.
- `clock_events` is append-only. Attendance rows are derived and can be recomputed (`recomputeDay`). Corrections append a new event.
- Telegram and WhatsApp only translate messages; all attendance logic is in `server/clocking`.
- Integration credentials and bot tokens are AES-256-GCM encrypted and never returned to the browser.
