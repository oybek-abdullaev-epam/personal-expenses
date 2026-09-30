# Expense tracker

Personal UZCARD income and spending: Gmail → Telegram → dashboard.

**Vercel migration complete — 29 September 2026:** [Open the public dashboard](https://personal-expenses-liard-chi.vercel.app). No login is required; anyone can view and edit transactions. The deployment uses Vercel Hobby with production-only backend secrets. Cloudflare processing and stored history are preserved; Telegram profile and future message links point to Vercel.

**Dedicated inbox switch complete — 24 September 2026:** old database history is cleared; existing Gmail emails and Telegram messages are retained. The old Google grant is revoked and its token is confirmed unusable. Tracking now starts at **2026-09-24 21:19:45.972 Asia/Tashkent** (2026-09-24T16:19:45.972Z), excluding all earlier email receipts. See [setup and recovery instructions](docs/SETUP.md#dedicated-inbox-switch--24-september-2026).

The old Sites deployment was deleted on 30 September 2026. Vercel is the only active frontend.

The Telegram bot's description and About text include the dashboard link. To refresh both, run `node scripts/integrations.mjs profile https://personal-expenses-liard-chi.vercel.app` using the existing local production configuration. The command verifies the saved text with Telegram.

The bot uses a generated wallet-and-checkmark avatar, saved with its prompt in `assets/`. Set it with `node scripts/integrations.mjs photo assets/telegram-avatar.jpg`; the command uploads the JPEG and verifies that Telegram reports a new profile photo.

**Implemented:** TypeScript Cloudflare Worker, D1 schema, deterministic bilingual parsing, paginated Gmail polling, Telegram categories and transaction-specific replies, retry outbox, daily reminders, and a responsive public Vercel-compatible website.

**Deployed:** The public Vercel dashboard is connected to the Cloudflare backend and D1 database. Anonymous dashboard reads pass; direct anonymous backend API and webhook requests remain rejected (401).

**Gmail connected:** the dedicated inbox is verified with only Gmail read-only access. Its refresh token is deployed and stored locally in an ignored, owner-readable file. The prior account’s grant is revoked; the staged token file was removed.

**Tracking active.** All 40 tests and the build pass. Production dashboard reads, filtered requests, totals, and health are verified. Activation remains 2026-09-24T16:19:45.972Z. No live transactions were edited during migration. See [SETUP.md](docs/SETUP.md) for historical integration acceptance checks.

**Purchase format support:** `Pokupka` purchases accept optional commas between merchant/date, after the time, and before the balance. Regression checks cover plain text, HTML, conflicting copies, duplicate imports, notification retries, and reply association.

## Dashboard views

The default **All** view combines incoming and outgoing money, grouped by Tashkent day. Totals show **Net cash flow (income − spending)** with an income/spending split bar, separately for each currency and using the active filters. Net cash flow is not an account balance. Choose **Income** or **Spending** to see either side alone. The view, **Needs details**, date and category filters apply as soon as they change; search applies on Enter or the search button. Tap a transaction to edit it.

**Month** (header switch, or `#month`) summarises one Tashkent calendar month at a time: spending, income and net cash flow for the month, a calendar shaded by each day's spending, and spending ranked by category. Days before activation are marked as not tracked rather than shown as zero. Hover, focus or tap a day to see its total. **Show transactions** and the category rows open the ledger with the matching filters. Amounts stay per currency; choose a currency when a month has more than one. Review and dismissed items are excluded. The daily amounts are also available as a table. This view is deployed.

Incoming `Perevod na kartu` notifications are recognized as income. Choose **Salary**, **Reimbursement**, or **Other income** in Telegram or on the dashboard, then add a description. Salary instalments are separate transactions. Repayments contribute to income and net cash flow without changing gross spending. Other unrecognized bank operation labels still go to review; no salary schedule or category is inferred.

## Run locally

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

Set local secrets in `backend/.dev.vars`; do not commit them. The backend starts inactive. Production setup, OAuth, webhook registration, and activation are documented in [SETUP.md](docs/SETUP.md).

Public OAuth information pages are available on the backend at `/about`, `/privacy`, and `/terms`. Expense and control API routes remain authenticated.

## Behavior

- Poll every five minutes for `noreply@info.uzcard.uz`, subject `UZCARD INFO`, only after explicit activation.
- Save one expense per Gmail message ID, treating matching Uzbek/Russian copies as one transaction. Unknown or conflicting formats become review items excluded from totals.
- Count outgoing card-to-card transfers labeled `Platezh` as expenses, alongside `oplata`, `E-Com oplata`, and `Pokupka` purchases. Accept both receipt punctuation variants: an optional comma between merchant/date, after the transaction time, and before `balans`. Other operation labels still require review.
- Store exact integer minor units, UTC timestamps interpreted from Asia/Tashkent, and card suffixes. Never retain full emails or balances. Totals are strings of minor units to preserve exact sums.
- Save before notification delivery. Persist retries and deduplicate inbound Telegram updates. Associate replies with their exact description-prompt message ID. After both category and description are saved through Telegram, send a standalone summary receipt with keyboard removal and a dashboard link. Only after the receipt succeeds, delete the associated category messages, description prompts, and owner’s description replies. Cleanup has independent, deduplicated retries. Keep the newest three receipts and expire receipts after 47 hours; pending transactions remain visible. Telegram may refuse deletion of messages older than 48 hours, which are left in place without endless retries. This flow applies to new completions; earlier chat history is not backfilled.
- At 20:00 Tashkent, queue a single daily reminder if unfinished items exist. Delivery retries can repeat a Telegram message after an ambiguous timeout.
- Search, date/category filters, “Needs details,” separate currency totals, optimistic edit conflict handling, and manual review resolution/dismissal are available on the website.
- Show last completed email sync, Gmail connection errors, and Telegram delivery failures.

## Structure

- `backend/src/parser.ts` — pure MIME/text parsing; synthetic fixtures only.
- `backend/src/store.ts` and `backend/migrations/` — D1 persistence and atomic outbox creation.
- `backend/src/gmail.ts` — read-only OAuth polling, activation boundary, checkpoints.
- `backend/src/telegram.ts` — outbound delivery, reply association, reminders.
- `backend/src/api.ts` — authenticated list/edit/totals/month insights/health/activation operations.
- `website/` — Vercel Node.js adapter, server proxy, responsive interface. Deploy only this directory to Vercel; do not publish the modified handler to Sites.
- `tests/` — real SQLite workflow tests with mocked external APIs and synthetic fixtures.
- `scripts/` — local preview and secret-safe setup helpers.

## Validation

All 41 automated tests pass. `npm test` covers parsing, HTML/plain MIME alternatives, duplicate ingestion, pagination, activation boundaries, money, timezone dates, crossed replies, duplicate updates, delivery retries, authorization recovery, review handling, month insights (Tashkent day and month boundaries, exact sums, exclusions), website writes, and unauthorized requests. `npm run build` type-checks TypeScript, dry-runs the backend Worker bundle, and validates the generated Vercel dashboard and adapter. The D1 migration has also been applied locally with Wrangler.

Synthetic checks also cover history-reset rollback and retries, stale Telegram interactions, exact activation boundaries, duplicate polling, and delivery retries. Live post-switch checks confirm owner dashboard access, an empty transaction list, no outstanding notifications, successful scheduled Gmail sync, and rejection of anonymous API/webhook requests. Transaction classification and daily reminders on the new inbox remain live acceptance checks.

[PLAN.md](PLAN.md) contains the agreed scope; [docs/SETUP.md](docs/SETUP.md) contains deployment and live acceptance steps.
