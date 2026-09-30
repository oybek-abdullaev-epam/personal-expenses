---
name: deploy-backend
description: Deploy the expense tracker backend (the Cloudflare Worker in `backend/`) to production, check for pending D1 migrations, verify it anonymously, and record the deploy in docs/SETUP.md. Use when asked to deploy, publish, or redeploy the backend/worker/API.
---

# Deploy the backend to Cloudflare

Deploys the Worker `personal-expenses` (config: `backend/wrangler.toml`, D1 database `expenses`, cron `*/5 * * * *`) at https://personal-expenses.oybek-expenses-4801.workers.dev. This does not deploy the Vercel dashboard (use the `deploy-website` skill, only on request).

## Rules

- Deploy with `npm run deploy:backend` only. Never deploy `backend/src/maintenance.ts` or run the mailbox-switch/reset flow; that is a separate, explicitly authorized procedure in docs/SETUP.md.
- Do not change secrets, `SITE_URL`, activation, or the cron schedule unless asked. Secrets persist across deploys; do not run `scripts/deploy-secrets.mjs` as part of a normal deploy.
- Never print or log `.env*` contents, `backend/.dev.vars`, tokens, or refresh tokens.
- Remote D1 migrations change production data and are hard to reverse: list them first, show the user what is pending, and apply only with their go-ahead.
- Smoke tests are read-only and unauthenticated. Never edit live transactions or send Telegram messages to test; use the synthetic local tests.
- Do not commit or push unless asked.

## Steps

Run everything from the repo root. Do not run the test and build steps in parallel.

1. **Validate.** `npm test` (all tests must pass), then `npm run typecheck`, then `npx wrangler deploy --dry-run --config backend/wrangler.toml`. Stop on any failure.
2. **Check Cloudflare access and migrations.** `npx wrangler whoami` must show a logged-in account; if not, ask the user to run `! npx wrangler login` (if it reports `request_forbidden`/CSRF, they should sign into the Cloudflare dashboard in the browser first, see SETUP.md). Then `npx wrangler d1 migrations list expenses --remote --config backend/wrangler.toml`.
   - "No migrations to apply": continue.
   - Pending migrations: show them, ask the user, then run `npm run db:migrate:remote` **before** deploying code that needs them. Keep migrations additive (no rebuilding or deleting existing records).
3. **Deploy.** `npm run deploy:backend`. Confirm the output reports the Worker URL, `schedule: */5 * * * *`, and a Current Version ID; note the version ID.
4. **Smoke test anonymously** against the Worker URL with `curl -s -o /dev/null -w '%{http_code}'`:
   - 401: `/api/expenses` (anonymous API must stay rejected)
   - 405: `/telegram/webhook` via GET (POST-only; a real webhook request needs its secret, do not send one)
   - 200: `/about`, `/privacy`, `/terms`
   - Also check the dashboard still reads through the backend: the Vercel `/api/health` should be 200 (https://personal-expenses-liard-chi.vercel.app/api/health).
   - Optionally review logs briefly with `npx wrangler tail --config backend/wrangler.toml` after the next five-minute cron tick if something looks off.
5. **Record it.** Append a short dated section to `docs/SETUP.md` (see "Backend redeploy — 30 September 2026" for the format): version ID, validation results, whether migrations were applied, smoke results, and that secrets, activation, and history were untouched. Update `README.md` only if what is implemented or how to run it changed.
6. **Report** in one or two sentences: the version ID, what was verified, and anything not verified.

## If something fails

- Test, typecheck, or dry-run failure: fix or report; do not deploy around it.
- Deploy fails on auth: re-run `npx wrangler login`; do not change the account or `database_id` in `wrangler.toml` without asking.
- Smoke test unexpected (`/api/expenses` not 401, `/about` not 200, dashboard health not 200): report it immediately. Roll back with `npx wrangler rollback --config backend/wrangler.toml` (previous version) after telling the user; D1 migrations are not rolled back by this, which is why they must be additive.
- Deployment status belongs in README.md and docs/SETUP.md, not in this skill.
