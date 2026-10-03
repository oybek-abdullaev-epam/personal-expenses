import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const client = readFileSync(
  new URL("../website/worker/client.js", import.meta.url),
  "utf8",
);
const adapter = readFileSync(
  new URL("../website/worker/telegram.js", import.meta.url),
  "utf8",
);
function element(tagName = "BUTTON") {
  const listeners: Record<string, Function> = {};
  return {
    tagName,
    value: "",
    disabled: false,
    hidden: false,
    textContent: "",
    open: false,
    addEventListener: (name: string, fn: Function) => {
      listeners[name] = fn;
    },
    listeners,
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
    replaceChildren() {},
    add() {},
    scrollIntoView() {},
    focus() {},
    setAttribute() {},
    removeAttribute() {},
  };
}
function forms(fetch: Function) {
  const nodes: Record<string, any> = {};
  const $ = (id: string) => (nodes[id] ||= element());
  const fields: any = [
    "merchant",
    "amount",
    "currency",
    "card_suffix",
    "direction",
    "local_time",
    "category",
    "description",
  ].map((name) =>
    Object.assign(element(name === "description" ? "TEXTAREA" : "INPUT"), {
      name,
    }),
  );
  for (const field of fields) fields[field.name] = field;
  const edit = {
    elements: fields,
    reset() {
      for (const field of fields) field.value = "";
    },
    addEventListener() {},
  };
  const context: any = {
    $,
    edit,
    fetch,
    AbortSignal,
    URL,
    URLSearchParams,
    crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000001" },
    categories: ["Food"],
    incomeCategories: ["Salary"],
    Option: class {},
    location: new URL("https://tracker.example/"),
    createTelegramAdapter: (options: any) => {
      context.adapterOptions = options;
      return { update() {} };
    },
    editorConfirmation: null,
    money: () => "12 UZS",
    load: async () => {},
    loadMonth: async () => {},
    setTimeout() {},
    selected: null,
    creationId: null,
    editorBaseline: "",
    pendingSubmission: null,
    saving: false,
    formConflict: false,
    reviewingLatest: false,
    editorVersion: 0,
    launchKey: null,
    launchSelection: null,
    launchVersion: 0,
    navigationVersion: 0,
    navigationKey: null,
    routedHref: null,
    launchRecord: null,
  };
  runInNewContext(
    client.slice(
      client.indexOf("function timeoutSignal("),
      client.indexOf("function node("),
    ) +
      client.slice(
        client.indexOf("function updateCategories("),
        client.indexOf("// Month view."),
      ),
    context,
  );
  context.history = {
    replaceState(_state: any, _title: string, url: URL) {
      context.location.href = url.href;
    },
  };
  runInNewContext(
    client.slice(
      client.indexOf("function route()"),
      client.indexOf("window.onhashchange"),
    ),
    context,
  );
  context.openEditor();
  Object.assign(fields.merchant, { value: "SYNTHETIC CAFE" });
  fields.amount.value = "12.30";
  fields.category.value = "Food";
  fields.description.value = "Cash lunch";
  return { context, fields, nodes };
}
test("ambiguous manual save freezes exact request and retry ID, preserves draft and guards close", async () => {
  const bodies: string[] = [];
  const { context, fields, nodes } = forms(async (_: string, options: any) => {
    bodies.push(options.body);
    if (bodies.length === 1) throw Error("lost response after persistence");
    return Response.json({ id: JSON.parse(options.body).id });
  });
  await context.save();
  assert.equal(nodes.editor.open, true);
  assert.equal(fields.amount.disabled, true);
  assert.equal(nodes.save.textContent, "Retry same save");
  context.closeEditor();
  assert.equal(nodes.editor.open, true);
  assert.equal(nodes["editor-confirm"].hidden, false);
  assert.equal(nodes["confirm-discard"].textContent, "Leave form");
  nodes["keep-editing"].onclick();
  assert.equal(nodes["editor-confirm"].hidden, true);
  // Even script-level mutation cannot rebuild an uncertain submitted payload.
  fields.amount.value = "99";
  await context.save();
  assert.equal(bodies[0], bodies[1]);
  assert.equal(nodes.editor.open, false);
});
test("known validation failure permits correction; conflicts preserve draft without blind stale retry", async () => {
  let status = 400,
    calls = 0;
  const { context, fields, nodes } = forms(async () => {
    calls++;
    return Response.json(
      {
        error: status === 400 ? "Invalid details" : "This transaction changed",
      },
      { status },
    );
  });
  await context.save();
  assert.equal(fields.amount.disabled, false);
  assert.equal(nodes.save.disabled, false);
  fields.amount.value = "14";
  status = 409;
  await context.save();
  assert.equal(fields.amount.value, "14");
  assert.equal(nodes.editor.open, true);
  assert.equal(nodes.save.disabled, true);
  await context.save();
  assert.equal(calls, 2);
});
function hostHarness(host?: any) {
  const listeners: Record<string, Function> = {},
    properties: Record<string, string> = {};
  const root = {
    dataset: {} as any,
    style: {
      setProperty: (key: string, value: string) => (properties[key] = value),
      removeProperty: (key: string) => delete properties[key],
    },
  };
  const sdk = element(),
    editor = element();
  const window = {
    innerHeight: 700,
    Telegram: host ? { WebApp: host } : undefined,
    addEventListener: (name: string, fn: Function) => (listeners[name] = fn),
  };
  const context: any = {
    window,
    document: {
      documentElement: root,
      getElementById: (id: string) => (id === "editor" ? editor : sdk),
    },
  };
  runInNewContext(adapter, context);
  let dirty = false,
    back = false,
    clicked = 0;
  const api = context.createTelegramAdapter({
    onBack: () => clicked++,
    canGoBack: () => back,
    hasUnsavedChanges: () => dirty,
  });
  return {
    root,
    properties,
    listeners,
    sdk,
    window,
    api,
    setDirty: (value: boolean) => (dirty = value),
    setBack: (value: boolean) => (back = value),
    clicked: () => clicked,
  };
}
test("absent or ordinary browser SDK keeps fallback, late host connects without identity data", () => {
  const h = hostHarness({ platform: "unknown", initData: "do not consume" });
  assert.equal(h.root.dataset.telegram, undefined);
  const events: Record<string, Function> = {};
  let ready = 0;
  h.window.Telegram = {
    WebApp: {
      platform: "web",
      colorScheme: "dark",
      themeParams: { bg_color: "#102030", text_color: "url(unsafe)" },
      onEvent: (name: string, fn: Function) => (events[name] = fn),
      ready: () => ready++,
      expand() {
        throw Error("unsupported");
      },
    },
  };
  h.sdk.listeners.load();
  assert.equal(ready, 1);
  assert.equal(h.root.dataset.telegramTheme, "dark");
  assert.equal(h.properties["--porcelain"], "#102030");
  assert.equal(h.properties["--ink"], undefined);
  h.window.Telegram.WebApp.colorScheme = "light";
  events.themeChanged();
  assert.equal(h.root.dataset.telegramTheme, "light");
  h.api.connect();
  assert.equal(ready, 1);
});
test("host Back and dirty close capability checks survive unsupported controls and resize", () => {
  let backClick: Function = () => {},
    shown = 0,
    confirmation = 0;
  const h = hostHarness({
    platform: "web",
    colorScheme: "light",
    viewportStableHeight: 650,
    safeAreaInset: { bottom: 10 },
    contentSafeAreaInset: { bottom: 20 },
    BackButton: {
      onClick: (fn: Function) => (backClick = fn),
      show: () => shown++,
      hide() {},
    },
    enableClosingConfirmation: () => confirmation++,
    disableClosingConfirmation() {},
  });
  h.setBack(true);
  h.setDirty(true);
  h.api.update();
  backClick();
  assert.equal(shown, 1);
  assert.equal(confirmation, 1);
  assert.equal(h.clicked(), 1);
  assert.equal(h.properties["--app-inset-bottom"], "20px");
  assert.equal(h.properties["--app-stable-height"], "650px");
  let prevented = false;
  h.listeners.beforeunload({ preventDefault: () => (prevented = true) });
  assert(prevented);
  h.window.innerHeight = 400;
  h.listeners.resize();
  assert.equal(h.properties["--app-height"], "400px");
});

