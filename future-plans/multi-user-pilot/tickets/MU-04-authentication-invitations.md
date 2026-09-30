# MU-04: Authentication and invitations

- **Status:** Backlog
- **Proposal:** [Private multi-user pilot](../PLAN.md)
- **Depends on:** [MU-02](MU-02-user-ownership.md)
- **Risks:** [R02](../RISKS.md#r02), [R01](../RISKS.md#r01)

## Context and objective

The dashboard currently has no user session. Add a trusted account identity and invitation gate before any user-facing data route can safely select an owner.

## Prerequisites

MU-02 supplies identity/session/invitation persistence. Use the authentication contract from MU-01 and mocked Google responses for automated tests.

## Included work

- Implement Google web sign-in with server-side validation of provider identity, issuer/audience, token freshness, verified invitation identity, and callback state/nonce as applicable to the selected flow.
- Create opaque server-managed sessions in secure, HttpOnly cookies; enforce expiry, rotation on authentication, sign-out invalidation, and same-origin mutation protection.
- Add a local administrative invitation command and lookup by durable Google subject after first verified sign-in. Keep sign-in independent from Gmail mailbox consent.
- Prevent replay, login CSRF, open redirects, and accidental assignment of the existing owner's records to the first invited user.
- Provide a common authenticated-account resolver for Worker routes and a minimal same-origin authentication proxy path through Vercel.

## Excluded work

- Private transaction APIs (MU-05), Gmail scopes or mailbox authorization (MU-06), complete onboarding screens (MU-10), and removal of existing accounts (MU-11).

## Affected interfaces

Authentication start/callback/session/logout routes, invitation command, server session records, and a trusted account context returned to downstream modules. Administrative credentials remain inaccessible to the browser.

## Acceptance checks

- [ ] An invited verified identity can create a session; anonymous, uninvited, unverified, and wrong-audience identities cannot.
- [ ] Expired/replayed callbacks, mismatched state/nonce, forged tokens, and external return destinations are rejected without creating or switching accounts.
- [ ] Session cookies have the required security attributes, session expiry is enforced, and logout invalidates server-side use of the old session.
- [ ] Two signed-in users resolve to different account contexts even when request bodies or headers contain another user's ID.
- [ ] Sign-in alone neither grants Gmail access nor activates ingestion; the owner's legacy data remains unclaimed without the established proof procedure.

## Completion evidence

Not started. Record the implementation reference, checks actually run and their results, relevant synthetic/redacted evidence, and any remaining limitations. This ticket does not authorize production deployment before MU-14.
