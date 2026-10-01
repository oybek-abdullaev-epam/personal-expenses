# Telegram Mini App risk register

- **Proposal:** [Telegram Mini App](PLAN.md)
- **Tickets:** [Index and dependency graph](TICKETS.md)
- **Recorded:** 2026-10-01
- **Status:** Implementation in progress; [MA-01 contracts](CONTRACTS.md) recorded. Runtime mitigations remain subject to evidence.

Severity describes potential impact; likelihood is a qualitative estimate before mitigation. Reassess risks against implementation evidence. Public viewing and editing without end-user authentication is confirmed scope. The former authentication/private-access risks R01/R02 are removed; remaining IDs stay stable.

| ID | Risk | Severity | Likelihood | Responsible tickets |
| --- | --- | --- | --- | --- |
| [R03](#r03) | Client differences block use or lose form input | High | Medium | MA-01, MA-04, MA-07 |
| [R04](#r04) | Transaction links or concurrent edits affect the wrong record | High | Medium | MA-05, MA-06, MA-07 |
| [R05](#r05) | Cutover breaks launch or existing processing | High | Medium | MA-07, MA-08 |
| [R06](#r06) | Combined pilot release has incompatible data-access assumptions | High | Medium | MA-01 |

## R03

**Client differences block use or lose form input**

Virtual keyboards, screen insets, SDK loading, and close/resume behavior can make forms unusable or interrupt a save.

**Mitigation:** Explicit client matrix, capability detection, targeted CSP changes, usable in-page navigation, and clear retry/conflict states. Keep the ordinary browser dashboard working. Retain unsaved input in memory during recoverable errors without persisting financial forms to browser storage by default.

**Verification / gate:** MA-04 and MA-07 record Telegram Web/browser evidence, including long forms at narrow widths, theme changes, missing launch data, SDK failure, and ambiguous writes. Native iOS/Android/Desktop and real mobile keyboard checks are explicitly deferred; browser emulation is not native-client proof. Unsupported clients get a useful browser fallback.

## R04

**Transaction links or concurrent edits affect the wrong record**

Untrusted selectors, records outside the loaded page, stale chat prompts, or repeated manual submissions could select or mutate the wrong transaction or duplicate side effects.

**Mitigation:** Validate selectors, use bounded lookups through the existing public proxy, preserve stable record IDs and version checks, keep opening read-only, and preserve request IDs for retries of the same manual submission. Audit current dashboard-edit/chat behavior before adding links.

**Verification / gate:** MA-06 tests old/invalid/missing targets, filtered-out records, reversed replies, chat/Mini App edit conflicts, notification/cleanup retries, and ambiguous manual saves. No unresolved association or duplicate-write issue may pass MA-07.

## R05

**Cutover breaks launch or existing processing**

A partial release, bad bot configuration, or unsafe rollback could break launch or disturb the currently functioning Gmail and Telegram workflow.

**Mitigation:** Reuse infrastructure, preserve transaction/processing state, stage compatible frontend/backend changes, and retain the browser dashboard and owner-operated recovery tools. Keep app URLs and integration recovery destinations explicit. Preserve server-held backend credentials, proxy restrictions, and webhook/owner-chat checks. Telegram unavailability must not halt ingestion.

**Verification / gate:** MA-07 rehearses upgrade, failure, rollback, and recovery with synthetic state including pending prompts. It checks anonymous dashboard use alongside existing direct-backend/admin/webhook rejection tests. MA-08 verifies continuity and records actual live checks using authorized disposable synthetic data. Naturally arriving receipts and a real 21:00 summary remain deferred, not inferred from synthetic tests. Recovery preserves stored data and existing integration protections.

## R06

**Combined pilot release has incompatible data-access assumptions**

FP-001 proposes private per-user data, whereas FP-002 retains the current public shared dashboard. Combining those implementations without reconciling scope would produce contradictory behavior.

**Mitigation:** Keep the proposals independent. MA-01 records the boundary; any future combined rollout needs a separate scope decision. Do not introduce authentication into FP-002 or weaken FP-001's private-user requirements implicitly.

**Verification / gate:** This backlog has no dependency on pilot authentication or account linking. If the pilot is already implemented when this work is scheduled, reconcile the combined product scope before deployment. Authentication remains outside this proposal.
