# MU-08: Per-user notification delivery

- **Status:** Backlog
- **Proposal:** [Private multi-user pilot](../PLAN.md)
- **Depends on:** [MU-07](MU-07-telegram-linking.md)
- **Risks:** [R03](../RISKS.md#r03), [R06](../RISKS.md#r06), [R07](../RISKS.md#r07)

## Context and objective

Delivery, reminders, and cleanup currently target one owner. Deliver account-scoped outbox work to the correct linked chat while retaining independent retries and existing transaction completion behavior.

## Prerequisites

MU-07 supplies confirmed chat associations and account-scoped inbound intents. MU-02 supplies scoped persistence and outbox constraints; follow the existing save-before-send contract.

## Included work

- Resolve each outbox job's owner and valid destination rather than using a global owner ID. Check active connection state and job generation before external effects.
- Scope job uniqueness, reminder keys/counts, notification failures, receipt associations, and cleanup to their account/chat. Preserve shared-bot update deduplication separately.
- Preserve category/description prompts, standalone receipt delivery, and cleanup only after confirmed receipt success. Keep the latest three receipts per chat and expire receipts after 47 hours without deleting pending prompts.
- Retry transient sends/deletes independently, handle Telegram retry hints, and stop retrying permanent deletion failures.
- Record only the identifiers needed for association and delivery recovery. Document that ambiguous send timeouts can repeat a message but cannot duplicate a transaction.

## Excluded work

- Global scheduler fairness (MU-09), new message designs/categories, bulk historical cleanup, production sends, and complete lifecycle orchestration (MU-11).

## Affected interfaces

`backend/src/telegram.ts` outbound functions, account-scoped outbox leases and job keys, Telegram destination/message associations, reminder eligibility, and cleanup persistence.

## Acceptance checks

- [ ] Concurrent jobs for two accounts reach only their confirmed chats, including when those chats share numeric message IDs.
- [ ] At 20:00 Tashkent each eligible account queues one daily reminder with its own count; completed accounts receive none.
- [ ] Transient failures retry independently; duplicate update processing does not create duplicate jobs, and ambiguous sends never create a second transaction.
- [ ] Failed receipt delivery leaves prompts intact; successful receipt delivery permits only that transaction's cleanup. Receipt retention is evaluated separately for each chat.
- [ ] Permanent delete failures stop retrying, pending prompts are preserved, and disabled/stale destinations cannot start new sends.
- [ ] Delivery, duplicate-processing, reversed-reply, and cleanup regression tests pass using mocked Telegram requests.

## Completion evidence

Not started. Record the implementation reference, checks actually run and their results, relevant synthetic/redacted evidence, and any remaining limitations. This ticket does not authorize production deployment before MU-14.
