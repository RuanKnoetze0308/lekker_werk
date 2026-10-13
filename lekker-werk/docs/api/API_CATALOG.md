# LekkerWerk API catalog

**Purpose.** This file records every operation in which the app reads or writes the database, written as an API endpoint. Today all of it runs inside one Next.js app: route handlers in `app/api/**`, and server-rendered pages that call services directly. When LekkerWerk outgrows that, hand this file to an engineer or agent and build one standalone, versioned API from it, for example an Azure Functions app behind Azure API Management. The Next.js frontend then becomes a client of that API.

**Rule.** Any change that adds or changes a service function touching the database updates this file in the same change. See `AGENTS.md`.

**Status legend.** `ROUTE` already exists as an HTTP route today. `PAGE` exists only as a server-side service call from a page, so it needs an endpoint when the API is split out. `JOB` is a scheduled or background operation. `INTERNAL` is a shared domain operation used by other endpoints and is never exposed directly.

---

## 1. Conventions (apply to every endpoint)

| Topic | Rule |
|---|---|
| Base path | `/api/v1`. Paths below omit it. Today's paths are `/api/...` without the version. |
| Tenancy | `companyId` always comes from the authenticated principal (session/JWT, device key, webhook secret). **Never** from the URL, query or body. Every query filters by it. |
| Location scope | Managers only see/act on their assigned locations (`manager_locations`). Admins see all. Enforce on every read and write that involves a location, employee or device. |
| Auth types | **User**: session cookie today. In the standalone API, use a bearer JWT (Azure AD B2C or Entra External ID) carrying `userId`, `companyId`, `role`. **Device**: `Authorization: Bearer lwd_...` per-device key (sha256 stored). **Webhook**: provider signature/secret. **Job**: `Authorization: Bearer $CRON_SECRET`; in Azure, timer triggers need no HTTP auth. |
| CSRF | Only for cookie sessions (`x-csrf-token` double submit). Not needed for bearer-token clients. |
| Envelope | Success `{ "data": ... }`. Error `{ "error": { "code", "message", "details?" } }`. Validation errors return 422 with `details: [{ path, message }]`. |
| Status codes | 200/201/202 ok · 401 unauthenticated · 402 subscription inactive / plan limit · 403 forbidden · 404 not found (also used to hide other tenants' ids) · 409 conflict · 422 invalid · 429 rate limited |
| Billing gate | Every user endpoint except `/billing/*` returns **402 `SUBSCRIPTION_REQUIRED`** when the trial or subscription has lapsed. Clocking returns rejection `SUBSCRIPTION_INACTIVE`. |
| Time | Instants are UTC ISO-8601. Calendar days are `YYYY-MM-DD` in the location's (or company's) timezone. Clock event time is **server time**, except buffered device punches (see Device API). |
| Ids | UUID v7 (`uuidv7()` in Postgres 18): time-ordered, safe to expose. |
| Pagination | `page`/`pageSize` (offset) for admin lists; keyset (`before=<occurredAt>`) for event history. |
| Idempotency | Chat: provider message id. Devices: `punchId` (unique per device). Stored on `clock_attempts.idempotency_key`. |
| Rate limits | Per IP and per route today (`rate_limits` table). Move to Redis or API Management policies at scale. |
| Audit | Every admin mutation writes `audit_logs` (actor, action, entity, metadata). Secrets and credential values are never logged. |
| Secrets | Integration/channel credentials are AES-256-GCM encrypted (`APP_ENCRYPTION_KEY`) and never returned. Card/PIN values are HMAC-SHA256'd and never stored in plain text. |

### Roles and permissions

| Permission | SUPER_ADMIN | COMPANY_ADMIN | MANAGER | EMPLOYEE |
|---|:-:|:-:|:-:|:-:|
| dashboard:view, employees:read/write, attendance:read/correct, schedules:manage, locations:read, qr:manage, reports:read | ✓ | ✓ | ✓ (own locations) | |
| locations:write, devices:manage, integrations:manage, settings:manage, users:manage, audit:read | ✓ | ✓ | | |
| platform:manage | ✓ | | | |

Source of truth: `server/auth/permissions.ts`.

---

## 2. Data model (by domain)

