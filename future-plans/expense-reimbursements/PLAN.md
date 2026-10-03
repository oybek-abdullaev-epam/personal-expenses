# Expense reimbursements

- **ID:** FP-003
- **Status:** In progress — ER-01–ER-06 authorized 3 October 2026
- **Recorded:** 2026-10-03
- **Related work:** [Telegram Mini App (FP-002)](../telegram-mini-app/PLAN.md) · [Private multi-user pilot (FP-001)](../multi-user-pilot/PLAN.md)
- **Planning material:** [Tickets and dependency graph](TICKETS.md) · [Risk register](RISKS.md) · [Idea index](../README.md)

The owner authorized implementation through ER-06 on 3 October 2026. This specification records the accepted experience; production deployment remains separately gated by ER-07. The root [PLAN.md](../../PLAN.md) remains the current implementation agreement. Reimbursements currently count as income without reducing spending; that remains true until this proposal is separately scheduled, implemented, and deployed.

## Problem and audience

The owner pays a shared bill and later receives other people's shares. Showing the original bill as full spending and each repayment as separate income obscures the owner's actual cost. Success means one visible expense representing the owner's spending, with the original payment and named reimbursements available in its details.

## Proposed experience and scope

### Main flow

1. Import or manually record the original expense and categorize it normally. Initially its full amount counts as spending.
2. For incoming money, choose **Reimbursement** in Telegram. Instead of requesting a generic description, the bot offers **Link to expense**, opening the existing Mini App at that reimbursement.
3. Enter **From**, a required person's name or nickname, and select the expense. A separate note is optional. No contact directory or identity verification is involved.
4. The picker lists recent eligible expenses and supports searching older ones independently of the current ledger page or date filter. Show date, merchant, description, original payment, amount already reimbursed, and remaining cost.
5. Preview **original payment − reimbursements = your spending**, then save. Linking requires both a nonblank payer name and an eligible expense.
6. Replace the original expense's displayed amount with its adjusted cost. Hide the linked repayment as a separate row in the default ledger; expose it inside the expense's details.

The browser dashboard uses the same fields and picker. Manual reimbursements may be saved pending and then completed through the picker; the reimbursement-specific note is optional even though ordinary manual transactions require descriptions. Pending records may lack a payer name or link. Bank sender/merchant data remains separate from the entered payer name.

### Example

All amounts below are synthetic UZS amounts.

| State of a dinner paid at 300,000 | Dinner spending | Income from repayments | Unlinked reimbursement |
| --- | ---: | ---: | ---: |
| No repayment received | 300,000 | 0 | 0 |
| 100,000 classified as Reimbursement, not linked | 300,000 | 0 | 100,000 |
| Ali's 100,000 linked to dinner | 200,000 | 0 | 0 |
| Sara's additional 100,000 linked to dinner | 100,000 | 0 | 0 |

The final ledger entry is **Dinner · 100,000 UZS**, with **Paid 300,000 · Reimbursed 200,000**. Details show the original payment and **Ali · 100,000 UZS** and **Sara · 100,000 UZS**, including repayment dates and optional notes.

An unlinked reimbursement is money already received that needs assigning. It is not an expected payment or an outstanding debt.

### Relationship and correction rules

- Apply the entire repayment to one expense. Several repayments may reference the same expense, but one repayment cannot be split.
- Require a resolved, undismissed expense in the same currency, with transaction time no later than the repayment. Expense category/description completion is independent of link eligibility.
- Never allow combined repayments to exceed the original payment. Explain the mismatch without silently capping or dropping money.
- Preserve original amounts, dates, directions, source IDs, and bank metadata. Calculate personal spending rather than overwriting a bank amount.
- A completed reimbursement requires a payer name and a link; a separate description is unnecessary. Whitespace alone is not a name. Treat names and notes as untrusted plain text.
- Allow correcting a payer name, editing a note, moving a link, or removing it. Moving a link updates both expenses atomically; removing it restores spending and returns the repayment to pending while retaining its name and note.
- Do not allow clearing the payer name while keeping a completed link. Require unlinking before category, direction, currency, amount, or date changes that would invalidate a relationship, including edits to a manual parent expense.
- Keep a fully reimbursed expense visible at zero, with its history. Count each original expense once, never its repayments as additional expenses.
- If the original expense is absent, use the existing manual expense form and then return to the picker. Do not infer or import historical receipts.

### Ledger and reporting

- All entries classified as Reimbursement are excluded from income immediately, whether linked or pending. Incoming money not yet classified retains the current treatment until classified.
- Unlinked reimbursements remain visible with **Needs an expense** and a separately reported pending amount. Missing payer names are also identified. Either missing requirement puts the record in Needs details.
- Default All shows ordinary transactions and pending reimbursements, hiding linked repayments as standalone rows. Spending shows adjusted original expenses; Income excludes reimbursements. The Reimbursement category filter exposes all repayments, linked and pending, for inspection and correction.
- Ordinary expense filters use the original expense's date/category and full reimbursement relationship, even when repayment dates fall outside the selected range. In the dedicated Reimbursement filter, dates refer to the repayments themselves. Pending totals use the pending repayment's date and the applicable filters.
- A September expense reimbursed in October reduces September spending. October does not gain reimbursement income. Keep the adjusted expense at its original position in the ledger.
- Use the same adjusted amounts for filtered totals, monthly spending, calendar, categories, and tracked-day averages. Preserve the existing activation boundary and incomplete-history treatment.
- Replace **Net cash flow** with **Income minus spending**, calculated as non-reimbursement income minus adjusted personal spending. This is not a measure of bank movements or an account balance.
- The 21:00 Tashkent summary uses adjusted spending for that day's expenses, includes pending reimbursements in outstanding details, and retains existing delivery/retry and empty-day rules. Already-sent summaries are not rewritten when repayments arrive later.
- Keep currencies separate, store exact integer minor units, use exact aggregate arithmetic and string totals, and retain explicit UTC storage/Tashkent dates.

