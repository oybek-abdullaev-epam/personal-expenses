# MU-01: Pilot prerequisites and contracts

- **Status:** Backlog
- **Proposal:** [Private multi-user pilot](../PLAN.md)
- **Depends on:** None
- **Risks:** [R08](../RISKS.md#r08), [R09](../RISKS.md#r09)

## Context and objective

The current app has one owner, one deployment-wide Gmail token, and a public website. Before changing that model, establish a shared implementation contract and verify that the personally known, noncommercial pilot fits the external services' requirements.

## Prerequisites

Read the proposal, root implementation agreement, deployment notes, and current authentication/ingestion code. Schedule implementation explicitly and reconcile accepted scope with the root agreement before feature changes; this backlog alone does not promote the proposal.

## Included work

- Record the onboarding state transitions: invited, signed in, connections ready, explicitly activated, disconnected, and removed. Only activation starts a new user's ingestion; reconnecting never creates a new activation time.
- Specify the Google subject used for account identity, invitation matching, separate mailbox identity, unique Telegram association, and authenticated proof required to attach the existing owner's history.
- Document the route/session and connection contracts needed by later tickets, including trusted identity propagation through Vercel, same-origin callbacks, and administrative commands outside the public proxy.
- Recheck Google's personal-use exception, app publishing mode, web OAuth callback configuration, token lifetime behavior, and current Vercel/Cloudflare limits. Record dated source links, configuration findings without secrets, a usage envelope for ten users, and any launch blockers.
- Record cutover gates, privacy/data-retention disclosures, support contact/process, and provider/account deletion expectations for the pilot.

## Excluded work

- Feature code, provider credential creation, production configuration changes, public registration, paid-plan changes, and participant messaging.

## Affected interfaces

The future authentication, connection, activation, and administrative contracts; the existing Worker/Vercel trust relationship. Save the completed contract alongside this proposal and link it from the relevant tickets.

## Acceptance checks

- [ ] Each intended user state has documented allowed reads/writes/background actions, and the chosen contracts preserve the proposal's defaults and exclusions.
- [ ] The account identity, mailbox identity, Telegram identity, and owner-bootstrap proof cannot be confused or supplied as unchecked browser ownership claims.
- [ ] Google and hosting findings cite primary sources with a check date and distinguish verified facts, app configuration, and unresolved blockers.
- [ ] Documented launch gates prevent proceeding when OAuth eligibility, recovery, or resource requirements are unmet; no paid fallback or broader audience is silently assumed.
- [ ] Every later interface-changing ticket can reference the same contract rather than independently choosing incompatible routes or state meanings.

## Completion evidence

Not started. Record the implementation reference, checks actually run and their results, relevant synthetic/redacted evidence, and any remaining limitations. This ticket does not authorize production deployment before MU-14.
