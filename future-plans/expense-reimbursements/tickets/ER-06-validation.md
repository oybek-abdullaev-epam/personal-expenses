# ER-06: Integrated validation and recovery rehearsal

- **Status:** Backlog
- **Proposal:** [Expense reimbursements](../PLAN.md)
- **Depends on:** [ER-05](ER-05-telegram.md)
- **Risks:** [R01](../RISKS.md#r01), [R02](../RISKS.md#r02), [R03](../RISKS.md#r03), [R04](../RISKS.md#r04), [R05](../RISKS.md#r05), [R06](../RISKS.md#r06)

## Context and objective

Establish evidence that the combined change preserves financial calculations, records, and Telegram workflows, and can be deployed or recovered without mixing incompatible behavior.

## Prerequisites

ER-05 completes the integrated feature and its prerequisites. ER-01's contracts and recovery design remain current; all prerequisite acceptance results are recorded.

## Included work

- Build a synthetic end-to-end matrix covering email/manual parents and repayments, required names, pending historical records, partial/full repayment, relink/unlink, cross-month totals, and separate currencies.
- Compare ledger, filtered totals, Month view, daily summaries, and receipt context against the same expected values and completion states.
- Exercise concurrent capacity claims, stale edits, network ambiguity, transaction rollback, duplicate ingestion/updates, reverse-order replies, and queued notification state across upgrades.
- Rehearse populated migration, interruption, activation, partial-release protection, and non-destructive recovery using the ER-01 release contract. Ensure old code cannot silently ignore existing links.
- Verify the agreed client matrix and fallback behavior with synthetic data. Record exact tested surfaces and any native/live deferrals.
- Verify access boundaries and plain-text handling; run npm test and npm run build. Update affected implementation docs with accurate delivered-versus-deployed status.
- Produce a release checklist identifying concrete blockers, remaining observations, and the authorization still required for production operations.

## Excluded work

Production deployment, modifying real financial history, unapproved bot messages, and asserting that synthetic checks establish naturally arriving receipt or real scheduled-summary results.

## Affected interfaces

Integration tests, migration fixtures, synthetic previews, verification evidence, deployment/recovery documentation, and implemented API/frontend/lifecycle docs. No production endpoint changes are authorized by this ticket alone.

## Acceptance checks

- [ ] All expected-value scenarios agree across surfaces, including parent-date deductions and reimbursement exclusion from income.
- [ ] Migration and recovery preserve every pre-existing synthetic record, source identity, activation/cursor, outbox job, and pending reply association.
- [ ] Failure/concurrency/retry cases cannot over-reimburse, double-allocate, lose links, or bypass required-name completion.
- [ ] Required UI and Telegram/browser checks have actual evidence; unavailable clients or live observations are listed as deferred rather than passed.
- [ ] Direct unauthorized backend calls, admin proxy access, invalid webhook/chat interactions, cross-origin writes, and applicable cross-owner access remain rejected.
- [ ] npm test and npm run build pass; unresolved correctness or data-preservation issues block rollout.
- [ ] A concrete compatible deploy/recovery sequence and release checklist are documented without executing production changes.

## Completion evidence

Not started. Record commands/results, synthetic scenario evidence, client coverage, migration/recovery outcomes, and unresolved release blockers or deferred observations.
