# MU-11: Account lifecycle

- **Status:** Backlog
- **Proposal:** [Private multi-user pilot](../PLAN.md)
- **Depends on:** [MU-05](MU-05-private-api-proxy.md), [MU-09](MU-09-fair-scheduling.md)
- **Risks:** [R07](../RISKS.md#r07), [R04](../RISKS.md#r04)

## Context and objective

Connection loss, voluntary disconnect, access removal, and account deletion have different effects. Coordinate them across sessions and background jobs so an old lease or callback cannot revive a removed account.

## Prerequisites

MU-05 supplies protected account interfaces; MU-09 supplies the scheduling/lease model and, transitively, Gmail, Telegram, and delivery operations. Consume the lifecycle states agreed in MU-01.

## Included work

- Implement separate operations for Gmail disconnect, Telegram disconnect, invitation/access removal, and administrative account deletion. Sign-out remains session-only; disconnect retains transaction history and activation.
- On Gmail disconnect, stop new polling/refresh work; on Telegram disconnect, stop new sends/cleanup and invalidate outstanding link attempts. Cancel or invalidate affected queued work and fence stale leases/callbacks.
- Support reconnecting the same mailbox/chat with stable ownership and activation. Reissue only necessary current prompts; stale pre-disconnect buttons cannot change the wrong transaction or revive cancelled work.
- Invalidate all account sessions and stop all work before deleting account-owned rows/credentials. Handle provider revocation and its retries without retaining financial history solely to retry cleanup or exposing tokens.
- Add local administrative removal/access commands outside the public proxy and wire connection-disconnect controls into the account interface. Define minimal temporary tombstones needed to reject in-flight/stale work and their expiry.
- Document in-flight limitations: a request already accepted by Telegram may complete after disconnect. Do not promise to retract already delivered messages.

## Excluded work

- A self-service public admin console, moving history between users, changing mailboxes, erasing messages from Gmail, and executing removal/revocation against real participants during development.

## Affected interfaces

Protected connection lifecycle routes, local invitation/account commands, session invalidation, credential revocation, scheduler generations/leases, Telegram links, and owned-row cleanup.

## Acceptance checks

- [ ] Disconnect preserves history and activation, prevents new associated provider work, and leaves another user's connections/jobs unaffected.
- [ ] A job leased before disconnect or removal cannot later persist new account work or start an external request after its final active-state check; tests record the remaining in-flight limitation.
- [ ] Replayed OAuth callbacks, Telegram links/buttons, stale leases, and repeated deletion requests cannot recreate a removed account or its transactions.
- [ ] Account removal invalidates existing sessions and removes account-owned data/credentials according to the documented recovery/revocation sequence; unrelated users' data is preserved.
- [ ] Revocation failure and interrupted deletion can be safely retried; evidence distinguishes local deletion completion from external provider completion.
- [ ] Same-identity reconnect preserves deduplication and activation, and any restored prompts are associated with the correct account/transaction.

## Completion evidence

Not started. Record the implementation reference, checks actually run and their results, relevant synthetic/redacted evidence, and any remaining limitations. This ticket does not authorize production deployment before MU-14.
