# Telegram Mini App contracts (MA-01)

Accepted 2026-10-01. Scope and rollout are authorized in the root [PLAN.md](../../PLAN.md). This document records implementation decisions and feasibility, not successful client launches. [Ticket index](TICKETS.md).

## Access and state

The website and Mini App expose the same public shared tracker without login, sessions, Telegram identity verification, or account linking. Do not send or log Telegram `initData`, use Telegram user data for access, or change integration ownership from launch context. Keep the server-held backend credential, public proxy allowlist, same-origin JSON writes, body limits, uncached responses, redirect/timeout protections, and webhook-secret/owner-chat checks. FP-001 remains independent.

No database migration, activation reset, ingestion change, new notification pipeline, or historical import is required. Opening a link never writes a transaction or queues a notification. Preserve manual request IDs on ambiguous retries and optimistic versions on edits. Completing an edit retains existing dashboard/chat lifecycle behavior.

## Launch surfaces and destinations

Use the existing bot's private chat. Menu configuration uses the Bot API; Main Mini App registration, BotFather changes, profile launch registration, attachment menu, and `startapp` direct links are not prerequisites or release scope.

| Surface | Contract |
| --- | --- |
| Menu | `setChatMenuButton` with `menu_button: {type: "web_app", text: "Open tracker", web_app: {url: TELEGRAM_APP_URL}}`; capture both default and owner override before changing, then read back with `getChatMenuButton`. Prefer the owner-chat override for controlled rollout. |
| Generic inline button | `{text: "Open tracker", web_app: {url: TELEGRAM_APP_URL}}` on suitable owner-chat messages and summaries. |
| Transaction inline button | `{text: "View transaction", web_app: {url: transactionUrl}}` on category notifications, review alerts, and completed receipts; preserve existing category rows and message associations. |
| Description prompt | Keep ForceReply. Telegram accepts one reply-markup type per message; do not replace ForceReply with an inline keyboard or send a second notification just for a button. |
| Browser fallback | Keep ordinary HTTPS dashboard links usable, including historical messages and profile text. |