| Domain | Tables | Notes |
|---|---|---|
| Tenancy & auth | `companies`, `locations`, `users`, `sessions`, `password_resets` | `users.company_id` is null only for platform admins. |
| People | `employees`, `employee_locations`, `managers`, `manager_locations` | Employees are never hard-deleted (history). |
| Devices | `clock_devices`, `employee_credentials` | One key per device; credentials are HMAC'd with a partial unique index on live values. |
| Chat channels | `communication_channels`, `communication_accounts`, `link_codes`, `conversation_states` | One channel row per company per channel. |
| Clocking | `qr_codes`, `clock_events` (**append-only**, enforced by trigger), `clock_attempts`, `attendance_records`, `break_records`, `work_schedules`, `employee_schedules`, `public_holidays` | Attendance is **derived** from events and can be rebuilt at any time. |
| Integrations | `integrations`, `integration_syncs`, `imported_hours`, `integration_requests` | Syncs are queued and run by a worker. |
| Billing | `subscriptions`, `payments` | PayFast. |
| System | `company_settings`, `employee_data_permissions`, `audit_logs`, `notifications`, `rate_limits`, `demo_data_registry` (development only) | |

Schema source: `db/schema/*.ts`. Extra SQL: `db/sql/001_immutable_clock_events.sql`.

---

## 3. Clocking engine (the core)

All clock-ins go through **one** operation, whatever the hardware or channel. Adapters translate their transport into a `ClockRequest`. Rules live only in the engine.

### INTERNAL `clock.process(ClockRequest) → ClockResult`
- **Today:** `server/clocking/clocking.service.ts → processClock()`
- **Input:** `{ companyId, action: CLOCK_IN|CLOCK_OUT|BREAK_START|BREAK_END|AUTO, source: TELEGRAM|WHATSAPP|WEB|DEVICE, identity, device?, qrToken?, latitude?, longitude?, idempotencyKey?, capturedAt?, now? }`
- **identity** is one of `{kind:"EMPLOYEE", employeeId}`, `{kind:"CHAT", channel, externalId}` or `{kind:"CREDENTIAL", credentialKind, value}`. Resolvers are in `server/clocking/identity.ts`. A new hardware type is usually just a new `credential_kind` value. A brand-new identity method is one new resolver.
- **Pipeline:**
  1. billing gate
  2. timestamp (devices may backdate up to 7 days and run 2 minutes ahead)
  3. identity
  4. employee active and in this tenant
  5. location (device > QR > primary location)
  6. location allowed for the employee
  7. GPS (phones only)
  8. breaks enabled
  9. idempotency
  10. **per-employee advisory lock**
  11. state machine as of the event time (AUTO picks the next logical action; double taps inside `duplicateWindowSeconds` are rejected)
  12. write
- **DB writes (one transaction):** `clock_events` insert · `clock_attempts` insert (ACCEPTED) · `employee_credentials.last_used_at` · `attendance_records` upsert and `break_records` rebuild for the event day and the day before (`recomputeDay`).
- **On rejection:** `clock_attempts` insert (REJECTED + reason). After 5 rejections in 10 minutes for the same employee, also inserts a `notifications` row (UNUSUAL_CLOCKING).
- **Rejection reasons:** EMPLOYEE_INACTIVE, ACCOUNT_NOT_LINKED, WRONG_COMPANY, QR_INVALID, QR_DISABLED, QR_EXPIRED, NOT_ALLOWED_AT_LOCATION, GPS_REQUIRED, OUTSIDE_RADIUS, ALREADY_CLOCKED_IN, NOT_CLOCKED_IN, ALREADY_ON_BREAK, NOT_ON_BREAK, DUPLICATE, CLOCKING_NOT_ALLOWED, RATE_LIMITED, SUBSCRIPTION_INACTIVE, CREDENTIAL_UNKNOWN, DEVICE_DISABLED, TIMESTAMP_OUT_OF_RANGE.
- **Azure note:** keep this as one function/library shared by every ingress. If volume needs it, ingress functions enqueue to Service Bus with a session per `employeeId` (which preserves per-employee ordering), and one consumer runs the engine.

