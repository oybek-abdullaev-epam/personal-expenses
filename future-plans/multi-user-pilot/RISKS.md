# Multi-user pilot risk register

- **Proposal:** [Private multi-user pilot](PLAN.md)
- **Tickets:** [Index and dependency graph](TICKETS.md)
- **Recorded:** 2026-09-30
- **Status:** Open planning risks; no mitigation is claimed implemented or verified.

Severity describes impact if the issue occurs. Likelihood is a qualitative estimate of exposure without the planned mitigation, not a measured probability. **Critical** risks include unauthorized access, account takeover, credential compromise, or loss of existing records; **High** risks threaten correctness, service continuity, or launch; **Medium** risks affect capacity, cost, or usability. All estimates must be revisited when implementation evidence exists.

External-source notes reflect planning references and must be rechecked by MU-01 and before rollout. This register is not a certification of Google eligibility, security, or hosting capacity.

## Overview

| ID | Risk | Severity | Likelihood | Responsible tickets |
| --- | --- | --- | --- | --- |
| [R01](#r01) | Cross-user data access | Critical | Medium | [MU-02](tickets/MU-02-user-ownership.md), [MU-04](tickets/MU-04-authentication-invitations.md), [MU-05](tickets/MU-05-private-api-proxy.md), [MU-13](tickets/MU-13-integrated-validation.md) |
| [R02](#r02) | Wrong-account OAuth or Telegram linking | Critical | Medium | [MU-04](tickets/MU-04-authentication-invitations.md), [MU-06](tickets/MU-06-gmail-integration.md), [MU-07](tickets/MU-07-telegram-linking.md), [MU-13](tickets/MU-13-integrated-validation.md) |
| [R03](#r03) | Provider identifiers and job keys collide | High | High | [MU-02](tickets/MU-02-user-ownership.md), [MU-06](tickets/MU-06-gmail-integration.md), [MU-07](tickets/MU-07-telegram-linking.md), [MU-08](tickets/MU-08-notification-delivery.md), [MU-13](tickets/MU-13-integrated-validation.md) |
| [R04](#r04) | Credential exposure, key loss, or client mismatch | Critical | Medium | [MU-03](tickets/MU-03-credential-storage.md), [MU-06](tickets/MU-06-gmail-integration.md), [MU-11](tickets/MU-11-account-lifecycle.md), [MU-12](tickets/MU-12-owner-migration.md) |
| [R05](#r05) | Migration damages history or pending interactions | Critical | Medium | [MU-02](tickets/MU-02-user-ownership.md), [MU-12](tickets/MU-12-owner-migration.md), [MU-13](tickets/MU-13-integrated-validation.md), [MU-14](tickets/MU-14-pilot-rollout.md) |
| [R06](#r06) | Backlog, outages, and rate limits delay other users | High | Medium | [MU-06](tickets/MU-06-gmail-integration.md), [MU-08](tickets/MU-08-notification-delivery.md), [MU-09](tickets/MU-09-fair-scheduling.md), [MU-13](tickets/MU-13-integrated-validation.md) |
| [R07](#r07) | Disconnect or deletion races with active work | High | Medium | [MU-08](tickets/MU-08-notification-delivery.md), [MU-11](tickets/MU-11-account-lifecycle.md), [MU-13](tickets/MU-13-integrated-validation.md) |
| [R08](#r08) | Google verification or configuration blocks onboarding | High | Medium | [MU-01](tickets/MU-01-pilot-prerequisites.md), [MU-14](tickets/MU-14-pilot-rollout.md) |
| [R09](#r09) | Hosting limits and future operating costs | Medium | Medium | [MU-01](tickets/MU-01-pilot-prerequisites.md), [MU-09](tickets/MU-09-fair-scheduling.md), [MU-14](tickets/MU-14-pilot-rollout.md) |
| [R10](#r10) | Onboarding friction and unsupported receipts | Medium | High | [MU-06](tickets/MU-06-gmail-integration.md), [MU-10](tickets/MU-10-onboarding-interface.md), [MU-14](tickets/MU-14-pilot-rollout.md) |
| [R11](#r11) | Partial deployment reopens access or breaks compatibility | Critical | Medium | [MU-05](tickets/MU-05-private-api-proxy.md), [MU-12](tickets/MU-12-owner-migration.md), [MU-13](tickets/MU-13-integrated-validation.md), [MU-14](tickets/MU-14-pilot-rollout.md) |

## R01

**Cross-user data access**

- **Severity:** Critical
- **Likelihood before mitigation:** Medium
- **Status:** Open
- **Responsible tickets:** [MU-02](tickets/MU-02-user-ownership.md), [MU-04](tickets/MU-04-authentication-invitations.md), [MU-05](tickets/MU-05-private-api-proxy.md), [MU-13](tickets/MU-13-integrated-validation.md)

**Potential issue:** A missing ownership condition in a record lookup, mutation, aggregate, review operation, or health query could disclose or modify another person's financial data. A shared backend credential by itself does not identify the person using the website.

**Mitigation:** Derive account identity from a validated session, require it in persistence operations, and enforce matching ownership on related rows. Audit every data-bearing route, including totals, insights, activation, reviews, and health. Keep administrative routes outside the website proxy and reject browser-supplied ownership claims.

**Verification:** Use two synthetic accounts across every route. Attempt cross-account IDs, filters, forged headers/bodies, record-existence probes, aggregate leaks, and access with only the shared proxy credential. Verify that each operation rejects the request or returns only the authenticated account's data.

**Gate or remaining limitation:** Block rollout on any unexplained cross-user result. Stop admission and affected processing if suspected exposure occurs during the pilot.


## R02

**Wrong-account OAuth or Telegram linking**

- **Severity:** Critical
- **Likelihood before mitigation:** Medium
- **Status:** Open
- **Responsible tickets:** [MU-04](tickets/MU-04-authentication-invitations.md), [MU-06](tickets/MU-06-gmail-integration.md), [MU-07](tickets/MU-07-telegram-linking.md), [MU-13](tickets/MU-13-integrated-validation.md)

**Potential issue:** Login CSRF, replayed OAuth callbacks, stolen/reused start links, or confusing the sign-in identity with the mailbox identity could attach one person's inbox/chat to another person's account.

**Mitigation:** Validate provider identities and callback state, bind connect attempts to the initiating session and operation, enforce unique mailbox/chat ownership, and use expiring single-use link tokens. Require browser confirmation of the private chat before it receives data. Never use the first arbitrary signup to claim legacy history.

**Verification:** Test wrong-session callbacks, invalid issuer/audience, unverified invitation identity, stale state, replayed codes/links, concurrent token consumption, unconfirmed Telegram links, group chats, and sender/chat mismatches. No case may reassign a connection or activate ingestion under the wrong owner.

**Gate or remaining limitation:** Linking and owner-bootstrap tests must pass before migration or participant admission.


## R03

**Provider identifiers and job keys collide**

- **Severity:** High
- **Likelihood before mitigation:** High
- **Status:** Open
- **Responsible tickets:** [MU-02](tickets/MU-02-user-ownership.md), [MU-06](tickets/MU-06-gmail-integration.md), [MU-07](tickets/MU-07-telegram-linking.md), [MU-08](tickets/MU-08-notification-delivery.md), [MU-13](tickets/MU-13-integrated-validation.md)

**Potential issue:** The existing receipt uniqueness and Telegram association keys assume a single mailbox/chat. Reused message IDs or globally keyed reminders/cleanup can suppress valid transactions, misroute replies, or delete another chat's messages.

**Mitigation:** Use mailbox-plus-source-message identity and chat-plus-message identity. Scope reminder, retry, and cleanup keys to their actual account/chat and enforce consistent relationships. Keep Telegram update deduplication at the shared-bot scope, since update IDs are not chat-local.

**Verification:** Give both synthetic mailboxes the same Gmail ID and both chats the same message ID. Verify independent imports, category callbacks, reversed replies, daily reminders, receipts, and cleanup. Replay each account's events and verify no duplicate transaction or deterministic job.

**Gate or remaining limitation:** Collision fixtures must pass before any multi-user processing is enabled.


## R04

**Credential exposure, key loss, or client mismatch**

- **Severity:** Critical
- **Likelihood before mitigation:** Medium
- **Status:** Open
- **Responsible tickets:** [MU-03](tickets/MU-03-credential-storage.md), [MU-06](tickets/MU-06-gmail-integration.md), [MU-11](tickets/MU-11-account-lifecycle.md), [MU-12](tickets/MU-12-owner-migration.md)

**Potential issue:** Per-user tokens can leak through storage/logs, become unrecoverable if an encryption key is lost, or fail when refreshed with the wrong OAuth client. Revoking one grant may have wider effects than deleting one local token.

**Mitigation:** Encrypt tokens using deployment-held keys with key/version and connection binding; tag each grant's issuing client. Keep keys/client secrets outside database rows and browser responses. Use redacted errors, preserve existing refresh tokens when a response omits a replacement, and document rotation, recovery, and revocation behavior.

**Verification:** Test ciphertext swapping/tampering, wrong/missing keys, client mismatch, missing-refresh-token responses, and credential replacement. Capture synthetic logs/responses to detect leakage. Rehearse key recovery and legacy-client migration with fake credentials; account-removal tests distinguish provider revocation from local deletion.

**Gate or remaining limitation:** No live token migration or pilot launch until credential recovery and legacy-client compatibility are demonstrated.


## R05

**Migration damages history or pending interactions**

- **Severity:** Critical
- **Likelihood before mitigation:** Medium
- **Status:** Open
- **Responsible tickets:** [MU-02](tickets/MU-02-user-ownership.md), [MU-12](tickets/MU-12-owner-migration.md), [MU-13](tickets/MU-13-integrated-validation.md), [MU-14](tickets/MU-14-pilot-rollout.md)

**Potential issue:** Assigning ownership, changing uniqueness keys, or allowing an old Worker to continue during migration could lose history, reset activation, duplicate imports, or break existing Telegram replies. An incompatible rollback could further damage the new state.

**Mitigation:** Use a controlled maintenance/drain or fencing sequence, verified owner bootstrap, explicit pre/post invariants, and a repeatable migration. Prepare recovery material outside the repository and a recovery procedure compatible with each schema stage. Preserve all transaction IDs, money fields, source IDs, activation, and required message/update associations.

**Verification:** Rehearse with synthetic owner history and pending jobs. Compare pre/post invariants, reply to old prompts, rerun the migration, inject failures between stages, and simulate late scheduled/webhook work. Demonstrate recovery rather than relying on an untested old-code rollback.

**Gate or remaining limitation:** The migration/recovery rehearsal must pass before MU-14; do not clear or reimport the owner's history as a workaround.


## R06

**Backlog, outages, and rate limits delay other users**

- **Severity:** High
- **Likelihood before mitigation:** Medium
- **Status:** Open
- **Responsible tickets:** [MU-06](tickets/MU-06-gmail-integration.md), [MU-08](tickets/MU-08-notification-delivery.md), [MU-09](tickets/MU-09-fair-scheduling.md), [MU-13](tickets/MU-13-integrated-validation.md)

**Potential issue:** A large Gmail page backlog, expired authorization, Telegram retries, or long-running cleanup could consume a scheduled run and starve healthy accounts. Runtime/provider limits may prevent meeting the normal five-minute delivery target.

**Mitigation:** Use persistent round-robin scheduling, per-account/per-run budgets, independent leases and retry times, safe checkpoints, and separate Gmail/delivery failure handling. Measure queue age, sync age, delivery latency, and resource use without logging financial content.

**Verification:** Run ten-account simulations with a backlog, a revoked mailbox, throttled Telegram, restarts, overlapping runs, and mid-page budget exhaustion. Show bounded progress for healthy users, safe catch-up for failed users, and measured normal-case latency. Report any target misses explicitly.

**Gate or remaining limitation:** Unbounded starvation, lost progress, or unsupported resource needs block expansion; lower admission or adjust the design before making latency claims.


## R07

**Disconnect or deletion races with active work**

- **Severity:** High
- **Likelihood before mitigation:** Medium
- **Status:** Open
- **Responsible tickets:** [MU-08](tickets/MU-08-notification-delivery.md), [MU-11](tickets/MU-11-account-lifecycle.md), [MU-13](tickets/MU-13-integrated-validation.md)

**Potential issue:** A leased job, late OAuth callback, or stale Telegram interaction may continue after disconnect/removal and send a notification or recreate state. A request already accepted by Telegram may complete even after local cancellation.

**Mitigation:** Distinguish disconnect, logout, access removal, and deletion. Disable connections and fence active generations, invalidate sessions/links, cancel queued work, and recheck state before external effects and persistence. Use minimal temporary tombstones where required. Document in-flight delivery limits.

**Verification:** Pause jobs before/after the final active-state check, disconnect/delete, then resume. Replay callbacks and updates, retry removal, and reconnect the same identity. Verify no new unauthorized work or resurrected history and no effects on the second account; record the unavoidable in-flight case.

**Gate or remaining limitation:** Lifecycle concurrency tests and provider/local deletion semantics must be documented before participants can use disconnect/removal controls.


## R08

**Google verification or configuration blocks onboarding**

- **Severity:** High
- **Likelihood before mitigation:** Medium
- **Status:** Open
- **Responsible tickets:** [MU-01](tickets/MU-01-pilot-prerequisites.md), [MU-14](tickets/MU-14-pilot-rollout.md)

**Potential issue:** The proposed Gmail scope is restricted. A personally known pilot may qualify for Google's personal-use exception, but eligibility and app configuration must be checked; invitation-only access alone is not sufficient. Testing-mode grants and unverified-app screens can also disrupt onboarding.

**Mitigation:** In MU-01, verify the actual audience, app publishing mode, web client/callbacks, requested scopes, token lifetime behavior, and current policy. Explain consent and any applicable unverified-app experience. Reassess verification/security-assessment requirements before changing the audience or making a public product.

**Verification:** Record dated primary-source findings and redacted configuration checks, then verify consent/reconnect for the initial participants. Unresolved eligibility or callback configuration remains a launch blocker; do not assume production publishing status means verified or permanent authorization.

**Gate or remaining limitation:** Confirm the pilot can use the selected configuration before admission. A failed assumption requires revising this future plan, not silently widening permissions or changing the intake approach.

**Sources:** [Google OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies) describe the personal-use exception for fewer than 100 personally known users. See also [verification exceptions](https://support.google.com/cloud/answer/13464323?hl=en), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification), and [token expiration](https://developers.google.com/identity/protocols/oauth2#expiration).


## R09

**Hosting limits and future operating costs**

- **Severity:** Medium
- **Likelihood before mitigation:** Medium
- **Status:** Open
- **Responsible tickets:** [MU-01](tickets/MU-01-pilot-prerequisites.md), [MU-09](tickets/MU-09-fair-scheduling.md), [MU-14](tickets/MU-14-pilot-rollout.md)

**Potential issue:** The single-owner deployment has not demonstrated the resource envelope for ten users. More polling, queries, and retries can hit limits, and future commercial use can require a different hosting plan.

**Mitigation:** Record current provider limits for the actual deployed plans, measure synthetic pilot traffic, set scheduling/admission budgets, and monitor redacted usage. Keep this pilot noncommercial and reassess hosting before any paid/public expansion; do not silently purchase upgrades.

**Verification:** MU-01 records dated limits/terms; MU-09 measures ten-user steady-state and recovery workloads; MU-14 compares pilot measurements to the selected budget. Include burst and retry costs rather than only empty-inbox polling.

**Gate or remaining limitation:** An unsupported resource envelope or incompatible use of a hosting plan blocks rollout/expansion until the plan is revised.

**Sources:** [Vercel Hobby documentation](https://vercel.com/docs/plans/hobby) limits Hobby to personal, noncommercial use. Recheck the current [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) during MU-01; no capacity or cost guarantee is established by this backlog.


## R10

**Onboarding friction and unsupported receipts**

- **Severity:** Medium
- **Likelihood before mitigation:** High
- **Status:** Open
- **Responsible tickets:** [MU-06](tickets/MU-06-gmail-integration.md), [MU-10](tickets/MU-10-onboarding-interface.md), [MU-14](tickets/MU-14-pilot-rollout.md)

**Potential issue:** Participants may confuse sign-in with Gmail consent, use the wrong inbox, miss Telegram confirmation, or lack matching UZCARD emails. Real receipts may have unsupported formats, leaving review items or no visible transactions.

**Mitigation:** Show sign-in and mailbox identities separately, explain the read-only mailbox permission and explicit activation, surface actionable connection status, and make interrupted setup resumable. Keep unknown receipts in review without guessing amounts/operations. Start with two participants before expanding.

**Verification:** Use synthetic UI scenarios for consent denial, missing connections, expired links, reconnects, and unknown receipt formats. During rollout, observe both participants completing setup and naturally arriving receipt flows; record support friction without storing their emails.

**Gate or remaining limitation:** Do not expand beyond two participants until their end-to-end flows work and unresolved setup/format issues have an explicit resolution.


## R11

**Partial deployment reopens access or breaks compatibility**

- **Severity:** Critical
- **Likelihood before mitigation:** Medium
- **Status:** Open
- **Responsible tickets:** [MU-05](tickets/MU-05-private-api-proxy.md), [MU-12](tickets/MU-12-owner-migration.md), [MU-13](tickets/MU-13-integrated-validation.md), [MU-14](tickets/MU-14-pilot-rollout.md)

**Potential issue:** A new frontend with an old global-data backend, or an old anonymous frontend restored during rollback, could bypass the intended privacy model. Old scheduled work may also write incompatible records after schema changes.

**Mitigation:** Make backend data routes require sessions independently of the proxy credential; retain proxy route restrictions and uncached responses. Coordinate backend/frontend/schema versions under maintenance and fence old work. Document compatible rollback versus forward recovery, keeping data routes closed until the combination is verified.

**Verification:** Exercise mixed-version and sessionless-proxy cases in an isolated rehearsal. Verify anonymous data rejection, owner access, admin-route rejection, old-worker fencing, and preserved reply associations after cutover and recovery.

**Gate or remaining limitation:** Do not reopen access or resume normal processing until authentication, ownership, and version compatibility checks pass.


## Updating the register

Keep each risk open until its responsible tickets provide verification evidence. Record the evidence reference and any remaining exposure when changing a risk's status. A successful automated test does not by itself satisfy a live acceptance or external-provider requirement. Add new risks when assumptions change, especially audience, supported banks, commercial use, data retention, or shared-account behavior.
