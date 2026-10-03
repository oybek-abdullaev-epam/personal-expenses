# ER-03: Candidate lookup and consistent personal-spending reports

- **Status:** Backlog
- **Proposal:** [Expense reimbursements](../PLAN.md)
- **Depends on:** [ER-02](ER-02-persistence.md)
- **Risks:** [R01](../RISKS.md#r01), [R05](../RISKS.md#r05), [R06](../RISKS.md#r06)

## Context and objective

Expose eligible original expenses and make transaction reads and reports consistently express personal spending. Keep original bank amounts separately inspectable.

## Prerequisites

ER-02 supplies persisted relationships, mutation invariants, and shared completion rules under the ER-01 contracts.

## Included work

- Implement bounded, searchable candidate retrieval independent of currently loaded ledger pages and filters. Include dates, descriptions, and original/reimbursed/remaining amounts; the write path remains authoritative when candidates become stale.
- Extend list/detail responses with payer/link metadata and original/reimbursed/net values, including linked repayment details for the parent expense.
- Hide linked standalone repayments from the default ledger, show pending ones, exclude reimbursements from Income, and support all repayments through the Reimbursement filter.
- Adjust totals and month insights using complete parent relationships across repayment date boundaries. Exclude classified reimbursements from income and return pending amounts separately.
- Apply the contract's filter precedence and counting rules, preserve exact per-currency arithmetic, and keep fully reimbursed expenses at zero without duplicating counts.
- Provide a shared calculation boundary for daily-summary integration in ER-05, avoiding separate reimbursement formulas.
- Preserve uncached responses, server-held credentials, bounded reads, and established access restrictions. Update API and reporting documentation.

## Excluded work

Picker rendering, Telegram message formatting, automatic selection, currency conversion, and public deployment.

## Affected interfaces

Transaction list/detail, candidate lookup, totals and insights; shared financial calculations; website proxy allowlist; API/reporting documentation. Existing raw amount fields must retain the ER-01 compatibility semantics.

## Acceptance checks

- [ ] The proposal's dinner sequence yields the exact expected spending, income, and pending values after each state transition.
- [ ] An October repayment reduces September's parent expense/category/day totals even when October is outside the query range; October does not count it as income.
- [ ] All, Spending, Income, Reimbursement, Needs details, date, category, search, and pagination combinations follow the contract without missing or double-counting relationships.
- [ ] Fully reimbursed expenses remain readable at zero and count once; aggregate sums remain exact for large amounts and separate currencies.
- [ ] Old pending reimbursements appear in Needs details and pending totals without guessed names or parents.
- [ ] Candidate lookup finds eligible older records outside the loaded page, excludes invalid records, and opening/read requests have no write or notification effects.
- [ ] Access/proxy rejection tests and the relevant API/reporting tests pass, including applicable ownership checks if the access model changed before scheduling.

## Completion evidence

Not started. Record response examples, expected/actual synthetic totals, commands run, results, and limitations.
