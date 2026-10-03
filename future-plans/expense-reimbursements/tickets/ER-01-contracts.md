# ER-01: Scope promotion and implementation contracts

- **Status:** Backlog
- **Proposal:** [Expense reimbursements](../PLAN.md)
- **Depends on:** None
- **Risks:** [R01](../RISKS.md#r01), [R02](../RISKS.md#r02), [R04](../RISKS.md#r04), [R06](../RISKS.md#r06)

## Context and objective

Turn the accepted product specification into an implementation contract after the owner schedules the work. Resolve technical choices without reopening accepted behavior such as required payer names or original-date spending adjustments.

## Prerequisites

Explicit scheduling authorization is required. Inspect the current root agreement, deployed architecture, and FP-001 status because they may change before this backlog is started. Creating this ticket does not satisfy the scheduling prerequisite.

## Included work

- Promote the scheduled scope into the root implementation agreement, clearly distinguishing it from delivered functionality.
- Create a proposal-local CONTRACTS.md defining reimbursement states, payer-name normalization/length, optional note handling, and one shared completion predicate.
- Define the additive schema, foreign-key/index strategy, calculated money fields, API routes and response/error shapes, eligible-candidate lookup, and proxy allowlist changes.
- Specify filter precedence, candidate pagination/search, zero-cost counts, pending totals, and cross-period reporting from the accepted product rules.
- Define atomic link/relink/unlink and parent-edit checks, version participation for all affected records, ambiguous-response retries, and manual submission idempotency.
- Define Telegram state transitions, stale interaction behavior, receipt deduplication, and the no-per-transaction-message rule for manual records.
- Specify migration activation, mixed-version safeguards, and a non-destructive recovery approach that preserves existing links and processing state.
- Set the required client evidence matrix, defaulting to ordinary browsers at mobile/desktop widths and Telegram Web. Record any native checks as separate requirements or explicit deferrals.
- Record the current access model and any needed reconciliation if FP-001 has shipped; no implementation dependency on FP-001 is created.

## Excluded work

Feature implementation, production migration, bot messages, deployment, splitting repayments, and changes to the accepted product choices without further owner instruction.

## Affected interfaces

Future reimbursement schema and Expense/API types; list/detail/edit/candidate/totals/insights contracts; manual validation; Telegram completion/outbox behavior; proxy boundaries; the root agreement and proposal-local contracts. None of these interfaces changes merely by writing the contract.

## Acceptance checks

- [ ] Scheduling authorization and root-scope reconciliation are recorded without claiming implementation or deployment.
- [ ] CONTRACTS.md resolves every technical decision assigned to ER-01 in the proposal and remains consistent with required payer names, whole-payment links, pending treatment, and original-period reporting.
- [ ] A concrete atomic approach is identified for concurrent capacity checks and failure-safe relinking, including every parent/repayment edit route.
- [ ] Read/write examples distinguish original amounts from calculated net values, with exact money and explicit Tashkent dates.
- [ ] Migration and recovery address old code ignoring new relationships rather than assuming schema readability is sufficient.
- [ ] Client/access contracts, route restrictions, synthetic verification scenarios, and production authorization boundaries are recorded.

## Completion evidence

Not started. Record the scheduling reference, contract links, resolved decisions, and remaining limitations. Use synthetic or redacted examples only.