### INTERNAL `attendance.recomputeDay(employeeId, workDate)`
- **Today:** `server/services/attendance.service.ts → recomputeDay()`
- **Reads:** `employees`, `locations`, `company_settings`, `clock_events` (excluding events that have been superseded by a correction), `employee_schedules`/`work_schedules`.
- **Writes:** upserts `attendance_records` (unique per employee and day); deletes and re-inserts `break_records`. Idempotent.

### INTERNAL `clock.state(employeeId, at?)`
- **Today:** `getClockState()`. Reads the latest accepted, non-superseded `clock_events` row at or before `at`. A shift older than `maxShiftHours` counts as OUT.

---

## 4. Device API (hardware terminals)

Any RFID/NFC reader, biometric scanner or kiosk that can make an HTTPS call can integrate. Auth uses the per-device key; there are no cookies.

### ROUTE `POST /device/v1/punches`
- **Today:** `app/api/device/v1/punches/route.ts → authenticateDevice() + submitPunches()` (`server/devices/device-ingest.ts`)
- **Auth:** `Authorization: Bearer lwd_<key>` → `clock_devices.key_hash`. A disabled device gets 403 `DEVICE_DISABLED`.
- **Body:** `{ punches: [{ punchId?: string(≤100), credential: { kind: RFID_CARD|NFC_TAG|PIN|BIOMETRIC_ID|BARCODE, value }, action?: CLOCK_IN|CLOCK_OUT|BREAK_START|BREAK_END, capturedAt?: ISO }] }`, with 1 to 200 punches.
- **Returns 200:** `{ deviceId, serverTime, results: [{ punchId, status: ACCEPTED|REJECTED|DUPLICATE, reason, display, eventType?, occurredAt? }] }`. Results come back in input order. A batch is never rejected as a whole.
- **Semantics:**
  - Punches are processed oldest `capturedAt` first, so an offline buffer replays in order.
  - With no `action`, the device's `fixed_action` applies; if that is null too, the action is AUTO (tap in / tap out).
  - Card values are normalised before hashing: whitespace, `:` and `-` are stripped and the value upper-cased; PINs keep digits only.
  - Re-sending the same `punchId` returns DUPLICATE and never creates a second event.
- **DB:**
  - Writes `clock_devices.last_seen_at`/`last_ip`.
  - Reads `employee_credentials`.
  - The engine writes for each punch.
- **Rate limit:** 300/min per IP.

### ROUTE `POST /device/v1/heartbeat`
- **Auth:** device key. **Returns:** `{ deviceId, name, fixedAction, serverTime }`. Devices should sync their clock from `serverTime`.
- **DB:** writes `clock_devices.last_seen_at`, `last_ip`.

---

## 5. Chat channels (Telegram / WhatsApp)

### ROUTE `POST /webhooks/telegram/{secret}`
- **Today:** `handleTelegramWebhook()` → `processTelegramUpdate()` → `handleInbound()`
- **Auth:** the per-company `secret` in the path **and** the `X-Telegram-Bot-Api-Secret-Token` header (set via `setWebhook secret_token`).
- **Body:** a Telegram `Update` (`message`, `callback_query`). The tenant comes from the secret.
- **DB:**
  - Reads `communication_channels`.
  - In the conversation, reads and writes `conversation_states` and `communication_accounts.last_seen_at`; reads `link_codes`, `employees` and `qr_codes`; reads settings and permissions.
  - Calls the engine.
  - Linking writes `communication_accounts` and marks `link_codes.used_at`.
- **Outbound:** Telegram `sendMessage` (inline keyboard or location request) and `answerCallbackQuery`.

### ROUTE `GET /webhooks/whatsapp` (Meta verification) · `POST /webhooks/whatsapp`
- **Auth:** GET compares `hub.verify_token`. POST verifies the HMAC `x-hub-signature-256` with the app secret.
- **Tenant:** `communication_channels.config.phoneNumberId` = `metadata.phone_number_id`.
- **DB and flow:** same as Telegram (`handleInbound`).

### JOB `telegram.poll` (local development only)
- **Today:** `scripts/telegram-poll.ts` (`npm run telegram:poll`). It long-polls `getUpdates` for bots in `config.mode = 'polling'` and calls `processTelegramUpdate()`. It isn't needed once there's a public HTTPS URL; production uses webhooks.

