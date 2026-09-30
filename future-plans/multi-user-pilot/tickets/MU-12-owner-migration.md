# MU-12: Owner migration and recovery rehearsal

- **Status:** Backlog
- **Proposal:** [Private multi-user pilot](../PLAN.md)
- **Depends on:** [MU-10](MU-10-onboarding-interface.md), [MU-11](MU-11-account-lifecycle.md)
- **Risks:** [R04](../RISKS.md#r04), [R05](../RISKS.md#r05), [R11](../RISKS.md#r11)

## Context and objective

The production owner already has history, an activation boundary, legacy Gmail authorization, and pending Telegram state. Rehearse a migration that preserves them and supports recovery before a real cutover is scheduled.

## Prerequisites

MU-10 provides the private onboarding/dashboard flow and MU-11 provides lifecycle fencing, covering the earlier backend work. Review the actual deployed schema/version and root deployment notes without copying private records into fixtures.

## Included work

- Build a synthetic representation of the current owner state, including income, expenses, review items, versions, pending/sent jobs, prompts/replies, update deduplication, and legacy credential metadata.
- Prepare repeatable migration and pre/post verification procedures that attach all existing owned records to the verified owner, preserve IDs and activation, and backfill mailbox/chat keys.
- Define the maintenance sequence: disable admission and new processing, drain or fence active work, apply the compatible schema/data changes, activate matching code, verify, then resume.
- Prepare secure recovery material/procedure outside source control and document how to recover an interrupted cutover. Distinguish pre-migration rollback from recovery after the new schema has accepted writes.
- Retain valid owner credentials with their issuing client; do not revoke grants during migration merely because another client was introduced.
- Rehearse both successful cutover and fault injection locally. Produce a runbook used by MU-14; no production migration occurs in this ticket.

## Excluded work

- Deleting/resetting owner history, historical reimport, importing full production emails, production credential changes, real cutover, and admitting participants.

## Affected interfaces

D1 migration runner and owner backfill, maintenance/drain or fencing controls, owner identity bootstrap, credential-client mapping, backend/frontend release order, and the operational recovery runbook.

## Acceptance checks

- [ ] Pre/post fixture comparisons preserve transaction IDs, monetary values, directions, categories, descriptions, versions, source identity, and the existing activation timestamp.
- [ ] Pending category/description replies and cleanup jobs still resolve to the original owner and transaction; previously processed updates stay deduplicated.
- [ ] Wrong-owner bootstrap is rejected; the first arbitrary signup cannot acquire legacy history.
- [ ] Migration retry does not duplicate ownership, connections, or jobs; injected failures at each cutover stage have a demonstrated compatible recovery action.
- [ ] A late scheduled run/webhook cannot write using stale single-owner assumptions during or after migration.
- [ ] The runbook prevents old anonymous frontend or incompatible Worker rollback from reopening access; no production records or credentials enter source control or logs.

## Completion evidence

Not started. Record the implementation reference, checks actually run and their results, relevant synthetic/redacted evidence, and any remaining limitations. This ticket does not authorize production deployment before MU-14.
