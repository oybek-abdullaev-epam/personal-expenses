# Live testing and release

Use this only when a milestone involves a deployed environment or live service. Apply repository/provider runbooks and the current user's release scope; a previous feature's real-bot permission, platform exclusions, or cleanup policy does not transfer to a new project.

## Prepare a reviewable release

Identify the actual deployment targets and required credentials/scopes with read-only checks. Read back current versions, aliases and relevant settings before changing them. Preserve a protected rollback snapshot without overwriting the original during trial runs. Store secrets/private identifiers outside Git and output only necessary redacted evidence.

Prepare a compatible candidate, exact deployment order, smoke checks and stage-specific recovery. Where interfaces change, deploy backward-compatible prerequisites before consumers. Treat a candidate as unpromoted only after verifying which aliases/configuration actually changed. Unexpected migrations, changed permission scope or new destructive effects require resolution before dependent release actions.

Use the user's authorized testing boundary. Prefer synthetic local data for broad faults and retries. For authorized live tests, track exact created IDs and cleanup rules; account for secondary effects such as notifications, retention policies, billing or downstream jobs. A disposable test row does not make surrounding production data disposable.

## Execute gates in order

1. Verify the integrated candidate's required tests/build and relevant real-client behavior. State which checks can only occur after compatible infrastructure is deployed.
2. Deploy the next compatible stage and capture its reported version. Read back actual configuration and check the deployed behavior before promoting or advertising entry points.
3. Perform authorized live smoke tests, including existing access boundaries and continuity invariants. Record actual client/version when exposed; distinguish browser-width checks from native-client support.
4. If a gate fails, stop dependent cutover. Diagnose read-only first, then use the stage-specific recovery already within scope. If a mutation's response was lost, reconcile remote state before retrying. Claim rollback only after its readback succeeds.
5. Remove only tracked test artifacts under their established authorization. Verify cleanup and continuity. Restore temporary client/test preferences. Preserve necessary rollback records.

Changing presentation should normally preserve stored data, integration ownership and pending work. Compare meaningful before/after metadata or privacy-preserving identifiers, allowing legitimate background progress; avoid exporting production content merely to establish continuity. Use synthetic populated-state tests for failure/recovery paths that would be unsafe to inject live.

## Record the outcome

Append actual deployment/configuration versions, smoke results, cleanup results and limitations to the repository's history. A healthy snapshot is not ongoing monitoring, and a local recovery rehearsal is not a cloud rollback. Keep deferred observations separate from release passes and from unresolved release blockers. Record the operator's recovery path, including any cached-client refresh needed to observe new configuration.
