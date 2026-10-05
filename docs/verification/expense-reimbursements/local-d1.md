# Local D1 migration and atomic guards

Verified 4 October 2026 using locked Wrangler 4.136.3, the local D1 engine only, persistence directory `/tmp/fp003-local-d1`. No `--remote` operation. All five migrations applied successfully.

```sh
npx wrangler d1 migrations apply expenses --local --persist-to /tmp/fp003-local-d1 --config backend/wrangler.toml
npx wrangler d1 execute expenses --local --persist-to /tmp/fp003-local-d1 --config backend/wrangler.toml --file <synthetic.sql>
```

Synthetic original parent P had amount 10,000 minor UZS, a later named incoming Reimbursement R had 6,000, and alternate eligible parent Q had 10,000. Initial link R→P yielded P version 1, R version 0, Q version 0. Changing R to 11,000 failed with `reimbursement_conflict: SQLITE_CONSTRAINT_TRIGGER`; amount and link stayed unchanged.

Wrangler local `d1 execute --file` sends the parsed statements through D1 `batch()` (confirmed in installed CLI implementation). This two-statement batch successfully relinked first, then deliberately violated capacity:

```sql
UPDATE expenses SET reimbursement_expense_id=:Q,version=version+1 WHERE id=:R;
UPDATE expenses SET amount_minor=11000 WHERE id=:R;
```

Expected failure occurred. A separate JSON readback, asserted with Node strict assertions, proved full rollback: R still linked P, amount 6,000, and versions P=1/R=0/Q=0. Running only the first update then succeeded, with R→Q and versions P=2/R=1/Q=1. Both parents changed exactly once. The [D1 batch contract](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) specifies whole-sequence rollback on failure.

An initial standalone `getPlatformProxy` verification attempt stalled before executing SQL and was terminated. The successful checks above used Wrangler's local D1 command and independent readbacks; the stalled attempt is not a pass. Synthetic populated migration, notification enqueue rollback, relationship races and preservation of old manual snapshots are additionally covered in the SQLite suite.
