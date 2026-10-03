# Expense reimbursement risk register

- **Proposal:** [Expense reimbursements](PLAN.md)
- **Tickets:** [Index and dependency graph](TICKETS.md)
- **Recorded:** 2026-10-03
- **Status:** Planned / not scheduled; mitigations are proposed, not verified

Severity describes potential impact; likelihood is a qualitative estimate before mitigation.

| ID | Risk | Severity | Likelihood | Responsible tickets |
| --- | --- | --- | --- | --- |
| [R01](#r01) | Reports double-count repayments or attribute them to the wrong period | High | Medium | ER-01, ER-03, ER-05, ER-06 |
| [R02](#r02) | Concurrent or retried edits over-reimburse or corrupt relationships | High | Medium | ER-01, ER-02, ER-06 |
| [R03](#r03) | Old prompts, receipts, or callbacks bypass completion rules | High | Medium | ER-02, ER-05, ER-06 |
| [R04](#r04) | Migration or mixed-version recovery loses history or changes totals unexpectedly | High | Medium | ER-01, ER-02, ER-06, ER-07 |
| [R05](#r05) | Picker ambiguity or interrupted forms cause incorrect assignments | Medium | Medium | ER-03, ER-04, ER-06 |
| [R06](#r06) | New metadata or routes violate existing access and data-handling boundaries | High | Medium | ER-01, ER-02, ER-03, ER-04, ER-06 |

## R01

**Reports double-count repayments or attribute them to the wrong period.**

Counting a reimbursement as both income and reduced spending inflates the result. Filtering repayment dates alongside parent expenses misses cross-month deductions. Calling the new result cash flow misrepresents its meaning.

**Mitigation:** Exclude all classified reimbursements from income, reduce the original expense only after linking, report pending amounts separately, and share exact calculations across surfaces. Label the result Income minus spending.

**Verification / gate:** ER-03 and ER-05 cover date/category/direction filters, September-to-October repayment, zero-cost expenses, and summary retry-time changes. ER-06 compares every surface against one synthetic expected-result matrix.

## R02

**Concurrent or retried edits over-reimburse or corrupt relationships.**

Two valid-looking repayments can jointly exceed remaining cost. Partial relinking or manual amount/currency edits can invalidate already-linked records.

**Mitigation:** Atomic capacity and relationship checks, optimistic conflicts, safe retry semantics, and validation on every write path. Retain immutable bank amounts and explicit unlinking for incompatible corrections.

**Verification / gate:** ER-02 proves simultaneous capacity claims, rollback during relink, stale versions, ambiguous responses, manual-create retries, and invalidating parent/repayment edits. ER-06 repeats the integrated failure scenarios.

## R03

**Old prompts, receipts, or callbacks bypass completion rules.**

Current completion depends on category and description. Reusing that check would prematurely complete an unnamed/unlinked reimbursement, while adding a second receipt path could duplicate messages or lose reply associations.

**Mitigation:** One shared completion rule, current-state checks at delivery, existing outbox deduplication, and existing message-to-transaction associations. Migration triggers no sends. Completed old receipts are not recreated.

**Verification / gate:** ER-05 and ER-06 cover reversed replies, duplicate updates, stale callbacks, reclassification, pending receipts, old delivered receipts, cleanup retries, and linking through the Mini App while chat messages remain active.

## R04

**Migration or mixed-version recovery loses history or changes totals unexpectedly.**

Existing reimbursements intentionally stop counting as income before they are linked. An old application version may still report them as income or ignore relationship restrictions even if an additive schema remains readable.

**Mitigation:** Explain the pending transition, preserve all source and integration state, and rehearse a release/recovery sequence that prevents incompatible writers and reports from mixing. Do not assume an additive migration makes old business logic safe. Never guess payer names or matches.

**Verification / gate:** ER-01 specifies compatibility and activation; ER-02 tests populated migration; ER-06 rehearses interruptions and recovery; ER-07 requires explicit production authorization and records actual outcomes.

## R05

**Picker ambiguity or interrupted forms cause incorrect assignments.**

Similar merchants, repayments arriving late, and records outside the loaded page can lead to wrong matches. Network failures or close/back actions can discard the name or repeat a save.

**Mitigation:** Searchable candidates with dates, descriptions, original/reimbursed/remaining amounts, a net-cost preview, visible required payer entry, correction actions, and existing conflict/retry handling. Do not automatically select a guessed match.

**Verification / gate:** ER-04 and ER-06 test older/filtered-out records, duplicate-looking expenses, required-name errors, keyboard/back flows in the agreed clients, ambiguous saves, and relink/unlink recovery.

## R06

**New metadata or routes violate existing access and data-handling boundaries.**

Payer names are user-supplied text on the currently public dashboard. New routes could bypass proxy restrictions, and a later multi-user release could expose another owner's candidates if scope is not reconciled.

**Mitigation:** Preserve current public-access semantics explicitly; do not imply payer privacy. Treat names/notes as plain text, avoid logging financial/user input, keep backend secrets server-side, and recheck FP-001 status before implementation. If ownership exists by then, enforce it for candidates and links as well as parent records.

**Verification / gate:** ER-01 records the access contract. ER-02/03/04 implement it, and ER-06 verifies injection-safe display, direct-backend/admin/webhook rejection, same-origin protections, and cross-owner isolation if applicable.
