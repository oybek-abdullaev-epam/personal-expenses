# MU-09: Fair background scheduling

- **Status:** Backlog
- **Proposal:** [Private multi-user pilot](../PLAN.md)
- **Depends on:** [MU-06](MU-06-gmail-integration.md), [MU-08](MU-08-notification-delivery.md)
- **Risks:** [R06](../RISKS.md#r06), [R09](../RISKS.md#r09)

## Context and objective

A single-account scheduled run can become unfair or exceed provider/runtime limits when repeated across ten mailboxes. Introduce bounded scheduling without coupling Gmail failures to notification delivery.

## Prerequisites

MU-06 supplies bounded per-mailbox polling; MU-08 supplies account-scoped delivery/reminder work. MU-01 records applicable platform limits and the pilot usage envelope.

## Included work

- Schedule eligible accounts in persistent round-robin order with explicit per-account and per-invocation budgets for ingestion, delivery, and cleanup.
- Use independent leases and retry times; prevent one busy or failing account from monopolizing slots, including after a Worker restart.
- Checkpoint safely when a budget ends, including in the middle of a Gmail page. Never advance a cursor beyond unprocessed receipts or drop outbox work.
- Keep Gmail, reminders, and delivery failures independent. Skip inactive/removed connections and use lease/generation checks to support lifecycle cancellation.
- Measure redacted operational counters for account progress, oldest pending work, provider rate limits, and runtime/resource consumption; avoid logging financial records.

## Excluded work

- A public-scale queue architecture, paid infrastructure changes, new ingestion providers, and production load generation.

## Affected interfaces

The Worker's five-minute scheduled handler, Gmail work slices, outbox leasing, scheduling state, retry/backoff behavior, and account-level health. Document chosen numerical budgets against measured platform limits in the implementation evidence.

## Acceptance checks

- [ ] A deterministic ten-account simulation gives every eligible account work without starvation while one mailbox is backlogged and another repeatedly fails.
- [ ] Overlapping invocations and expired/reclaimed leases do not create duplicate transactions, duplicate deterministic jobs, or lost cursor progress.
- [ ] A budget interruption mid-page safely resumes; a process restart preserves scheduling fairness and pending delivery.
- [ ] Gmail failure does not suppress another account's reminders or pending delivery; disabled connections are skipped.
- [ ] Simulated normal pilot traffic measures time from receipt arrival to successful delivery against the five-minute target. Report misses and processing/schedule delay separately instead of claiming a guarantee.
- [ ] Budget/resource evidence includes provider rate-limit recovery and confirms the selected hosting configuration can support the intended pilot.

## Completion evidence

Not started. Record the implementation reference, checks actually run and their results, relevant synthetic/redacted evidence, and any remaining limitations. This ticket does not authorize production deployment before MU-14.
