# Personal expense tracker: Gmail → Telegram → website

Agreed plan, 23 September 2026, updated 24 September 2026. The deployed tracker now uses the dedicated expense inbox. The owner-authorized database history reset and old Gmail grant revocation are complete. The current activation boundary is 2026-09-24T16:19:45.972Z (2026-09-24 21:19:45.972 Asia/Tashkent); earlier receipts are excluded. New-inbox scheduled sync and the empty private dashboard are verified. A naturally arriving transaction and reminder acceptance checks remain pending. See README.md and docs/SETUP.md.

## Summary

Build a personal expense tracker for the owner’s existing Gmail account. Check for new UZCARD emails every five minutes, save each transaction, and send a Telegram notification asking for a category and short description.

Track only emails received after activation. At **8 pm Tashkent time**, send one reminder if any expenses still need details.

## User experience

- Telegram shows the amount, merchant, transaction time, and card’s last four digits.
- Category buttons: **Transport, Food, Groceries, Shopping, Bills, Health, Entertainment, Other**.
- After choosing a category, reply to a transaction-specific prompt with a description. Replies remain associated with the correct expense when several transactions arrive together.
- An expense is complete when both category and description are supplied. Unfinished expenses remain saved and visible.
- After Telegram classification completes, send a standalone receipt with amount, merchant, transaction time, category, description, and dashboard link. Only after successful receipt delivery, delete its category messages, description prompts, and the owner’s description replies. Persist cleanup retries independently from receipt delivery.
- Keep at most the latest three completed receipts, also expiring them after 47 hours to stay within Telegram’s 48-hour deletion window. Never remove pending transaction prompts. Older messages Telegram refuses to delete may remain; stop retrying permanent deletion failures. Full history stays on the website.
- The mobile-friendly website opens directly to the expense list, newest first. Include search, date/category filters, a “Needs details” filter, spending totals, and editing of category and description.
- Daily reminders contain the unfinished count and a link to the website; send nothing when the list is complete.

## Implementation

### Email ingestion and storage

- Connect the selected existing mailbox using Gmail OAuth with `gmail.readonly`; leave messages unchanged.
- Match sender `noreply@info.uzcard.uz` and subject `UZCARD INFO`.
- Parse the supplied format deterministically: operation, merchant, local transaction time, card suffix, amount, and currency. Interpret transaction times as `Asia/Tashkent`; store monetary amounts as integer minor units.
- Treat the Uzbek and Russian copies within one email as one transaction. Use Gmail message IDs to prevent repeated imports across polling runs.
- Do not store account balances or full email bodies. Store the source message ID for troubleshooting.
- Count outgoing card-to-card transfers reported as `Platezh` as expenses, as confirmed by the owner on 24 September 2026. `Pokupka` purchases are expenses; accept receipts with or without the comma between merchant/date, after the time, and before the balance. Incoming `Perevod na kartu` transactions are recorded as income; unknown operation labels remain review items.
- Unexpected formats or operation types become review items rather than guessed expenses. Exclude unresolved items from totals and notify the user.
- Persist polling progress, paginate results, and catch up after outages without importing anything before activation.

### Cloud services and interfaces

