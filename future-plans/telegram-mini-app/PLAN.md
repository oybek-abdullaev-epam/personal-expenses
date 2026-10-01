# Telegram Mini App

- **ID:** FP-002
- **Status:** In progress
- **Recorded:** 2026-10-01
- **Related work:** [Private multi-user pilot (FP-001)](../multi-user-pilot/PLAN.md)
- **Planning material:** [Tickets and dependency graph](TICKETS.md) · [Risk register](RISKS.md) · [Idea index](../README.md)

The owner scheduled implementation and controlled rollout on **2026-10-01**, including real-bot testing with disposable synthetic data. The accepted scope is promoted into the root [PLAN.md](../../PLAN.md). Implementation and observed evidence remain distinct; see [CONTRACTS.md](CONTRACTS.md).

## Problem and audience

The owner already receives and classifies transactions in Telegram but opens a separate dashboard to explore history, inspect the month, or enter cash transactions. Make Telegram the main place to use the tracker, retaining the existing dashboard capabilities and data.

This proposal adapts the current single-owner tracker. It retains the existing public-access policy: anyone with the website or Mini App link can view and edit the same transactions. Separate accounts remain FP-001's responsibility.

## Confirmed scope decision

The owner explicitly removed end-user authentication from this proposal on **2026-10-01**. Opening the Mini App must go directly to the tracker, without sign-in, Telegram identity verification, account linking, application sessions, or an owner-only access gate. This is settled scope, not an open prerequisite to revisit during implementation.

The ordinary website remains usable without login too. Existing server-held backend credentials, administrative restrictions, Gmail OAuth, and Telegram webhook/owner-chat checks remain in place; they support the existing integrations and do not require dashboard visitors to authenticate.

## Accepted experience and scope

1. Open the existing bot and tap **Open tracker** to launch directly into the Ledger inside Telegram.
2. Keep search, direction/date/category filters, Needs details, totals, editing, review resolution, Month view, manual entries, and connection health.
3. Keep category buttons and transaction-specific description replies in the chat. Retain completed receipts, cleanup retries, and the **21:00 Asia/Tashkent daily spending summary**, including its empty-day and outstanding-details rules.
4. Add **View transaction** links to suitable transaction messages and receipts, and **Open tracker** to summaries. Opening a link selects its transaction and never changes data by itself.
5. Match the interface to Telegram's appearance and usable screen area. Back navigation should close an editor before leaving a view. Explain loading, unsupported clients, and connection failures without unnecessarily discarding unsaved form data.
6. Keep the current browser dashboard as a fallback. Missing Telegram launch data or SDK availability must not prevent ordinary dashboard use.

## Preserved behavior and exclusions

Preserve transaction IDs, history, email activation, Gmail cursor and deduplication, pending reply associations, outbox retries, and receipt cleanup state. Keep exact integer minor units, string totals, separate currencies, UTC storage, and explicit Tashkent input/display. Manual submissions retain request-ID idempotency and optimistic edit conflicts, including retries after network failures.

End-user authentication, sessions, owner-only dashboard access, and private-API conversion are excluded. No parser rewrite, historical email import, history reset, bank expansion, budgeting, payment collection, public registration, group expense sharing, native mobile app, or separate frontend framework is included. Keep hosting on Vercel and Cloudflare; displaying the UI inside Telegram does not remove the hosted frontend. In-app Gmail onboarding is outside this release.

## Approach and affected interfaces

### Reuse the existing application

Adapt `website/worker/page.html` and `website/worker/client.js`, retaining the Vercel adapter and same-origin API proxy in `website/worker/index.js`. Keep the Worker/D1 backend and separate ingestion, persistence, and notification delivery modules.

Add a small Telegram integration boundary for startup, appearance, navigation, and launch context. Existing business rules and transaction forms remain shared. Feature-detect client capabilities and retain ordinary in-page controls when a Telegram-specific control is unavailable. Review the current CSP, which permits inline scripts but not the external SDK, and make only the targeted additions necessary for the selected launch modes.

### Existing public API flow

Keep the current flow: Mini App or browser → same-origin Vercel proxy → Cloudflare backend. The proxy retains its server-held backend credential; the client receives no secret. Do not add authentication exchange/logout routes, session storage, login cookies, or user identity requirements.

Retain the proxy allowlist, same-origin JSON write checks, body limits, uncached responses, and redirect/timeout protections. Keep administrative routes outside the public proxy and retain webhook-secret and owner-chat checks for chat interactions. Public dashboard edits already follow a different access policy from bot replies; embedding the dashboard does not change that distinction.

Telegram launch data is unnecessary for access. Do not require it, log it, or use it to change mailbox/chat ownership. Only consume the minimal presentation and routing fields needed for the UI, treating them as untrusted input. No database migration is expected.

### Launch and transaction navigation

