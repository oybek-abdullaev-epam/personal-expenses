# MA-05: Bot launch integration

- **Status:** Done
- **Proposal:** [Telegram Mini App](../PLAN.md)
- **Depends on:** [MA-04](MA-04-interface.md)
- **Risks:** [R03](../RISKS.md#r03), [R04](../RISKS.md#r04)

## Context and objective

Connect bot entry points, the adapted interface, and existing public APIs into a working no-login launch flow using synthetic fixtures and authorized real-bot checks.

## Prerequisites

MA-04 provides the adapted client using the existing public API proxy. MA-01 [defines launch modes and the test boundary](../CONTRACTS.md): local synthetic fixtures plus authorized disposable synthetic messages/data on the real bot, preserving all owner history.

## Included work

- Connect startup directly to existing public API requests, without an authentication exchange, session, or Telegram identity gate.
- Prepare menu **Open tracker** and generic message launch buttons, through Bot API menu configuration and private-chat inline `web_app` buttons; no Main Mini App/BotFather or `startapp` setup. Document configuration steps and existing settings needed for rollback.
- Separate frontend hosting/API URLs from Telegram launch destinations. Audit summary, review, receipt, Gmail-recovery, and profile links so recovery remains usable.
- Preserve the notification outbox and existing category/reply controls; button additions reuse existing delivery jobs.

## Excluded work

Record-specific routing (MA-06), embedded Gmail OAuth, sending messages outside the owner chat, and untracked production-data changes. Controlled real-bot configuration/testing is authorized; capture prior menu settings and retain rollback.

## Affected interfaces

Client API/bootstrap code, `backend/src/telegram.ts`, URL/environment configuration, integration setup helpers if appropriate, and setup/frontend/operations docs.

## Acceptance checks

- [x] Required launch modes open the Ledger without sign-in in Telegram Web using authorized synthetic data; another visitor receives the same public dashboard, using synthetic data for verification.
- [x] SDK failure, unsupported clients, and ordinary browser URLs retain useful dashboard access or a browser fallback without requiring launch credentials.
- [x] Existing notification formatting, summary rules, callback data, and reply association behavior survive launch-button additions.
- [x] Duplicate updates, notification timeouts/retries, and cleanup retries preserve existing guarantees; no second delivery pipeline or duplicate transaction is introduced.

## Completion evidence

See [MA-05 evidence](../../../docs/verification/telegram-mini-app/MA-05.md): real Telegram Web K menu and inline launch, exact menu restoration, 67 passing tests, successful build, and independent review. Native clients remain deferred.
