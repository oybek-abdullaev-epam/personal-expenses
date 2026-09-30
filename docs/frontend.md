# Frontend: the public dashboard

This page explains how the website in [`website/`](../website) is built, how its proxy guards the backend, how the browser code is organised, and how to preview UI changes. There is no framework and no bundler, just three source files and a 20-line build script.

## How a request is served

```mermaid
flowchart LR
  B[Browser] -->|"GET /  or  /api/…"| V[Vercel edge]
  V -->|"rewrite (vercel.json)"| A["website/api/index.js<br/>(Node 24 function)"]
  A -->|"imports"| D["dist/server/index.js<br/>(built from worker/)"]
  D -->|"/  → inline HTML page"| B
  D -->|"/api/* allowlisted<br/>+ Bearer BACKEND_TOKEN"| C[Cloudflare backend]
```

- **[`vercel.json`](../website/vercel.json)** rewrites `/` and `/api/:path*` to the single function `/api/index`. `public/` holds only `robots.txt` (`Disallow: /`), and the build writes that file too.
- **[`api/index.js`](../website/api/index.js)** is the Vercel adapter. It imports the **built** `dist/server/index.js` and passes it `BACKEND_URL` and `BACKEND_TOKEN` from `process.env`. Those two variables are set only in Vercel's **production** environment.
- **[`worker/index.js`](../website/worker/index.js)** is the actual handler. It uses the standard `fetch(request, env)` Web API, so it runs the same way on Vercel, in Wrangler (`npm run dev:website`) and in the Node preview server.

## The proxy: the website's security boundary

The dashboard has no login. What protects the backend is this list of rules in `worker/index.js`:

| Rule | Behaviour |
|---|---|
| Path allowlist | Only `^/api/(expenses(/<36 chars [a-f0-9-]>)?\|totals\|insights\|health)$` is forwarded. Everything else under `/api/` returns **404**, including `/api/activate`. The id must be **lowercase**. |
| Method table | `/api/expenses/:id` accepts PATCH only. `/api/expenses` accepts GET and POST. Everything else accepts GET only. Any other method returns **405**. |
| Same-origin writes | POST and PATCH need `Origin` equal to the site's own origin **and** `Content-Type: application/json`, otherwise **403**. This blocks cross-site form posts (CSRF). |
| Body limit | Write bodies are limited to 8000 UTF-8 bytes (**413**). |
| Configuration check | If `BACKEND_URL` or `BACKEND_TOKEN` is missing, it returns **503** "Connect the expense service…". If `BACKEND_URL` isn't `https://`, it also returns 503. |
| Credential handling | It adds `Authorization: Bearer …` on the server. With `redirect: "manual"`, any 3xx from upstream is turned into a **503**, so the token is never sent to a redirect target. The timeout is 15 s. |
| Responses | The upstream status and body are passed through, always with `Cache-Control: no-store`. |
| Page | `GET`/`HEAD /` returns the inline HTML with a strict CSP: `default-src 'none'`, inline script and style only, `connect-src 'self'`. It also sends `nosniff` and `no-referrer`. Any other path returns 404. |

The backend applies its own checks as well (token, validation, versions; see [backend-api.md](backend-api.md)). The proxy is an extra layer, not the only one.

### Adding a new dashboard endpoint

Change all four of these, or the call will 404 in the browser:
1. The backend route in `api()` ([`backend/src/api.ts`](../backend/src/api.ts)).
2. The **path regex** in `worker/index.js`.
3. The **method table** just below it, if it needs anything other than GET.
4. The proxy tests in [`tests/website.test.ts`](../tests/website.test.ts), which assert what is and isn't forwarded.

## The build

`npm --prefix website run build` runs `scripts/build.sh`, which calls [`scripts/build.mjs`](../website/scripts/build.mjs):

1. It reads `worker/index.js`, `worker/page.html` and `worker/client.js`.
2. It replaces `__CLIENT_SCRIPT__` in the HTML with the client code, then replaces the string literal `"__PAGE_DOCUMENT__"` in the handler with the whole page as a JSON string.
3. It writes the result to **`dist/server/index.js`**, which is one self-contained module, plus `public/robots.txt`.

[`scripts/validate-artifact.mjs`](../website/scripts/validate-artifact.mjs) (`npm --prefix website run validate`) imports the adapter, requests `/`, and checks that the page rendered and that no placeholder is left.