Use a bot menu **Open tracker** button and private-chat message buttons. Telegram defines menu and inline `web_app` buttons; inline Mini App buttons have private-chat restrictions. [Menu button](https://core.telegram.org/bots/api#menubuttonwebapp) · [Inline keyboard button](https://core.telegram.org/bots/api#inlinekeyboardbutton).

Configure the menu through `setChatMenuButton` and inline `web_app` buttons with the HTTPS Vercel URL. Main Mini App/BotFather registration, profile launch buttons, and `startapp` links are outside this release. The concrete payloads and browser fallback are in [CONTRACTS.md](CONTRACTS.md).

Use `?transaction=<UUID>` with one strictly validated UUID selector, without embedding amounts, descriptions, credentials, or personal identifiers in launch URLs. Missing, removed, or malformed targets produce an unavailable state and a path back to the Ledger. The current API has list and PATCH operations but no single-transaction GET; MA-06 adds bounded `GET /api/expenses/:id` under the existing public proxy policy rather than assuming the loaded list contains the record.

Use `TELEGRAM_APP_URL` for the HTTPS Vercel Mini App destination, `SITE_URL` for browser/recovery links, and `BACKEND_URL` only for the server proxy; do not blindly replace every use of `SITE_URL`. Audit receipts, summaries, review alerts, Gmail-reconnect notices, bot profile links, and old messages. Link changes must not alter transaction-to-reply associations or create a second notification pipeline. Completing details through the Mini App must retain existing dashboard-edit behavior and safely coexist with pending chat prompts.

## Relationship to the multi-user pilot

FP-002 is independent of FP-001 and has no dependency on its sign-in, account linking, or private APIs. It serves the current shared dashboard without user accounts.

FP-001 separately proposes private per-user data. That model and this public shared-data model must be reconciled as part of a future combined rollout, if pursued. Do not silently add pilot authentication to FP-002 or expose pilot users' private data through this proposal. If the pilot ships first, settle the changed product scope before combining releases; it does not make authentication a hidden ticket in this backlog. FP-001 itself is unchanged by this planning update.

## Recorded decisions

| Decision | Direction | Owner / resolution gate |
| --- | --- | --- |
| Access policy | No end-user authentication; anyone with either link can view/edit | Confirmed by owner on 2026-10-01 |
| Standalone browser | Retain existing public dashboard | In scope |
| Launch surfaces | Bot API menu and private-chat inline `web_app` buttons; no Main Mini App registration | [MA-01 contract](CONTRACTS.md) |
| Required clients | Telegram Web and ordinary browser; native iOS/Android/Desktop deferred | Owner-scoped browser-only verification; record exact tested variant/version in MA-05/MA-07 |
| Recovery | Browser dashboard plus existing owner-operated integration tools | MA-07 rehearsal |
| Future pilot combination | Separate scope reconciliation if both proposals are pursued | Future combined planning; no FP-001 prerequisite here |

## Validation and rollout

- [ ] Mini App and browser visitors can use all existing dashboard operations without sign-in, identity checks, or launch credentials.
- [ ] Required clients support keyboard-open forms, theme changes, Back, close/reopen, and interrupted network access; missing SDK support has a usable browser fallback.
- [ ] Backend credentials remain server-side; direct requests without the backend credential, public administrative requests, and invalid webhook/chat interactions remain rejected.
- [ ] Manual-create retry after an ambiguous response does not duplicate a record; conflicts preserve input and require a refresh/review.
- [ ] Transaction links open the correct record outside the current page/filter; unavailable links fail safely and opening a link causes no mutation.
- [ ] Duplicate ingestion/updates, reversed description replies, notification retries, cleanup retries, and mixed chat/Mini App edits preserve correct associations and effects.
- [ ] History, activation, progress, pending prompts, exact totals, and the 21:00 summary remain correct. No full emails, balances, or credentials appear in test evidence.
- [ ] `npm test` and `npm run build` pass for the implementation, supplemented by Telegram Web/browser checks with synthetic data; real-bot testing in the owner chat is authorized.
- [ ] Rehearse deployment, configuration recovery, and rollback to the browser dashboard without changing existing integration protections or stored state.
- [ ] During the authorized controlled rollout, verify the public dashboard and Mini App, then enable live launch buttons and observe links and the existing transaction flow. Record unobserved checks as pending. Native-client checks, a naturally arriving receipt, and a real 21:00 summary are deferred and do not block this rollout.

Update current-behavior documentation only with implementation; append deployment results to `docs/history.md` only when deployment occurs. Keep only outstanding checks in `next_steps.md`.

## Tickets and dependencies

See [TICKETS.md](TICKETS.md) for six tickets, prerequisite edges, and release gates. Authentication and private-API tickets MA-02/MA-03 have been removed; remaining IDs stay stable. Changes now proceed under the implementation and controlled-rollout authorization, with evidence recorded per ticket.

## Risks and references

See [RISKS.md](RISKS.md). Official Telegram references above were checked on **2026-10-01**; MA-01 and MA-08 must recheck relevant requirements and actual bot/client configuration. Application architecture and rollout steps are our proposed design, not Telegram guarantees.

## Completion evidence

MA-01 contract is recorded on 2026-10-01; implementation is in progress. Real Telegram Web launch and downstream acceptance evidence must be recorded by MA-05/MA-07/MA-08; this scope update does not claim them passed.
