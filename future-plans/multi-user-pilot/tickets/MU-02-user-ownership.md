# MU-02: User ownership and persistence

- **Status:** Backlog
- **Proposal:** [Private multi-user pilot](../PLAN.md)
- **Depends on:** [MU-01](MU-01-pilot-prerequisites.md)
- **Risks:** [R01](../RISKS.md#r01), [R03](../RISKS.md#r03), [R05](../RISKS.md#r05)

## Context and objective

Transactions, sync state, locks, outbox jobs, and Telegram message associations currently assume one owner. Introduce enforceable ownership and synthetic fixtures that later modules can share.

## Prerequisites

MU-01 has established identity, ownership, lifecycle, and compatibility contracts. Work against local/synthetic databases; applying migrations to production belongs to MU-14.

## Included work

- Introduce users, connection identities, and account-scoped persistence for transactions, sync state, outbox jobs, locks, and Telegram associations. Reserve persistence needed by invitation/session/linking workflows without implementing those flows.
- Replace mailbox-global receipt uniqueness with mailbox-plus-source-message uniqueness and single-column Telegram message identity with chat-plus-message identity. Keep the shared bot's update deduplication at bot scope.
- Enforce that dependent rows and their referenced transaction/connection have the same owner. Expose persistence operations that require a trusted account context.
- Make migrations repeatable through the migration runner and verify rollback of failed transactional changes. Add two-user fixtures, including identical provider IDs and existing owner records.
- Document which intermediate schemas are compatible with the old runtime; do not claim partial migrations are safe to deploy.

## Excluded work

- Login, provider requests, user interface work, scheduling, remote migrations, and assigning production history to a real user.

## Affected interfaces

D1 migrations, persistence operations in `backend/src/store.ts`, shared types in `backend/src/domain.ts`, and SQLite fixtures in `tests/helpers.ts`. Preserve transaction IDs, exact money representation, and optimistic edit versions.

## Acceptance checks

- [ ] Two synthetic users can store identical Gmail message IDs in different mailboxes and identical Telegram message IDs in different chats without collision.
- [ ] A duplicate within the same mailbox creates one transaction and one initial notification job.
- [ ] Cross-owner relationships and writes without the required trusted account context are rejected.
- [ ] Fixture migration preserves existing transaction fields, IDs, versions, activation data, and pending associations; an injected failure rolls back its transaction.
- [ ] Local migration replay and relevant persistence tests pass; no production database is accessed.

## Completion evidence

Not started. Record the implementation reference, checks actually run and their results, relevant synthetic/redacted evidence, and any remaining limitations. This ticket does not authorize production deployment before MU-14.
