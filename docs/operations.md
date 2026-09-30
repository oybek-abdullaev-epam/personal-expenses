# Operations runbook

This page covers how to tell whether production is healthy, what each error means and how to fix it, what every helper script does, and the known sharp edges. Deploying is covered in [deployment.md](deployment.md), and first-time setup in [SETUP.md](SETUP.md).

## Is it healthy?

1. **Open the dashboard.** The line at the top reads one of:
   - "Last email sync …": good, and the time should be within the last 5 minutes or so.
   - "Email sync needs attention: gmail …": a Gmail error. See the table below.
   - "… Telegram delivery needs attention": some outbox rows have failed at least once and haven't been sent yet.
   - "Tracking has not been activated.": the `sync_state` row doesn't exist.
2. **Health endpoint.** The same data is available anonymously as JSON:
   ```sh
   curl -s https://personal-expenses-liard-chi.vercel.app/api/health
   # {"sync":{"activated_at":…,"last_success":…,"error":null},"notifications":{"pending":0,"failed":0}}
   ```
   `pending > 0` for a few minutes is normal, because delivery runs every 5 minutes and after every webhook. A `failed` count that keeps rising is not normal.
3. **Live logs.** Run `npx wrangler tail --config backend/wrangler.toml`. It shows each request and cron invocation with its status and any uncaught exception. **The code itself logs nothing** (there are no `console.*` calls), on purpose, to keep email data out of logs. The `error` columns in D1 are the diagnostic trail.
4. **Look at the database directly** (read-only queries only):
   ```sh
   npx wrangler d1 execute expenses --remote --config backend/wrangler.toml \
     --command "SELECT id,kind,attempts,error,datetime(available_at/1000,'unixepoch') FROM outbox WHERE sent_at IS NULL"
   ```
   Don't `SELECT *` from `expenses` into a shared terminal or log. Its rows are personal financial data.

## Gmail error codes (`sync_state.error`)

| Code | Likely cause | Fix |
|---|---|---|
| `gmail_authorization_required` | The refresh token was revoked or expired, or the Google app was moved back to Testing (whose tokens expire after 7 days). The owner also gets one Telegram alert. | `node scripts/google-oauth.mjs /path/to/client.json` (sign in to the **same** inbox), then `node scripts/deploy-secrets.mjs`. The activation boundary is kept. The error clears on the next successful poll. |
| `gmail_invalid_cursor` | Gmail returned HTTP 400, often for an expired `pageToken`. | Usually none. The page token is cleared and the window restarts on the next run. If it repeats every run, look at the request in `wrangler tail`. |
| `gmail_unavailable` | A Google outage, a network problem, a 10 s timeout, or a 5xx or 429 response. | Wait. Every run retries. |
| `gmail_invalid_message`, `gmail_sync_failed` | An unexpected response shape, or a bug. | It retries automatically. If it persists, reproduce the problem with a synthetic test. |

While there is an error, the checkpoint doesn't move forward, so **no email is lost**. After recovery, the backlog is processed at up to 25 emails per 5-minute run.

## Telegram delivery errors (`outbox.error`)