### Telegram lifecycle

Reuse the existing transaction selector, browser fallback, message associations, outbox, and cleanup rules. Merely opening the picker performs no write.

Selecting Reimbursement saves the category and offers the linking flow without requiring a generic description reply. Queued prompts must use current transaction state, and old replies must not complete an unlinked or unnamed reimbursement. Other categories keep their current description flow.

Completing a pending email reimbursement through the dashboard queues the existing completion receipt once if it has never been delivered. Include the payer and linked expense context. Corrections do not send replacement receipts. Manual transactions retain their current no-per-transaction-message policy. Existing delivered receipts are not rewritten or duplicated, including for old reimbursements subsequently linked. Migration alone sends no messages.

## Exclusions

No splitting one repayment across expenses, expected-share tracking, debt collection, contacts management, automatic matching, currency conversion, overpayment credit, group/event aggregation, historical email import, bank parser rewrite, account system, or deployment is authorized by saving this proposal. Payer names are labels, not new user accounts.

## Approach and affected interfaces

- Keep ingestion, persistence, and delivery separate. Introduce reimbursement metadata and a relationship while preserving source deduplication, IDs, activation, sync state, outbox jobs, and Telegram associations.
- Use an additive migration and calculate adjusted values from original records. Existing Reimbursement entries become pending under the new reporting behavior. Preserve descriptions as notes; do not derive names or matches from them.
- Extend transaction reads/writes with payer/link metadata and original/reimbursed/net values. Add bounded searchable candidate retrieval and separate pending totals. The exact endpoint, field, and schema contract is an ER-01 deliverable, not an existing capability.
- Apply atomic eligibility, capacity, and version checks to every relevant mutation path, including manual edits and Telegram classification changes. Retried saves cannot allocate a repayment twice, and simultaneous repayments cannot exceed an expense's capacity.
- Share calculation and completion rules across ledger, insights, reminders, and receipt eligibility. Avoid independent formulas that disagree about whether a reimbursement is complete or counts as income.
- Retain the public website/Mini App access policy, same-origin proxy checks, backend credential protection, and owner-only bot interactions. New routes must remain within the established proxy boundary.

## Assumptions and open decisions

The product choices above are accepted, including the owner's final correction that **payer name is required**. They are not alternatives to reopen during routine implementation.

| Remaining implementation decision | Owner / resolution gate |
| --- | --- |
| Exact schema, API fields/routes, candidate pagination, search/filter precedence, and payer length limit | ER-01, before ER-02 begins |
| Atomic D1 mutation strategy and idempotent retry/conflict contract for links and manual creation | ER-01 specifies; ER-02 demonstrates with concurrent and failure tests |
| Compatibility window, activation sequencing, and recovery after old/new application versions overlap | ER-01 defines; ER-06 rehearses before ER-07 |
| Client verification matrix and permitted production smoke checks | ER-01 proposes browser and Telegram Web coverage; ER-07 requires explicit rollout authorization before live writes/messages |
| Relationship to FP-001 if private multi-user support ships first | ER-01 rechecks current scope and confines links/candidates to the authenticated owner if applicable; no dependency on implementing FP-001 |

## Validation and rollout

- [ ] The synthetic dinner example produces one net expense, named detail rows, no reimbursement income, and correct pending totals.
- [ ] Missing/blank names or missing links remain incomplete; ordinary transaction description rules remain intact.
- [ ] Partial/full reimbursement, relinking, unlinking, and cross-month/category/filter totals agree across every reporting surface.
- [ ] Excessive amounts, currency mismatches, future-relative parent expenses, unresolved/dismissed targets, and invalidating edits are rejected without partial writes.
- [ ] Concurrent links, stale versions, ambiguous responses, and retries preserve exact amounts and single application of each repayment.
- [ ] Migration preserves all history and integration state, leaves old reimbursements pending, and creates no message burst or inferred identities.
- [ ] Duplicate polling/updates, reversed replies, old prompts, receipt/cleanup retries, and mixed dashboard/chat edits retain correct associations.
- [ ] Required browser/Telegram clients support the picker, required name, back navigation, conflict recovery, and corrected zero-cost display.
- [ ] Backend/admin/webhook rejection checks, existing tests, and build pass; use only synthetic or redacted evidence.
- [ ] Rehearse deployment and recovery, then separately authorize and execute rollout. Record actual deployment in history and only genuinely outstanding checks in next_steps.

## Tickets and dependencies

See [TICKETS.md](TICKETS.md) for seven Backlog tickets and prerequisite edges. Scheduling and reconciliation with the root implementation agreement precede feature work. Saving these specifications and tickets does not pass that gate.

## Risks and references

See [RISKS.md](RISKS.md). Repository baseline: [data model](../../docs/data-model.md), [API](../../docs/backend-api.md), [transaction lifecycle](../../docs/transaction-lifecycle.md), and [frontend](../../docs/frontend.md), inspected on 2026-10-03. These describe current functionality; this proposal describes future changes. No external platform capability is newly certified by this planning work.

## Completion evidence

Implementation scheduled. See [contracts](CONTRACTS.md) and [orchestration record](ORCHESTRATION.md) for progress and evidence. No production deployment.