test("Back closes editor first and Month second; dirty Escape preserves the form", () => {
  const { context, fields, nodes } = forms(async () => Response.json({}));
  context.location.hash = "#month";
  assert.equal(context.adapterOptions.canGoBack(), true);
  context.adapterOptions.onBack();
  assert.equal(nodes.editor.open, true);
  assert.equal(context.location.hash, "#month");
  let prevented = false;
  nodes.editor.listeners.cancel({ preventDefault: () => (prevented = true) });
  assert(prevented);
  assert.equal(fields.description.value, "Cash lunch");
  assert.equal(nodes["editor-confirm"].hidden, false);
  nodes["keep-editing"].onclick();
  assert.equal(nodes.editor.open, true);
  context.adapterOptions.onBack();
  nodes["confirm-discard"].onclick();
  assert.equal(nodes.editor.open, false);
  assert.equal(context.location.hash, "#month");
  assert.equal(context.adapterOptions.hasUnsavedChanges(), false);
  context.adapterOptions.onBack();
  assert.equal(context.location.hash, "");
  assert.equal(context.adapterOptions.canGoBack(), false);
});

test("review dismissal requires explicit inline action and never opens a native dialog", async () => {
  let submitted: any = null;
  const { context, nodes } = forms(async (_: string, options: any) => {
    submitted = JSON.parse(options.body);
    return Response.json({});
  });
  context.discardEditor();
  context.openEditor({
    id: "00000000-0000-4000-8000-000000000002",
    version: 0,
    direction: "expense",
    source: "email",
    review_reason: "unsupported",
    source_message_id: "synthetic",
  });
  nodes.dismiss.onclick();
  assert.equal(submitted, null);
  assert.equal(nodes["editor-confirm"].hidden, false);
  assert.equal(nodes["confirm-discard"].textContent, "Dismiss review");
  nodes["keep-editing"].onclick();
  assert.equal(submitted, null);
  nodes.dismiss.onclick();
  nodes["confirm-discard"].onclick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(submitted.dismiss, true);
});

