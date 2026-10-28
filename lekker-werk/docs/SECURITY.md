# Security

How LekkerWerk protects tenants' data, and what has to be done outside the code.

## How it works

| Area | What protects it | Where |
|---|---|---|
| Tenant isolation | `companyId` only ever comes from the session, device key or webhook secret. Every query filters by it; ids from another tenant answer 404. | `server/auth/context.ts`, every service |
| Platform access | SUPER_ADMIN is granted only with `npm run platform:admin -- grant <email>` (needs database access, `@thewebdaddy.co.za` only). Never by signup or login. | `scripts/platform-admin.ts` |
| Passwords | scrypt (N=32768). At least 10 characters with upper, lower and a digit; refused if in HaveIBeenPwned (k-anonymity, fails open). | `lib/crypto.ts`, `server/auth/breached-password.ts` |
| Login guessing | 5 failures per identifier per IP per 15 min, 30 per identifier per hour. No lockout, same response for unknown accounts. | `authentication.service.ts` |
| Two-step login | Optional TOTP + 10 backup codes for super admins. No session until the code is accepted; codes can't be replayed; 5 wrong codes / 15 min. | `server/services/two-step.service.ts`, System → Security |
| Sessions | Random token, only its sha256 stored, httpOnly + SameSite=Lax cookie. 7 days max, 12 h idle (2 h for super admins). New token when a super admin enters/leaves a tenant; tenant access lapses after 1 h. | `server/auth/session.ts` |
| CSRF | Same-origin check plus a double-submit token on every mutating request with a session. | `server/http/route.ts` |
| Browser | Nonce-based CSP (no injected script can run), HSTS, `frame-ancestors 'none'`, `nosniff`, Referrer-Policy, Permissions-Policy. | `proxy.ts`, `lib/security-headers.ts` |
| Client IP | Read from the trusted end of `X-Forwarded-For` (`TRUSTED_PROXY_HOPS`), so rate limits and PayFast's IP check can't be spoofed. | `server/http/client-ip.ts` |
| Secrets at rest | Integration credentials, bot tokens, QR secrets, TOTP secrets: AES-256-GCM (`APP_ENCRYPTION_KEY`). Device keys, reset tokens, backup codes: sha256. Card/PIN values: HMAC (`CREDENTIAL_HASH_KEY`). | `lib/crypto.ts`, `server/devices/credential-hash.ts` |
| Clock terminals | Per-device bearer key; 10 unknown cards/PINs per 10 min, then paused and admins alerted. | `server/devices/device-ingest.ts` |
| Webhooks | WhatsApp: HMAC signature of the raw body. Telegram: secret in the URL + secret header. PayFast: signature with passphrase, merchant id, source IP, PayFast's own validation, amount. | `server/channels/*`, `server/billing/payfast.ts` |
| Outbound calls | Tenant-supplied URLs (integrations): https only, public addresses only, checked again at connect time (no DNS rebinding), no redirects, size and time limits. | `lib/ssrf.ts` |
| Exports | CSV cells starting with `= + - @` are neutralised so they can't run as spreadsheet formulas. | `lib/csv.ts` |
| Errors | The browser never sees SQL, stack traces or secrets: a diagnostic code and a ref for the server log. | `server/http/route.ts`, `docs/ERROR_CODES.md` |
| Audit | Every admin change, login, platform promotion and tenant entry is in `audit_logs`. `clock_events` can't be edited (database trigger). | `server/services/audit.service.ts` |

## Checklist outside the code

Do these once, then review them every few months.

- [ ] **Two-step login on every account that can reach production:** GitHub, Railway, PayFast, your domain registrar and the `@thewebdaddy.co.za` mailbox provider.
- [ ] **No catch-all forwarding on `thewebdaddy.co.za`,** and only people you trust get a mailbox there.
- [ ] **GitHub:** turn on Dependabot alerts and security updates, and secret scanning with push protection (repo → Settings → Code security). Protect `main` (require a pull request).
- [ ] **Railway:** only the people who need it are project members. `APP_ENCRYPTION_KEY`, `CRON_SECRET`, `PAYFAST_PASSPHRASE` and `CREDENTIAL_HASH_KEY` live only in Railway variables and your password manager, never in git or chat.
- [ ] **Backups:** Railway Postgres backups are on, and you have restored one into a scratch database at least once to prove it works. Keep a copy of `APP_ENCRYPTION_KEY` with the backups; without it the encrypted columns can't be read.
- [ ] **After each deploy:** the steps in [DEPLOY_RAILWAY.md §7](DEPLOY_RAILWAY.md).
- [ ] **Dependencies:** `npm audit --omit=dev` is clean before each release.

## Known gaps / next steps

- **Email isn't sent yet** (`sendEmail` is a stub), so password reset doesn't reach anyone in production, and signup emails aren't verified. Connect a provider (Resend, Postmark or SMTP), then add email verification.
- **No "change password" screen.** Users created by an admin keep the temporary password until reset works.
- **Dev-only advisories:** vitest/tinypool and drizzle-kit's bundled esbuild. They never run in production. Fix by moving to Node 22 and vitest 5.
- **Rate limits live in Postgres.** Fine for one database; move to Redis or the API gateway at scale.

## Reporting a problem

If you find a security issue, email the platform team directly rather than opening a public GitHub issue.