### INTERNAL `conversation.handleInbound(InboundMessage, sender)`
- **Today:** `server/channels/messaging.service.ts`. It is channel-neutral and handles link codes, QR deep links (`/start q_<token>` and `CLOCK <token>`), the menu, the clock actions (rate limited to 20/min per chat) and the info requests (`employee-info.service.ts`).

### ROUTE `POST /dev/chat-simulator` (non-production only)
- **Today:** `simulateChat()` (`server/channels/simulator.ts`). **Permission:** settings:manage.
- **Body:** `{ channel, externalId: "sim-...", displayName?, text? | location? | scanQrId? | linkEmployeeId? }`.
- **Returns:** `{ sent, replies: [{ text, buttons?, requestLocation? }] }`.
- **DB:** the same as a real chat. `linkEmployeeId` also inserts into `link_codes`.

---

## 6. Endpoints by domain (user-authenticated)

Format: **Today** = current implementation · **Perm** = permission · **DB** = tables read (R) / written (W) · tx = single transaction.

### 6.1 Auth
| Endpoint | Status | Today | Body / Query | Returns | DB |
|---|---|---|---|---|---|
| `POST /auth/signup` | ROUTE | `authentication.service.signup` | company, contact, password, `preferredChannel`, `locationMode`, `locations[]`, `timezone` | `{ redirect }` + session | W tx: `companies`, `users`, `locations`, `company_settings`, `subscriptions` (7-day trial), `communication_channels` ×2, `employee_data_permissions`, `work_schedules`, `audit_logs`; W `sessions` |
| `POST /auth/login` | ROUTE | `login` | `{ identifier, password }` | `{ redirect }` + session | R `users`; W `users` (failed count, lockout, `last_login_at`), `sessions`, `audit_logs` |
| `POST /auth/logout` | ROUTE | `destroySession` | | | W `sessions` (delete) |
| `POST /auth/forgot` | ROUTE | `requestPasswordReset` | `{ email }` | always 200 | R `users`; W `password_resets`; sends an email (provider not wired yet) |
| `POST /auth/reset` | ROUTE | `resetPassword` | `{ token, password }` | | W tx: `users`, `password_resets.used_at`, `sessions` (delete all); W `audit_logs` |
| `GET /me` | PAGE | `resolveSession` | | user, role, company, location scope, billing access | R `sessions`, `users`, `managers`, `manager_locations`, `subscriptions` |

Lockout: 5 failures → 15 minutes. Login is limited to 10/min per IP and signup to 5/min per IP.

### 6.2 Company and settings
| Endpoint | Status | Today | Perm | Body | DB |
|---|---|---|---|---|---|
| `GET /company` | ROUTE | `company.service.getCompany` | any | | R `companies` |
| `PATCH /company` | ROUTE | `updateCompany` | settings:manage | name, reg no., contact, timezone, `preferredChannel` | W tx `companies`, `communication_channels.is_default`, `audit_logs` |
| `GET /settings/attendance` | ROUTE | `getSettings` | settings:manage | | R `company_settings` (merged with defaults) |
| `PUT /settings/attendance` | ROUTE | `updateAttendanceSettings` | settings:manage | gps, requireQr, radius, duplicateWindow, maxShiftHours, breaks, overtime threshold, workingWeek | W `company_settings` upsert, `audit_logs` |
| `GET /settings/employee-permissions` | ROUTE | `getEmployeeDataPermissions` | settings:manage | | R `employee_data_permissions` |
| `PUT /settings/employee-permissions` | ROUTE | `updateEmployeeDataPermissions` | settings:manage | `{ permissions: { key: bool } }` | W tx `employee_data_permissions`, `audit_logs` |
| `GET /settings/channels` | ROUTE | `listChannels` | settings:manage | | R `communication_channels`. Returns mode, bot link and webhook URL, **never** credentials |
| `PUT /settings/channels` | ROUTE | `configureChannel` | settings:manage | Telegram `{ enabled, botToken? }`; WhatsApp `{ enabled, phoneNumberId?, displayNumber?, accessToken? }` | W `communication_channels` (encrypted creds, `config.mode`), `audit_logs`. Telegram: `getMe`, then `setWebhook` (public HTTPS) or `deleteWebhook` (polling), plus `setMyCommands`/`setMyDescription`. WhatsApp enable requires the add-on (402) |
| `GET /audit-logs` | PAGE | `audit.service.listAuditLogs` | audit:read | `limit` | R `audit_logs`, `users` |

