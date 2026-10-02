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
    crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000001" },
    categories: ["Food"],
    incomeCategories: ["Salary"],
    Option: class {},
    location: { hash: "" },
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
  };
  runInNewContext(
    client.slice(
      client.indexOf("async function api("),
      client.indexOf("function node("),
    ) +
      client.slice(
        client.indexOf("function updateCategories("),
        client.indexOf("// Month view."),
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
