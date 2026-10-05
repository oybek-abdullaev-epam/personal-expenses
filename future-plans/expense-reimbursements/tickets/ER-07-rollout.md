# ER-07: Separately authorized production rollout

- **Status:** Blocked — separate production/live-test authorization required
- **Proposal:** [Expense reimbursements](../PLAN.md)
- **Depends on:** [ER-06](ER-06-validation.md)
- **Risks:** [R04](../RISKS.md#r04)

## Context and objective

Release the verified feature only after the owner separately authorizes production changes, then record actual behavior and remaining observations.

## Prerequisites

ER-06 provides passing validation, a compatible migration/deployment sequence, and rehearsed recovery with no unresolved correctness blockers. Explicit production authorization is required, including whether real-bot messages and disposable synthetic live writes are permitted. Documentation and scheduling alone do not authorize those actions.

## Included work

- Recheck the deployment target and accepted release contract against the current application. Record the starting versions and settings needed for recovery without exposing secrets.
- Explain that existing reimbursements will stop counting as income and appear pending until their payer names and expense links are entered. Do not populate these fields from guesses or silently assign historical records.
- Execute the rehearsed migration, backend, frontend, and behavior-activation sequence within the authorized scope, fencing incompatible work if required by the contract.
- Verify hosted read flows and integration continuity, then exercise only authorized write/message smoke checks. Remove only explicitly identified disposable test artifacts if such tests were authorized.
- Use the rehearsed recovery procedure if release checks fail, preserving financial records and links.
- Update current-behavior documentation and proposal/ticket status based on evidence. Append actual deployment records to docs/history.md and retain only unfinished acceptance checks in next_steps.md.

## Excluded work

Bulk matching, payer-name inference, history reset, historical email import, unrelated infrastructure changes, or live writes/messages beyond the owner's authorization.

## Affected interfaces

Production D1 migration, Worker and Vercel artifacts, existing integration state, deployment/recovery runbook, current-behavior docs, and completion evidence.

## Acceptance checks

- [ ] Production authorization, scope, target versions, and readiness checks are recorded before mutations.
- [ ] Deployment follows the rehearsed sequence; history, original amounts, activation/cursor, source deduplication, outbox state, and pending reply associations are preserved.
- [ ] Existing reimbursements appear pending without inferred payers/parents or a migration-triggered notification burst.
- [ ] Hosted ledger/details/reporting, required payer validation, Mini App entry, and integration continuity are verified within the authorized smoke-test scope.
- [ ] Any authorized synthetic artifacts are cleaned up precisely, with no changes to unrelated records or messages.
- [ ] Failed checks trigger the documented recovery path; completion is not claimed until release gates pass.
- [ ] Deployment history and current-behavior docs reflect actual results; natural receipt/21:00 observations and deferred clients remain open where unobserved.

## Completion evidence

Not started. Record the authorization reference, deployed versions, migration and smoke-test outcomes, recovery if used, exact synthetic cleanup scope, and remaining limitations. Do not include private records or credentials.
