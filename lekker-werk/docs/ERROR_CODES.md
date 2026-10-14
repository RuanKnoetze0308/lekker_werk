# Error codes

When the server hits an unexpected problem, the API answers with a **diagnostic code** and a **ref**:

```json
{ "error": { "code": "INTERNAL", "diagnostic": "LW-DB-42703", "ref": "x7Kp2QaB", "hint": "...", "message": "Something went wrong. (error LW-DB-42703, ref x7Kp2QaB)" } }
```

- The message (and so the code) shows in the form/dialog, and the full error object is logged to the
  browser **dev tools console** as `[LekkerWerk API] POST /api/... → 500`.
- The **ref** finds the full error (SQL, stack trace) in the server log: Railway → app service →
  Deployments → Logs → search for the ref.
- Expected problems (validation, permissions, not found) keep their normal 4xx codes and have no diagnostic.

Source: `server/http/diagnose.ts` (mapping), `server/http/route.ts` (response), `lib/env.ts` (`ConfigError`).

## LW-CFG: server configuration (HTTP 503)

| Code | Meaning | Fix |
|---|---|---|
| `LW-CFG-01-<NAME>` | Environment variable `<NAME>` is not set (e.g. `LW-CFG-01-APP_ENCRYPTION_KEY`). | Set it in Railway → Variables. |
| `LW-CFG-02` | `APP_ENCRYPTION_KEY` is set but isn't 32 bytes base64 (the message says how many bytes it decodes to). | Copy the exact value from `.env.local` (44 chars, ends in `=`, no quotes or spaces). |
| `LW-CFG-03` | Stored secrets (QR tokens, bot tokens, integration credentials) can't be decrypted: `APP_ENCRYPTION_KEY` differs from the key they were encrypted with. | Restore the original key. Data encrypted with a lost key has to be re-created (e.g. Regenerate the QR code). |

## LW-DB: database (HTTP 500). The suffix is the Postgres SQLSTATE

| Code | Meaning | Usual cause |
|---|---|---|
| `LW-DB-42703` | Column doesn't exist | A migration wasn't applied. Check the deploy log for `[migrate]`. |
| `LW-DB-42P01` | Table doesn't exist | Same: migration not applied. |
| `LW-DB-42704` | Type / enum doesn't exist | Same: migration not applied. |
| `LW-DB-22P02` | Invalid value for the column type | Bad uuid / enum / number reached the database. |
| `LW-DB-23502` | Required column empty (NOT NULL) | Code didn't fill a required field. |
| `LW-DB-23503` | Foreign key: referenced row missing | E.g. a deleted user/location id. |
| `LW-DB-23505` | Unique constraint | Duplicate value (e.g. same name twice). |
| `LW-DB-23514` | Check constraint failed | Value outside the allowed range. |
| `LW-DB-40001` / `40P01` | Serialization failure / deadlock | Concurrent requests; retry. |
| `LW-DB-53300` | Too many connections | Pool exhausted; check Railway Postgres. |
| `LW-DB-57014` | Query timed out | Slow query. |
| `LW-DB-57P01` | Database restarted | Transient; retry. |
| `LW-DB-28P01` | Database login failed | `DATABASE_URL` credentials. |
| `LW-DB-3D000` | Database doesn't exist | `DATABASE_URL` database name. |
| `LW-DB-P0001` | Raised by a database rule | E.g. trying to update/delete `clock_events` (append-only trigger). |
| `LW-DB-<other>` | Any other SQLSTATE | Look it up: postgresql.org/docs/current/errcodes-appendix.html |

## LW-NET: network (HTTP 500)

| Code | Meaning |
|---|---|
| `LW-NET-ECONNREFUSED` | Database or an external service (PayFast, Telegram, WhatsApp) refused the connection. |
| `LW-NET-ENOTFOUND` | Host name not found (bad URL / DNS). |
| `LW-NET-ETIMEDOUT` | Connection timed out. |
| `LW-NET-ECONNRESET` | Connection dropped mid-request. |

## LW-INT: anything else (HTTP 500)

`LW-INT-<ErrorClass>` (e.g. `LW-INT-TypeError`): a bug in the code. Send the code **and the ref**; the ref leads to the stack trace in the server log.
