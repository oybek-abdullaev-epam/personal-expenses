# Project history

Dated status notes, deployment records, and acceptance-check logs. They were moved here, unchanged, from README.md, docs/SETUP.md, and next_steps.md on 30 September 2026 so those files could describe the system rather than its timeline. Test counts and "pending" notes reflect the date of each entry, not the present. Add new deployment records at the end.

## Status summary previously in README.md (as of 30 September 2026)

**Vercel migration complete — 29 September 2026:** [Open the public dashboard](https://personal-expenses-liard-chi.vercel.app). No login is required; anyone can view and edit transactions. The deployment uses Vercel Hobby with production-only backend secrets. Cloudflare processing and stored history are preserved; Telegram profile and future message links point to Vercel.

**Dedicated inbox switch complete — 24 September 2026:** old database history is cleared; existing Gmail emails and Telegram messages are retained. The old Google grant is revoked and its token is confirmed unusable. Tracking now starts at **2026-09-24 21:19:45.972 Asia/Tashkent** (2026-09-24T16:19:45.972Z), excluding all earlier email receipts. See [setup and recovery instructions](SETUP.md#switching-the-gmail-inbox-one-time-maintenance-procedure).

The old Sites deployment was deleted on 30 September 2026. Vercel is the only active frontend.

The Telegram bot's description and About text include the dashboard link. To refresh both, run `node scripts/integrations.mjs profile https://personal-expenses-liard-chi.vercel.app` using the existing local production configuration. The command verifies the saved text with Telegram.

The bot uses a generated wallet-and-checkmark avatar, saved with its prompt in `assets/`. Set it with `node scripts/integrations.mjs photo assets/telegram-avatar.jpg`; the command uploads the JPEG and verifies that Telegram reports a new profile photo.

**Implemented:** TypeScript Cloudflare Worker, D1 schema, deterministic bilingual parsing, paginated Gmail polling, Telegram categories and transaction-specific replies, retry outbox, daily reminders, and a responsive public Vercel-compatible website.

**Deployed:** The public Vercel dashboard is connected to the Cloudflare backend and D1 database. Anonymous dashboard reads pass; direct anonymous backend API and webhook requests remain rejected (401).

**Gmail connected:** the dedicated inbox is verified with only Gmail read-only access. Its refresh token is deployed and stored locally in an ignored, owner-readable file. The prior account’s grant is revoked; the staged token file was removed.

**Tracking active.** All 47 tests and the build pass. Production dashboard reads, filtered requests, totals, and health are verified. Activation remains 2026-09-24T16:19:45.972Z. No live transactions were edited during migration. See [SETUP.md](SETUP.md) for historical integration acceptance checks.

**Purchase format support:** `Pokupka` purchases accept optional commas between merchant/date, after the time, and before the balance. Regression checks cover plain text, HTML, conflicting copies, duplicate imports, notification retries, and reply association.

D1 migration `0004_manual_transactions.sql`, the updated backend, and the Vercel website are deployed. Production checks verify the Add transaction interface, creation validation, reads, and access protections; no live transactions were added or edited for smoke testing. Database foreign-key checks pass and the activation boundary is unchanged. See [SETUP.md](#manual-transactions-deployment--30-september-2026) for deployment details.

## Launch checklist previously in next_steps.md (24 September 2026)

Current status: dedicated-inbox switch and database history reset completed on 24 September 2026. Current activation is 2026-09-24T16:19:45.972Z / 2026-09-24 21:19:45.972 Asia/Tashkent. New-inbox scheduled sync, empty owner dashboard, authorization checks, old grant revocation, and token cleanup are verified. All 36 tests and the build pass. Next: verify the next naturally arriving transaction through Telegram and the website, then complete reminder checks. No purchase or artificial production transaction should be created for testing.

The provisioning notes below are historical, not pending work. See docs/SETUP.md for the current switch record. Preserve the new activation boundary on reconnects.

### Progress — 24 September 2026

- Telegram connected as @oybek_personal_expenses_bot; owner verified, seven secrets uploaded, webhook registered, and connection test delivered.
- Website 503 fixed and deployed; owner access and anonymous rejection verified. All 21 tests and build pass.
- Tracking activated at 2026-09-24T04:41:14.629Z / 09:41:14.629 Asia/Tashkent. Retrying activation preserves this boundary.
- Scheduled sync succeeded at 04:50:00.390 UTC / 09:50:00.390 Tashkent, with no sync error or outstanding notifications. Real transaction and reminder acceptance checks below remain pending; tracking active does not mean fully live-verified.

- First real transfer reached Telegram as a review item; `Platezh` support is now deployed after the owner confirmed transfers count as expenses. The original item was resolved without duplication and its category prompt delivered. All 23 tests and build pass. The owner completed category and description replies; backend readback verified both on the original expense, one record per source after a later sync, and healthy notifications. Fresh post-fix transfer ingestion, website edit persistence, reverse-order live replies, and reminder checks remain pending.

### Income extension completed — 24 September 2026

Income is supported and the dashboard defaults to combined transactions and net cash flow, with separate income/spending totals and filters. Categories: Salary, Reimbursement, Other income. Incoming `Perevod na kartu` notifications are recognized. The existing review was resolved in place. Migration and backend/private website deployments are complete; 27 tests and build pass. Live income category/description completion and reminders remain pending.

### Summary

Finish the remaining integrations, activate tracking after readiness checks pass, and verify a real UZCARD transaction. Gmail authorization, Cloudflare deployment, and the private website are already complete.

### Connect Telegram

- Create a new bot through the verified BotFather, named **Personal Expenses**. Use an available username ending in `_bot`.
- Have the owner open its private chat and press **Start**.
- Save the bot token directly in the ignored, owner-readable `.env.production.json`; never paste it into chat or logs.
- Run `node scripts/integrations.mjs owner`, verify the owner’s private chat ID, and save it as `TELEGRAM_OWNER_ID`.
- Preserve the existing Google credentials, backend token, and webhook secret.

### Deploy and verify integrations

- Run `node scripts/deploy-secrets.mjs` to upload all seven integration secrets to the existing Cloudflare Worker.
- Run `node scripts/integrations.mjs webhook` to register the webhook without dropping pending updates.
- Verify the bot identity and webhook URL, then send one clearly labeled connection-test message to the owner.
- Run `npm test` and `npm run build`.
- Confirm the owner can open the website and reach backend health; confirm anonymous expense requests and webhook requests without the secret are rejected.
- Confirm UZCARD emails are delivered to the authorized Gmail account.

No database migration, new service, or API change is planned. Fix setup defects only if these checks reveal them.

### Activate and validate

- Once readiness checks pass, run `node scripts/integrations.mjs activate`.
- Record the activation timestamp in UTC and Tashkent time. Preserve it on retries; import no earlier emails.
- Verify a successful scheduled Gmail sync and healthy notification processing.
- On the next naturally occurring UZCARD transaction, confirm one saved expense and a Telegram category prompt, normally within five minutes.
- Choose a category, reply with a description, and verify both on the website. Edit the description there and refresh to confirm persistence.
- Confirm a later polling cycle does not create another expense.
- When two transactions are available, reply in reverse order to verify association. Leave an item incomplete through 20:00 Tashkent to verify the reminder, then verify no reminder on a day with no unfinished items.

### Completion and defaults

- Use the existing single-owner infrastructure and read-only Gmail permission.
- Do not initiate purchases or inject artificial transactions into production for testing.
- Update README and setup notes with activation status, completed checks, and any live checks still pending.
- Distinguish **tracking active** from **fully live-verified**: real transaction and reminder checks may span multiple days.
- If setup checks fail, keep tracking inactive. If a problem appears after activation, preserve saved expenses and the activation timestamp while fixing it.

## Original activation history — 24 September 2026

Tracking is **active**, but **not fully live-verified**.

- Original activation timestamp: **2026-09-24T04:41:14.629Z** (UTC), **2026-09-24 09:41:14.629 Asia/Tashkent** (UTC+05:00). Superseded only by the explicitly authorized history reset above; ordinary retries and reconnects never reset activation.
- All **27 automated tests pass**, including a regression test for edge-compatible redirect handling. Type checking, backend dry run, website build, and artifact validation pass.
- The website's 503 was reproduced in Cloudflare's local runtime: fetch rejects `redirect: "error"`. The proxy now uses `manual` and rejects 3xx responses without following or forwarding them. The same runtime check now reaches the backend. Website source commit `a1351b82e797d971e52b643653c6354e486f436d` was published successfully as version 2 to the existing owner-private site. Owner browser verification confirms health, totals, and expense-list loading.
- Anonymous backend and website expense requests return 401; webhook requests without the secret return 401. Site access remains owner-only.
- Gmail refresh and read-only scope were reverified immediately before activation. A message-ID-only query confirms matching UZCARD mail; no historical messages were imported for testing.
- Personal Expenses (@oybek_personal_expenses_bot) is connected. The private owner ID was verified, all seven integration secrets uploaded, webhook URL verified without dropping pending updates, and one labeled connection-test message delivered. Webhook reports no delivery error.
- Local configuration is owner-readable (0600); existing Google credentials, backend token, and webhook secret were preserved.
- Scheduled Gmail sync verified: last successful run 2026-09-24T04:50:00.390Z (09:50:00.390 Asia/Tashkent), with no sync error and zero pending or failed notifications. Retrying activation preserved the original timestamp.

The first real notification reached Telegram as an unsupported-operation review. Its observed label was `Platezh`; the owner confirmed that outgoing transfers count as expenses. A synthetic bilingual transfer fixture and regression checks now cover text/HTML parsing, balances, duplicate imports, retry delivery, and crossed replies. The parser fix was deployed on 24 September 2026. The existing review item was resolved in place through the version-checked API, preserving its expense ID and Gmail source ID, and one idempotent category notification was delivered successfully with exactly one recorded transaction-to-message association. Activation and polling progress were preserved.

Live verification on 24 September 2026: the owner confirmed the Telegram flow worked. Backend readback verifies category and description saved on the original resolved transfer, exactly one expense with that Gmail source ID, a later successful sync, no sync error, and no outstanding notifications. No transaction details were copied into these notes.

Live checks still pending: automatic parsing of a fresh `Platezh` email after the fix, persisted website edits, reverse-order replies for two transactions, one 20:00 Tashkent reminder for unfinished items, and no reminder on a day with no unfinished items. Do not create artificial production transactions or initiate purchases. Preserve expenses and activation state if a post-activation problem appears.

## Income dashboard — 24 September 2026

The owner requested income support and a combined view by default. Incoming `Perevod na kartu` transactions now have an explicit income direction and categories Salary, Reimbursement, and Other income. The dashboard shows net cash flow (income minus spending), income, and gross spending per currency, with direction and category filters. Both salary instalments and repayments are income; reimbursements do not reduce the gross spending total. Unknown operation labels still require review, including any salary email format not yet recognized.

Migration `0002_income.sql` adds direction and income category without rebuilding or deleting existing records. It is applied to production. The backend and owner-private website (source commit `909673737d5e1041b7431452d69c6b0cd51b6260`) are deployed. Existing API paths retain their names for compatibility; `/api/totals` retains spending `amount_minor` and adds exact string `income_minor` and signed `net_minor`.

The existing incoming review was parsed again and resolved in place, with its expense ID/source ID preserved and no duplicate. One idempotent income category prompt was delivered successfully; the live Telegram chat shows Salary, Reimbursement, and Other income buttons. Live API readback confirms one source record and consistent separate/net totals. Owner browser verification passed; anonymous backend, website, and secretless webhook requests return 401. Activation is unchanged. Synthetic browser checks verified combined totals, income filtering, income category choices, and description persistence after refresh. All 27 tests and the build pass, including incoming MIME parsing, opposite-direction conflicts, retries, duplicate updates, crossed replies, income completion/reminders, and review recovery.

## Dedicated inbox switch — 24 September 2026

Completed: the dedicated inbox passed identity and read-only scope verification, its refresh token is deployed, and normal service is restored. Following a 16-minute maintenance drain, one atomic reset removed all seven old transactions, all notification records, and all Telegram transaction associations. The 17 processed Telegram update IDs were preserved. Current activation: **2026-09-24T16:19:45.972Z** / **2026-09-24 21:19:45.972 Asia/Tashkent**. New-inbox scheduled sync succeeded at **2026-09-24T16:20:54.788Z** / **21:20:54.788 Asia/Tashkent**, with no error or pending notifications. The authenticated dashboard and API show an empty history with no totals. Anonymous backend and secretless webhook requests return 401; the temporary reset endpoint returns 404. The existing Telegram webhook matches its original endpoint and has no pending updates. The old Gmail grant was revoked and its refresh token rejected with invalid_grant; the new grant was reverified afterward. Local credentials were replaced and the staged token removed. All 36 tests and the build pass. Backend version: 6083640c-a06c-448c-b12d-f5a835591c32.

The owner chose database-only deletion and tracking from the switch onward. Existing emails and Telegram messages remain. The original activation below is historical and is superseded by the recorded switch timestamp. No transaction export or additional backup is created.

## Purchase format support — 29 September 2026

Deployed backend version `8010791a-a014-4649-afc0-72eca19980f6`. `Pokupka` is accepted as an expense; delimiters between merchant/date, after the time, and before the balance accept the observed comma variants. The original review email was replayed in memory, with both language copies agreeing. Its existing record was resolved through the version-checked API, preserving the transaction and source IDs; parsed fields and a single pending record for that source were verified. Category and description still need owner input on the dashboard. No Telegram message was sent by this recovery.

All 37 tests and the build pass, including purchase MIME/punctuation variants, conflicting copies, duplicate persistence, delivery retries, and crossed replies. Post-deployment health has no sync error or pending notifications; anonymous access returns 401. No original email or account balance was saved in diagnostics.

## Vercel transition status — 29 September 2026

Deployment complete: https://personal-expenses-liard-chi.vercel.app (Vercel project `spartak5/personal-expenses`, Hobby, Node.js 24). Deployment `dpl_4dLQhUkrB8iiMH525GNEBCejET3b` is ready with deployment protection disabled. Only production has `BACKEND_URL` and `BACKEND_TOKEN`, both stored as secrets; previews have neither. All 40 tests and the full build pass. Synthetic browser edits persisted, and production anonymous page/API reads, filters, totals, health, and rejected administrative routes passed. No real transaction was edited.

Cloudflare version `ee9b7d68-5ef1-40bb-9422-8c7e281583c0` sets `SITE_URL` to Vercel and updates public information/privacy wording. Activation remains `2026-09-24T16:19:45.972Z`; database history and integration credentials were preserved. The five-minute schedule remains deployed. Telegram profile description and About links were updated and verified. Historical messages retain their original links.

Rollback: use a previously working Vercel deployment, keeping the stable production URL. The old Sites deployment is no longer available.

## Dashboard redeploy — 29 September 2026

Redeployed `website` to Vercel production with the combined income/spending cash-flow view (deployment `personal-expenses-b48noulex-spartak5.vercel.app`, aliased to https://personal-expenses-liard-chi.vercel.app). All 40 tests and the full build passed first. Anonymous `/`, `/api/expenses` (including `view=income`), `/api/totals`, and `/api/health` return 200; `/api/activate` returns 404. Read-only checks only; no live transactions were edited. The backend was not redeployed.

## Old Site deletion — 30 September 2026

The owner deleted the old Expenses Site. Sites reports project `appgprj_6ab37342b244819194332f7abb2448e0` as not found (404). The Vercel dashboard still returns HTTP 200. Removed the obsolete local Sites hosting manifest and fallback instructions. Cloudflare data, integration credentials, and Vercel configuration are unchanged.

## Backend redeploy — 30 September 2026

Redeployed the Cloudflare Worker (`npm run deploy:backend`), version `e17babd6-4e3d-4f34-a46d-6d89b962950f`, after all 41 tests, the typecheck, and a Worker dry run passed. No D1 migrations were pending and the five-minute schedule is unchanged. Anonymous `/api/expenses` returns 401, `/about` returns 200, and the Vercel `/api/health` returns 200. Secrets, activation, and database history were not touched; no live transactions were edited.

## Dashboard redeploy — 30 September 2026

Redeployed `website` to Vercel production with the Month view (deployment `personal-expenses-70bqjw9ap-spartak5.vercel.app`, aliased to https://personal-expenses-liard-chi.vercel.app), after the backend redeploy the same day. All 41 tests and the full build passed first. Anonymous `/`, `/api/expenses` (including `view=income`), `/api/totals`, `/api/health`, and `/api/insights?month=2026-09` return 200; `/api/activate` returns 404; the direct Cloudflare `/api/expenses` returns 401. Read-only checks only; no live transactions were edited. The backend was not redeployed in this step.

## Dashboard redeploy (category strip) — 30 September 2026

Redeployed `website` to Vercel production with the Month view category strip and a centred month title (deployment `personal-expenses-c8kr0tpdg-spartak5.vercel.app`, aliased to https://personal-expenses-liard-chi.vercel.app). All 41 tests and the full build passed first. Anonymous `/`, `/api/expenses` (including `view=income`), `/api/totals`, `/api/health`, and `/api/insights?month=2026-09` return 200; `/api/activate` returns 404; the served page contains the new strip. Read-only checks only; no live transactions were edited. The backend was not redeployed.

## Manual transactions deployment — 30 September 2026

The owner approved publishing manual entry, then committing and pushing the implementation. All 47 automated tests and the full build passed before deployment. Applied D1 migration `0004_manual_transactions.sql` remotely; its 16 statements succeeded. Production `PRAGMA foreign_key_check` returned no violations. Populated-database preservation and migration rollback were verified with synthetic tests before deployment.

Deployed Cloudflare Worker version `1dab22b4-97e6-4987-9706-3cf42e57473a`; the five-minute schedule is unchanged. Deployed Vercel production `dpl_EWwHm3po6gZjJSwYqzDZ1spR3786` (`personal-expenses-1w6608q8n-spartak5.vercel.app`), aliased to https://personal-expenses-liard-chi.vercel.app. The CLI deployment used explicit `--scope spartak5` after an unscoped attempt returned Not authorized. A temporary npm cache avoided local cache permission errors; no credentials were changed.

The served page contains Add transaction and retry-safe creation code. Anonymous page, expenses (including income filter), totals, health, and September insights return 200. A same-origin empty creation request returns 400 without creating a record, cross-origin creation returns 403, administrative activation remains 404, and unauthenticated backend API/webhook calls return 401. Activation remains `2026-09-24T16:19:45.972Z`; Gmail sync reports no error. No live transactions were added or edited for smoke testing. Manual cash/income creation, editing, mobile/desktop forms, and backdated monthly totals were verified in the synthetic preview.

Future deployments should apply pending D1 migrations before the backend, then deploy the website from `website` using `vercel --prod --yes --scope spartak5`. For frontend rollback, use Vercel deployment history. Keep the applied schema migration; do not reverse it or remove manual transaction data to roll back the interface.

## Feature description previously in README.md (as of 30 September 2026)

The README was slimmed to an entry point on 30 September 2026. Its detailed feature, behavior, structure and validation notes are kept here unchanged; the current descriptions live in the other docs/ pages.

### Manual entry (deployed 30 September 2026)

Choose **Add transaction** in either view to record spending or income. Enter merchant/sender, amount, currency, Tashkent date/time, category, and description. UZS and the current Tashkent time are defaults; card suffix is optional for cash or other non-card entries. Amounts accept whole units or up to two decimal places. Saved entries carry a **Manual** label and support editing all fields. No Telegram messages are sent.

Backdated entries (2000 onward) are supported, including before email activation; future times are rejected. Earlier entries contribute to totals, but their days and spending are excluded from the tracked-day average. The monthly calendar can navigate to earlier months and marks history before email tracking as potentially incomplete.

Retry a failed save in the same open form to reuse its request ID. Repeated saves cannot create another record; reusing the ID with changed details returns a conflict. Opening a new form starts a new transaction. Manual entries and later email receipts are not automatically matched or merged.

### Dashboard views

The default **All** view combines incoming and outgoing money, grouped by Tashkent day. Totals show **Net cash flow (income − spending)** with an income/spending split bar, separately for each currency and using the active filters. Net cash flow is not an account balance. Choose **Income** or **Spending** to see either side alone. The view, **Needs details**, date and category filters apply as soon as they change; search applies on Enter or the search button. Tap a transaction to edit it.

**Month** (header switch, or `#month`) summarises one Tashkent calendar month at a time: spending, income and net cash flow for the month, a calendar shaded by each day's spending, and spending ranked by category. Days before activation without spending are marked as not tracked; backdated entries are shown with an incomplete-history note. Hover, focus or tap a day to see its total. **Show transactions** and the category rows open the ledger with the matching filters. Amounts stay per currency; choose a currency when a month has more than one. Review and dismissed items are excluded. The daily amounts are also available as a table. This view is deployed.

Incoming `Perevod na kartu` notifications are recognized as income. Choose **Salary**, **Reimbursement**, or **Other income** in Telegram or on the dashboard, then add a description. Salary instalments are separate transactions. Repayments contribute to income and net cash flow without changing gross spending. Other unrecognized bank operation labels still go to review; no salary schedule or category is inferred.

### Run locally

Requires Node.js 24+ and npm.

```sh
npm ci
npm test
npm run build
npm run preview
```

`preview` opens a local server at `http://127.0.0.1:8788` with synthetic expenses in an in-memory SQLite database. It disables external network calls, never sends Telegram messages, and resets when stopped. It uses the same anonymous dashboard handler as production.

To run the actual backend locally:

```sh
cp backend/.dev.vars.example backend/.dev.vars
npm run db:migrate:local
npm run dev
```

Set local secrets in `backend/.dev.vars`; do not commit them. The backend starts inactive. Production setup, OAuth, webhook registration, and activation are documented in [SETUP.md](SETUP.md).

Public OAuth information pages are available on the backend at `/about`, `/privacy`, and `/terms`. Expense and control API routes remain authenticated.

### Behavior

- Poll every five minutes for `noreply@info.uzcard.uz`, subject `UZCARD INFO`, only after explicit activation.
- Save one expense per Gmail message ID, treating matching Uzbek/Russian copies as one transaction. Unknown or conflicting formats become review items excluded from totals.
- Count outgoing card-to-card transfers labeled `Platezh` as expenses, alongside `oplata`, `E-Com oplata`, and `Pokupka` purchases. Accept both receipt punctuation variants: an optional comma between merchant/date, after the transaction time, and before `balans`. Other operation labels still require review.
- Store exact integer minor units, UTC timestamps interpreted from Asia/Tashkent, and card suffixes. Never retain full emails or balances. Totals are strings of minor units to preserve exact sums.
- Save before notification delivery. Persist retries and deduplicate inbound Telegram updates. Associate replies with their exact description-prompt message ID. After both category and description are saved through Telegram, send a standalone summary receipt with keyboard removal and a dashboard link. Only after the receipt succeeds, delete the associated category messages, description prompts, and owner’s description replies. Cleanup has independent, deduplicated retries. Keep the newest three receipts and expire receipts after 47 hours; pending transactions remain visible. Telegram may refuse deletion of messages older than 48 hours, which are left in place without endless retries. This flow applies to new completions; earlier chat history is not backfilled.
- At 20:00 Tashkent, queue a single daily reminder if unfinished items exist. Delivery retries can repeat a Telegram message after an ambiguous timeout.
- Search, date/category filters, “Needs details,” separate currency totals, optimistic edit conflict handling, and manual review resolution/dismissal are available on the website.
- Show last completed email sync, Gmail connection errors, and Telegram delivery failures.

### Structure

- `backend/src/parser.ts` — pure MIME/text parsing; synthetic fixtures only.
- `backend/src/store.ts` and `backend/migrations/` — D1 persistence and atomic outbox creation.
- `backend/src/gmail.ts` — read-only OAuth polling, activation boundary, checkpoints.
- `backend/src/telegram.ts` — outbound delivery, reply association, reminders.
- `backend/src/api.ts` — authenticated list/edit/totals/month insights/health/activation operations.
- `website/` — Vercel Node.js adapter, server proxy, responsive interface. Deploy only this directory to Vercel; do not publish the modified handler to Sites.
- `tests/` — real SQLite workflow tests with mocked external APIs and synthetic fixtures.
- `scripts/` — local preview and secret-safe setup helpers.

### Validation

All 47 automated tests pass. `npm test` covers parsing, HTML/plain MIME alternatives, duplicate ingestion, pagination, activation boundaries, money, timezone dates, crossed replies, duplicate updates, delivery retries, authorization recovery, review handling, month insights (Tashkent day and month boundaries, exact sums, exclusions), website writes, and unauthorized requests. `npm run build` type-checks TypeScript, dry-runs the backend Worker bundle, and validates the generated Vercel dashboard and adapter. All four D1 migrations passed locally with `npm run db:migrate:local`. Manual-entry checks cover duplicate/retried creation, persistence failures, migration rollback and preserved reply links, exact amounts, income, validation, edits, and same-origin writes.

Synthetic checks also cover history-reset rollback and retries, stale Telegram interactions, exact activation boundaries, duplicate polling, and delivery retries. Live post-switch checks confirm owner dashboard access, an empty transaction list, no outstanding notifications, successful scheduled Gmail sync, and rejection of anonymous API/webhook requests. Transaction classification and daily reminders on the new inbox remain live acceptance checks.

[PLAN.md](../PLAN.md) contains the agreed scope; [docs/SETUP.md](SETUP.md) contains deployment and live acceptance steps.

[Future plans](../future-plans/README.md) collects unscheduled ideas, proposals, implementation tickets, and risks. These documents describe future work, not implemented features.


## Daily Telegram summary deployment — 30 September 2026

Deployed backend version `56e530da-4582-4b7e-863c-bd50af46f025`. Daily Telegram summaries now queue around 21:00 Asia/Tashkent on the existing five-minute schedule, showing today’s spending so far and expense count separately per currency, outstanding needs-details count across all dates when nonzero, and the dashboard link. Days with neither spending nor outstanding details are skipped. Manual spending is included; income, dismissed records, and unresolved reviews are excluded from spending. Delivery retries refresh the values and expire after the local date changes.

All 52 synthetic tests and `npm run build` passed, including exact large totals, local-date boundaries, concurrent sends, retry refresh, stale jobs, duplicate ingestion, and reply associations. No migrations were pending or applied. Secrets, activation, stored transactions, Telegram associations, and the cron schedule were preserved; the website did not require redeployment. Anonymous smoke checks passed: backend `/api/expenses` 401, webhook GET 405, `/about`, `/privacy`, and `/terms` 200, and dashboard `/api/health` 200. No live transactions were edited or test Telegram messages sent. The naturally scheduled summary remains a live acceptance check.

## Dashboard redeploy (calm, phone-first ledger) — 30 September 2026

Deployed `website/` to Vercel production (`personal-expenses-38vlgctgg-spartak5.vercel.app`, aliased to https://personal-expenses-liard-chi.vercel.app). The ledger rows are now two quiet lines. Whole amounts drop `.00`, UZS goes unmarked and other currencies keep their code. Day totals only appear on days with two or more spends. On phones there is a slim top bar with a sync dot (tap to refresh) and a filter button, plus a fixed bottom bar with Ledger, **+** (Add transaction) and Month. Net cash flow moved from the ledger to the Month view, and the ledger now shows a spending and income line only while filtering.

All 52 synthetic tests and `npm run build` passed. Anonymous smoke checks: `/`, `/api/expenses`, `/api/expenses?view=income`, `/api/totals` and `/api/health` returned 200, and `/api/activate` returned 404. The live page contains the new top-bar controls. The backend was not redeployed and no live transactions were edited. Safe-area padding, the fixed bar under Safari's collapsing toolbar, and `ui-rounded` figures remain checks to do by hand on a phone.

## Telegram Mini App candidate — 2 October 2026

Published frontend candidate `personal-expenses-fwlgpln37-spartak5.vercel.app` (`dpl_5oU9R4j5HwhM2nyQ5JjDgLww97bf`) with `vercel --prod --skip-domain --yes --scope spartak5`. The CLI also reported alias `personal-expenses-spartak5.vercel.app`; the established `personal-expenses-liard-chi.vercel.app` was checked and still serves the previous frontend. No backend deployment, migrations, or secret changes. All 60 tests/build passed; candidate `/` and `/api/health` returned 200, `/api/activate` 404. A tracked disposable owner-chat launch opened in Telegram Web K (host protocol 9.6); editor draft guard, Back and clean close/reopen passed. No production transactions were created. This is candidate verification, not stable-alias/live-menu cutover.

## Mini App compatible backend — 3 October 2026

Deployed the MA-06 compatible Worker with app-button configuration still disabled: version `403e5a95-457e-4830-b533-508e1bba613e`. This adds bounded authenticated record lookup and optional presentation buttons; existing cron `*/5 * * * *`, SITE_URL, secrets, D1 bindings, history and activation were retained. No pending migrations; none applied. Integrated validation: 88 tests, typecheck, dry run, frontend build/validation passed. Anonymous backend list/record APIs and unauthenticated webhook POST returned 401; `/about` returned 200; stable dashboard health returned 200 and public activation route 404. The stable frontend/menu had not yet changed at this checkpoint. Recovery can retain this compatible version with buttons disabled.

## Telegram Mini App rollout complete — 3 October 2026

Promoted frontend `personal-expenses-cgpmekt7e-spartak5.vercel.app` (`dpl_HLdn6AaXocmbvxNfXYiMrsdemw4R`) to the existing `personal-expenses-liard-chi.vercel.app` alias after candidate checks; protection remains disabled. Enabled `TELEGRAM_APP_URL` on Worker version `46a5fbe6-b183-4bfc-9b08-d886ee69be63`, then verified the owner Open tracker menu and retained its original rollback snapshot. Profile text now says 21:00, with the same browser link. No migrations or integration-secret changes.

Telegram Web K opened the correct synthetic record, saved an edit, reopened without another write, and handled Back. A refreshed client picked up the final stable menu destination; Ledger/Month and ordinary anonymous browser access worked. Exact cleanup removed one guarded synthetic manual row and two tracked launch messages; the removed link now shows unavailable. Every pre-existing record remained present, activation unchanged, Gmail cursor not reset, sync healthy, no pending outbox errors or recent webhook errors. No production receipt was synthesized or existing receipt deleted. 88 tests/build passed and independent review closed; native clients, natural receipts and real 21:00 observations remain deferred. [Full rollout evidence](verification/telegram-mini-app/MA-08.md) and [recovery readiness](verification/telegram-mini-app/MA-07.md).