### 6.3 Locations
| Endpoint | Status | Today | Perm | Body | DB |
|---|---|---|---|---|---|
| `GET /locations` | ROUTE | `listLocations` | locations:read | `includeInactive?` | R `locations` + active employee count |
| `POST /locations` | ROUTE | `createLocation` | locations:write | name, address, lat, lng | plan limit (402); W `locations`, `audit_logs` |
| `GET /locations/{id}` | ROUTE | `getLocation` | locations:read | | R `locations` |
| `PATCH /locations/{id}` | ROUTE | `updateLocation` | locations:write | name, address, lat/lng, timezone, gps override, radius, status | W `locations`, `audit_logs` |
| `GET /locations/{id}/managers` | ROUTE | `listLocationManagers` | locations:read | | R `manager_locations`, `managers`, `users` |
| `PUT /locations/{id}/managers` | ROUTE | `setLocationManagers` | users:manage | `{ userIds[] }` | W tx `manager_locations` (replace), `audit_logs` |
| `GET /locations/{id}/day?date=` | PAGE | `dashboard.service.getLocationDay` | dashboard:view | | R `employees`, `attendance_records` |

### 6.4 Employees
| Endpoint | Status | Today | Perm | Body / Query | DB |
|---|---|---|---|---|---|
| `GET /employees` | ROUTE | `listEmployees` | employees:read | `q, locationId, department, managerId, status, page, pageSize` | R `employees`, `locations` |
| `POST /employees` | ROUTE | `createEmployee` | employees:write | number, names, email, phone, dept, position, `locationId`, `extraLocationIds[]`, `managerId`, `preferredChannel`, `platformIdentifier` | plan limit (402); unique number per company (409); W tx `employees`, `employee_locations`, `audit_logs` |
| `GET /employees/{id}` | ROUTE | `getEmployee` | employees:read | | R `employees`, `locations`, `users`, `employee_locations`, `communication_accounts` |
| `PATCH /employees/{id}` | ROUTE | `updateEmployee` | employees:write | partial of create | W tx `employees`, `employee_locations` (replace), `audit_logs` |
| `POST /employees/{id}/status` | ROUTE | `setEmployeeActive` | employees:write | `{ active }` | W tx `employees.status`, revokes `communication_accounts`, `audit_logs` |
| `POST /employees/{id}/link-code` | ROUTE | `generateLinkCode` | employees:write | `{ channel }` | W `link_codes` (sha256, 24h). Returns `{ code, expiresAt, link }` (t.me/wa.me deep link) |
| `DELETE /employees/{id}/link-code` | ROUTE | `revokeCommunicationAccount` | employees:write | `{ accountId }` | W `communication_accounts.revoked_at` |
| `GET /employees/{id}/credentials` | ROUTE | `credential.service.listCredentials` | employees:read | | R `employee_credentials` (hint only) |
| `POST /employees/{id}/credentials` | ROUTE | `issueCredential` | employees:write | `{ kind, value, label? }` (PIN: 4–8 digits) | one live owner per value (409); W `employee_credentials` (HMAC), `audit_logs` (no value) |
| `DELETE /employees/{id}/credentials` | ROUTE | `revokeCredential` | employees:write | `{ credentialId }` | W `employee_credentials.revoked_at`, `audit_logs` |
| `GET /employees/{id}/hours?from&to` | PAGE | `attendance.service.employeeHours` | attendance:read | | R `attendance_records` (days + totals) |
| `GET /employees/{id}/clock-events?before&limit` | PAGE | `listClockEvents` | attendance:read | keyset | R `clock_events`, `locations`, `clock_devices` |
| `GET /departments` | PAGE | `listDepartments` | employees:read | | R distinct `employees.department` |

