# MU-13: Integrated isolation and reliability validation

- **Status:** Backlog
- **Proposal:** [Private multi-user pilot](../PLAN.md)
- **Depends on:** [MU-12](MU-12-owner-migration.md)
- **Risks:** [R01](../RISKS.md#r01), [R02](../RISKS.md#r02), [R03](../RISKS.md#r03), [R05](../RISKS.md#r05), [R06](../RISKS.md#r06), [R07](../RISKS.md#r07), [R11](../RISKS.md#r11)

## Context and objective

Module tests alone do not prove isolation across authentication, persistence, providers, lifecycle operations, and migration. Validate the complete candidate release using multiple synthetic accounts before production rollout.

## Prerequisites

MU-12 has produced a rehearsed candidate and recovery runbook, with all predecessor acceptance checks complete. Use isolated local/preview environments and mocked integrations; retain module-level tests rather than replacing them.

## Included work

- Build an end-to-end matrix mapping each risk to the relevant tests and evidence, with at least two users whose provider message IDs deliberately collide.
- Exercise anonymous/uninvited access, forged ownership, aggregate/health leaks, OAuth/link replay, cross-chat replies, duplicate processing, and account deletion races through real application interfaces.
- Repeat migration-to-running-app scenarios, then verify reply continuity, exact money, Tashkent date grouping, reminder timing, and unchanged activation.
- Simulate ten accounts, including bursts, rate limits, backlogs, worker restarts, expired leases, and independent integration failures; measure fairness, latency, and resource use.
- Run `npm test` and `npm run build`; record exact commands/results and investigate failures rather than carrying forward old README test counts.
- Produce a release-readiness report with pass/fail evidence, unresolved launch blockers, and live checks reserved for MU-14.

## Excluded work

- Production load tests, manufactured financial transactions, sending Telegram messages to real users, provider verification approval, and production deployment.

## Affected interfaces

The composed Worker, Vercel proxy/UI, D1 persistence/migrations, credential module, Gmail/Telegram adapters, and scheduler. Tests cross the same public/authenticated interfaces as callers.

## Acceptance checks

- [ ] No synthetic cross-user scenario can read, mutate, classify, summarize, or observe another user's data or connection health.
- [ ] Duplicate polling and updates, ambiguous delivery, cleanup retries, and reverse-order replies retain one transaction and correct associations.
- [ ] Deletion/disconnect, stale callbacks/leases, and migration interruption cannot revive removed data or affect another account.
- [ ] Ten-account results show bounded fair progress, measured normal delivery latency, and documented behavior during outages and quota exhaustion.
- [ ] The full test suite/build pass and the report maps results to risk IDs; failures or unverified requirements remain explicit release blockers.
- [ ] The report distinguishes automated coverage from owner/two-participant live acceptance and any historical live checks still pending.

## Completion evidence

Not started. Record the implementation reference, checks actually run and their results, relevant synthetic/redacted evidence, and any remaining limitations. This ticket does not authorize production deployment before MU-14.
