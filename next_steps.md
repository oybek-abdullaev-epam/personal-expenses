# Remaining live acceptance checks

Current status: dedicated-inbox switch and database history reset completed on 24 September 2026. Current activation is 2026-09-24T16:19:45.972Z / 2026-09-24 21:19:45.972 Asia/Tashkent. New-inbox scheduled sync, empty owner dashboard, authorization checks, old grant revocation, and token cleanup are verified. All 36 tests and the build pass. Next: verify the next naturally arriving transaction through Telegram and the website, then complete reminder checks. No purchase or artificial production transaction should be created for testing.

The provisioning notes below are historical, not pending work. See docs/SETUP.md for the current switch record. Preserve the new activation boundary on reconnects.

## Progress — 24 September 2026

- Telegram connected as @oybek_personal_expenses_bot; owner verified, seven secrets uploaded, webhook registered, and connection test delivered.
- Website 503 fixed and deployed; owner access and anonymous rejection verified. All 21 tests and build pass.
- Tracking activated at 2026-09-24T04:41:14.629Z / 09:41:14.629 Asia/Tashkent. Retrying activation preserves this boundary.
- Scheduled sync succeeded at 04:50:00.390 UTC / 09:50:00.390 Tashkent, with no sync error or outstanding notifications. Real transaction and reminder acceptance checks below remain pending; tracking active does not mean fully live-verified.

- First real transfer reached Telegram as a review item; `Platezh` support is now deployed after the owner confirmed transfers count as expenses. The original item was resolved without duplication and its category prompt delivered. All 23 tests and build pass. The owner completed category and description replies; backend readback verified both on the original expense, one record per source after a later sync, and healthy notifications. Fresh post-fix transfer ingestion, website edit persistence, reverse-order live replies, and reminder checks remain pending.

## Income extension completed — 24 September 2026

Income is supported and the dashboard defaults to combined transactions and net cash flow, with separate income/spending totals and filters. Categories: Salary, Reimbursement, Other income. Incoming `Perevod na kartu` notifications are recognized. The existing review was resolved in place. Migration and backend/private website deployments are complete; 27 tests and build pass. Live income category/description completion and reminders remain pending.

## Summary

Finish the remaining integrations, activate tracking after readiness checks pass, and verify a real UZCARD transaction. Gmail authorization, Cloudflare deployment, and the private website are already complete.

## Connect Telegram

- Create a new bot through the verified BotFather, named **Personal Expenses**. Use an available username ending in `_bot`.
- Have the owner open its private chat and press **Start**.
- Save the bot token directly in the ignored, owner-readable `.env.production.json`; never paste it into chat or logs.
- Run `node scripts/integrations.mjs owner`, verify the owner’s private chat ID, and save it as `TELEGRAM_OWNER_ID`.
- Preserve the existing Google credentials, backend token, and webhook secret.

## Deploy and verify integrations

- Run `node scripts/deploy-secrets.mjs` to upload all seven integration secrets to the existing Cloudflare Worker.
- Run `node scripts/integrations.mjs webhook` to register the webhook without dropping pending updates.
- Verify the bot identity and webhook URL, then send one clearly labeled connection-test message to the owner.
- Run `npm test` and `npm run build`.
- Confirm the owner can open the website and reach backend health; confirm anonymous expense requests and webhook requests without the secret are rejected.
- Confirm UZCARD emails are delivered to the authorized Gmail account.

No database migration, new service, or API change is planned. Fix setup defects only if these checks reveal them.

## Activate and validate

- Once readiness checks pass, run `node scripts/integrations.mjs activate`.
- Record the activation timestamp in UTC and Tashkent time. Preserve it on retries; import no earlier emails.
- Verify a successful scheduled Gmail sync and healthy notification processing.
- On the next naturally occurring UZCARD transaction, confirm one saved expense and a Telegram category prompt, normally within five minutes.
- Choose a category, reply with a description, and verify both on the website. Edit the description there and refresh to confirm persistence.
- Confirm a later polling cycle does not create another expense.
- When two transactions are available, reply in reverse order to verify association. Leave an item incomplete through 20:00 Tashkent to verify the reminder, then verify no reminder on a day with no unfinished items.

## Completion and defaults

- Use the existing single-owner infrastructure and read-only Gmail permission.
- Do not initiate purchases or inject artificial transactions into production for testing.
- Update README and setup notes with activation status, completed checks, and any live checks still pending.
- Distinguish **tracking active** from **fully live-verified**: real transaction and reminder checks may span multiple days.
- If setup checks fail, keep tracking inactive. If a problem appears after activation, preserve saved expenses and the activation timestamp while fixing it.
