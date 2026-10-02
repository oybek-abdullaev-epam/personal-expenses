# MA-08: Controlled owner rollout

- **Status:** Ready
- **Proposal:** [Telegram Mini App](../PLAN.md)
- **Depends on:** [MA-07](MA-07-validation.md)
- **Risks:** [R05](../RISKS.md#r05)

## Context and objective

Release the validated Telegram Mini App while preserving owner history, processing continuity, and the agreed public-access policy without end-user authentication.

## Prerequisites

MA-07 supplies passing readiness evidence and a rehearsed runbook. The owner authorized implementation and controlled rollout on 2026-10-01, including real-bot tests with disposable synthetic data. No additional confirmation gate is required. Recheck bot/client requirements and confirm MA-01's launch/client contract and the confirmed no-login scope still apply.

## Included work

- Deploy compatible frontend/backend changes in the rehearsed order. Verify anonymous dashboard use and existing integration protections before advertising live entry points.
- Verify no-login dashboard access, preserved state, direct backend/admin boundaries, and webhook protections, then configure the selected Bot API menu and inline message launches.
- Check Ledger, Month, a historical transaction link, and connection health without unnecessary production mutations. Use clearly marked disposable synthetic records/messages for real-bot integration checks and remove only those test artifacts. Native-client verification, naturally arriving receipts, and a real 21:00 summary are deferred and remain open observations.
- Monitor redacted integration errors, launch failures, sync/queue age, and delivery errors. Use the rehearsed recovery path if release gates fail.
- Update root plan, README, affected developer docs, and ticket status to reflect actual behavior. Append deployment references and evidence to `docs/history.md`; place only remaining live checks in `next_steps.md`.

## Excluded work

History reset, activation changes, historical import, pilot invitations, public release, paid infrastructure changes, and contacting other users.

## Affected interfaces

Production deployment/configuration, bot entry points, runtime access policy, and current-behavior/operations/history documentation.

## Acceptance checks

- [ ] Visitors launch and use the tracker without login or Telegram identity verification; the ordinary browser dashboard remains functional.
- [ ] Existing history, activation, progress, pending interactions, and notification delivery remain intact.
- [ ] Telegram Web transaction navigation and synthetic receipt/classification checks pass; automated summary regressions preserve spending/empty-day/outstanding-details behavior. Natural receipt and real 21:00 observations remain explicitly deferred, not claimed passed.
- [ ] Rollback/recovery preserves stored data, public dashboard access, and existing backend/admin/webhook protections.
- [ ] Deployment references, observed results, open/deferred checks, and support/recovery instructions are recorded before marking this scoped rollout complete.

## Completion evidence

Not started. Record authorization, deployment references, redacted live results, and any unobserved acceptance checks separately from automated evidence.