### 6.5 Clock devices (admin)
| Endpoint | Status | Today | Perm | Body | DB |
|---|---|---|---|---|---|
| `GET /devices` | ROUTE | `device.service.listDevices` | devices:manage | | R `clock_devices`, `locations`, `clock_events` (punch count, 24h) |
| `POST /devices` | ROUTE | `createDevice` | devices:manage | `{ locationId, kind, name, serialNumber?, fixedAction? }` | W `clock_devices` (key hash), `audit_logs`. Returns **`apiKey` once** |
| `PATCH /devices/{id}` | ROUTE | `updateDevice` | devices:manage | `{ name?, enabled?, fixedAction? }` | W `clock_devices`, `audit_logs` |
| `POST /devices/{id}/rotate-key` | ROUTE | `rotateDeviceKey` | devices:manage | | W `clock_devices.key_hash`, `audit_logs`. Returns the new `apiKey` once; the old key stops working immediately |
| `POST /devices/{id}/simulate` | ROUTE (non-prod) | `submitPunches` | devices:manage | `{ credential }` | exactly what a device punch does |

### 6.6 QR codes
| Endpoint | Status | Today | Perm | Body | DB |
|---|---|---|---|---|---|
| `GET /qr-codes?locationId` | ROUTE | `listQrCodes` | qr:manage | | R `qr_codes`, `locations` |
| `POST /qr-codes` | ROUTE | `createQrCode` | qr:manage | `{ locationId, label, type: GENERAL\|CLOCK_IN\|CLOCK_OUT\|TEMPORARY, expiresAt? }` | W `qr_codes` (token sha256 + AES copy), `audit_logs` |
| `POST /qr-codes/{id}/regenerate` | ROUTE | `regenerateQrCode` | qr:manage | | W tx: disable old, insert new, `audit_logs` |
| `POST /qr-codes/{id}/enabled` | ROUTE | `setQrEnabled` | qr:manage | `{ enabled }` | W `qr_codes`, `audit_logs`, `notifications` (QR_DISABLED) |
| `GET /qr-codes/{id}/download?format=png\|svg` | ROUTE | `getQrAsset` | qr:manage | | R `qr_codes` (decrypts the token), `locations` |
| `GET /q/{token}` (public) | ROUTE | `app/q/[token]` | none (rate limited per IP) | | R `qr_codes`, `communication_channels` → 302 to the `t.me/<bot>?start=q_<token>` or `wa.me` link |

### 6.7 Attendance
| Endpoint | Status | Today | Perm | Body / Query | DB |
|---|---|---|---|---|---|
| `GET /attendance` | ROUTE | `listAttendance` | attendance:read | `from, to, locationId, employeeId, department, page, pageSize` | R `attendance_records`, `employees`, `locations` |
| `POST /attendance/corrections` | ROUTE | `createCorrection` | attendance:correct | `{ employeeId, eventType, occurredAt, note, correctsEventId? }` | W tx: **new** `clock_events` row (source MANUAL_CORRECTION, supersedes the original), `recomputeDay`, `audit_logs`. Never updates or deletes events |
| `GET /attendance/rejected-attempts` | PAGE | `listRecentAttempts` | attendance:read | `limit` | R `clock_attempts` (REJECTED), `employees` |

### 6.8 Schedules
| Endpoint | Status | Today | Perm | Body | DB |
|---|---|---|---|---|---|
| `GET /schedules` | ROUTE | `listSchedules` | schedules:manage | | R `work_schedules`, `locations` |
| `POST /schedules` | ROUTE | `createSchedule` | schedules:manage | `{ name, locationId?, graceMinutes, overtimeAfterMinutesPerDay?, days[{day,start,end,breakMinutes}] }` | W `work_schedules`, `audit_logs` |
| `PUT /schedules/{id}` | ROUTE | `updateSchedule` | schedules:manage | same | W `work_schedules`, `audit_logs` |
| `POST /schedules/assign` | ROUTE | `assignSchedule` | schedules:manage | `{ employeeId, scheduleId, effectiveFrom }` | W tx: closes the open `employee_schedules`, inserts a new one, `audit_logs` |

Schedule resolution for a day: employee assignment → location schedule → company default (`resolveDaySchedule`).

