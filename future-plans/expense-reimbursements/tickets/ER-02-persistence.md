# ER-02: Reimbursement persistence and atomic mutations

- **Status:** Done
- **Proposal:** [Expense reimbursements](../PLAN.md)
- **Depends on:** [ER-01](ER-01-contracts.md)
- **Risks:** [R02](../RISKS.md#r02), [R03](../RISKS.md#r03), [R04](../RISKS.md#r04), [R06](../RISKS.md#r06)

## Context and objective

Persist payer metadata and one-expense reimbursement relationships without rewriting bank transactions. Ensure every write preserves capacity, completion, and retry guarantees.

## Prerequisites

ER-01 supplies the accepted schema, mutation/validation contracts, shared completion rule, migration activation, and recovery design.

## Included work

- Add and register an additive migration, relationship indexes/constraints, and relevant domain types. Preserve all transaction, manual-request, outbox, message-association, and sync state.
- Implement shared required-name/link completion validation, optional reimbursement notes, and pending manual reimbursement creation while retaining ordinary manual description requirements.
- Implement the specified atomic link, relink, unlink, payer correction, and note-edit operations with optimistic version checks and safe retries.
- Enforce source category/direction, resolved target, currency, chronology, and aggregate capacity on every affected write path.
- Reject clearing names on linked records and require unlinking before edits that would invalidate a relationship. Apply this to both parent expenses and incoming repayments, including Telegram classification writes.
- Preserve raw email amounts/dates and manual-create idempotency snapshots. Existing reimbursements have no guessed name or parent and become pending under the new behavior.
- Introduce the shared completion predicate needed by reporting and notification work without enabling a partial production rollout.
- Update relevant data-model/API/manual-flow developer documentation to describe the implemented contract and its deployment status accurately.

## Excluded work

Candidate UI, aggregate reporting, Telegram launch/receipt presentation, automatic historical matching, production migration, and deployment.

## Affected interfaces

New migration and test harness registration; persistence/domain/manual modules; transaction mutation endpoints and proxy methods where required by ER-01; guards on existing API and Telegram writes. Parsing remains unchanged.

## Acceptance checks

- [x] Migration on populated synthetic history preserves IDs, source deduplication, manual snapshots, activation/cursor, outbox jobs, and pending Telegram associations, with no queued migration messages.
- [x] Multiple named repayments can link to one expense; a repayment cannot link twice or be split. Original bank fields remain unchanged.
- [x] Missing/blank names and invalid targets/currencies/dates/capacity are rejected at the server, while incomplete pending records remain saveable.
- [x] Concurrent repayments competing for remaining capacity cannot jointly over-reimburse; stale versions conflict without partial writes.
- [x] Injected failures during relink/unlink and retry after an ambiguous response preserve the old or new complete state, never a partial state or double allocation.
- [x] Parent and repayment manual edits, category changes, and clearing a payer cannot bypass invariants; compatible note/name edits remain usable.
- [x] Manual request-ID retries remain idempotent after later edits, and ordinary description validation remains unchanged.
- [x] Direct unauthorized writes and disallowed proxy operations remain rejected; persistence tests and typecheck pass.

## Completion evidence

[ER-02 evidence](../../../docs/verification/expense-reimbursements/ER-02.md). Implementation and focused/independent verification passed; commit/push recorded in ORCHESTRATION.md.
