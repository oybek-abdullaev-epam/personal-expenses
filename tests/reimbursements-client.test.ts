import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const client = readFileSync(
  new URL("../website/worker/client.js", import.meta.url),
  "utf8",
);
const parentId = "10000000-0000-4000-8000-000000000001";
const secondParentId = "10000000-0000-4000-8000-000000000002";
const repaymentId = "20000000-0000-4000-8000-000000000001";
const parent = {
  id: parentId,
  source: "manual",
  direction: "expense",
  category: "Food",
  income_category: null,
  merchant: "SYNTHETIC DINNER",
  amount_minor: 30000000,
  original_minor: "30000000",
  reimbursed_minor: "10000000",
  personal_spending_minor: "20000000",
  currency: "UZS",
  occurred_at: "2026-09-20T14:00:00Z",
  description: "Dinner for three",
  version: 3,
  available_minor: "20000000",
};
const repayment = {
  id: repaymentId,
  source: "email",
  direction: "income",
  income_category: "Reimbursement",
  category: null,
  merchant: "BANK SENDER",
  amount_minor: 10000000,
  currency: "UZS",
  occurred_at: "2026-10-02T14:00:00Z",
  payer_name: "",
  description: "",
  reimbursement_expense_id: null,
  version: 2,
};
class Element {
  children: any[] = [];
  value = "";
  text = "";
  disabled = false;
  hidden = false;
  open = false;
  name = "";
  required = false;
  attributes: Record<string, string> = {};
  dataset: Record<string, string> = {};
  listeners: Record<string, Function> = {};
  style = { flex: "", width: "", setProperty() {} };
  classList = { add() {}, remove() {}, toggle() {} };
  onclick?: Function;
  onchange?: Function;
  onkeydown?: Function;
  constructor(public tagName = "BUTTON") {}
  get textContent(): string {
    return (
      this.text +
      this.children
        .map((c) => (typeof c === "string" ? c : c.textContent))
        .join("")
    );
  }
  set textContent(value: string) {
    this.text = value;
    this.children = [];
  }
  set innerHTML(_value: string) {
    throw Error("Untrusted HTML injection");
  }
  append(...children: any[]) {
    this.children.push(...children);
  }
  prepend(...children: any[]) {
    this.children.unshift(...children);
  }
  replaceChildren(...children: any[]) {
    this.text = "";
    this.children = children;
  }
  add(option: any) {
    this.children.push(option);
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }
  removeAttribute(name: string) {
    delete this.attributes[name];
  }
  scrollIntoView() {}
  focus() {}
  addEventListener(name: string, fn: Function) {
    this.listeners[name] = fn;
  }
  querySelectorAll(selector: string): Element[] {
    return this.children.flatMap((child) =>
      typeof child === "string"
        ? []
        : [
            ...(selector === "button" && child.tagName === "BUTTON"
              ? [child]
              : selector === ".cell" && child.className === "cell"
                ? [child]
                : []),
            ...child.querySelectorAll(selector),
          ],
    );
  }
}
function harness(handler?: (path: string, options: any) => any) {
  const nodes: Record<string, any> = {};
  const get = (id: string) => (nodes[id] ||= new Element());
  const fields: any = [
    "merchant",
    "amount",
    "currency",
    "card_suffix",
    "direction",
    "local_time",
    "category",
    "description",
    "payer_name",
    "reimbursement_expense_id",
  ].map((name) =>
    Object.assign(new Element(name === "description" ? "TEXTAREA" : "INPUT"), {
      name,
    }),
  );
  for (const field of fields) fields[field.name] = field;
  const edit = Object.assign(get("edit-form"), {
    elements: fields,
    reset() {
      for (const field of fields) field.value = "";
    },
  });
  get("filters").elements = {};
  get("filters").reset = () => {};
  const calls: { path: string; options: any }[] = [];
  let nextId = 0;
  const context: any = {
    document: {
      getElementById: get,
      querySelectorAll: () => [],
      createElement: (tag: string) => new Element(tag.toUpperCase()),
      body: new Element("BODY"),
    },
    window: {},
    URL,
    URLSearchParams,
    AbortSignal,
    Intl,
    Date,
    BigInt,
    RadioNodeList: class {},
    crypto: {
      randomUUID: () =>
        "30000000-0000-4000-8000-" + String(++nextId).padStart(12, "0"),
    },
    Option: class extends Element {
      constructor(text: string, value: string) {
        super("OPTION");
        this.textContent = text;
        this.value = value;
      }
    },
    location: new URL("https://tracker.example/?sdk=keep"),
    history: { replaceState() {} },
    setTimeout() {},
    createTelegramAdapter: (options: any) => {
      context.adapter = options;
      return { update() {} };
    },
    fetch: async (path: string, options: any) => {
      calls.push({ path, options });
      const result = handler ? await handler(path, options) : null;
      return result instanceof Response
        ? result
        : Response.json(
            result ??
              (path.includes("reimbursement-candidates")
                ? { expenses: [parent], nextCursor: null }
                : path.includes("/reimbursements")
                  ? { expenses: [], nextCursor: null }
                  : path.includes("health")
                    ? { sync: null, notifications: { failed: 0 } }
                    : path.includes("insights")
                      ? { currencies: [] }
                      : path.startsWith("/api/expenses?")
                        ? { expenses: [], nextOffset: null }
                        : options.method
                          ? {
                              ...repayment,
                              ...JSON.parse(options.body),
                              version: 3,
                            }
                          : repayment),
          );
    },
  };
  runInNewContext(
    client.slice(0, client.lastIndexOf("route();\nload();")),
    context,
  );
  context.inspect = () =>
    runInNewContext(
      "({ selected, creationId, pendingSubmission, formConflict, reimbursementParent, reimbursementParentVersions, editorBaseline })",
      context,
    );
  context.set = (code: string) => runInNewContext(code, context);
  return { context, fields, nodes, calls, edit };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("pending and linking separate From validation from optional note and keep bank sender", async () => {
  const h = harness();
  h.context.openEditor(repayment);
  await tick();
  assert.equal(h.fields.description.required, false);
  h.context.chooseParent(parent);
  h.fields.payer_name.value = "   ";
  await h.context.save();
  assert.equal(h.calls.filter((c) => c.options.method).length, 0);
  assert.match(h.nodes["form-error"].textContent, /Enter From/);
  h.fields.payer_name.value = " Ali ";
  await h.context.save();
  const body = JSON.parse(h.calls.find((c) => c.options.method)!.options.body);
  assert.equal(body.payer_name, "Ali");
  assert.equal(body.description, "");
  assert.equal(body.reimbursement_expense_id, parentId);
  assert.equal(body.parent_versions[parentId], 3);
  for (const call of h.calls)
    assert.equal(
      call.options.headers["X-Tracker-Contract"],
      "reimbursements-v1",
    );
});

test("new manual reimbursements save pending before picker, with blank name and note", async () => {
  const h = harness();
  h.context.openEditor();
  h.fields.direction.value = "income";
  h.context.updateCategories("Reimbursement");
  h.fields.merchant.value = "Cash repayment";
  h.fields.amount.value = "100000.00";
  h.context.updateReimbursementForm();
  h.context.editorState();
  assert.equal(h.fields.description.required, false);
  assert.equal(h.nodes["candidate-controls"].hidden, true);
  assert.equal(h.calls.length, 0);
  await h.context.save();
  await tick();
  const created = h.calls.find((c) => c.options.method === "POST")!;
  const body = JSON.parse(created.options.body);
  assert.equal(body.reimbursement_expense_id, null);
  assert.equal(body.payer_name, "");
  assert.equal(body.description, "");
  assert.equal(h.nodes.editor.open, true);
  assert.equal(h.nodes["candidate-controls"].hidden, false);
  assert.ok(
    h.calls.some((c) => c.path.includes(body.id + "/reimbursement-candidates")),
  );
});

test("paged search is independent of ledger and preserves selection during a new search", async () => {
  const h = harness((path) =>
    path.includes("reimbursement-candidates")
      ? { expenses: [parent], nextCursor: "opaque-page" }
      : null,
  );
  h.context.openEditor(repayment);
  await tick();
  h.context.chooseParent(parent);
  h.nodes["candidate-query"].value = "older dinner & literal %";
  await h.context.loadCandidates();
  await h.context.loadCandidates(true);
  const paths = h.calls.map((c) => c.path);
  assert.ok(paths.some((p) => p.includes("q=older+dinner+%26+literal+%25")));
  assert.ok(paths.some((p) => p.includes("cursor=opaque-page")));
  assert.equal(h.fields.reimbursement_expense_id.value, parentId);
  assert.equal(h.calls.filter((c) => c.options.method).length, 0);
  assert.match(
    h.nodes["candidate-list"].textContent,
    /Dinner for three.*Paid 300,000 UZS.*Available for this repayment 200,000 UZS/,
  );
});

test("linked correction, relink and unlink submit all affected parent versions", async () => {
  for (const action of ["name", "relink", "unlink"]) {
    const h = harness();
    h.context.openEditor({
      ...repayment,
      payer_name: "Ali",
      reimbursement_expense_id: parentId,
      reimbursement_expense: parent,
      parent_versions: { [parentId]: 3 },
    });
    await tick();
    h.fields.payer_name.value = "Sara";
    if (action === "relink")
      h.context.chooseParent({ ...parent, id: secondParentId, version: 8 });
    if (action === "unlink") h.nodes["clear-parent"].onclick();
    await h.context.save();
    const body = JSON.parse(
      h.calls.find((c) => c.options.method)!.options.body,
    );
    assert.equal(body.parent_versions[parentId], 3);
    assert.equal(
      body.reimbursement_expense_id,
      action === "unlink"
        ? null
        : action === "relink"
          ? secondParentId
          : parentId,
    );
    if (action === "relink")
      assert.equal(body.parent_versions[secondParentId], 8);
  }
});

test("ambiguous link freezes parent versions; conflict recovery reads latest context only with consent", async () => {
  let writes = 0;
  const latestParent = { ...parent, version: 9 };
  const h = harness((path, options) => {
    if (options.method) {
      if (++writes === 1) throw Error("response lost");
      return Response.json({ error: "Parent changed" }, { status: 409 });
    }
    if (path.endsWith(repaymentId))
      return {
        ...repayment,
        payer_name: "Saved Ali",
        reimbursement_expense_id: parentId,
        reimbursement_expense: latestParent,
        parent_versions: { [parentId]: 9 },
        version: 4,
      };
    return null;
  });
  h.context.openEditor(repayment);
  await tick();
  h.context.chooseParent(parent);
  h.fields.payer_name.value = "Ali";
  await h.context.save();
  assert.equal(h.fields.payer_name.disabled, true);
  assert.equal(h.nodes["add-parent"].disabled, true);
  h.fields.payer_name.value = "script mutation";
  await h.context.save();
  const writesOnly = h.calls.filter((c) => c.options.method);
  assert.equal(writesOnly[0].options.body, writesOnly[1].options.body);
  assert.match(h.nodes["form-error"].textContent, /earlier save/);
  const before = h.calls.length;
  h.nodes["review-latest"].onclick();
  assert.equal(h.calls.length, before);
  h.nodes["confirm-discard"].onclick();
  await tick();
  assert.equal(h.fields.payer_name.value, "Saved Ali");
  assert.equal(h.context.inspect().reimbursementParentVersions[parentId], 9);
  assert.equal(h.context.inspect().selected.version, 4);
});

test("manual missing expense flow preserves repayment name/note and retries exact new expense ID", async () => {
  let writes = 0;
  const h = harness((_path, options) => {
    if (!options.method) return null;
    if (++writes === 1) throw Error("response lost");
    const body = JSON.parse(options.body);
    return {
      ...parent,
      id: body.id,
      reimbursed_minor: "0",
      personal_spending_minor: "30000000",
      version: 1,
    };
  });
  h.context.openEditor(repayment);
  await tick();
  h.fields.payer_name.value = "<Ali>";
  h.fields.description.value = "Draft note";
  h.context.addMissingParent();
  const originalCreation = h.context.inspect().creationId;
  h.fields.merchant.value = "Original cash dinner";
  h.fields.amount.value = "300000.00";
  h.fields.category.value = "Food";
  h.fields.description.value = "Dinner";
  await h.context.save();
  assert.equal(h.nodes.editor.open, true);
  await h.context.save();
  await tick();
  const writesOnly = h.calls.filter((c) => c.options.method);
  assert.equal(writesOnly[0].options.body, writesOnly[1].options.body);
  assert.equal(h.context.inspect().selected.id, repaymentId);
  assert.equal(h.fields.payer_name.value, "<Ali>");
  assert.equal(h.fields.description.value, "Draft note");
  assert.equal(h.fields.reimbursement_expense_id.value, originalCreation);
  assert.equal(
    h.context.inspect().reimbursementParentVersions[originalCreation],
    1,
  );
  assert.equal(writesOnly.length, 2);
});

test("Back from clean or dirty missing-parent form restores original reimbursement draft", async () => {
  const h = harness();
  h.context.openEditor(repayment);
  await tick();
  h.fields.payer_name.value = "Ali";
  h.fields.description.value = "Keep this";
  h.context.addMissingParent();
  h.context.adapter.onBack();
  assert.equal(h.context.inspect().selected?.id, repaymentId);
  assert.equal(h.fields.description.value, "Keep this");
  h.context.addMissingParent();
  h.fields.merchant.value = "Unfinished parent";
  h.context.adapter.onBack();
  assert.equal(h.nodes["editor-confirm"].hidden, false);
  h.nodes["keep-editing"].onclick();
  assert.equal(h.fields.merchant.value, "Unfinished parent");
  h.context.adapter.onBack();
  h.nodes["confirm-discard"].onclick();
  assert.equal(h.context.inspect().selected.id, repaymentId);
  assert.equal(h.fields.payer_name.value, "Ali");
});

test("full reimbursement displays zero across ledger/month and plain-text named paged details", async () => {
  const named = {
    ...repayment,
    payer_name: '<img src=x onerror="bad">',
    description: "<script>note</script>",
  };
  const zero = {
    ...parent,
    reimbursed_minor: "30000000",
    personal_spending_minor: "0",
  };
  const h = harness((path) =>
    path.includes("/reimbursements")
      ? { expenses: [named], nextCursor: "next" }
      : null,
  );
  h.context.openEditor(zero);
  await tick();
  assert.match(h.nodes["repayment-summary"].textContent, /Your spending 0 UZS/);
  assert.match(
    h.nodes["repayment-list"].textContent,
    /<img src=x onerror="bad">/,
  );
  assert.match(h.nodes["repayment-list"].textContent, /<script>note<\/script>/);
  await h.context.loadRepayments(true);
  assert.ok(h.calls.some((c) => c.path.includes("reimbursements?cursor=next")));
  const row = h.context.row(zero, false);
  assert.match(row.textContent, /0 UZS/);
  assert.match(row.textContent, /Paid 300,000 UZS · Reimbursed 300,000 UZS/);
  h.context.renderTotals([
    {
      currency: "UZS",
      amount_minor: "0",
      income_minor: "0",
      pending_reimbursement_minor: "10000000",
      count: 1,
    },
  ]);
  assert.match(
    h.nodes.totals.textContent,
    /Spending 0.*Pending reimbursements 100,000/,
  );
  h.context.set(
    `month = "2026-09"; monthData = { currencies: [{ currency: "UZS", spending_minor: "0", income_minor: "0", net_minor: "0", pending_reimbursement_minor: "10000000", days: [{date:"2026-09-20",spending_minor:"0",count:1}], categories:[{category:"Food",spending_minor:"0",count:1}] }] }; renderMonth();`,
  );
  assert.match(h.nodes["month-totals"].textContent, /Income minus spending0/);
  assert.match(
    h.nodes["month-totals"].textContent,
    /Pending reimbursements100,000/,
  );
  assert.match(h.nodes["day-table"].textContent, /0 UZS/);
});

test("late candidate results cannot replace new editor; known rejection retains editable selection", async () => {
  let resolve: Function = () => {};
  let first = true;
  const h = harness((path, options) => {
    if (options.method)
      return Response.json(
        { error: "Repayment exceeds remaining cost" },
        { status: 400 },
      );
    if (first && path.includes("reimbursement-candidates")) {
      first = false;
      return new Promise((r) => {
        resolve = r;
      });
    }
    return null;
  });
  h.context.openEditor(repayment);
  h.context.discardEditor();
  h.context.openEditor();
  resolve({ expenses: [parent], nextCursor: null });
  await tick();
  assert.equal(h.nodes["candidate-list"].textContent, "");
  h.context.discardEditor();
  h.context.openEditor(repayment);
  await tick();
  h.context.chooseParent(parent);
  h.fields.payer_name.value = "Ali";
  await h.context.save();
  assert.equal(h.fields.payer_name.disabled, false);
  assert.equal(h.fields.reimbursement_expense_id.value, parentId);
  assert.match(h.nodes["form-error"].textContent, /remaining cost/);
});

test("Unicode From limit counts code points; ordinary manual descriptions stay required", async () => {
  const h = harness();
  h.context.openEditor();
  assert.equal(h.fields.description.required, true);
  h.context.discardEditor();
  h.context.openEditor(repayment);
  await tick();
  h.context.chooseParent(parent);
  h.fields.payer_name.value = "😀".repeat(101);
  await h.context.save();
  assert.match(h.nodes["form-error"].textContent, /100 characters/);
  assert.equal(h.calls.filter((c) => c.options.method).length, 0);
  h.fields.payer_name.value = "😀".repeat(100);
  await h.context.save();
  assert.equal(h.calls.filter((c) => c.options.method).length, 1);
});

test("failed Review latest keeps payer, link, current parent versions and frozen payload", async () => {
  let writes = 0;
  const h = harness((path, options) => {
    if (options.method) {
      if (++writes === 1) throw Error("lost response");
      return Response.json(
        { error: "Parent version conflict" },
        { status: 409 },
      );
    }
    if (path.endsWith(repaymentId)) throw Error("offline");
    return null;
  });
  h.context.openEditor(repayment);
  await tick();
  h.context.chooseParent(parent);
  h.fields.payer_name.value = "Keep Ali";
  h.fields.description.value = "Keep note";
  await h.context.save();
  await h.context.save();
  const frozen = h.context.inspect().pendingSubmission.body;
  h.nodes["review-latest"].onclick();
  h.nodes["confirm-discard"].onclick();
  await tick();
  assert.equal(h.fields.payer_name.value, "Keep Ali");
  assert.equal(h.fields.description.value, "Keep note");
  assert.equal(h.fields.reimbursement_expense_id.value, parentId);
  assert.equal(h.context.inspect().reimbursementParentVersions[parentId], 3);
  assert.equal(h.context.inspect().pendingSubmission.body, frozen);
  assert.match(h.nodes["form-error"].textContent, /draft is kept/);
});

test("correction reads honor latest click and dirty consent; recent picker clears search", async () => {
  const pending: Record<string, Function> = {};
  const h = harness((path) =>
    path.includes("/reimbursements")
      ? { expenses: [], nextCursor: null }
      : new Promise((resolve) => {
          pending[path] = resolve;
        }),
  );
  h.context.openEditor(parent);
  await tick();
  h.fields.description.value = "Unfinished parent note";
  const first = h.context.openCorrection(repaymentId);
  const secondId = "20000000-0000-4000-8000-000000000002";
  const second = h.context.openCorrection(secondId);
  pending["/api/expenses/" + secondId]({ ...repayment, id: secondId });
  await second;
  pending["/api/expenses/" + repaymentId](repayment);
  await first;
  assert.equal(h.context.inspect().selected.id, parentId);
  assert.equal(h.fields.description.value, "Unfinished parent note");
  h.nodes["confirm-discard"].onclick();
  assert.equal(h.context.inspect().selected.id, secondId);
  h.nodes["candidate-query"].value = "old dinner";
  h.nodes["candidate-refresh"].onclick();
  assert.equal(h.nodes["candidate-query"].value, "");
  assert.ok(h.calls.at(-1)!.path.endsWith("?q="));
});

test("zero-only filter totals stay visible even without a count projection", () => {
  const h = harness();
  h.context.renderTotals([
    {
      currency: "UZS",
      amount_minor: "0",
      income_minor: "0",
      pending_reimbursement_minor: "0",
    },
  ]);
  assert.equal(h.nodes.totals.hidden, false);
  assert.match(h.nodes.totals.textContent, /Spending 0/);
});

test("searching after clearing a persisted link keeps the draft unlinked", async () => {
  const linked = {
    ...repayment,
    payer_name: "Ali",
    reimbursement_expense_id: parentId,
    reimbursement_expense: parent,
    parent_versions: { [parentId]: 3 },
  };
  const h = harness((path) =>
    path.includes("reimbursement-candidates")
      ? { expenses: [parent], nextCursor: null }
      : linked,
  );
  h.context.openEditor(linked);
  await tick();
  h.nodes["clear-parent"].onclick();
  h.nodes["candidate-refresh"].onclick();
  await tick();
  assert.equal(h.fields.reimbursement_expense_id.value, "");
  assert.match(
    h.nodes["reimbursement-preview"].textContent,
    /Needs an expense/,
  );
  assert.equal(h.nodes.save.textContent, "Save pending");
});

test("saving an existing pending reimbursement closes the editor without reopening the picker", async () => {
  const h = harness();
  h.context.openEditor(repayment);
  await tick();
  const before = h.calls.length;
  await h.context.save();
  await tick();
  const after = h.calls.slice(before);
  assert.ok(after.some((c) => c.options.method === "PATCH"));
  assert.equal(h.nodes.editor.open, false);
  assert.ok(!after.some((c) => c.path.includes("reimbursement-candidates")));
});

test("unlink_first shows its message and leaves the form editable without a conflict", async () => {
  const linked = {
    ...repayment,
    payer_name: "Ali",
    reimbursement_expense_id: parentId,
    reimbursement_expense: parent,
    parent_versions: { [parentId]: 3 },
  };
  const message = "Save the unlink or new link on its own first.";
  const h = harness((path, options) =>
    options.method
      ? Response.json({ error: message, code: "unlink_first" }, { status: 409 })
      : path.includes("reimbursement-candidates")
        ? { expenses: [parent], nextCursor: null }
        : linked,
  );
  h.context.openEditor(linked);
  await tick();
  await h.context.save();
  await tick();
  assert.equal(h.nodes["form-error"].textContent, message);
  assert.equal(h.nodes.editor.open, true);
  assert.equal(h.context.inspect().formConflict, false);
});
