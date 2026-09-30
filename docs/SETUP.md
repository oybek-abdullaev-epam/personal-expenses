# Connect the tracker

The backend, public Vercel website, Gmail authorization, and Telegram integration are deployed. The numbered sections below are setup and recovery instructions. Ordinary reconnects preserve the activation boundary; the explicitly authorized mailbox switch below is a one-time exception.

## Purchase format support — 29 September 2026

Deployed backend version `8010791a-a014-4649-afc0-72eca19980f6`. `Pokupka` is accepted as an expense; delimiters between merchant/date, after the time, and before the balance accept the observed comma variants. The original review email was replayed in memory, with both language copies agreeing. Its existing record was resolved through the version-checked API, preserving the transaction and source IDs; parsed fields and a single pending record for that source were verified. Category and description still need owner input on the dashboard. No Telegram message was sent by this recovery.

All 37 tests and the build pass, including purchase MIME/punctuation variants, conflicting copies, duplicate persistence, delivery retries, and crossed replies. Post-deployment health has no sync error or pending notifications; anonymous access returns 401. No original email or account balance was saved in diagnostics.

## Dedicated inbox switch — 24 September 2026

Completed: the dedicated inbox passed identity and read-only scope verification, its refresh token is deployed, and normal service is restored. Following a 16-minute maintenance drain, one atomic reset removed all seven old transactions, all notification records, and all Telegram transaction associations. The 17 processed Telegram update IDs were preserved. Current activation: **2026-09-24T16:19:45.972Z** / **2026-09-24 21:19:45.972 Asia/Tashkent**. New-inbox scheduled sync succeeded at **2026-09-24T16:20:54.788Z** / **21:20:54.788 Asia/Tashkent**, with no error or pending notifications. The authenticated dashboard and API show an empty history with no totals. Anonymous backend and secretless webhook requests return 401; the temporary reset endpoint returns 404. The existing Telegram webhook matches its original endpoint and has no pending updates. The old Gmail grant was revoked and its refresh token rejected with invalid_grant; the new grant was reverified afterward. Local credentials were replaced and the staged token removed. All 36 tests and the build pass. Backend version: 6083640c-a06c-448c-b12d-f5a835591c32.

The owner chose database-only deletion and tracking from the switch onward. Existing emails and Telegram messages remain. The original activation below is historical and is superseded by the recorded switch timestamp. No transaction export or additional backup is created.

The switch is complete. The following commands document this operation and recovery; do not rerun them to start another reset without a new explicit instruction. Run from the project root:

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

Save the deployed HTTPS Worker URL for step 3. The Worker stays inactive until step 6. Five-minute cron runs are configured; 20:00 Asia/Tashkent is 15:00 UTC. [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

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
5. Leave one item incomplete through 20:00 Tashkent and verify one reminder. Complete all items and verify no reminder on the next day.
6. Review an unsupported email without adding it to totals; either enter verified fields or dismiss it.

The tracker is **not operationally verified** until this live flow succeeds. Synthetic tests cannot prove Google consent, Telegram delivery, public dashboard access, or cloud configuration.

## Recovery and limitations

- Gmail checkpoints and pagination live in D1. Failed pages are replayed safely, using message IDs to prevent duplicates. One page of up to 25 messages is processed per scheduled run; catch-up may span several runs. A two-second query overlap protects second-boundary receipts.
- Each expense and its pending notification are saved in one database transaction. Sends retry with exponential backoff (up to one hour), including Telegram's requested delay. A send that succeeds but times out can be repeated; this never creates a second expense. Replies to an unacknowledged send cannot be mapped until a successfully recorded prompt arrives.
- Reminders are queued once per Tashkent date during the 20:00 hour, recheck the unfinished count, and expire when the local date changes. If the service is down throughout that hour, no late reminder is created. Retries after an ambiguous timeout share Telegram's duplicate-send limitation.
- Review items retain only a reason and Gmail message ID, not body, balances, or guessed transaction fields. Look up the original email manually when resolving them.
- Accepted operations are `E-Com oplata`, `oplata`, `Pokupka`, and `Platezh` (outgoing card-to-card transfers count as expenses); UZS, USD, EUR, and RUB use two minor-unit digits. Other formats/currencies are review items. Card data is limited to four digits. No conversion or automatic categorization runs.
- Protect and back up D1 with your Cloudflare account's facilities. Never change an applied migration; add a new one.

## Vercel transition status — 29 September 2026

Deployment complete: https://personal-expenses-liard-chi.vercel.app (Vercel project `spartak5/personal-expenses`, Hobby, Node.js 24). Deployment `dpl_4dLQhUkrB8iiMH525GNEBCejET3b` is ready with deployment protection disabled. Only production has `BACKEND_URL` and `BACKEND_TOKEN`, both stored as secrets; previews have neither. All 40 tests and the full build pass. Synthetic browser edits persisted, and production anonymous page/API reads, filters, totals, health, and rejected administrative routes passed. No real transaction was edited.

Cloudflare version `ee9b7d68-5ef1-40bb-9422-8c7e281583c0` sets `SITE_URL` to Vercel and updates public information/privacy wording. Activation remains `2026-09-24T16:19:45.972Z`; database history and integration credentials were preserved. The five-minute schedule remains deployed. Telegram profile description and About links were updated and verified. Historical messages retain their original links.

Rollback: use a previously working Vercel deployment, keeping the stable production URL. The old Sites deployment is no longer available.

## Old Site deletion — 30 September 2026

The owner deleted the old Expenses Site. Sites reports project `appgprj_6ab37342b244819194332f7abb2448e0` as not found (404). The Vercel dashboard still returns HTTP 200. Removed the obsolete local Sites hosting manifest and fallback instructions. Cloudflare data, integration credentials, and Vercel configuration are unchanged.

## Dashboard redeploy — 29 September 2026

Redeployed `website` to Vercel production with the combined income/spending cash-flow view (deployment `personal-expenses-b48noulex-spartak5.vercel.app`, aliased to https://personal-expenses-liard-chi.vercel.app). All 40 tests and the full build passed first. Anonymous `/`, `/api/expenses` (including `view=income`), `/api/totals`, and `/api/health` return 200; `/api/activate` returns 404. Read-only checks only; no live transactions were edited. The backend was not redeployed.

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
