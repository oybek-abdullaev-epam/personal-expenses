# MA-07: Integrated validation and recovery rehearsal

- **Status:** Done
- **Proposal:** [Telegram Mini App](../PLAN.md)
- **Depends on:** [MA-06](MA-06-transaction-links.md)
- **Risks:** [R03](../RISKS.md#r03), [R04](../RISKS.md#r04), [R05](../RISKS.md#r05)

## Context and objective

Produce evidence that the complete candidate is usable without login and recoverable before changing the live service.

## Prerequisites

MA-06 and its transitive dependencies meet acceptance checks. Use synthetic data with pending chat prompts, notifications, manual records, reviews, and nontrivial filters/history.

## Included work

- Run `npm test` and `npm run build`; verify anonymous dashboard use, existing backend/admin/webhook rejection checks, and credential redaction.
- Complete the required Telegram Web/browser matrix with synthetic data (native clients are deferred): launch, list/month/edit/review/manual entry, transaction links, keyboard/themes, Back, close/resume, missing launch data, and ambiguous network responses.
- Regress duplicate ingestion, notification/cleanup retries, reversed replies, concurrent edits, exact money, Tashkent boundaries, and 21:00 summaries.
- Rehearse coordinated deployment, failure at each cutover stage, rollback to the browser dashboard, and recovery when Telegram is unavailable. Verify existing state remains unchanged apart from expected synthetic actions.
- Produce a release checklist with blocker decisions, ordered configuration changes, verification steps, and rollback triggers; document it in deployment/operations pages.

## Excluded work

Production rollout, marking live checks complete from mocks, and user-data exports.

## Affected interfaces

Automated suites, synthetic environment and authorized owner-chat real-bot checks, deployment/recovery runbook, candidate documentation, and ticket evidence.

## Acceptance checks

- [x] Required automated checks pass and supported-client tasks have recorded results; unresolved release blockers are explicit.
- [x] Mini App and ordinary browser dashboard operations work anonymously. Direct backend requests without its credential, public admin requests, and invalid webhook/chat interactions remain rejected.
- [x] Rehearsal preserves history, activation, Gmail progress, outbox state, and pending reply associations, including through recovery.
- [x] Rollback preserves public dashboard use and existing integration protections; the owner can recover through documented tools.
- [x] Readiness report separates verified candidate behavior from live checks reserved for MA-08.

## Completion evidence

See [MA-07 readiness](../../../docs/verification/telegram-mini-app/MA-07.md): 88 tests/build passed, independent review closed, browser matrix and same-database recovery rehearsal passed. Live record routing and final configuration are MA-08 smoke gates; native/natural observations remain deferred.
