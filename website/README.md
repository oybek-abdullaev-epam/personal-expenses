# Public expense website

Production: https://personal-expenses-liard-chi.vercel.app (Vercel Hobby, `spartak5/personal-expenses`).

Public viewing and editing with no login. The existing HTML/JavaScript dashboard runs behind a Vercel Node.js Function, which holds the Cloudflare backend credential server-side.

Build with `npm run build`, then validate with `npm run validate`. Run `npm run preview` from the parent directory for a synthetic local preview. `npm run dev:website` from the parent runs the generated Web handler in Wrangler for local development; production runs on Vercel.

Deploy this directory with Vercel CLI on a personal Hobby project, framework preset Other, Node.js 24. `vercel.json` rewrites requests to `api/index.js`; the adapter calls the generated `dist/server/index.js`. The build embeds `worker/page.html` and `worker/client.js`. `public` contains a robots exclusion file; application routes are served by the function.

Set `BACKEND_URL` and sensitive `BACKEND_TOKEN` as production-only Vercel environment variables. Do not set production credentials in preview environments or commit credentials. Disable production deployment protection so visitors need no Vercel login. Administrative backend operations are not exposed by the proxy.

The old Sites deployment was deleted on 30 September 2026. Its obsolete hosting manifest was removed. Deploy only to Vercel; use Vercel deployment history for rollback. See `../docs/SETUP.md` for deployment details.
