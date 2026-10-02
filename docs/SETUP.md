# Connect the tracker

First-time provisioning and recovery for the backend, Gmail, Telegram, and the public Vercel website. Everything below is already set up in production. Use these steps to rebuild from scratch, reconnect an integration, or recover from a failure. Ordinary reconnects keep the activation boundary. The mailbox switch at the end is the only exception, and it is a one-time operation.

For routine redeploys, see [deployment.md](deployment.md). For day-to-day checks, see [operations.md](operations.md). Dated records of past setup work and deployments are in [history.md](history.md).

## 1. Create the backend

Use Node.js 24 or newer. From the project root:

```sh
npm ci
npx wrangler login
npx wrangler d1 create expenses
```

If Wrangler reports `request_forbidden` with “No CSRF value available in the session cookie,” sign into the Cloudflare dashboard in your browser first, then rerun `npx wrangler login` for a fresh authorization attempt. The initial authorization attempt encountered that error; a later in-browser authorization succeeded and the backend is now deployed.

Copy the returned database ID into `backend/wrangler.toml`, replacing the all-zero placeholder. Keep `database_name = "expenses"`. Then:

```sh
npm run db:migrate:remote
npm run deploy:backend
```

Save the deployed HTTPS Worker URL for step 3. The Worker stays inactive until step 6. Five-minute cron runs are configured; 21:00 Asia/Tashkent is 16:00 UTC. [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

## 2. Authorize the selected Gmail account

The Google Cloud project **Personal Expenses** (`personal-expenses-509512`) has its Gmail API enabled, only `gmail.readonly` declared under Data Access, and a Desktop client named **Personal Expenses Setup**. Its publishing status is **In production**. Public app information, privacy and use pages are deployed at the backend’s `/about`, `/privacy` and `/terms` paths and configured in Google branding. Mailbox authorization is complete. The refresh token successfully obtained an access token with only `gmail.readonly`, and a Gmail profile request verified the expected owner mailbox without reading messages. Credentials are saved in ignored, owner-readable `.env.production.json` and have been uploaded to Cloudflare.

Configure UZCARD delivery to the selected account. In [Google Cloud Console](https://console.cloud.google.com/), create/select a project and enable the Gmail API. Configure Google Auth Platform branding, audience and data access with only `https://www.googleapis.com/auth/gmail.readonly`. Create an OAuth **Desktop app** client and download its client JSON outside the repository.

For ongoing personal use, set the external app's publishing status to **In production** before authorizing. Testing-mode refresh tokens for Gmail expire after seven days. Production status does not guarantee permanent tokens: revocation or other Google policies can still require reconnection. Complete any verification Google requires for your configuration; this is a single-owner personal integration. [Google OAuth token expiration](https://developers.google.com/identity/protocols/oauth2#expiration).

```sh
node scripts/google-oauth.mjs /absolute/path/to/downloaded-client.json
```

The script opens your browser, requests read-only Gmail access, checks an unpredictable state value, and uses PKCE with a loopback callback. Select the selected account. Tokens are saved in ignored, owner-readable `.env.production.json`, never printed. The script also generates `BACKEND_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`. [Google desktop OAuth flow](https://developers.google.com/identity/protocols/oauth2/native-app).

For reconnection, rerun this command and upload secrets again; do not change the saved activation timestamp.

## 3. Create your Telegram bot

Open the verified [BotFather](https://t.me/BotFather) in Telegram, run `/newbot`, and follow its prompts. Open the new bot's private chat and press **Start**.

Open `.env.production.json` in a local editor. Add the bot token as `TELEGRAM_BOT_TOKEN` and the Worker URL as `BACKEND_URL`. Preserve the generated secrets and Google values. Run:

```sh
node scripts/integrations.mjs owner
```

This prints only private chat IDs, never message bodies. Add your own numeric ID as a string under `TELEGRAM_OWNER_ID`. If several appear, verify yours before continuing. This lookup works before setting the webhook; do not remove an existing production webhook just to repeat it.

The complete local JSON has these keys:

```json
{
  "GOOGLE_CLIENT_ID": "…",
  "GOOGLE_CLIENT_SECRET": "…",
  "GOOGLE_REFRESH_TOKEN": "…",
  "BACKEND_TOKEN": "…",
  "TELEGRAM_WEBHOOK_SECRET": "…",
  "TELEGRAM_BOT_TOKEN": "…",
  "TELEGRAM_OWNER_ID": "…",
  "BACKEND_URL": "https://your-worker.workers.dev"
}
```

Upload the seven Worker secrets and register the webhook:

```sh
node scripts/deploy-secrets.mjs
node scripts/integrations.mjs webhook
```

Webhook requests require the Telegram secret header, and interactions must come from your configured user ID in that same private chat. Group chats are rejected. [Telegram Bot API](https://core.telegram.org/bots/api#setwebhook).

The bot's description and profile About text include the public Vercel dashboard link (updated and verified on 29 September 2026). Refresh them after changing the dashboard URL:

```sh
node scripts/integrations.mjs profile https://personal-expenses-liard-chi.vercel.app
```

This uses the existing local bot token and reads both fields back to verify the update.

## Telegram Mini App menu and notification buttons

The Mini App opens the same public shared tracker without sign-in. It requires no Main Mini App registration, BotFather changes, or `startapp` link. Keep `SITE_URL` as the ordinary dashboard and Gmail-recovery link. Optional `TELEGRAM_APP_URL` is a separate HTTPS app root, with no credentials, query, fragment, or extra path; it must be publicly accessible without Vercel login. Add it to the Worker’s `[vars]` only when the candidate is verified and the rollout is ready. Also save it in ignored `.env.production.json` for the menu helper. Invalid or absent Worker configuration omits app buttons and preserves browser links.

Before changing the menu, capture the default and owner override, using the existing local bot token and owner ID:

```sh
node scripts/mini-app-menu.mjs capture
node scripts/mini-app-menu.mjs apply https://your-public-app.vercel.app/
# Without an argument, apply uses TELEGRAM_APP_URL from .env.production.json.
node scripts/mini-app-menu.mjs restore
```

Capture writes ignored `.env.telegram-menu.json` with mode 600 and refuses to overwrite it. Keep that original snapshot throughout testing and rollout. Apply changes only the owner’s private-chat override to **Open tracker**, then verifies its exact readback; restore reapplies and verifies the captured override, including inherited/default settings. The default menu is captured for audit and never modified. `node scripts/mini-app-menu.mjs check` verifies the owner menu against local `TELEGRAM_APP_URL`. A failed or timed-out apply retains the snapshot: restore and verify before retrying. No command resets the webhook or consumes updates.

App buttons reuse existing category notifications, review notices, completed receipts, and daily summaries. Category buttons stay available; description prompts keep ForceReply. Gmail authorization notices and profile links keep the ordinary `SITE_URL` browser destination. [deployment.md](deployment.md#telegram-mini-app-controlled-rollout) describes candidate testing and rollback.

## 4. Connect the public Vercel website

The frontend is now built for Vercel Hobby. The old private Sites deployment was deleted on 30 September 2026. Deploy this frontend only to Vercel.

From `website`, run `npx vercel login`, then `npx vercel link` and select a personal Hobby account/project. Use framework Other and Node.js 24; committed `vercel.json` supplies build and routing settings. Add `BACKEND_URL` and sensitive `BACKEND_TOKEN` with `vercel env add NAME production`, supplying values through stdin from the ignored local configuration without printing them. Do not configure these secrets for previews.

Run `npx vercel --prod`. Ensure production deployment protection is disabled. Verify `/`, `/api/expenses`, `/api/totals`, and `/api/health` anonymously, including query filters. Check that `/api/activate` remains 404 and direct unauthenticated Cloudflare API/webhook requests remain 401. Use synthetic local tests for writes; do not alter live transactions for smoke tests.

Set `SITE_URL` in `backend/wrangler.toml` to the published website URL and redeploy if needed. It is used in review notices, authorization alerts, and reminders.

## 5. Verify before activation

```sh
npm test
npm run build
```

Open the Vercel dashboard anonymously. Confirm transactions, totals, and health load without login. Verify direct anonymous backend requests remain rejected. Keep the mailbox connection read-only.

## 6. Activate and complete the live acceptance check

Only when the integrations are connected:

```sh
node scripts/integrations.mjs activate
```

Activation is idempotent and records the current server time permanently. Earlier email receipts are excluded even if their transaction dates differ. No historical import runs.

On the next real UZCARD transaction received after activation:

1. Verify exactly one expense appears and one Telegram category prompt arrives, normally within five minutes.
2. Select a category, then reply to that transaction's description prompt. Confirm the website shows both details.
3. If two transactions arrive together, reply in reverse order and check both associations.
4. Edit the website description and refresh; the edit must persist.
5. Verify one spending summary during 21:00 Tashkent when today has spending or outstanding details exist. On a day with neither, verify no summary.
6. Review an unsupported email without adding it to totals; either enter verified fields or dismiss it.

The tracker is **not operationally verified** until this live flow succeeds. Synthetic tests cannot prove Google consent, Telegram delivery, public dashboard access, or cloud configuration.

## Recovery and limitations

- Gmail checkpoints and pagination live in D1. Failed pages are replayed safely, using message IDs to prevent duplicates. One page of up to 25 messages is processed per scheduled run; catch-up may span several runs. A two-second query overlap protects second-boundary receipts.
- Each expense and its pending notification are saved in one database transaction. Sends retry with exponential backoff (up to one hour), including Telegram's requested delay. A send that succeeds but times out can be repeated; this never creates a second expense. Replies to an unacknowledged send cannot be mapped until a successfully recorded prompt arrives.
- Daily summaries are queued once per Tashkent date during the 21:00 hour, recheck spending totals and the unfinished count on delivery, and expire when the local date changes. If the service is down throughout that hour, no late reminder is created. Retries after an ambiguous timeout share Telegram's duplicate-send limitation.
- Review items retain only a reason and Gmail message ID, not body, balances, or guessed transaction fields. Look up the original email manually when resolving them.
- Accepted operations are `E-Com oplata`, `oplata`, `Pokupka`, and `Platezh` (outgoing card-to-card transfers count as expenses); UZS, USD, EUR, and RUB use two minor-unit digits. Other formats/currencies are review items. Card data is limited to four digits. No conversion or automatic categorization runs.
- Protect and back up D1 with your Cloudflare account's facilities. Never change an applied migration; add a new one.

## Switching the Gmail inbox (one-time maintenance procedure)

This procedure was last run on 24 September 2026. Its outcome is recorded in [history.md](history.md#dedicated-inbox-switch--24-september-2026). The switch is complete. The following commands document this operation and recovery; do not rerun them to start another reset without a new explicit instruction. Run from the project root:

```sh
node scripts/google-oauth.mjs --switch NEW_GMAIL_ADDRESS
node scripts/switch-gmail.mjs verify
npx wrangler deploy backend/src/maintenance.ts --config backend/wrangler.toml --keep-vars
node scripts/switch-gmail.mjs record-pause
node scripts/switch-gmail.mjs install-token
node scripts/switch-gmail.mjs status
```

The authorization script stages the verified token in ignored, owner-readable `.env.gmail-switch.json`, preserving production credentials. The maintenance deployment rejects application traffic without writes, including Telegram retries, and performs no scheduled work. Its authenticated reset endpoint is absent from the normal Worker. Wait at least 16 minutes after recording maintenance: scheduled invocations can last 15 minutes. Then:

```sh
node scripts/switch-gmail.mjs reset
npm run deploy:backend
node scripts/switch-gmail.mjs health
```

Reset atomically clears dependent rows before transactions, preserves `telegram_updates`, and records the new activation/cursor. `.env.gmail-switch-state.json` stores operation timestamps and completion markers, never tokens or transaction records. Retrying reset reuses the recorded boundary and is a no-op if already applied. Keep this state file during recovery; do not start a second reset. Confirm zero history/totals and wait for `last_success` to reach the new boundary without errors before cleanup:

```sh
node scripts/switch-gmail.mjs finish
```

Finish revokes the old grant, verifies that its refresh token is rejected, reverifies the new grant, replaces local credentials while preserving unrelated secrets, and removes the staged token. Revocation can take time to propagate; the helper preserves its recovery files until verified. If interrupted before reset, leave maintenance in place while diagnosing; returning to the old configuration requires restoring its refresh token before deploying the normal Worker. After reset, recover forward using the same boundary. Never export transaction data for this operation.