| Value | Meaning | Fix |
|---|---|---|
| `telegram_unavailable` | Network error, timeout, 5xx, or 429 rate limit (Telegram's `retry_after` is respected). | It retries on its own with backoff (at most one hour). |
| `telegram_configuration_required` | Telegram answered 401 or 403. The bot token is wrong, or the owner blocked or stopped the bot. | Fix `TELEGRAM_BOT_TOKEN` and redeploy the secrets, or press **Start** in the bot chat again. Pending rows go out on the next retry. |
| `telegram_message_not_deletable` | A cleanup delete was refused, usually because the message is older than 48 h. | None. The row is marked `unavailable` and never retried. |

Rows are **retried forever**. There is no maximum attempt count and no dead-letter queue. A permanently broken row keeps retrying about once an hour and keeps `failed` above 0.

If the webhook itself is broken (buttons do nothing), run `node scripts/integrations.mjs webhook` to register it again. The command is idempotent, and pending updates are not dropped.

## Helper scripts

Run all of them from the project root. They read the git-ignored `.env.production.json` and never print secrets. When a step fails they print a fixed message rather than the upstream response.

| Command | Does | Reads / writes |
|---|---|---|
| `node scripts/google-oauth.mjs <client.json>` | Browser OAuth (PKCE, loopback, `gmail.readonly` only). It saves the Google tokens and generates `BACKEND_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` **if they are missing**. | Writes `.env.production.json` (mode 600) |
| `node scripts/google-oauth.mjs --switch new@gmail.com` | The same flow for a mailbox switch. It stages the token instead of replacing it. | Writes `.env.gmail-switch.json` |
| `node scripts/deploy-secrets.mjs` | Uploads the 7 Worker secrets with `wrangler secret bulk`. | Reads `.env.production.json` |
| `node scripts/integrations.mjs owner` | Lists private-chat IDs from the bot's pending updates, so you can find `TELEGRAM_OWNER_ID`. | Reads the bot token |
| `node scripts/integrations.mjs webhook` | `setWebhook` to `<BACKEND_URL>/telegram/webhook` with the secret, for `message` and `callback_query` only. | Reads config |
| `node scripts/integrations.mjs profile <site-url>` | Sets the bot's description and About text with the dashboard link, then reads them back to verify. | Reads config |
| `node scripts/integrations.mjs photo assets/telegram-avatar.jpg` | Uploads the bot avatar and verifies it. | Reads config |
| `node scripts/integrations.mjs activate` | `POST /api/activate`. It is idempotent and prints the boundary. | Reads config |
| `node scripts/switch-gmail.mjs verify\|record-pause\|status\|install-token\|reset\|health\|finish` | The mailbox-switch procedure. **Don't run it without an explicit decision to switch inboxes.** See [SETUP.md](SETUP.md#switching-the-gmail-inbox-one-time-maintenance-procedure). | Reads `.env.production.json` and `.env.gmail-switch.json`. Writes `.env.gmail-switch-state.json` |
| `npm run preview` (`scripts/preview.ts`) | Local synthetic dashboard. | Nothing persistent |

## Activation

- The tracker does **nothing** with Gmail until `node scripts/integrations.mjs activate` has been run once. That creates `sync_state` with `activated_at = now`.
- **Emails received before `activated_at` are never imported**, even if the transaction inside them is newer. There is no historical import. To record older transactions, add them by hand on the dashboard.
- Running activate again returns the existing boundary and changes nothing. Reconnecting Gmail keeps the boundary too.
- The current boundary is `2026-09-24T16:19:45.972Z`, set by the mailbox switch (see [history.md](history.md)).

## The maintenance Worker

[`backend/src/maintenance.ts`](../backend/src/maintenance.ts) is a **separate Worker entry point** that uses the same name and database as production. Deploying it *replaces* the production Worker:
- It rejects every normal request, including Telegram webhooks, and does no scheduled work.
- It exposes an authenticated history-reset endpoint that the normal Worker doesn't have.

It exists only for the one-time mailbox switch, which clears all transaction history. It was last used on 24 September 2026. Deploying it by accident stops the tracker until `npm run deploy:backend` is run again.

## Known limitations and sharp edges

- **Rows completed on the website leave their Telegram messages in the chat.** Cleanup runs only after a Telegram receipt, and website edits never queue a receipt.
- **Duplicate Telegram messages are possible.** If a send times out after Telegram accepted it, it is retried. This never creates a duplicate transaction.
- **No retry cap and no pruning.** `outbox`, `telegram_messages` and `telegram_updates` only grow. That is fine at personal volume.
- **Any Gmail HTTP 400 resets the page cursor.** This is safe because of dedup, but a message that causes a 400 on every attempt would block progress.
- **Backlog speed** is 25 emails per 5-minute run.
- **An unexpected exception becomes 503 with nothing logged.** To debug it, reproduce the failing request in a test.
- **Replaying a manual create after the row was edited** returns 200 with the *edited* row, because the comparison uses the original snapshot.
- **The reminder is skipped, not delayed,** if the service is down for the whole 20:00–20:59 Tashkent hour.
- **Review items keep no email content.** To resolve one, find the original email in Gmail yourself.
- **Anyone with the dashboard URL can view and edit data.** This is intentional. The URL is the only protection.
- **Manual entries are never matched to later email receipts.** If you add a card purchase by hand and the email arrives later, you get two rows.

## Backups

D1 has built-in **Time Travel** (point-in-time restore within Cloudflare's retention window), which you use through the Cloudflare dashboard or `wrangler d1 time-travel`. No additional backup is configured. For an extra snapshot, `npx wrangler d1 export expenses --remote --config backend/wrangler.toml --output <file>` writes a SQL dump. That file contains personal financial data, so keep it out of the repository.
