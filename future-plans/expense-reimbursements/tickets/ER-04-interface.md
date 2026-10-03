# ER-04: Shared picker, payer entry, and expense details

- **Status:** Backlog
- **Proposal:** [Expense reimbursements](../PLAN.md)
- **Depends on:** [ER-03](ER-03-reporting.md)
- **Risks:** [R05](../RISKS.md#r05), [R06](../RISKS.md#r06)

## Context and objective

Let the owner assign received money to the right expense, name the payer, and see one understandable net expense in both the browser and Mini App.

## Prerequisites

ER-03 supplies candidate/detail/reporting APIs and the ER-02 mutation contract. ER-01 supplies required clients and validation behavior.

## Included work

- Add reimbursement-specific From, expense selection, and optional note controls to the shared transaction interface. Require a nonblank name and eligible expense to complete linking; allow pending saves with clear missing-details labels.
- Build the recent/searchable picker with date, merchant, description, original payment, prior reimbursements, remaining cost, and a preview of the result before save.
- Support existing transaction launch links into this interface without changing data on open. Preserve browser fallback and access outside loaded filters/pages.
- Show adjusted amounts and paid/reimbursed context in expense rows; show named, dated repayment details and actions to correct names, relink, or unlink.
- Make all repayments discoverable through the Reimbursement filter. Show pending amounts separately and rename Net cash flow to Income minus spending.
- Support manually adding a missing original expense and returning to the reimbursement without accidentally duplicating either record.
- Retain drafts during recoverable errors, preserve request identity across ambiguous saves, surface version conflicts, and respect existing back/discard behavior.
- Treat names and bank content as plain text. Update frontend documentation and synthetic preview examples.

## Excluded work

Contacts, expected shares, automatic matching, payment collection, Telegram notification delivery, and deployment.

## Affected interfaces

Shared browser/Mini App editor and routing, ledger rows/details, filters, Month view labels, preview fixtures, and frontend documentation. Reuse the existing framework and Telegram adapter.

## Acceptance checks

- [ ] The full dinner flow works in the agreed browser/Telegram client matrix, with required From and optional note clearly distinguished.
- [ ] Empty and whitespace-only names cannot complete linking; optional notes do not block completion; pending records show what is missing.
- [ ] Similar and older expenses can be distinguished and found outside current pages/filters; stale capacity receives an actionable server error without applying a guessed alternative.
- [ ] Linking, payer correction, relinking, unlinking, and full reimbursement update the ledger/details/totals consistently, including zero-cost expenses.
- [ ] Manual parent creation returns to the original reimbursement without duplicate submissions or losing entered name/note during the in-app flow.
- [ ] Back/cancel, narrow layouts, supported themes, unavailable SDK, interrupted requests, ambiguous responses, and conflicts preserve correct navigation and recovery.
- [ ] Synthetic markup-like payer names render literally; no bank data, names, or draft inputs are added to logs or persistent browser storage by default.
- [ ] Required visual/manual evidence and frontend/build checks are recorded, with native-client deferrals identified honestly.

## Completion evidence

Not started. Record screenshots or other synthetic evidence, tested client/browser capabilities, commands/results, and remaining limitations.
