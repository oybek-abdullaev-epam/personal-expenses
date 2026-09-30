# MU-07: Telegram linking and inbound handling

- **Status:** Backlog
- **Proposal:** [Private multi-user pilot](../PLAN.md)
- **Depends on:** [MU-04](MU-04-authentication-invitations.md)
- **Risks:** [R02](../RISKS.md#r02), [R03](../RISKS.md#r03)

## Context and objective

Telegram currently accepts only the configured owner's private chat, and reply lookup uses message ID alone. Link each authenticated user to one private chat and route every inbound interaction through that association.

## Prerequisites

MU-04 supplies authenticated link creation; MU-02 supplies chat-scoped message associations and unique connection ownership. Use the single shared bot and MU-01 linking contract.

## Included work

- Generate short-lived, opaque, single-use Telegram start tokens bound to the initiating authenticated account. Store token verification material without logging usable links.
- Consume links atomically in a private chat, validating sender/chat identity and preventing an existing Telegram identity from being reassigned to another user. Require authenticated browser confirmation of the proposed chat before activation.
- Replace the global owner check with verified account/chat resolution for category callbacks and description replies. Match both chat ID and message ID, then verify transaction ownership.
- Persist inbound update deduplication for the shared bot, transaction changes, and account-scoped outbox intent atomically.
- Retain compatibility for existing owner reply associations through the migration mapping; reject unknown chats, stale buttons, and old/replayed linking attempts safely.

## Excluded work

- Outbound delivery, reminders, receipt cleanup (MU-08), provider webhook changes in production, group chats, multiple bots, and full disconnect/deletion orchestration (MU-11).

## Affected interfaces

Authenticated link creation/confirmation/status interfaces, `/telegram/webhook`, inbound update/account resolution, chat/message association persistence, and notification intents consumed by MU-08.

## Acceptance checks

- [ ] An authenticated user can link and confirm one private chat; expired, reused, guessed, wrong-session, or concurrently consumed tokens cannot establish another binding.
- [ ] Unconfirmed links cannot receive transaction data; group/supergroup events and sender/chat mismatches cannot classify transactions.
- [ ] Two chats with the same message IDs can independently classify and describe their own transactions, including reversed reply order.
- [ ] Forged callback transaction IDs, another chat's prompt IDs, duplicate updates, and stale interactions cannot mutate the wrong account or enqueue duplicate effects.
- [ ] Existing webhook-secret checks remain required, and linking tests use mocks without changing the production webhook.

## Completion evidence

Not started. Record the implementation reference, checks actually run and their results, relevant synthetic/redacted evidence, and any remaining limitations. This ticket does not authorize production deployment before MU-14.
