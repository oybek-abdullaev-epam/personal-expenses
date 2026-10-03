import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { isUuid } from "../backend/src/telegram-links";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");
const lower = "123e4567-e89b-42d3-a456-426614174000";
const cases: [string, boolean][] = [
  [lower, true],
  [lower.toUpperCase(), true],
  [lower.slice(1), false],
  [lower + "0", false],
  [lower.replace("e", "g"), false],
  ["", false],
];

test("backend, worker proxy and client agree on accepted transaction IDs", async () => {
  const workerSource = read("../website/worker/index.js").replace(
    "export default",
    "globalThis.worker =",
  );
  const sandbox: any = { Response, URL, TextEncoder, AbortSignal };
  sandbox.globalThis = sandbox;
  runInNewContext(workerSource, sandbox);
  const clientSource = read("../website/worker/client.js");
  const selector = clientSource.slice(
    clientSource.indexOf("function transactionSelector("),
    clientSource.indexOf("function node("),
  );
  const client: any = { URLSearchParams };
  runInNewContext(selector, client);
  for (const [id, valid] of cases) {
    assert.equal(isUuid(id), valid, `backend ${id}`);
    const response: Response = await sandbox.worker.fetch(
      new Request(`https://site.example/api/expenses/${id}`),
      {},
    );
    // 404 means the proxy rejected the path; 503 means it was accepted but unconfigured.
    assert.equal(response.status !== 404, valid, `worker ${id}`);
    assert.equal(
      client.transactionSelector(`?transaction=${id}`).kind === "transaction",
      valid && id !== "",
      `client ${id}`,
    );
  }
});