test("a stalled write times out into frozen recovery rather than trapping the form", async () => {
  const { context, fields, nodes } = forms(
    async (_: string, options: any) =>
      new Promise((_, reject) => {
        options.signal.addEventListener("abort", () =>
          reject(Error("request timed out")),
        );
      }),
  );
  context.AbortSignal = {
    timeout(ms: number) {
      assert.equal(ms, 20000);
      const controller = new AbortController();
      queueMicrotask(() => controller.abort());
      return controller.signal;
    },
  };
  await context.save();
  assert.equal(nodes.editor.open, true);
  assert.equal(nodes.save.disabled, false);
  assert.equal(nodes.cancel.disabled, false);
  assert.equal(fields.amount.disabled, true);
  assert.equal(nodes.save.textContent, "Retry same save");
  context.closeEditor();
  assert.equal(nodes["editor-confirm"].hidden, false);
  assert.equal(nodes["confirm-discard"].textContent, "Leave form");
});

const firstId = "00000000-0000-4000-8000-00000000000a";
const secondId = "00000000-0000-4000-8000-00000000000b";
const transaction = (id = firstId, version = 3) => ({
  id,
  version,
  source: "manual",
  direction: "expense",
  merchant: "SYNTHETIC LINK CAFE",
  amount_minor: "1230",
  currency: "UZS",
  category: "Food",
  description: "Saved lunch",
  occurred_at: "2026-10-01T07:30:00.000Z",
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test("transaction selector accepts exactly one UUID, canonicalizes case and ignores SDK fields", () => {
  const { context } = forms(async () => Response.json({}));
  for (const search of [
    "",
    "?tgWebAppVersion=8.0",
    "?transaction=",
    "?transaction=&sdk=ok",
  ])
    assert.equal(context.transactionSelector(search).kind, "none");
  const selection = context.transactionSelector(
    `?transaction=${firstId.toUpperCase()}&tgWebAppPlatform=web`,
  );
  assert.equal(selection.kind, "transaction");
  assert.equal(selection.id, firstId);
  for (const value of [
    `?transaction=${firstId}&transaction=${secondId}`,
    `?transaction=&transaction=`,
    `?transaction=&transaction=${firstId}`,
    `?transaction=${firstId}%0A`,
    `?transaction=%20${firstId}`,
    "?transaction=../../api/activate",
    `?transaction=${firstId}/edit`,
    "?transaction=00000000-0000-4000-8000-00000000000g",
  ])
    assert.equal(context.transactionSelector(value).kind, "invalid", value);
});

test("linked transaction uses one bounded read outside filters/pages; repeated opening never writes", async () => {
  const calls: { path: string; method: string; signal: AbortSignal }[] = [];
  const { context, fields, nodes } = forms(
    async (path: string, options: any) => {
      calls.push({
        path,
        method: options.method || "GET",
        signal: options.signal,
      });
      return Response.json(transaction());
    },
  );
  context.discardEditor();
  context.params = new URLSearchParams("category=Salary&from=2001-01-01");
  context.nextOffset = 500;
  context.location.search = `?transaction=${firstId.toUpperCase()}&tgWebAppPlatform=web`;
  context.route();
  assert.equal(
    nodes["transaction-message"].textContent,
    "Loading transaction…",
  );
  await settle();
  assert.equal(nodes.editor.open, true);
  assert.equal(context.selected.id, firstId);
  assert.equal(fields.local_time.value, "2026-10-01T12:30");
  assert.equal(fields.amount.value, "12.30");
  assert.equal(context.params.get("category"), "Salary");
  assert.equal(context.nextOffset, 500);
  context.route();
  assert.equal(calls.length, 1);
  context.discardEditor();
  await context.loadLaunch();
  assert.equal(calls.length, 2);
  assert(
    calls.every(
      (call) =>
        call.path === `/api/expenses/${firstId}` && call.method === "GET",
    ),
  );
  assert(calls.every((call) => call.signal instanceof AbortSignal));
});

test("invalid links skip lookup; missing/dismissed records are neutral and network errors can retry", async () => {
  let calls = 0;
  let status = 404;
  const { context, nodes } = forms(async () => {
    calls++;
    if (status === 0) throw Error("offline");
    return Response.json(
      status === 200 ? transaction() : { error: "Not found" },
      { status },
    );
  });
  context.discardEditor();
  context.location.search = "?transaction=invalid";
  context.route();
  assert.equal(calls, 0);
  assert.equal(
    nodes["transaction-message"].textContent,
    "This transaction is unavailable.",
  );
  context.location.search = `?transaction=${firstId}`;
  context.route();
  await settle();
  assert.equal(nodes.editor.open, false);
  assert.equal(nodes["transaction-retry"].hidden, true);
  assert.equal(
    nodes["transaction-message"].textContent,
    "This transaction is unavailable.",
  );
  status = 0;
  await context.loadLaunch();
  assert.equal(nodes["transaction-retry"].hidden, false);
  assert.match(nodes["transaction-message"].textContent, /could not be loaded/);
  status = 200;
  await nodes["transaction-retry"].onclick();
  assert.equal(context.selected.id, firstId);
});

test("out-of-order launch responses cannot overwrite the newer transaction or its state", async () => {
  const old = deferred<Response>(),
    recent = deferred<Response>();
  const { context, nodes } = forms((path: string) =>
    path.endsWith(firstId) ? old.promise : recent.promise,
  );
  context.discardEditor();
  context.location.search = `?transaction=${firstId}`;
  context.route();
  context.location.search = `?transaction=${secondId}`;
  context.route();
  recent.resolve(Response.json(transaction(secondId)));
  await settle();
  assert.equal(context.selected.id, secondId);
  old.resolve(Response.json(transaction(firstId)));
  await settle();
  assert.equal(context.selected.id, secondId);
  assert.equal(nodes["transaction-retry"].hidden, true);
  assert.equal(context.launchRecord.id, secondId);
});

test("a late launch read never replaces an editor opened during the request, even after it closes", async () => {
  const read = deferred<Response>();
  const { context, fields, nodes } = forms(() => read.promise);
  context.discardEditor();
  context.location.search = `?transaction=${firstId}`;
  context.route();
  context.openEditor();
  fields.description.value = "Keep this new draft";
  read.resolve(Response.json(transaction()));
  await settle();
  assert.equal(context.selected, null);
  assert.equal(fields.description.value, "Keep this new draft");
  assert.equal(nodes.editor.open, true);
  context.discardEditor();
  assert.equal(nodes.editor.open, false);
  nodes["transaction-open"].onclick();
  assert.equal(context.selected.id, firstId);
});

test("Back leaves editor, launch state, then Month; Return cancels lookup and preserves SDK parameters", async () => {
  const read = deferred<Response>();
  const { context, nodes } = forms(() => read.promise);
  context.discardEditor();
  context.location.href = `https://tracker.example/?transaction=${firstId}&tgWebAppPlatform=web&extra=kept#month`;
  context.route();
  read.resolve(Response.json(transaction()));
  await settle();
  context.adapterOptions.onBack();
  assert.equal(nodes.editor.open, false);
  assert.equal(context.location.hash, "#month");
  context.adapterOptions.onBack();
  assert.equal(context.location.search, "?tgWebAppPlatform=web&extra=kept");
  assert.equal(context.location.hash, "#month");
  assert.equal(nodes["transaction-launch"].hidden, true);
  context.adapterOptions.onBack();
  assert.equal(context.location.hash, "");
  assert.equal(context.adapterOptions.canGoBack(), false);

  const pending = deferred<Response>();
  context.fetch = () => pending.promise;
  context.location.href = `https://tracker.example/?transaction=${secondId}&sdk=kept#tgWebAppData=unchanged`;
  context.route();
  nodes["transaction-return"].onclick();
  assert.equal(context.location.search, "?sdk=kept");
  assert.equal(context.location.hash, "#tgWebAppData=unchanged");
  pending.resolve(Response.json(transaction(secondId)));
  await settle();
  assert.equal(nodes.editor.open, false);
  assert.equal(nodes["transaction-launch"].hidden, true);
});

test("hash navigation during a pending link read does not reopen the editor", async () => {
  const read = deferred<Response>();
  const { context, nodes } = forms(() => read.promise);
  context.discardEditor();
  context.location.search = `?transaction=${firstId}`;
  context.route();
  context.location.hash = "#month";
  context.route();
  read.resolve(Response.json(transaction()));
  await settle();
  assert.equal(nodes.editor.open, false);
  assert.equal(context.location.hash, "#month");
  assert.equal(nodes["transaction-open"].hidden, false);
});

test("Review latest requires inline consent, preserves draft on failed read, then edits current version", async () => {
  let getStatus = 503;
  const calls: any[] = [];
  const { context, fields, nodes } = forms(
    async (path: string, options: any) => {
      calls.push({ path, method: options.method || "GET", body: options.body });
      if (options.method === "PATCH") {
        const body = JSON.parse(options.body);
        return Response.json(
          body.version === 7 ? transaction(firstId, 8) : { error: "Changed" },
          { status: body.version === 7 ? 200 : 409 },
        );
      }
      return Response.json(
        getStatus === 200 ? transaction(firstId, 7) : { error: "Offline" },
        { status: getStatus },
      );
    },
  );
  context.discardEditor();
  context.openEditor(transaction());
  fields.description.value = "Unsaved draft";
  await context.save();
  nodes["review-latest"].onclick();
  assert.equal(calls.length, 1);
  assert.equal(nodes["confirm-discard"].textContent, "Replace draft");
  nodes["keep-editing"].onclick();
  assert.equal(fields.description.value, "Unsaved draft");
  nodes["review-latest"].onclick();
  nodes["confirm-discard"].onclick();
  await settle();
  assert.equal(fields.description.value, "Unsaved draft");
  assert.equal(context.selected.version, 3);
  assert.equal(nodes.save.disabled, true);
  assert.equal(nodes["review-latest"].disabled, false);
  getStatus = 200;
  nodes["review-latest"].onclick();
  nodes["confirm-discard"].onclick();
  await settle();
  assert.equal(fields.description.value, "Saved lunch");
  assert.equal(context.selected.version, 7);
  assert.equal(nodes.editor.open, true);
  fields.description.value = "New confirmed draft";
  await context.save();
  assert.equal(JSON.parse(calls.at(-1).body).version, 7);
  assert(
    calls
      .filter((call) => call.method === "GET")
      .every((call) => call.path === `/api/expenses/${firstId}`),
  );
});

test("ambiguous manual creation conflict reviews original creation ID and becomes an edit", async () => {
  const calls: any[] = [];
  const { context, fields, nodes } = forms(
    async (path: string, options: any) => {
      calls.push({ path, method: options.method || "GET", body: options.body });
      if (calls.length === 1) throw Error("lost creation response");
      if (options.method === "POST")
        return Response.json(
          { error: "Request details changed" },
          { status: 409 },
        );
      return Response.json(
        transaction("00000000-0000-4000-8000-000000000001", 9),
      );
    },
  );
  const creation = context.creationId;
  await context.save();
  const submitted = context.pendingSubmission.body;
  await context.save();
  assert.equal(calls[0].body, calls[1].body);
  assert.equal(context.pendingSubmission.body, submitted);
  nodes["review-latest"].onclick();
  nodes["confirm-discard"].onclick();
  await settle();
  assert.equal(calls[2].path, `/api/expenses/${creation}`);
  assert.equal(context.creationId, null);
  assert.equal(context.selected.version, 9);
  assert.equal(context.pendingSubmission, null);
  fields.description.value = "Updated after recovery";
  await context.save();
  assert.equal(calls[3].method, "PATCH");
  assert.equal(JSON.parse(calls[3].body).version, 9);
});

test("a conflict read finishing after leaving its editor cannot replace a new draft", async () => {
  const read = deferred<Response>();
  const { context, fields, nodes } = forms(async (_: string, options: any) => {
    if (options.method === "PATCH")
      return Response.json({ error: "Changed" }, { status: 409 });
    return read.promise;
  });
  context.discardEditor();
  context.openEditor(transaction());
  fields.description.value = "Old draft";
  await context.save();
  nodes["review-latest"].onclick();
  nodes["confirm-discard"].onclick();
  context.closeEditor();
  nodes["confirm-discard"].onclick();
  context.openEditor();
  fields.description.value = "New manual draft";
  read.resolve(Response.json(transaction(firstId, 10)));
  await settle();
  assert.equal(context.selected, null);
  assert.equal(fields.description.value, "New manual draft");
  assert.equal(nodes.editor.open, true);
  assert.equal(fields.description.disabled, false);
});

test("a late read after a newer editor closes cannot reopen an old selection", async () => {
  const read = deferred<Response>();
  const { context, fields, nodes } = forms(() => read.promise);
  context.discardEditor();
  context.location.search = `?transaction=${firstId}`;
  context.route();
  context.openEditor();
  fields.description.value = "Intervening draft";
  context.discardEditor();
  read.resolve(Response.json(transaction()));
  await settle();
  assert.equal(nodes.editor.open, false);
  assert.equal(context.selected, null);
  assert.equal(nodes["transaction-open"].hidden, false);
});

test("leaving a launch while its read fails keeps the normal Ledger state", async () => {
  const read = deferred<Response>();
  const { context, nodes } = forms(() => read.promise);
  context.discardEditor();
  context.location.search = `?transaction=${firstId}`;
  context.route();
  nodes["transaction-return"].onclick();
  read.reject(Error("late failure"));
  await settle();
  assert.equal(nodes.editor.open, false);
  assert.equal(nodes["transaction-launch"].hidden, true);
  assert.equal(nodes["transaction-retry"].hidden, true);
});

test("saving a linked transaction refreshes its reopen version and dismissal makes it unavailable", async () => {
  let dismiss = false;
  const { context, nodes } = forms(async (_: string, options: any) => {
    if (!options.method) return Response.json(transaction());
    const body = JSON.parse(options.body);
    dismiss = Boolean(body.dismiss);
    return Response.json({
      ...transaction(firstId, 4),
      dismissed_at: dismiss ? "2026-10-02T00:00:00Z" : null,
    });
  });
  context.discardEditor();
  context.location.search = `?transaction=${firstId}`;
  context.route();
  await settle();
  await context.save();
  nodes["transaction-open"].onclick();
  assert.equal(context.selected.version, 4);
  await context.save(true);
  assert.equal(dismiss, true);
  assert.equal(context.launchRecord, null);
  assert.equal(nodes["transaction-open"].hidden, true);
  assert.equal(
    nodes["transaction-message"].textContent,
    "This transaction is unavailable.",
  );
});

test("a delayed link lookup cannot replace the version saved through a Ledger editor", async () => {
  const read = deferred<Response>();
  const { context, fields, nodes } = forms(async (_: string, options: any) => {
    if (!options.method) return read.promise;
    return Response.json({
      ...transaction(firstId, 4),
      description: "Confirmed saved details",
    });
  });
  context.discardEditor();
  context.location.search = `?transaction=${firstId}`;
  context.route();
  assert.equal(context.launchRecord, null);
  context.openEditor(transaction(firstId, 3));
  fields.description.value = "Confirmed saved details";
  await context.save();
  assert.equal(context.launchRecord.version, 4);
  read.resolve(Response.json(transaction(firstId, 3)));
  await settle();
  assert.equal(nodes.editor.open, false);
  assert.equal(context.launchRecord.version, 4);
  nodes["transaction-open"].onclick();
  assert.equal(context.selected.version, 4);
  assert.equal(fields.description.value, "Confirmed saved details");
});

test("explicit conflict recovery supersedes an older pending launch lookup", async () => {
  const read = deferred<Response>();
  let reads = 0;
  const { context, fields, nodes } = forms(async (_: string, options: any) => {
    if (options.method === "PATCH")
      return Response.json({ error: "Changed" }, { status: 409 });
    if (++reads === 1) return read.promise;
    return Response.json(transaction(firstId, 8));
  });
  context.discardEditor();
  context.location.search = `?transaction=${firstId}`;
  context.route();
  context.openEditor(transaction(firstId, 3));
  fields.description.value = "Conflicting draft";
  await context.save();
  nodes["review-latest"].onclick();
  nodes["confirm-discard"].onclick();
  await settle();
  assert.equal(context.launchRecord.version, 8);
  context.closeEditor();
  read.resolve(Response.json(transaction(firstId, 3)));
  await settle();
  assert.equal(nodes.editor.open, false);
  assert.equal(context.launchRecord.version, 8);
  nodes["transaction-open"].onclick();
  assert.equal(context.selected.version, 8);
});

test("an uncertain dismiss keeps its intent when retried", async () => {
  let attempts = 0;
  const { context, nodes } = forms(async (_: string, options: any) => {
    if (!options.method) return Response.json(transaction());
    if (++attempts === 1) throw Error("lost response");
    return Response.json({
      ...transaction(firstId, 4),
      dismissed_at: "2026-10-02T00:00:00Z",
    });
  });
  context.discardEditor();
  context.location.search = `?transaction=${firstId}`;
  context.route();
  await settle();
  await context.save(true);
  assert.equal(context.pendingSubmission.dismiss, true);
  assert.equal(nodes.save.textContent, "Retry dismiss");
  await context.save();
  assert.equal(nodes.toast.textContent, "Review dismissed");
  assert.equal(context.launchRecord, null);
  assert.equal(
    nodes["transaction-message"].textContent,
    "This transaction is unavailable.",
  );
});

test("a 409 on retrying an uncertain update says the earlier save may have applied", async () => {
  let patches = 0;
  const { context, nodes } = forms(async (_: string, options: any) => {
    if (++patches === 1) throw Error("lost response");
    return Response.json(
      { error: "This transaction changed" },
      { status: 409 },
    );
  });
  context.discardEditor();
  context.openEditor(transaction());
  await context.save();
  assert.equal(
    nodes["form-error"].textContent.includes("could not be confirmed"),
    true,
  );
  await context.save();
  assert.equal(context.formConflict, true);
  assert.match(nodes["form-error"].textContent, /may be your earlier save/);
  assert.equal(nodes["review-latest"].hidden, false);
});

test("leaving the form after an unconfirmed save refreshes the Ledger and Month", async () => {
  const { context, nodes } = forms(async () => {
    throw Error("lost response");
  });
  let loads = 0,
    months = 0;
  context.load = async () => loads++;
  context.loadMonth = async () => months++;
  await context.save();
  context.closeEditor();
  nodes["confirm-discard"].onclick();
  assert.equal(nodes.editor.open, false);
  assert.equal(loads, 1);
  assert.equal(months, 0);
  context.openEditor();
  context.location.hash = "#month";
  context.pendingSubmission = {
    path: "/api/expenses",
    method: "POST",
    body: "{}",
  };
  context.closeEditor();
  nodes["confirm-discard"].onclick();
  assert.equal(loads, 2);
  assert.equal(months, 1);
});

test("discarding an ordinary draft does not reload", () => {
  const { context, nodes } = forms(async () => Response.json({}));
  let loads = 0;
  context.load = async () => loads++;
  fieldsDirty(context);
  context.closeEditor();
  nodes["confirm-discard"].onclick();
  assert.equal(loads, 0);
});
function fieldsDirty(context: any) {
  context.edit.elements.description.value = "Changed";
}

test("requests still time out when AbortSignal.timeout is unavailable", async () => {
  let signal: AbortSignal | undefined;
  const { context } = forms(async (_: string, options: any) => {
    signal = options.signal;
    return Response.json({});
  });
  let fire: Function = () => {};
  context.AbortSignal = {};
  context.AbortController = AbortController;
  context.setTimeout = (fn: Function, ms: number) => {
    assert.equal(ms, 20000);
    fire = fn;
  };
  await context.api("/api/health");
  assert.equal(signal?.aborted, false);
  fire();
  assert.equal(signal?.aborted, true);
});

test("one hash navigation routes once even though two events fire", () => {
  const { context } = forms(async () => Response.json({}));
  let months = 0;
  context.loadMonth = async () => months++;
  context.route();
  context.location.hash = "#month";
  context.onNavigate();
  context.onNavigate();
  assert.equal(months, 1);
  context.location.hash = "";
  context.onNavigate();
  context.onNavigate();
  assert.equal(months, 1);
  assert.equal(context.navigationVersion, 3);
});

test("outside Telegram, viewport events leave the CSS fallbacks alone", () => {
  const h = hostHarness();
  h.window.innerHeight = 320;
  h.listeners.resize();
  assert.deepEqual(h.properties, {});
});