- Use a TypeScript Cloudflare Worker and D1 database for Gmail polling, expense storage, Telegram handling, and reminders. Cloudflare supports scheduled execution through [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
- Host the public website on Vercel Hobby with no login. Anyone can view and edit transactions, including resolving or dismissing review items. Server routes call the Cloudflare backend using a server-held credential; browsers never receive backend secrets. Keep administrative operations inaccessible through the website.
- Provide backend operations to list/filter expenses, update category/description, retrieve totals, and report integration health.
- Receive Telegram events at a separate Worker webhook, validate its secret, and accept interactions only from the configured owner’s private chat. Telegram supports webhook secrets and category buttons through its [Bot API](https://core.telegram.org/bots/api).
- Save expenses before notification delivery. Persist pending notifications, retry transient failures, and deduplicate inbound Telegram updates. An ambiguous Telegram send timeout may produce a repeated notification, but must never create another expense.
- Show last successful email sync and connection errors on the website; alert through Telegram when Gmail authorization needs attention.

## Setup and validation

- The owner uses their existing Gmail account and configures UZCARD delivery. Google read-only authorization applies to the entire mailbox; ingestion selects only matching UZCARD emails received after activation.
- Guide the owner through Google authorization, creating a Telegram bot with BotFather, starting its chat, and connecting cloud hosting. Store credentials as deployment secrets.
- Configure Google OAuth for ongoing personal use rather than leaving it in Testing, where Gmail refresh tokens expire after seven days. Follow Google’s [OAuth documentation](https://developers.google.com/identity/protocols/oauth2).
- Test the supplied bilingual email, HTML/plain-text variants, repeated polling, multiple transactions, malformed messages, and unsupported operations.
- Verify replies attach to the correct expense, website edits persist, unauthorized access fails, and daily reminders occur once at the correct local time.
- Validate recovery from Gmail/Telegram failures, then complete one live transaction flow before declaring the tracker operational.

## Income extension — 24 September 2026

- Default to combined transactions and net cash flow (all income minus spending); also show income and gross spending separately. Salary and reimbursements both count as income.
- Show expenses and incoming money together on the dashboard, with direction filters and separate totals per currency. Positive amounts are stored with an explicit direction; income never increases gross spending.
- Classify incoming money manually as Salary, Reimbursement (someone repaying their share), or Other income. Salary can arrive more than once per month; each email remains a separate transaction. No salary amount or schedule is guessed.
- Telegram uses income-specific category buttons and the same transaction-specific description flow. Income missing category or description participates in the existing reminder and Needs details filter.
- Preserve all existing records, Telegram associations, source deduplication, and activation time. Reclassify the existing incoming review item in place after validating its email. No historical import.

## Authorized mailbox switch and history reset — 24 September 2026

The owner explicitly approved switching to a dedicated Gmail inbox and deleting the existing database history. This one-time operation supersedes the earlier activation-preservation rule: set a new activation boundary at the switch and exclude all earlier email receipts, including messages already in the new inbox. Ordinary reconnects must continue preserving the resulting boundary.

Authorize and verify the new inbox with the existing OAuth client and only `gmail.readonly`. Pause all application processing with a temporary maintenance Worker, then drain earlier scheduled work before resetting. Atomically delete transactions (including income and reviews), notifications, Telegram message associations, locks, and old sync state. Preserve Telegram update deduplication. Keep existing Gmail emails and Telegram chat messages; stale Telegram interactions must not recreate history or affect new transactions. No export or additional transaction backup is created.

Deploy the new refresh token, reset activation and cursor to one recorded UTC timestamp, and restore the normal Worker. Verify an empty dashboard and a successful new-inbox sync before revoking the old account's grant and removing obsolete local token copies. Retain the OAuth client, Telegram integration, dashboard credentials, database, and polling schedule. The application creates no Gmail watch or Pub/Sub subscription. Record execution results in `docs/SETUP.md`; synthetic tests must cover atomic rollback, reset retries, stale Telegram interactions, activation-boundary filtering, duplicate polling, and notification retries.

## Ongoing defaults

Single owner, one existing mailbox, all matching cards, English interface, and Tashkent timezone. Start with the categories above. Keep currencies separate in totals; no currency conversion, historical import, automatic categorization, or budgeting in the first version. Target notification delivery within five minutes of email arrival during normal service operation.

## Vercel transition — 29 September 2026

The owner approved public viewing and all existing dashboard edits without authentication. Use the existing HTML/JavaScript interface and a Node.js Vercel Function, deployed from `website` on a personal Hobby project with a `vercel.app` address. Keep production backend credentials in production server environment variables only. Preserve backend and webhook authentication, same-origin JSON writes, body limits, conflict handling, timeout and redirect protections, and uncached API responses.

Preserve Cloudflare D1 history, activation, Gmail processing, and Telegram state. Validate anonymous reads and synthetic writes, rejected administrative routes, credential isolation, duplicate processing, retries, and reply associations. Smoke-test production reads before changing `SITE_URL` and Telegram profile links. The owner subsequently requested deletion of the old Sites deployment, completed and verified on 30 September 2026. Use Vercel deployment history for frontend rollback; do not recreate the deleted Site. No paid add-ons or custom domain. Deployment and cutover status belongs in README.md and docs/SETUP.md.
