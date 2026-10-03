---
name: orchestrate-feature
description: Implement a documented future idea or large planned feature through dependency-driven subagents, independent verification, milestone artifacts, and incremental commits and pushes. Use when asked to orchestrate feature delivery end to end or resume an existing orchestration; planning-only requests and small standalone edits do not need this workflow.
---

# Feature Orchestrator

Act as the accountable integrator: turn the selected proposal into working, verified software and complete the authorized release. Use subagents for bounded implementation and independent review. Continue through ready milestones without asking the user to say “continue” after each one.

## 1. Establish scope and readiness

Read repository instructions, the root implementation plan, the selected idea, its tickets/dependency graph, and relevant runbooks. Locate existing implementation and evidence before scheduling new work. Reconcile conflicting proposal/current-plan statements against the user's latest decisions; escalate only material ambiguity that cannot be resolved from the session.

Record the agreed outcome, acceptance checks, explicit exclusions/deferred checks, and release boundary in the existing planning documents. Separate implementation, live testing, deployment and merge authorization. A request to implement an idea does not by itself authorize production mutations or merging the default branch. Preserve prior authorization across turns; ask only for a genuinely missing decision and continue independent work while waiting.

Check the actual checkout, branch, dirty files, remotes, available subagent tools, and required runtime/test tools. Verify needed service access with read-only calls; check permission for the particular operation, not merely whether a CLI is logged in. Inspect secret presence without exposing values. Record missing credentials/capabilities as specific blockers for dependent work, not reasons to stop unrelated implementation. Existing browser authentication is evidence only after an authenticated page is observed.

**Gate:** Each acceptance check has a planned verification method; the release boundary is explicit; ready work can run with known ownership and prerequisites.

## 2. Maintain the dependency graph and resume record

Reuse existing tickets and evidence conventions. If absent, create a compact plan with stable milestone IDs, dependency edges, acceptance checks, owner/file scope, status and evidence links. Split by independently verifiable behavior, not arbitrary file counts. Identify shared contracts before parallel implementations; settle request/response shapes, state transitions and compatibility assumptions first.

A milestone becomes ready only when prerequisite contracts or changes are verified and available in its checkout. For intentionally parallel contract-first work, name the ready subtasks and their exact prerequisites; keep dependent integration and acceptance pending. Keep this record current:

| Milestone | Dependencies | Owner / checkout | State | Verification / artifact | Commit / push |
| --- | --- | --- | --- | --- | --- |

Use Pending, Ready, Active, Blocked, Verified and Done, or equivalent repository states. **Done** means acceptance verified, docs updated, and the milestone committed/pushed under the agreed Git workflow. Record implementation state separately from delivery state when needed, for example Verified / locally committed / push blocked. A skipped check is deferred or blocked, never passed.

On resume, read this record, Git state and live agent status. Reconcile partial edits and prior evidence before dispatching again. Preserve authorization, unresolved findings, deployment versions, exact test-artifact manifests and next actions. Chat history is not the sole checkpoint.

## 3. Dispatch bounded subagent work

Use native subagent tools, not separate user-owned chats, for subtasks. Size the team to independent ready work and available slots; reserve orchestrator capacity for integration. Serial dependencies do not become parallel just because slots are free.

Default model preference for this workflow is GPT-6.1 Sol for implementation and focused tests; GPT-6 Astra for ambiguous architecture, difficult diagnosis or independent review. Use `medium` reasoning, when supported, for routine bounded changes and high reasoning for state machines, concurrency, security boundaries and cross-system review; increase effort when demonstrated difficulty warrants it. Verify exposed model IDs/efforts. If a preferred model is unavailable, use an available suitable model and disclose the substitution; do not invent availability. Follow tool constraints on model overrides and context forks.

Each assignment carries:

- Milestone objective, relevant spec paths and acceptance criteria.
- Prerequisite commit/contract and exact checkout.
- Exclusive edit ownership and allowed shared interfaces.
- Required tests, evidence, and a clear completion report.
- Side-effect boundary: by default the orchestrator owns integration, commits/pushes, credentials, deployments and live-service mutations.

Use separate worktrees for overlapping edits, independent branch histories, risky experiments or incompatible build environments. Prefer a shared checkout with explicit non-overlapping ownership when integration is simpler. Keep shared-contract edits under one owner even across worktrees. Record the base commit; dependencies must exist in each worktree before work begins. Integrate completed work once, run affected checks on the combined result, and preserve recoverable work before cleanup. Coordinate shared tests/build outputs rather than letting agents race on generated files.

If an agent fails or hits a limit, inspect its partial work, then resume/reassign the bounded remainder or complete it yourself. Repeated unavailable access is a blocker, not evidence of completion. Avoid identical retries without a changed condition.

## 4. Verify and publish each milestone

Treat an agent's report as a handoff, not proof. Inspect the diff against its acceptance criteria and repository rules. Run appropriate checks on the integrated revision. Arrange an independent review for substantial behavior/state/access changes, ideally by an agent that did not implement them. Fix concrete findings and verify closure before advancing dependent milestones.

Keep verification proportional to the change: unit/integration tests for logic and failure behavior; actual browser/client use for interaction claims; deployment readbacks for configuration. Include duplicate/retry, stale response/conflict, and unauthorized access cases where those behaviors are affected. Mocks do not establish a real-client or production pass.

Save a concise evidence record per milestone: revision tested, commands and results, acceptance-to-evidence mapping, reviewed findings and resolution, artifact links, limitations and deferred checks. Use screenshots for meaningful visible behavior, sanitized test output for logic, and deployment IDs/readbacks for releases. Capture synthetic/redacted artifacts; keep credentials and private payloads out of tracked reports.

Update behavior/run/deployment docs with the change. Stage only owned files; preserve unrelated user work. Commit each verified milestone and push to the agreed feature branch. If none exists, use an appropriate `codex/` branch. Confirm the remote received the commit before reporting it pushed. If push is blocked, retain the local commit, record the error, and continue independent authorized work. Keep merge/default-branch changes within their separate authorization.

Present a short checkpoint: what works, verification result, clickable proof and commit/push status. Then continue the graph; this update is not an approval gate.

## 5. Complete release and handoff

If deployment or live testing is in scope, read [references/release.md](references/release.md) before preparing the first external mutation. Finish all safe preparation before asking for any missing authorization so the user can review a concrete candidate.

Completion requires all in-scope milestones integrated and verified, required independent findings closed, relevant docs current, and intended commits pushed. For an authorized release, it also requires actual deployment verification and test cleanup. If a required check remains blocked, report the precise incomplete scope instead of marking the feature Done.

Leave a concise final handoff: delivered behavior and entry point, verification/evidence links, final branch/commit, deployment status, and explicit remaining limitations. Close unnecessary processes, restore temporary test settings, and clean up only agent-owned disposable artifacts/worktrees whose work is preserved.