`dist/` is git-ignored. **Anything that imports `dist/` sees only the last build**: the Vercel adapter, `validate` and `npm run preview`, which rebuilds first. `tests/website.test.ts` imports the *unbuilt* `worker/index.js`, whose page is still the placeholder, so it tests the proxy rules and not the page contents.

## Browser code: [`worker/client.js`](../website/worker/client.js)

The browser code is one plain script with module-level state (`expenses`, `nextOffset`, `params`, `selected`, `creationId`, `month`, and so on). The main functions:

| Function | Does |
|---|---|
| `api(path, options)` | A `fetch` wrapper. It parses JSON and throws `Error(data.error)` for any non-2xx response, so backend messages appear in the UI. |
| `money(minor, currency)` | Formats a minor-unit value with **BigInt** (it takes numbers or strings). Floating point is never used. |
| `time`, `dayKey`, `dayLabel`, `clock` | Formatting with `Intl` and `timeZone: "Asia/Tashkent"`. |
| `load(append)` | Fetches `/api/expenses`, `/api/totals` and `/api/health` in parallel. `requestVersion` makes a newer filter change win over an in-flight load. With `append = true`, it appends the next page ("Load more"). |
| `render()`, `row(e)` | Build the ledger grouped by Tashkent day. Tapping a row calls `openEditor(e)`. |
| `renderTotals(totals)` | Shows net cash flow and the income/spending split per currency. |
| `form.onsubmit` / `form.onchange` | Turn the filter form into `params`. Toggles and pickers apply immediately, and search applies on Enter. |
| `openEditor(e)` | Opens the `<dialog id="editor">`. With `e = null` it is the **Add transaction** form, and `creationId = crypto.randomUUID()` is generated once per open form. It shows review fields for review items and all fields for manual rows. |
| `save(dismiss)` | Builds the PATCH or POST body (`version`, category, description, plus the manual or `resolve` fields) and sends it, then reloads. A retry from the same open form reuses `creationId`, which is what makes manual creation idempotent. |
| `localInput(iso)` / `apiLocalTime(input)` | Convert between UTC ISO and the `<input type="datetime-local">` value in Tashkent time, then to the backend's `dd.mm.yy HH:MM` format. |
| `route()` | A hash router. `#month` shows the Month view, and anything else shows the ledger. |
| `loadMonth()`, `renderMonth()` | Fetch `/api/insights?month=` and draw the month totals, the calendar heatmap, the per-day table and the category strip. |
| `showLedger(filters)` | Jumps from the Month view to the ledger with filters for a day or a category. |

## Markup and styles: [`worker/page.html`](../website/worker/page.html)

All CSS is in a `<style>` block at the top (dark-first, with light-mode tokens). The body contains:
- `header.bar`: the Ledger/Month switch (`#to-ledger`, `#to-month`) and `#add-transaction`.
- `main#ledger-view`: sync status `#sync`, `#totals`, the filter form `#filters` (search, All/Income/Spending, Needs details, and a collapsible date/category section), the list `#rows` and `#more`.
- `main#month-view`: month navigation, `#month-totals`, the calendar `#cal` with its `#readout`, an accessible `#day-table`, and the categories `#cat-strip` and `#cats`.
- `dialog#editor`: the edit and create form, with `#review-fields`, `#form-error` and `#dismiss`.
- `#toast`.

## Previewing UI changes

```sh
npm run preview      # builds, then serves http://127.0.0.1:8788
```

[`scripts/preview.ts`](../scripts/preview.ts) builds an in-memory database with `setup()` from the test helpers and fills it with synthetic transactions: spending spread over a month, income, and one review item. It **replaces `fetch`** so that only the fake backend is reachable, then serves the real built handler. Nothing leaves your machine, and restarting resets the data.

The [`design-ui` skill](../.claude/skills/design-ui/SKILL.md) records the UI conventions (dark-first, calm, phone-first). It also includes a headless-Chrome screenshot script. Save screenshots under [`docs/screenshots/`](screenshots).

`npm run dev:website` also uses port 8788. It serves the built handler in Wrangler with no backend configured, so `/api/*` returns 503. Use it only to check the Worker runtime, and don't run it at the same time as `preview`.
