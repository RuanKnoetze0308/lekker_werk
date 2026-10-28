# Releasing LekkerWerk on Railway

There are two services: the **app** (this folder) and a **Postgres** database. Each deploy runs the database migrations first. If a migration fails, the release stops and the previous version stays live. Your local data, including the demo company and logins, is copied across once.

## 1. Push the code

The git repository root is `C:\dev\lekker_werk` and the app lives in `lekker-werk/`.

```bash
cd C:\dev\lekker_werk
git add -A
git commit -m "LekkerWerk: clock-in engine, leave, payroll, Railway release"
git push
```

These files are **not** pushed, on purpose, because they are git-ignored:
- `.env.local`: your secrets.
- `db/exports/`: data exports with personal data.
- `scripts/demo/.demo-login.json`: the demo password.

## 2. Create the Railway project

1. On railway.com, create a **New Project** and choose **Deploy from GitHub repo**.
2. Open the service's **Settings** and set **Root Directory** to `lekker-werk`. Railway then picks up `railway.json`:
   - build: `npm run build`
   - pre-deploy: `npm run migrate`
   - start: `npm run start`
   - health check: `/api/health`
3. In the project, choose **+ New** and then **Database → PostgreSQL**. Railway's default image is PostgreSQL 18. If you pick 16 or 17, that works too: the first migration adds the ID function those versions lack.
4. Open the app service's **Settings → Networking** and choose **Generate Domain**. Note the URL, e.g. `https://lekkerwerk-production.up.railway.app`.

## 3. Variables (app service → Variables)

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}`, the reference to the Railway database (private network, already encrypted). Never use the public `DATABASE_PUBLIC_URL` for the app; if you must reach a database over the internet, add `?sslmode=require` |
| `APP_ENCRYPTION_KEY` | **Copy exactly from your `.env.local`.** QR codes, bot tokens and integration secrets are encrypted with it. A different key makes the copied data unreadable. |
| `APP_URL` | Your Railway URL, e.g. `https://lekkerwerk-production.up.railway.app` (no trailing slash) |
| `CRON_SECRET` | A new long random value (at least 32 random bytes: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `PAYFAST_PASSPHRASE` | **Required for live payments.** Set the same passphrase in PayFast → Settings → Developer settings |
| `TRUSTED_PROXY_HOPS` | Leave unset (1 = Railway's edge). See §7 |
| `CREDENTIAL_HASH_KEY` | Optional, recommended for new installs: 32 random bytes, base64. Never change it once set |
| `NODE_ENV` | `production` |
| `ENABLE_SIMULATORS` | `1` while you demo, so the chat simulator and device "Test tap" work online. Remove it before real customers. |
| `PAYFAST_MODE` | `sandbox` until you are ready to take real money. On a public https URL, live checkout is no longer blocked. |
| `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE` | Your sandbox credentials (or live ones later) |
| `WHATSAPP_*` | Leave empty until Meta approves the shared number (see `.env.example`) |
| `OPS_EMAIL` | Optional: where integration requests are emailed |

Then **Deploy**. The deploy log should show `[migrate] done … (1 migrations applied in total)`, and `/api/health` should return `{"ok":true}`.

## 4. Copy your data (once)

On your PC, in `C:\dev\lekker_werk\lekker-werk`:

```bash
npm run db:export
npm run db:import -- "<Railway Postgres PUBLIC url>"
```

- Get the public URL from the Postgres service: **Connect → Public Network**. It contains the database password, so don't paste it anywhere else.
- The import runs as one transaction: either everything arrives or nothing does. It refuses to run if the Railway database already has companies.
- Run `db:export` right before importing, so the latest local changes go across.

Then open your Railway URL and log in with:
- **your own account**, with the same email and password as locally, or
- **Demo Admin**, whose email and password are in `scripts/demo/.demo-login.json` on your PC.

## 5. Scheduled jobs (cron)

Add two more services from the same GitHub repo. Give each **Root Directory** `lekker-werk` and the same `APP_URL` and `CRON_SECRET` variables.

| Service | Start command | Cron schedule |
|---|---|---|
| `jobs-maintenance` | `node scripts/cron.mjs maintenance` | `0 * * * *` (hourly) |
| `jobs-sync` | `node scripts/cron.mjs sync` | `*/15 * * * *` |

Maintenance does the following:
- loads South African public holidays
- builds leave balances
- turns yesterday's no-shows into absences
- flags forgotten clock-outs
- cleans up expired sessions

## 6. Telegram for real

Once deployed, open Settings → Communication and paste your bot token there.
- Because `APP_URL` is public https, the bot switches to **webhook mode** automatically. `npm run telegram:poll` isn't needed.
- First send `/revoke` to @BotFather to get a fresh token, because the old one was shared in a chat.

## 7. Security after the first deploy

1. **Make yourself platform admin.** Sign up normally with your `@thewebdaddy.co.za` address, then run `railway run npm run platform:admin -- grant you@thewebdaddy.co.za` (or the same command in the service shell). Signup and login never grant it. `npm run platform:admin -- list` shows who has it.
2. **Turn on two-step login:** System portal → Security. Keep the backup codes in your password manager. Lost both? `npm run platform:admin -- reset-2fa <email>`.
3. **Check the client IP is right** (it drives every rate limit): sign in, then in the database run `select ip from sessions order by created_at desc limit 1;`. It must be your own public IP. If it shows a Railway/Fastly address instead, set `TRUSTED_PROXY_HOPS=2` and check again.
4. **Live payments:** `PAYFAST_PASSPHRASE` must be set (live checkout refuses to run without it).
5. **Remove `ENABLE_SIMULATORS`** before real customers.

The full checklist, including things to do outside the code (GitHub, Railway and PayFast accounts, backups), is in [SECURITY.md](SECURITY.md).

## Later schema changes

1. Edit `db/schema/*`.
2. Run `npm run db:generate`, which writes a new file in `db/migrations`.
3. Run `npm run migrate` locally.
4. Commit. Railway applies it on the next deploy.

Your local database was created before migrations existed. It is already marked as being on the baseline (`npm run db:mark-baseline`).
