# MU-06: Per-user Gmail integration

- **Status:** Backlog
- **Proposal:** [Private multi-user pilot](../PLAN.md)
- **Depends on:** [MU-03](MU-03-credential-storage.md), [MU-04](MU-04-authentication-invitations.md)
- **Risks:** [R02](../RISKS.md#r02), [R03](../RISKS.md#r03), [R04](../RISKS.md#r04), [R06](../RISKS.md#r06), [R10](../RISKS.md#r10)

## Context and objective

Gmail polling currently reads one environment token and one singleton sync row. Each participant needs a separately authorized mailbox and independent ingestion progress without changing deterministic parsing.

## Prerequisites

MU-03 supplies encrypted credential storage and OAuth-client selection; MU-04 supplies the authenticated account. Use MU-02's ownership constraints and the connection contract from MU-01.

## Included work

- Implement authenticated Gmail consent/callback handling with read-only offline access, mailbox identity verification, and one mailbox per user. Permit a mailbox different from the sign-in account, but reject attaching a mailbox already owned by another user.
- Bind the consent attempt to its initiating user and intended connect/reconnect operation; validate callbacks and requested/granted scopes before persisting tokens.
- Require explicit first activation after required connections are ready. Maintain activation, cursor, pagination, auth-alert state, and health independently for every mailbox.
- Refactor polling into bounded per-mailbox work, saving transactions and account-scoped outbox entries atomically. Preserve parser behavior, sender/subject matching, activation filtering, and duplicate handling.
- Handle authorization loss, transient failures, cursor recovery, and same-mailbox reconnect without resetting history. Expose redacted connection status to the owning user.

## Excluded work

- Additional banks, historical imports, mailbox switching, Telegram delivery (MU-08), global scheduling (MU-09), and complete disconnect/deletion orchestration (MU-11).

## Affected interfaces

Gmail consent/callback/status/reconnect interfaces, `backend/src/gmail.ts`, credential storage, scoped sync state, and persistence/outbox operations. Keep `backend/src/parser.ts` independent of user authentication and token handling.

## Acceptance checks

- [ ] Two users can connect different mailboxes; a callback tied to A cannot be applied from B's session, and an already-owned mailbox cannot be reassigned.
- [ ] Messages before activation are excluded, messages at activation are eligible, and a repeated activation or same-mailbox reconnect preserves the original timestamp.
- [ ] Identical message IDs across mailboxes are independent; repeated polling within one mailbox creates one transaction and one initial outbox entry.
- [ ] Pagination, interruption, malformed receipts, and unknown operations preserve safe progress; unresolved items remain excluded from totals.
- [ ] Revoking or timing out one synthetic mailbox leaves another able to ingest; error/alert state is visible only to its owner and contains no token or full email.
- [ ] Relevant parser and ingestion regressions pass with synthetic MIME fixtures and mocked provider requests.

## Completion evidence

Not started. Record the implementation reference, checks actually run and their results, relevant synthetic/redacted evidence, and any remaining limitations. This ticket does not authorize production deployment before MU-14.