### 6.9 Dashboard and reports (read models)
| Endpoint | Status | Today | Perm | Query | DB |
|---|---|---|---|---|---|
| `GET /dashboard/overview` | PAGE | `getDashboardOverview` | dashboard:view | `date, locationId, department, managerId` | R `locations`, `employees`, `clock_events` (current state), `attendance_records`, `work_schedules`, `clock_attempts`, `company_settings` |
| `GET /dashboard/live` | PAGE | `getLiveBoard` | dashboard:view | filters | R `clock_events` (latest per employee + shift start), `clock_devices`, `employees`, `locations` |
| `GET /dashboard/activity` | PAGE | `getRecentActivity` | dashboard:view | filters, `limit` | R `clock_events`, `employees`, `locations`, `clock_devices` |
| `GET /dashboard/hours-by-employee` | PAGE | `getHoursByEmployee` | dashboard:view | `from, to`, filters | R `attendance_records`, `employees`, `locations` |
| `GET /reports?kind&from&to&format=json\|csv` | ROUTE | `reporting.service.runReport` / `toCsv` | reports:read | kinds: daily_attendance, weekly_hours, monthly_hours, overtime, late_arrivals, location_attendance, erp_reconciliation | R `attendance_records`, `employees`, `locations`, `imported_hours` |

Azure note: the dashboard reads are the hottest path. Serve them from a read replica, or use materialised daily aggregates once there are many tenants.

### 6.10 Integrations
| Endpoint | Status | Today | Perm | Body | DB |
|---|---|---|---|---|---|
| `GET /integrations` | ROUTE | `listIntegrations` | integrations:manage | | R `integrations` (no secrets) |
| `POST /integrations` | ROUTE | `saveIntegration` | integrations:manage | `{ provider, category, name, enabled, syncFrequencyMinutes, config{}, credentials{}? }` | plan limit on enable (402); W `integrations` (encrypted creds), `audit_logs` |
| `PUT /integrations/{id}` | ROUTE | `saveIntegration` | integrations:manage | same; blank credential fields keep the stored values | W `integrations`, `audit_logs` |
| `DELETE /integrations/{id}` | ROUTE | `disconnectIntegration` | integrations:manage | | W `integrations` (disable, wipe creds), `audit_logs`. Imported history is kept |
| `POST /integrations/{id}/test` | ROUTE | `testIntegration` | integrations:manage | | R `integrations`; outbound call to the provider (SSRF-guarded) |
| `POST /integrations/{id}/sync` | ROUTE | `requestSync` | integrations:manage | | W `integration_syncs` (QUEUED); 409 if one is already queued or running. 202 |
| `GET /integrations/{id}/sync` | ROUTE | `listSyncs` | integrations:manage | | R `integration_syncs` |
| `GET /integrations/imported-hours/summary?from&to` | PAGE | `importedHoursSummary` | integrations:manage | | R `imported_hours` |
| `GET /integrations/requests` | ROUTE | `integration-request.service.listIntegrationRequests` | integrations:manage | | R `integration_requests` |
| `POST /integrations/requests` | ROUTE | `createIntegrationRequest` | integrations:manage | `{ systemName, category, website?, contactEmail, dataNeeded?, notes? }` | W `integration_requests` (SUBMITTED), `audit_logs`, `notifications` (INTEGRATION_REQUESTED); emails `OPS_EMAIL` if set |

**Provider catalog** (`lib/integration-catalog.ts`). The five most used by South African SMEs: Sage, Xero, QuickBooks Online, SimplePay, PaySpace. Also listed: Syspro, Odoo (working) and Custom API (working). Each provider implements `IntegrationProviderImpl` (`server/integrations/types.ts`): `testConnection`, `fetchHours` (import). **Planned contract for the payroll connectors:** `exportTimesheets(settings, rows: { employeeRef, workDate, normalMinutes, overtimeMinutes }[])`. It pushes approved hours to payroll, is idempotent per (employee, day), and is recorded in `integration_syncs`.

**Planned (not built yet):** `PATCH /platform/integration-requests/{id}` (platform:manage) moves a request through REVIEWING → QUOTED (`quotedAmount`) → IN_PROGRESS → COMPLETED/DECLINED and notifies the customer.

### 6.11 Users (admins and managers)
| Endpoint | Status | Today | Perm | Body | DB |
|---|---|---|---|---|---|
| `GET /users` | ROUTE | `listUsers` | users:manage | | R `users` |
| `GET /users/managers` | PAGE | `listManagerUsers` | dashboard filters | | R `users` (role MANAGER) |
| `POST /users` | ROUTE | `createUser` | users:manage | `{ name, email, role: COMPANY_ADMIN\|MANAGER, password, locationIds[] }` | W tx `users`, `managers`, `manager_locations`, `audit_logs` |
| `PATCH /users/{id}` | ROUTE | `setUserStatus` | users:manage | `{ active }` | W `users.status`, `audit_logs` |

