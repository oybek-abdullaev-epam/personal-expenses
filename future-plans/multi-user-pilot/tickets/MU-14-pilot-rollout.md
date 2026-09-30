# MU-14: Controlled pilot rollout

- **Status:** Backlog
- **Proposal:** [Private multi-user pilot](../PLAN.md)
- **Depends on:** [MU-13](MU-13-integrated-validation.md)
- **Risks:** [R05](../RISKS.md#r05), [R08](../RISKS.md#r08), [R09](../RISKS.md#r09), [R10](../RISKS.md#r10), [R11](../RISKS.md#r11)

## Context and objective

The candidate must move from the currently public single-owner app to a private pilot without losing history, exposing accounts, or declaring unobserved behavior verified. Rollout is the only production-executing ticket in this backlog.

## Prerequisites

MU-13 has passed and supplied a readiness report; MU-12 supplies the rehearsed runbook. Recheck MU-01's external prerequisites and confirm this rollout is separately scheduled/authorized. Do not treat saving this ticket as deployment permission.

## Included work

- Recheck OAuth configuration/eligibility, hosting limits, operational access, private-session behavior, recovery readiness, and outstanding live acceptance checks before the maintenance window.
- Execute the rehearsed owner cutover: stop admission/work, drain or fence in-flight processing, migrate without reset, deploy compatible backend/frontend, verify owner identity and private access, and resume processing.
- Verify owner history, activation, pending reply associations, and integration health using redacted evidence before allowing pilot participants.
- Have the owner invite two personally known participants; observe onboarding, a naturally arriving UZCARD transaction for each, Telegram classification, website persistence, and daily reminder behavior. Do not initiate purchases or inject production transactions for testing.
- Expand to at most ten total pilot accounts only after those checks pass. Monitor redacted sync age, queue age, integration errors, authorization failures, and resource/latency measurements.
- Update the root plan, README, and setup/runbook documentation to reflect what was actually deployed and verified. Record remaining limitations and the recovery/support process.

## Excluded work

- Public registration, commercial launch, paid upgrades without a separate decision, new banks, changing activation, resetting history, and contacting participants on the owner's behalf without explicit messaging authorization.

## Affected interfaces

Production deployment/migration and secret configuration as required by the rehearsed runbook; owner bootstrap, invitation command, integration health, and operational documentation. Keep existing history and bot/webhook continuity.

## Acceptance checks

- [ ] Anonymous dashboard data access is rejected, the owner can sign in, and direct backend/admin protections remain enforced after deployment.
- [ ] History/activation verification passes and pending owner interactions continue against their original transactions; no migration-driven history reset or historical import occurs.
- [ ] Two participants complete independent real transaction flows without data leakage; their website edits persist and Telegram replies affect the correct transactions.
- [ ] Live reminder evidence covers once-per-Tashkent-day delivery for unfinished work and no reminder for completed work; unobserved checks remain pending.
- [ ] Measured health/resource use is acceptable for the pilot and all identified release blockers are resolved before expanding beyond two participants.
- [ ] On suspected cross-user exposure, stop pilot admission and affected processing immediately using the runbook; on integrity or compatibility failure, use the rehearsed recovery path without restoring anonymous access.
- [ ] Deployment references, redacted acceptance results, support ownership, and current limitations are recorded before marking this ticket Done.

## Completion evidence

Not started. Record the deployment reference, checks actually run and their results, relevant synthetic/redacted evidence, and any remaining limitations. Record rollout authorization and observed live acceptance separately from automated test results.