Telegram documents HTTPS `web_app` destinations, private-chat inline buttons, and menu configuration through the Bot API. [WebAppInfo](https://core.telegram.org/bots/api#webappinfo), [InlineKeyboardButton](https://core.telegram.org/bots/api#inlinekeyboardbutton), [setChatMenuButton](https://core.telegram.org/bots/api#setchatmenubutton).

`TELEGRAM_APP_URL` is an explicit optional HTTPS Vercel app URL, not a `t.me` URL, backend URL, or access credential. Require a valid HTTPS URL without userinfo, query, or fragment; the current app is served at `/`. When absent or invalid, omit Mini App buttons and retain existing browser links without failing notification delivery. Validate setup configuration before changing the menu. Do not infer a Telegram destination by replacing every `SITE_URL` use.

`SITE_URL` remains the ordinary browser and Gmail-recovery destination. It may currently equal the app URL but has a separate purpose. `BACKEND_URL` stays server-side in Vercel's proxy configuration. Candidate deployments may supply a distinct app URL; verify it is publicly usable without Vercel login before advertising it.

## Transaction selector and retrieval

- Build `TELEGRAM_APP_URL + ?transaction=<UUID>` using URL APIs. Example synthetic selector: `00000000-0000-4000-8000-000000000001`. Carry no financial fields, mailbox/chat identifiers, credentials, or access grants.
- Accept exactly one `transaction` query parameter matching the UUID shape `8-4-4-4-12` hexadecimal digits. Canonicalize case consistently before lookup. Reject duplicates, malformed values, path-like values, and extra selector syntax. Other Telegram SDK query/hash fields are not identity or transaction selectors.
- Add `GET /api/expenses/:id` to backend and public proxy. Perform one parameterized primary-key lookup and return the same transaction shape used by the existing list/edit API. Do not scan or fetch all list pages. Missing or dismissed records return 404; invalid paths are rejected. Retain backend authentication, no-store responses, and the proxy's existing method/access limits.
- Load the target independently of current filters, month, or pagination and open its detail/editor view without saving it. Empty selector means the normal Ledger. Invalid, missing, dismissed, or unavailable records show a neutral state and return-to-Ledger action. Network failure offers retry rather than reporting a missing record or silently selecting another.
- Keep selection transient; Back closes an editor before leaving the view. Opening the same URL twice has no data or notification effect. Out-of-order navigation responses must not replace a newer selection.

## Client contract and evidence gates

| Client/check | Required now | Evidence state at MA-01 |
| --- | --- | --- |
| Telegram Web in available browser | Menu and inline launches, anonymous operations, selected transaction, Back, theme/viewport capabilities, close/reopen, error handling | Parent agent confirmed authenticated Telegram Web K and accessible bot chat; app launch untested. Record browser/version and actual capability results in MA-05/MA-07. |
| Ordinary browser | Ledger, Month, edit/review/manual entry, filters, narrow/desktop layouts, SDK failure, absent context, retry/conflict handling | Required implementation regression evidence in MA-04/MA-07. |
| Native iOS/Android/Desktop | Deferred | Not verified; mobile browser widths do not establish native keyboard/webview support. |
| Naturally arriving receipt / real 21:00 summary | Deferred | Keep open after rollout; do not claim synthetic checks prove observation. |

Use SDK capability detection for startup, Telegram theme, viewport/safe-area changes, and Back. Keep in-page controls and ordinary dashboard use when the SDK or launch context is missing. Preserve unsaved input through recoverable errors and avoid persisting financial form data to browser storage by default. Record unsupported capabilities honestly. The supported-browser candidate must pass real Telegram Web launch checks before claiming integrated launch support.

The owner authorized real-bot tests with clearly marked disposable synthetic data/messages in the owner's chat. Keep test artifacts identifiable and remove only those artifacts after verification; never reset history or clear production queues. Use manual synthetic records and separately tracked launch messages for real-bot tests. Exercise email classification, receipts, and cleanup only in local synthetic fixtures: the global latest-three receipt retention could otherwise delete an older real receipt. Prefer synthetic local fixtures for broad fault/retry tests. No contacts or other chats are part of testing.

## Audited baseline and recovery

Source audit on 2026-10-01, before Mini App implementation:

| Area | Existing behavior / required change |
| --- | --- |
| `website/worker/index.js` | Public `/`; GET list/totals/insights/health; POST manual expense; PATCH expense by ID. Add only bounded single-record GET. Current SDK CSP needs a narrow script-source addition. |
| `backend/src/api.ts`, `store.ts` | Backend credential checked before API; existing primary-key lookup reusable. Preserve public transaction shape and dismissed-record policy. |
| `backend/src/telegram.ts` | `SITE_URL` in summary, receipt, review, Gmail-auth notice. Add app markup to existing jobs; retain recovery/browser text. Preserve category callbacks, ForceReply, outbox leases/retries, receipts and cleanup. |
| `scripts/integrations.mjs` | Profile helper uses a browser URL, no menu helper at baseline. Profile text still says 20:00 reminder and must be corrected to 21:00 daily summary if updated. Capture menu settings for restore, never reset webhook/updates to configure launch. |
| Hosting | Current stable website alias: `https://personal-expenses-liard-chi.vercel.app`; backend: `https://personal-expenses.oybek-expenses-4801.workers.dev`. Vercel rewrites `/` and `/api/*` to its existing function. |
| Actual bot read-only inspection | Parent agent reported `getMe` has no Main Mini App, default menu is commands, owner inherits default. No identifiers, tokens, or private message contents retained here. This establishes configuration compatibility, not launch success. |

Deploy a compatible backend before the frontend that calls its new route. Verify anonymous browser access and protected backend/admin/webhook boundaries before configuring launch. Restore captured menu settings and remove/disable app-button configuration if launch fails; use Vercel's previous production deployment and a compatible backend rollback if necessary. Do not restore/reset D1 or modify activation, Gmail cursor, pending replies, or outbox state to roll back presentation. Keep Gmail recovery in the ordinary browser through existing owner-operated tools.

For MA-04/MA-05 real-browser verification, create a candidate in the existing Vercel project with `vercel --prod --skip-domain --yes`: production environment variables are available, but the stable alias is not promoted. Verify public access, then send only a tracked disposable launch message to the owner. This is authorized test setup, not the final live-menu cutover. A production backend change still waits for the complete compatible candidate.

MA-07 records automated checks and recovery rehearsal. MA-08 executes the already authorized controlled rollout and records actual deployment/real-bot results in `docs/history.md`; `next_steps.md` holds deferred checks. No additional approval gate is introduced by this document.

## Official reference check

Checked 2026-10-01: Telegram's [menu launch documentation](https://core.telegram.org/bots/webapps#launching-mini-apps-from-the-menu-button), [SDK initialization](https://core.telegram.org/bots/webapps#initializing-mini-apps), [Main Mini App distinction](https://core.telegram.org/bots/webapps#launching-the-main-mini-app), and Bot API references above. Telegram supports the selected mechanisms; URL separation, selector/API semantics, access policy, and rollout gates are this project's design decisions.