### 6.12 Notifications
| Endpoint | Status | Today | Perm | DB |
|---|---|---|---|---|
| `GET /notifications` | ROUTE | `listNotifications` | dashboard:view | R `notifications` (the company's, or the user's own) |
| `POST /notifications/read-all` | ROUTE (`POST /notifications` today) | `markAllRead` | dashboard:view | W `notifications.read_at` |
| `notify()` | INTERNAL | `notification.service.notify` | | W `notifications`. Delivery by email/chat plugs in here |

### 6.13 Billing (PayFast)
| Endpoint | Status | Today | Perm | Body | DB |
|---|---|---|---|---|---|
| `GET /billing` | PAGE | `getBillingOverview` | settings:manage | | R `subscriptions`, `payments`, plan usage counts |
| `POST /billing/checkout` | ROUTE | `startCheckout` | settings:manage (works while locked) | `{ plan, interval, channel }` | W `payments` (PENDING). Returns signed PayFast form fields |
| `POST /billing/cancel` | ROUTE | `cancelSubscription` | settings:manage (works while locked) | | W `subscriptions` (cancel at period end), `audit_logs`; PayFast API call |
| `POST /billing/payfast/itn` | ROUTE (server-to-server) | `handleItn` | PayFast signature + source IP + validation call + amount check | form body | W tx `payments`, `subscriptions` |
| `ensureSubscription(companyId)` | INTERNAL | | | | R/W `subscriptions` (lazily creates the trial) |

Prices live only in `lib/pricing.ts`.

---

## 7. Jobs (scheduled / background)

| Job | Status | Today | Trigger | DB |
|---|---|---|---|---|
| Integration sync worker | ROUTE `POST /jobs/sync` | `runSyncJobs` | cron with `CRON_SECRET` → **Azure: timer trigger + queue** | W `integration_syncs` (fail stuck runs, enqueue due ones, claim with `FOR UPDATE SKIP LOCKED`), upserts `imported_hours`, W `integrations` (last sync, next sync), `notifications` |
| Maintenance | ROUTE `POST /jobs/maintenance` | `runMaintenance` | cron → **Azure: timer trigger (hourly)** | deletes expired `sessions`, `rate_limits`, `link_codes`, `conversation_states`, `password_resets`; detects forgotten clock-outs → `notifications` |
| Telegram poller | script | `scripts/telegram-poll.ts` | local development only | see §5 |
| Demo data | script | `scripts/demo/seed.ts`, `clean.ts` | manual, development only | creates/removes demo rows listed in `demo_data_registry` |

---

## 8. Suggested Azure layout (when splitting out)

- **Function apps by domain:** `identity` (auth, users), `workforce` (employees, locations, schedules, devices admin), `clocking` (engine + device API + chat webhooks), `reporting` (dashboard and reports, read replica), `integrations` (CRUD + sync workers), `billing` (PayFast).
- **Shared library:** the clocking engine, `recomputeDay`, permissions and tenancy guards. Package it once and use it everywhere. Never fork the rules.
- **Data:** Azure Database for PostgreSQL Flexible Server, with the same schema (Drizzle migrations). Keep the `clock_events` immutability trigger.
- **Queues:** Service Bus. Chat webhooks and device punches go into a queue (session = employeeId) so the webhooks can reply fast. Sync jobs go into a separate queue.
- **Secrets:** Key Vault for `APP_ENCRYPTION_KEY`, provider secrets and PayFast keys.
- **Gateway:** API Management for versioning (`/v1`), rate limits per tenant and per device, and JWT validation.

---

## 9. Changelog

| Date | Change |
|---|---|
| 2026-10-10 | First version. Covers all existing routes, plus:<ul><li>a clocking engine that works with any device</li><li>the device API</li><li>device and credential admin</li><li>the chat simulator</li><li>Telegram polling mode and automatic bot setup</li><li>the South African integration catalog and integration requests</li><li>new dashboard read models (live board, activity, hours by employee)</li><li>demo seed/clean</li></ul> |
