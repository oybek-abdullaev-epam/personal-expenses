# ER-05: Telegram linking, completion, and daily summaries

- **Status:** Verified locally — commit/push recorded in orchestration ledger
- **Proposal:** [Expense reimbursements](../PLAN.md)
- **Depends on:** [ER-04](ER-04-interface.md)
- **Risks:** [R01](../RISKS.md#r01), [R03](../RISKS.md#r03)

## Context and objective

Move reimbursement completion from generic description replies to the shared named-link flow, preserving notification retries, chat cleanup, and transaction association.

## Prerequisites

ER-04 supplies the working transaction-specific picker. Shared completion, mutation, and reporting rules from its prerequisites are available for notification integration.

## Included work

- After Reimbursement classification, offer Link to expense using existing Mini App record selectors and browser fallback. Skip the generic description request for this category; preserve normal category behavior elsewhere.
- Make current-state checks suppress inappropriate queued prompts and prevent stale description replies or callbacks from completing or invalidating a reimbursement.
- Use the shared required-name/link completion rule throughout receipt eligibility, outstanding counts, and cleanup decisions.
- Completing a pending email reimbursement in the dashboard queues its existing completion receipt only if never delivered. Include payer and linked expense context, retaining source associations and outbox deduplication.
- Preserve no per-transaction notifications for manual entries, no replacement receipts for corrections, no new receipts for previously delivered history, and no migration-triggered sends.
- Use adjusted daily spending and pending reimbursement needs in the 21:00 summary. Recalculate on retries for the current day and retain local-date expiry, exact totals, and existing empty-day rules.
- Update transaction-lifecycle and operations documentation for the new completion path and stale-interaction handling.

## Excluded work

Matching inside Telegram chat buttons, rewriting old Telegram receipts/summaries, new notification infrastructure, real-bot testing without explicit authorization, and deployment.

## Affected interfaces

Category callback handling, pending prompt/receipt rendering, dashboard completion-to-outbox boundary, summary calculation, shared completion predicates, receipt/cleanup state, and Telegram link helpers.

## Acceptance checks

- [x] Reimbursement classification produces a correct transaction-specific link rather than a mandatory description reply; other categories retain their existing flow.
- [x] Link/name completion through the browser or Mini App sends at most one deterministic completion receipt, with correct payer and expense context; delivery timeouts retain the existing documented ambiguity.
- [x] Manual completion and corrections do not queue receipts; old delivered receipts are not recreated; migration alone produces no messages.
- [x] Old description replies and category callbacks cannot bypass name/link requirements, corrupt relationships, or target another record.
- [x] Duplicate Gmail imports/Telegram updates, reversed replies, receipt/cleanup retries, and interleaved dashboard/chat edits preserve source associations and deduplicated effects.
- [x] Same-day and cross-month repayments, zero-cost expenses, pending reimbursements, summary retries, and date expiry produce exact expected results without rewriting sent summaries.
- [x] Notification and regression tests pass using mocked transport; any separately authorized live evidence is clearly distinguished from mocks.

## Completion evidence

[Mocked transport and review evidence](../../../docs/verification/expense-reimbursements/ER-05.md). Live Telegram acceptance is an ER-04/ER-06 gate and is not claimed by these tests.
