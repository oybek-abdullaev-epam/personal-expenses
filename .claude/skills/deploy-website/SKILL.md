---
name: deploy-website
description: Publish the expense tracker dashboard (the `website/` directory) to Vercel production, verify it anonymously, and record the deploy in docs/SETUP.md. Use when asked to deploy, publish, or redeploy the frontend/website/dashboard.
---

# Deploy the dashboard to Vercel

Deploys `website/` to the Vercel Hobby project `spartak5/personal-expenses` at https://personal-expenses-liard-chi.vercel.app. This does not deploy the Cloudflare backend (`npm run deploy:backend` is separate and only on request).

## Rules

- Never deploy the modified public handler to the private Sites deployment; that stays as the rollback.
- Smoke tests are read-only. Never edit live transactions to test; use the synthetic local tests for writes.
- Never print or log `BACKEND_TOKEN`, `.env*` contents, or `website/.env.local`. Do not change env vars unless asked; only production has `BACKEND_URL`/`BACKEND_TOKEN`.
- Do not commit or push unless asked.

## Steps

Run everything from the repo root unless noted. Use absolute paths; do not run the test and build steps in parallel.

1. **Validate.** `npm test` (all tests must pass), then `npm run build` (typecheck, Worker dry run, website build and `validate`). Stop on any failure.
2. **Check the Vercel account.** From `website/`, run each with `--cache ../.npm-cache`, because `~/.npm` may have root-owned files that break npx:
   - `npx --yes --cache ../.npm-cache vercel whoami`. If not logged in, ask the user to run `! npx --cache ../.npm-cache vercel login`.
   - `npx --yes --cache ../.npm-cache vercel project inspect personal-expenses` must find `spartak5/personal-expenses` (the account username differs from the `spartak5` team slug; that is expected). `website/.vercel/project.json` holds the link.
3. **Deploy.** From `website/`: `npx --yes --cache ../.npm-cache vercel --prod --yes`. Confirm the output says the deployment is ready and reports the production URL. Ensure deployment protection stays disabled (`"deploymentProtection": []`).
4. **Smoke test anonymously** against the production URL with `curl -s -o /dev/null -w '%{http_code}'`:
   - 200: `/`, `/api/expenses`, `/api/expenses?view=income`, `/api/totals`, `/api/health`
   - 404: `/api/activate`
   - Optionally confirm the page still contains the expected UI text, such as "Net cash flow" and "Needs details".
   - If asked to be thorough, also confirm a direct unauthenticated request to the Cloudflare backend API returns 401 (URL is in `backend/wrangler.toml`/`docs/SETUP.md`; do not send tokens).
5. **Record it.** Append a short dated section to `docs/SETUP.md` (see "Dashboard redeploy — 29 September 2026" for the format): what changed, the deployment hostname, tests/build result, smoke check results, and that the backend was not redeployed. Update `README.md` only if what is implemented or how to run it changed.
6. **Report** in one or two sentences: the live URL, what was verified, and anything not verified.

## If something fails

- Build or test failure: fix or report; do not deploy around it.
- Deploy fails on scope or access: check `vercel teams ls` shows `spartak5`; do not relink or create a new project without asking.
- Smoke test not 200 or `/api/activate` not 404: report it, then check `vercel inspect` and logs. Rollback is redeploying the previous deployment from the Vercel dashboard, not touching Sites.
- If `SITE_URL` or the public URL changes, follow SETUP.md section 4 (backend `SITE_URL` redeploy and `node scripts/integrations.mjs profile <url>`), asking the user first.
