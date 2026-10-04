const categories = [
  "Transport",
  "Food",
  "Groceries",
  "Shopping",
  "Bills",
  "Health",
  "Entertainment",
  "Other",
];
const incomeCategories = ["Salary", "Reimbursement", "Other income"];
const $ = (id) => document.getElementById(id),
  form = $("filters"),
  edit = $("edit-form");
for (const select of document.querySelectorAll('select[name="category"]'))
  for (const c of [...categories, ...incomeCategories])
    select.add(new Option(c, c));
let expenses = [],
  nextOffset = null,
  params = new URLSearchParams(),
  selected = null,
  creationId = null,
  loading = false,
  requestVersion = 0,
  editorBaseline = "",
  pendingSubmission = null,
  saving = false,
  formConflict = false,
  editorConfirmation = null,
  reviewingLatest = false,
  editorVersion = 0,
  launchKey = null,
  launchSelection = null,
  launchVersion = 0,
  navigationVersion = 0,
  navigationKey = null,
  routedHref = null,
  launchRecord = null;
const time = (value) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
const money = (minor, currency) => {
  const value = BigInt(minor);
  const n = value < 0n ? -value : value;
  return (
    (value < 0n ? "−" : "") +
    (n / 100n).toLocaleString("en-US") +
    // Whole amounts drop ".00"; any non-zero fraction is shown in full.
    (n % 100n ? "." + (n % 100n).toString().padStart(2, "0") : "") +
    " " +
    currency
  );
};
// AbortSignal.timeout is missing in older Telegram WebViews.
function timeoutSignal(ms) {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}
async function api(path, options = {}) {
  const r = await fetch(path, {
    ...options,
    signal: timeoutSignal(20000),
    headers: { ...options.headers, "X-Tracker-Contract": "reimbursements-v1" },
  });
  let data;
  try {
    data = await r.json();
  } catch {
    const error = Error("Unable to read the response. Please try again.");
    error.status = r.status;
    error.uncertain = true;
    throw error;
  }
  if (!r.ok) {
    const error = Error(
      data.error || "Something went wrong. Please try again.",
    );
    error.status = r.status;
    error.code = data.code;
    error.uncertain = r.status >= 500;
    throw error;
  }
  return data;
}
// Only the transaction query field selects a record; SDK fields stay untouched.
function transactionSelector(search) {
  const values = new URLSearchParams(search).getAll("transaction");
  if (!values.length || (values.length === 1 && values[0] === ""))
    return { kind: "none" };
  if (
    values.length !== 1 ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      values[0],
    )
  )
    return { kind: "invalid" };
  return { kind: "transaction", id: values[0].toLowerCase() };
}
function node(tag, text, className) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (className) n.className = className;
  return n;
}
const dayFormat = (options) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", ...options });
const dayKey = (value) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
function dayLabel(value) {
  const key = dayKey(value);
  if (key === dayKey(Date.now())) return "Today";
  if (key === dayKey(Date.now() - 86400000)) return "Yesterday";
  return dayFormat({
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(key.slice(0, 4) !== dayKey(Date.now()).slice(0, 4)
      ? { year: "numeric" }
      : {}),
  }).format(new Date(value));
}
const clock = (value) =>
  dayFormat({ hour: "2-digit", minute: "2-digit" }).format(new Date(value));
function figure(text, currency, className) {
  const n = node("span", undefined, "figure " + className);
  n.append(text, node("span", currency, "cur"));
  return n;
}
// Display only: bank names arrive in capitals with a country suffix. The
// editor keeps the raw merchant.
function displayName(raw) {
  const name = raw.replace(/[\s,]+UZ$/i, "").trim() || raw;
  if (name !== name.toUpperCase()) return name;
  return name.replace(/\p{L}+/gu, (w) =>
    // Short or vowel-less words are likely initials, such as "KFC".
    w.length <= 2 || !/[AEIOUY]/.test(w) ? w : w[0] + w.slice(1).toLowerCase(),
  );
}
function isReimbursement(e) {
  return e?.direction === "income" && e.income_category === "Reimbursement";
}
function personalSpending(e) {
  return e.personal_spending_minor ?? e.amount_minor ?? "0";
}
function row(e, showCard) {
  const income = e.direction === "income",
    review = Boolean(e.review_reason),
    label = income ? e.income_category : e.category,
    at = e.occurred_at || e.received_at;
  const repayment = isReimbursement(e);
  const needs =
    !review &&
    (repayment
      ? !e.payer_name?.trim() || !e.reimbursement_expense_id
      : !label || !e.description);
  const button = node(
    "button",
    undefined,
    "tx" + (review ? " review" : needs ? " needs" : ""),
  );
  button.type = "button";
  const sub = node("span", undefined, "sub"),
    when = node("span", undefined, "when");
  if (review) sub.append("Check the email");
  else if (repayment) {
    sub.append(node("span", "Reimbursement", "cat"));
    if (e.payer_name) sub.append(" · From " + e.payer_name);
    else sub.append(" · ", node("span", "Needs a name", "missing"));
    if (!e.reimbursement_expense_id)
      sub.append(" · ", node("span", "Needs an expense", "missing"));
    if (e.description) sub.append(" · " + e.description);
  } else {
    sub.append(
      label
        ? node("span", label, "cat")
        : node(
            "span",
            e.description ? "Add a category" : "Add category and description",
            "missing",
          ),
    );
    if (e.description) sub.append(" ", e.description);
    else if (label)
      sub.append(" ", node("span", "Add a description", "missing"));
  }
  if (!income && !review && BigInt(e.reimbursed_minor ?? "0") > 0n)
    sub.append(
      " · Paid " +
        money(e.original_minor ?? e.amount_minor, e.currency) +
        " · Reimbursed " +
        money(e.reimbursed_minor, e.currency),
    );
  if (e.source === "manual") when.append(node("span", "Manual", "tag"));
  if (showCard && e.card_suffix) {
    const card = node("span", "••" + e.card_suffix);
    card.prepend(node("span", "Card ending ", "sr"));
    when.append(card);
  }
  when.append(node("span", clock(at)));
  let amt;
  if (review) amt = node("span", "Not included", "amt off");
  else {
    // UZS is the default and goes unmarked; other currencies keep their code.
    amt = node(
      "span",
      (repayment
        ? ""
        : income
          ? "+"
          : BigInt(personalSpending(e)) === 0n
            ? ""
            : "−") +
        money(income ? e.amount_minor : personalSpending(e), e.currency).split(
          " ",
        )[0],
      "figure amt" + (income && !repayment ? " in" : ""),
    );
    if (e.currency !== "UZS") amt.append(node("span", e.currency, "cur"));
    else amt.append(node("span", " UZS", "sr"));
  }
  button.append(
    node("span", review ? "Review " : "Edit ", "sr"),
    node(
      "span",
      e.merchant ? displayName(e.merchant) : "Email needs review",
      "merchant",
    ),
    amt,
    sub,
    when,
  );
  if (e.merchant) button.title = e.merchant;
  button.onclick = () => openTransaction(e);
  const li = node("li");
  li.append(button);
  return li;
}
function dayHeader(label, spent) {
  const h = node("h2");
  h.append(node("span", label));
  const sums = [...spent];
  if (sums.length) {
    const total = node("span", undefined, "day-total");
    total.append(node("span", "Spent ", "sr"));
    for (const [cur, v] of sums) {
      const part = node(
        "span",
        (v > 0n ? "−" : "") + money(v, cur).split(" ")[0],
      );
      if (cur !== "UZS") part.append(node("span", cur, "cur"));
      total.append(part);
    }
    h.append(total);
  }
  return h;
}
function render() {
  $("rows").replaceChildren();
  const showCard =
    new Set(expenses.map((e) => e.card_suffix).filter(Boolean)).size > 1;
  const days = [];
  for (const e of expenses) {
    const key = dayKey(e.occurred_at || e.received_at);
    let day = days.at(-1);
    if (!day || day.key !== key) {
      day = {
        key,
        at: e.occurred_at || e.received_at,
        items: [],
        spent: new Map(),
        spends: 0,
      };
      days.push(day);
    }
    day.items.push(e);
    if (e.direction !== "income" && !e.review_reason) {
      day.spends++;
      day.spent.set(
        e.currency,
        (day.spent.get(e.currency) ?? 0n) + BigInt(personalSpending(e)),
      );
    }
  }
  days.forEach((d, i) => {
    const li = node("li", undefined, "day"),
      list = node("ul");
    list.dataset.day = d.key;
    for (const e of d.items) list.append(row(e, showCard));
    // A lone spend already shows its amount, and the last day may continue on
    // the next page, so neither gets a total.
    const partial = i === days.length - 1 && nextOffset !== null;
    li.append(
      dayHeader(dayLabel(d.at), partial || d.spends < 2 ? new Map() : d.spent),
      list,
    );
    $("rows").append(li);
  });
  $("empty").hidden = expenses.length > 0;
  const empty = [
    node("strong", "No transactions to show"),
    node(
      "span",
      params.size
        ? "Nothing matches these filters."
        : "New transactions will appear here after tracking is activated.",
    ),
  ];
  if (params.size) {
    const clear = node("button", "Clear filters", "btn");
    clear.type = "button";
    clear.onclick = () => {
      form.reset();
      form.requestSubmit();
    };
    empty.push(clear);
  }
  $("empty").replaceChildren(...empty);
  $("more").hidden = nextOffset === null;
}
let activatedAt = null;
// The ledger only totals a filtered view; month totals live in the Month tab.
function renderTotals(totals) {
  const box = $("totals");
  box.replaceChildren();
  const lines = [...totals].sort(
    (a, b) => (b.currency === "UZS") - (a.currency === "UZS"),
  );
  box.hidden = !lines.length;
  if (lines.length) box.append(node("span", "Filtered", "filtered-label"));
  for (const total of lines) {
    const line = node("p", undefined, "filtered");
    for (const [name, value, sign] of [
      ["Spending", total.amount_minor, "−"],
      ["Income", total.income_minor, "+"],
      ["Pending reimbursements", total.pending_reimbursement_minor ?? "0", ""],
    ]) {
      if (!BigInt(value) && name !== "Spending") continue;
      const part = node("span", name + " ");
      const amt = node(
        "span",
        (BigInt(value) ? sign : "") +
          money(value, total.currency).split(" ")[0],
        "figure",
      );
      if (total.currency !== "UZS")
        amt.append(node("span", total.currency, "cur"));
      part.append(amt);
      line.append(part);
    }
    box.append(line);
  }
}
function syncStatus(text, state, at) {
  $("sync").textContent = text;
  $("sync").dataset.state = state;
  // Phones show only a dot and a short time; problems keep the full line.
  const mini = $("sync-mini");
  mini.dataset.state = state;
  $("sync-short").textContent = !at
    ? ""
    : dayKey(at) === dayKey(Date.now())
      ? clock(at)
      : dayFormat({ day: "numeric", month: "short" }).format(new Date(at));
  mini.setAttribute("aria-label", text + ". Refresh");
  document.body.dataset.sync = state;
}
async function load(append = false) {
  // A new filter or refresh supersedes an in-flight load; Load more waits.
  if (append && loading) return;
  loading = true;
  const version = ++requestVersion;
  $("refresh").disabled = $("sync-mini").disabled = true;
  $("more").disabled = true;
  $("error").hidden = true;
  try {
    const query = new URLSearchParams(params);
    if (append && nextOffset !== null) query.set("offset", String(nextOffset));
    const [list, totals, health] = await Promise.all([
      api("/api/expenses?" + query),
      params.size ? api("/api/totals?" + params) : [],
      api("/api/health"),
    ]);
    if (version !== requestVersion) return;
    expenses = append
      ? [
          ...expenses,
          ...list.expenses.filter((e) => !expenses.some((x) => x.id === e.id)),
        ]
      : list.expenses;
    nextOffset = list.nextOffset;
    render();
    renderTotals(totals);
    const sync = health.sync;
    activatedAt = sync?.activated_at ?? null;
    const failed = health.notifications.failed;
    if (!sync) syncStatus("Tracking has not been activated.", "off");
    else if (sync.error)
      syncStatus(
        "Email sync needs attention: " + sync.error.replaceAll("_", " "),
        "down",
      );
    else
      syncStatus(
        sync.last_success
          ? "Last email sync " + time(sync.last_success)
          : "Waiting for the first email sync.",
        failed ? "warn" : "ok",
        sync.last_success,
      );
    if (failed) {
      $("sync").textContent += ". Telegram delivery needs attention";
      $("sync-mini").setAttribute(
        "aria-label",
        $("sync").textContent + ". Refresh",
      );
    }
  } catch (e) {
    if (version !== requestVersion) return;
    $("error").textContent = e.message;
    $("error").hidden = false;
    if (!expenses.length) {
      $("empty").hidden = false;
      $("empty").replaceChildren(
        node("strong", "Your transaction list is unavailable"),
        node("span", "Check the connection message above, then refresh."),
      );
    }
    syncStatus("Connection unavailable", "down");
  } finally {
    if (version === requestVersion) {
      loading = false;
      $("refresh").disabled = $("sync-mini").disabled = false;
      $("more").disabled = false;
    }
  }
}
form.onsubmit = (event) => {
  event.preventDefault();
  params = new URLSearchParams();
  for (const [key, value] of new FormData(form))
    if (value) params.set(key, key === "needsDetails" ? "true" : String(value));
  const extra = ["q", "from", "to", "category"].filter((k) =>
    params.has(k),
  ).length;
  $("more-summary").textContent =
    "Search, dates and category" + (extra ? ` (${extra} active)` : "");
  if (params.has("q")) $("more-filters").open = true;
  $("filter-toggle").classList.toggle("on", extra > 0);
  load();
};
// Toggles and pickers apply immediately; typed search applies on Enter or Apply.
form.onchange = (event) => {
  if (event.target.name !== "q") form.requestSubmit();
};
$("refresh").onclick = $("sync-mini").onclick = () => load();
$("filter-toggle").onclick = () =>
  ($("more-filters").open = !$("more-filters").open);
$("more-filters").ontoggle = () =>
  $("filter-toggle").setAttribute(
    "aria-expanded",
    String($("more-filters").open),
  );
$("more").onclick = () => load(true);
function updateCategories(value = "") {
  const select = edit.elements.category;
  select.replaceChildren(new Option("Choose a category", ""));
  for (const c of edit.elements.direction.value === "income"
    ? incomeCategories
    : categories)
    select.add(new Option(c, c));
  select.value = value;
  updateReimbursementForm();
}
let reimbursementParent = null,
  reimbursementParentVersions = {},
  candidateCursor = null,
  candidateVersion = 0,
  repaymentsCursor = null,
  repaymentsVersion = 0,
  reimbursementReturn = null,
  correctionTarget = null,
  correctionVersion = 0;
edit.elements.direction.onchange = () => updateCategories();
edit.elements.category.onchange = () => {
  updateReimbursementForm();
  editorState();
  if (selected && isReimbursement(selected) && reimbursementMode())
    loadCandidates();
};
async function openTransaction(record) {
  if ($("editor").open) return;
  const version = ++editorVersion;
  try {
    const detail = await api("/api/expenses/" + record.id);
    if (version !== editorVersion || $("editor").open) return;
    openEditor(detail);
  } catch (error) {
    if (version !== editorVersion) return;
    $("toast").textContent = error.message;
    $("toast").hidden = false;
    setTimeout(() => ($("toast").hidden = true), 4000);
  }
}
// Reimbursement drafts and navigation remain in memory, including a temporary
// manual parent form. Reads never change relationship or source versions.
function reimbursementMode() {
  return (
    Boolean(edit.elements.payer_name) &&
    edit.elements.direction.value === "income" &&
    edit.elements.category.value === "Reimbursement"
  );
}
function updateReimbursementForm() {
  if (!edit.elements.payer_name) return;
  const active = reimbursementMode();
  $("reimbursement-fields").hidden = !active;
  $("description-label").textContent = active
    ? "Note (optional)"
    : "Description";
  edit.elements.description.required =
    !active && (!selected || selected.source === "manual");
  // Pending saves may omit From; linking has explicit trimmed validation.
  edit.elements.payer_name.required = false;
  $("candidate-controls").hidden =
    !active ||
    !selected ||
    Boolean(selected.review_reason) ||
    !isReimbursement(selected);
  $("candidate-first").hidden =
    !active ||
    Boolean(selected && !selected.review_reason && isReimbursement(selected));
  $("expense-repayments").hidden =
    !selected ||
    Boolean(selected.review_reason) ||
    selected.direction !== "expense";
  $("parent-return").hidden = !reimbursementReturn;
  renderReimbursementPreview();
}
function editorRepaymentMinor() {
  if (selected?.source !== "manual" && selected)
    return BigInt(selected.amount_minor || 0);
  const raw = edit.elements.amount.value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
function costText(parent) {
  return (
    "Paid " +
    money(parent.original_minor ?? parent.amount_minor, parent.currency) +
    " · Reimbursed " +
    money(parent.reimbursed_minor ?? "0", parent.currency) +
    " · Your spending " +
    money(personalSpending(parent), parent.currency)
  );
}
function renderReimbursementPreview() {
  if (!edit.elements.payer_name) return;
  const box = $("reimbursement-preview");
  box.replaceChildren();
  if (!reimbursementMode()) return;
  const parent = reimbursementParent;
  if (!parent) {
    box.append(node("p", "Pending reimbursement · Needs an expense"));
    if (!edit.elements.payer_name.value.trim())
      box.append(node("p", "Needs a name in From"));
    return;
  }
  const repayment = editorRepaymentMinor();
  box.append(
    node("strong", parent.merchant),
    node(
      "p",
      time(parent.occurred_at) +
        (parent.description ? " · " + parent.description : ""),
    ),
    node("p", costText(parent)),
  );
  const previous =
    BigInt(parent.reimbursed_minor ?? "0") -
    (selected?.reimbursement_expense_id === parent.id
      ? BigInt(selected.amount_minor)
      : 0n);
  const original = BigInt(parent.original_minor ?? parent.amount_minor);
  if (repayment !== null) {
    box.append(
      node(
        "p",
        "After this repayment: " +
          money(original, parent.currency) +
          " − " +
          money(previous + repayment, parent.currency) +
          " = " +
          money(original - previous - repayment, parent.currency) +
          " your spending",
      ),
    );
    if (previous + repayment > original)
      box.append(
        node(
          "p",
          "This repayment exceeds the remaining cost. Choose another expense or correct the repayment first.",
          "missing",
        ),
      );
  }
  if (!edit.elements.payer_name.value.trim())
    box.append(node("p", "Enter From to complete this link.", "missing"));
}
function chooseParent(parent) {
  if (
    saving ||
    reviewingLatest ||
    pendingSubmission ||
    formConflict ||
    editorConfirmation
  )
    return;
  reimbursementParent = parent;
  reimbursementParentVersions[parent.id] = parent.version;
  edit.elements.reimbursement_expense_id.value = parent.id;
  renderReimbursementPreview();
  editorState();
}
async function loadCandidates(append = false) {
  if (
    !selected ||
    !isReimbursement(selected) ||
    !reimbursementMode() ||
    selected.review_reason ||
    saving ||
    pendingSubmission ||
    formConflict
  )
    return;
  const source = selected.id,
    editorAtStart = editorVersion,
    version = ++candidateVersion;
  const q = $("candidate-query").value.trim();
  const query = new URLSearchParams({ q });
  if (append && candidateCursor) query.set("cursor", candidateCursor);
  $("candidate-status").textContent = "Loading eligible expenses…";
  $("candidate-more").disabled = true;
  try {
    // A list projection may lack parent context; fetch it without refreshing the
    // source's optimistic version or replacing draft fields.
    if (
      selected.reimbursement_expense_id &&
      !reimbursementParent &&
      edit.elements.reimbursement_expense_id.value ===
        selected.reimbursement_expense_id
    ) {
      const detail = await api("/api/expenses/" + source);
      if (
        editorAtStart !== editorVersion ||
        version !== candidateVersion ||
        !$("editor").open
      )
        return;
      if (detail.version !== selected.version) {
        formConflict = true;
        $("form-error").textContent =
          "This transaction changed. Your draft is kept. Review latest before saving.";
        editorState();
        return;
      }
      if (
        edit.elements.reimbursement_expense_id.value ===
        selected.reimbursement_expense_id
      ) {
        reimbursementParent = detail.reimbursement_expense;
        reimbursementParentVersions = { ...(detail.parent_versions || {}) };
        renderReimbursementPreview();
      }
    }
    const data = await api(
      "/api/expenses/" + source + "/reimbursement-candidates?" + query,
    );
    if (
      editorAtStart !== editorVersion ||
      version !== candidateVersion ||
      !$("editor").open ||
      !reimbursementMode()
    )
      return;
    if (!append) $("candidate-list").replaceChildren();
    for (const parent of data.expenses) {
      const button = node("button", undefined, "candidate btn"),
        li = node("li");
      button.type = "button";
      button.append(
        node("strong", parent.merchant),
        node("span", time(parent.occurred_at)),
        node("span", parent.description || "No description"),
        node("span", costText(parent)),
        node(
          "span",
          "Available for this repayment " +
            money(parent.available_minor, parent.currency),
        ),
      );
      button.onclick = () => chooseParent(parent);
      li.append(button);
      $("candidate-list").append(li);
    }
    candidateCursor = data.nextCursor;
    $("candidate-more").hidden = !candidateCursor;
    $("candidate-status").textContent = data.expenses.length
      ? "Select an expense below. Your current selection is kept until you save."
      : "No eligible expenses found. Search again or add the missing original expense.";
  } catch (error) {
    if (
      editorAtStart !== editorVersion ||
      version !== candidateVersion ||
      !$("editor").open
    )
      return;
    $("candidate-status").textContent =
      error.message + " Your selection and draft are kept. Try Search again.";
  } finally {
    if (editorAtStart === editorVersion && version === candidateVersion)
      editorState();
  }
}
async function loadRepayments(append = false) {
  if (!selected || selected.direction !== "expense" || selected.review_reason)
    return;
  const source = selected.id,
    editorAtStart = editorVersion,
    version = ++repaymentsVersion;
  const query = new URLSearchParams();
  if (append && repaymentsCursor) query.set("cursor", repaymentsCursor);
  $("repayment-summary").textContent = costText(selected);
  $("repayment-status").textContent = "Loading repayments…";
  $("repayment-more").disabled = true;
  try {
    const data = await api(
      "/api/expenses/" + source + "/reimbursements?" + query,
    );
    if (
      editorAtStart !== editorVersion ||
      version !== repaymentsVersion ||
      !$("editor").open
    )
      return;
    if (!append) $("repayment-list").replaceChildren();
    for (const repayment of data.expenses) {
      const li = node("li");
      li.append(
        node("strong", repayment.payer_name),
        node(
          "p",
          money(repayment.amount_minor, repayment.currency) +
            " · " +
            time(repayment.occurred_at),
        ),
        node("p", repayment.description || ""),
      );
      const correct = node("button", "Correct name or expense link", "btn");
      correct.type = "button";
      correct.onclick = () => openCorrection(repayment.id);
      li.append(correct);
      $("repayment-list").append(li);
    }
    repaymentsCursor = data.nextCursor;
    $("repayment-more").hidden = !repaymentsCursor;
    $("repayment-status").textContent = data.expenses.length
      ? "Repayments received"
      : append
        ? "No more repayments"
        : "No linked repayments yet";
  } catch (error) {
    if (
      editorAtStart !== editorVersion ||
      version !== repaymentsVersion ||
      !$("editor").open
    )
      return;
    $("repayment-status").textContent =
      error.message + " Try Refresh repayments.";
  } finally {
    if (editorAtStart === editorVersion && version === repaymentsVersion)
      $("repayment-more").disabled = false;
  }
}
async function openCorrection(id) {
  if (saving || reviewingLatest || pendingSubmission || editorConfirmation)
    return;
  const version = editorVersion,
    request = ++correctionVersion;
  try {
    const latest = await api("/api/expenses/" + id);
    if (
      request !== correctionVersion ||
      version !== editorVersion ||
      !$("editor").open
    )
      return;
    if (editorDirty()) {
      correctionTarget = latest;
      confirmEditor("correction");
    } else {
      discardEditor();
      openEditor(latest);
    }
  } catch (error) {
    if (request === correctionVersion && version === editorVersion)
      $("repayment-status").textContent =
        error.message + " Your draft is kept.";
  }
}
function addMissingParent() {
  if (
    !selected ||
    !isReimbursement(selected) ||
    !reimbursementMode() ||
    saving ||
    pendingSubmission ||
    formConflict ||
    editorConfirmation
  )
    return;
  reimbursementReturn = {
    record: selected,
    fields: [...edit.elements]
      .filter((field) => /^(INPUT|SELECT|TEXTAREA)$/.test(field.tagName))
      .map((field) => [field.name, field.value]),
    parent: reimbursementParent,
    versions: { ...reimbursementParentVersions },
    baseline: editorBaseline,
    query: $("candidate-query").value,
  };
  discardEditor();
  openEditor();
  $("edit-title").textContent = "Add original expense";
  $("edit-summary").textContent =
    "Save the original payment, then return to your reimbursement. Your From and note are kept.";
  edit.elements.currency.value = reimbursementReturn.record.currency;
  edit.elements.local_time.value = localInput(
    reimbursementReturn.record.occurred_at,
  );
  editorBaseline = editorValues();
  updateReimbursementForm();
}
function restoreReimbursementDraft(parent = null) {
  if (!reimbursementReturn) return;
  const draft = reimbursementReturn;
  reimbursementReturn = null;
  openEditor(draft.record);
  for (const [name, value] of draft.fields)
    if (edit.elements[name]) edit.elements[name].value = value;
  reimbursementParent = draft.parent;
  reimbursementParentVersions = draft.versions;
  editorBaseline = draft.baseline;
  $("candidate-query").value = draft.query;
  if (parent?.direction === "expense") chooseParent(parent);
  updateReimbursementForm();
  editorState();
  loadCandidates();
}
$("candidate-search").onclick = () => loadCandidates();
$("candidate-refresh").onclick = () => {
  $("candidate-query").value = "";
  loadCandidates();
};
$("candidate-more").onclick = () => loadCandidates(true);
$("candidate-query").onkeydown = (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    loadCandidates();
  }
};
$("repayment-more").onclick = () => loadRepayments(true);
$("repayment-refresh").onclick = () => loadRepayments();
$("clear-parent").onclick = () => {
  if (saving || pendingSubmission || formConflict || editorConfirmation) return;
  reimbursementParent = null;
  if (edit.elements.reimbursement_expense_id)
    edit.elements.reimbursement_expense_id.value = "";
  renderReimbursementPreview();
  editorState();
};
$("save-pending").onclick = () => save(false, true);
$("add-parent").onclick = addMissingParent;
$("parent-return").onclick = closeEditor;
edit.addEventListener("input", () => renderReimbursementPreview());
function localInput(iso) {
  return new Date(Date.parse(iso) + 5 * 3600000).toISOString().slice(0, 16);
}
function apiLocalTime(input) {
  const [date, hour] = input.split("T");
  if (!date || !hour) return input;
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year.slice(2)} ${hour}`;
}
function editorValues() {
  return JSON.stringify(
    [...edit.elements]
      .filter((field) => /^(INPUT|SELECT|TEXTAREA)$/.test(field.tagName))
      .map((field) => [field.name, field.value]),
  );
}
function editorDirty() {
  return (
    $("editor").open &&
    (saving ||
      reviewingLatest ||
      Boolean(pendingSubmission) ||
      editorValues() !== editorBaseline)
  );
}
function editorState() {
  for (const field of edit.elements)
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(field.tagName))
      field.disabled =
        saving ||
        reviewingLatest ||
        Boolean(pendingSubmission) ||
        (field.name === "direction" && Boolean(reimbursementReturn)) ||
        (field.name === "direction" &&
          selected &&
          selected.source !== "manual" &&
          !selected.review_reason);
  $("save").disabled =
    saving || reviewingLatest || formConflict || Boolean(editorConfirmation);
  $("dismiss").disabled =
    saving ||
    reviewingLatest ||
    formConflict ||
    Boolean(pendingSubmission) ||
    Boolean(editorConfirmation);
  $("cancel").disabled = saving;
  $("review-latest").hidden = !formConflict;
  $("review-latest").disabled =
    saving || reviewingLatest || Boolean(editorConfirmation);
  $("save").textContent = pendingSubmission
    ? pendingSubmission.dismiss
      ? "Retry dismiss"
      : "Retry same save"
    : selected
      ? "Save changes"
      : "Add transaction";
  if (edit.elements.payer_name) {
    const locked =
      saving ||
      reviewingLatest ||
      Boolean(pendingSubmission) ||
      formConflict ||
      Boolean(editorConfirmation);
    for (const id of [
      "candidate-search",
      "candidate-more",
      "candidate-refresh",
      "add-parent",
      "clear-parent",
      "save-pending",
    ])
      $(id).disabled = locked;
    for (const button of $("candidate-list").querySelectorAll("button"))
      button.disabled = locked;
    $("save-pending").hidden =
      !reimbursementMode() || !selected || !reimbursementParent;
    $("save-pending").textContent = selected?.reimbursement_expense_id
      ? "Unlink and save pending"
      : "Save pending without linking";
    if (!pendingSubmission && reimbursementMode())
      $("save").textContent = reimbursementParent
        ? "Link and save"
        : selected
          ? "Save pending"
          : "Save pending, then choose expense";
  }
  telegram.update();
}
function discardEditor() {
  editorVersion++;
  candidateVersion++;
  repaymentsVersion++;
  reviewingLatest = false;
  $("editor").close();
  pendingSubmission = null;
  formConflict = false;
  editorConfirmation = null;
  $("editor-confirm").hidden = true;
  telegram.update();
}
function confirmEditor(action) {
  editorConfirmation = action;
  $("editor-confirm-message").textContent =
    action === "latest"
      ? "Replace your draft with the latest saved transaction? Your unsaved details will be discarded only if it loads successfully."
      : action === "dismiss"
        ? "Dismiss this review item? It will remain excluded from totals."
        : pendingSubmission
          ? "The save may have succeeded. Leave this form? Check the Ledger before adding another transaction."
          : "Discard your unsaved changes?";
  $("confirm-discard").textContent =
    action === "latest"
      ? "Replace draft"
      : action === "dismiss"
        ? "Dismiss review"
        : pendingSubmission
          ? "Leave form"
          : "Discard changes";
  $("editor-confirm").hidden = false;
  editorState();
  $("keep-editing").focus();
  $("editor-confirm").scrollIntoView({ block: "nearest" });
}
function closeEditor() {
  if (saving) return;
  if (editorDirty()) confirmEditor("close");
  else {
    const parent =
      reimbursementReturn && selected?.direction === "expense"
        ? selected
        : null;
    discardEditor();
    if (reimbursementReturn) restoreReimbursementDraft(parent);
  }
}
$("keep-editing").onclick = () => {
  correctionVersion++;
  correctionTarget = null;
  editorConfirmation = null;
  $("editor-confirm").hidden = true;
  editorState();
  $("cancel").focus();
};
$("confirm-discard").onclick = () => {
  if (saving) return;
  if (editorConfirmation === "latest") {
    editorConfirmation = null;
    $("editor-confirm").hidden = true;
    reviewLatest();
  } else if (editorConfirmation === "dismiss") {
    editorConfirmation = null;
    $("editor-confirm").hidden = true;
    editorState();
    save(true);
  } else {
    // An unconfirmed save may have committed; refresh so the ledger shows it.
    const unconfirmed = Boolean(pendingSubmission);
    discardEditor();
    if (correctionTarget) {
      const target = correctionTarget;
      correctionTarget = null;
      openEditor(target);
    } else if (reimbursementReturn)
      restoreReimbursementDraft(
        selected?.direction === "expense" ? selected : null,
      );
    if (unconfirmed) {
      load();
      if (location.hash === "#month") loadMonth();
    }
  }
};
const telegram = createTelegramAdapter({
  onBack: () => {
    if ($("editor").open) closeEditor();
    else if (launchSelection && launchSelection.kind !== "none") leaveLaunch();
    else if (location.hash === "#month") location.hash = "";
  },
  canGoBack: () =>
    $("editor").open ||
    Boolean(launchSelection && launchSelection.kind !== "none") ||
    location.hash === "#month",
  hasUnsavedChanges: () => editorDirty() || Boolean(reimbursementReturn),
});
edit.addEventListener("input", () => telegram.update());
edit.addEventListener("change", () => telegram.update());
$("editor").addEventListener("cancel", (event) => {
  event.preventDefault();
  closeEditor();
});
$("editor").addEventListener("close", () => telegram.update());
function openEditor(e = null) {
  if ($("editor").open) return;
  editorVersion++;
  reviewingLatest = false;
  pendingSubmission = null;
  formConflict = false;
  editorConfirmation = null;
  $("editor-confirm").hidden = true;
  selected = e;
  creationId = e ? null : crypto.randomUUID();
  const manual = !e || e.source === "manual";
  edit.reset();
  edit.elements.direction.value = e?.direction || "expense";
  edit.elements.direction.disabled = !manual && !e.review_reason;
  updateCategories(e?.income_category || e?.category || "");
  edit.elements.description.value = e?.description || "";
  if (edit.elements.payer_name) {
    edit.elements.payer_name.value = e?.payer_name || "";
    edit.elements.reimbursement_expense_id.value =
      e?.reimbursement_expense_id || "";
    reimbursementParent = e?.reimbursement_expense || e?.parent || null;
    reimbursementParentVersions = { ...(e?.parent_versions || {}) };
    candidateCursor = repaymentsCursor = null;
    candidateVersion++;
    repaymentsVersion++;
    $("candidate-query").value = "";
    $("candidate-list").replaceChildren();
    $("repayment-list").replaceChildren();
  }
  $("edit-title").textContent = e ? "Transaction details" : "Add transaction";
  $("save").textContent = e ? "Save changes" : "Add transaction";
  $("edit-summary").textContent = !e
    ? "Enter spending or income. Time is in Tashkent (UTC+05)."
    : e.review_reason
      ? "Source message: " + e.source_message_id
      : (manual ? "Manual · " : "") +
        e.merchant +
        " · " +
        money(e.amount_minor, e.currency);
  $("form-error").textContent = "";
  for (const id of ["review-note", "dismiss"]) $(id).hidden = !e?.review_reason;
  $("review-fields").hidden = !manual && !e.review_reason;
  $("card-optional").hidden = !manual;
  for (const key of [
    "merchant",
    "amount",
    "currency",
    "local_time",
    "category",
    "description",
  ])
    edit.elements[key].required = manual;
  const date = edit.elements.local_time;
  date.type = manual ? "datetime-local" : "text";
  date.max = manual ? localInput(new Date().toISOString()) : "";
  date.min = manual ? "2000-01-01T00:00" : "";
  if (manual) {
    edit.elements.merchant.value = e?.merchant || "";
    edit.elements.amount.value = e
      ? `${BigInt(e.amount_minor) / 100n}.${(BigInt(e.amount_minor) % 100n).toString().padStart(2, "0")}`
      : "";
    edit.elements.currency.value = e?.currency || "UZS";
    edit.elements.card_suffix.value = e?.card_suffix || "";
    date.value = localInput(e?.occurred_at || new Date().toISOString());
  }
  updateReimbursementForm();
  editorBaseline = editorValues();
  $("editor").showModal();
  if (edit.elements.payer_name && e && !e.review_reason) {
    if (isReimbursement(e)) loadCandidates();
    else if (e.direction === "expense") loadRepayments();
  }
  editorState();
}
$("add-transaction").onclick = () => openEditor();
$("cancel").onclick = closeEditor;
async function save(dismiss = false, pending = false) {
  if ((!selected && !creationId) || $("save").disabled) return;
  const creating = !selected;
  const manual = creating || selected.source === "manual";
  const body = {
    version: selected?.version,
    [edit.elements.direction.value === "income"
      ? "income_category"
      : "category"]: edit.elements.category.value || null,
    description: edit.elements.description.value,
  };
  if (manual) {
    Object.assign(
      body,
      Object.fromEntries(
        ["merchant", "amount", "currency", "card_suffix", "direction"].map(
          (k) => [k, edit.elements[k].value],
        ),
      ),
    );
    body.local_time = apiLocalTime(edit.elements.local_time.value);
    if (creating) body.id = creationId;
  }
  if (!pendingSubmission && reimbursementMode()) {
    const payer = edit.elements.payer_name.value.trim();
    const parentId = pending
      ? null
      : edit.elements.reimbursement_expense_id.value || null;
    if (parentId && !payer) {
      $("form-error").textContent =
        "Enter From before linking this reimbursement.";
      return;
    }
    if ([...payer].length > 100) {
      $("form-error").textContent = "From must be at most 100 characters.";
      return;
    }
    body.payer_name = payer;
    body.reimbursement_expense_id = parentId;
    const ids = new Set(
      [selected?.reimbursement_expense_id, parentId].filter(Boolean),
    );
    if (ids.size)
      body.parent_versions = Object.fromEntries(
        [...ids].map((id) => [id, reimbursementParentVersions[id]]),
      );
  } else if (!pendingSubmission && selected?.reimbursement_expense_id) {
    body.parent_versions = { ...reimbursementParentVersions };
  }
  if (dismiss) body.dismiss = true;
  else if (selected?.review_reason)
    body.resolve = Object.fromEntries(
      [
        "merchant",
        "amount",
        "currency",
        "local_time",
        "card_suffix",
        "direction",
      ].map((k) => [k, edit.elements[k].value]),
    );
  // Keep the exact body and request ID if delivery cannot be determined.
  const submission = pendingSubmission || {
    path: creating ? "/api/expenses" : "/api/expenses/" + selected.id,
    method: creating ? "POST" : "PATCH",
    body: JSON.stringify(body),
    dismiss,
  };
  const dismissed = submission.dismiss;
  saving = true;
  editorState();
  $("form-error").textContent = "";
  try {
    const persisted = await api(submission.path, {
      method: submission.method,
      headers: { "Content-Type": "application/json" },
      body: submission.body,
    });
    editorVersion++;
    updateLinkedRecord(persisted, dismissed);
    pendingSubmission = null;
    editorConfirmation = null;
    $("editor-confirm").hidden = true;
    saving = false;
    editorBaseline = editorValues();
    $("editor").close();
    if (reimbursementReturn) restoreReimbursementDraft(persisted);
    else if (
      edit.elements.payer_name &&
      isReimbursement(persisted) &&
      !persisted.reimbursement_expense_id
    )
      openEditor(persisted);
    telegram.update();
    $("toast").textContent = dismissed
      ? "Review dismissed"
      : "Transaction saved";
    $("toast").hidden = false;
    setTimeout(() => ($("toast").hidden = true), 2500);
    await load();
    if (location.hash === "#month") await loadMonth();
  } catch (e) {
    if (e.code === "refresh_required") {
      formConflict = true;
      $("form-error").textContent =
        "Refresh the tracker to continue. Your draft remains in this open form.";
    } else if (e.status === 409) {
      // A replay carries the old version, so a 409 may be our own earlier save.
      const retried = Boolean(pendingSubmission);
      formConflict = true;
      $("form-error").textContent = retried
        ? "This transaction changed. That may be your earlier save. Your draft is kept here. Review the latest saved transaction before making further changes."
        : e.message +
          " Your draft is kept here. Review the latest saved transaction before making further changes.";
    } else if (e.uncertain || e.status === undefined) {
      pendingSubmission = submission;
      $("form-error").textContent =
        "The save could not be confirmed. Your submitted details are kept. Retry the same save to check its result; do not add another transaction.";
    } else {
      pendingSubmission = null;
      $("form-error").textContent = e.message;
    }
  } finally {
    saving = false;
    editorState();
  }
}
edit.onsubmit = (event) => {
  event.preventDefault();
  save();
};
$("dismiss").onclick = () => confirmEditor("dismiss");
$("review-latest").onclick = () => confirmEditor("latest");
async function reviewLatest() {
  if (!formConflict || reviewingLatest || !$("editor").open) return;
  const id = selected?.id || creationId,
    version = editorVersion;
  reviewingLatest = true;
  editorState();
  $("form-error").textContent = "Loading the latest saved transaction…";
  try {
    const latest = await api("/api/expenses/" + id);
    if (version !== editorVersion || !$("editor").open) return;
    // Consent above permits replacement only after a successful bounded read.
    discardEditor();
    openEditor(latest);
    updateLinkedRecord(latest);
  } catch (e) {
    if (version !== editorVersion || !$("editor").open) return;
    $("form-error").textContent =
      e.status === 404
        ? "The saved transaction is unavailable. Your draft is kept here."
        : "The latest transaction could not be loaded. Your draft is kept here. Try Review latest again.";
  } finally {
    if (version === editorVersion) {
      reviewingLatest = false;
      editorState();
    }
  }
}
function launchState(state) {
  $("transaction-launch").hidden = state === "none";
  $("transaction-message").textContent =
    state === "loading"
      ? "Loading transaction…"
      : state === "ready"
        ? "Your linked transaction is ready."
        : state === "network"
          ? "The transaction could not be loaded. Please try again."
          : "This transaction is unavailable.";
  $("transaction-retry").hidden = state !== "network";
  $("transaction-open").hidden = state !== "ready";
  telegram.update();
}
function updateLinkedRecord(record, dismissed = false) {
  if (
    launchSelection?.kind !== "transaction" ||
    launchSelection.id !== record.id
  )
    return;
  // A confirmed write or explicit latest read supersedes any earlier lookup,
  // including one that has not populated the linked-record cache yet.
  launchVersion++;
  launchRecord = dismissed ? null : record;
  launchState(dismissed ? "unavailable" : "ready");
}
async function loadLaunch() {
  if (launchSelection?.kind !== "transaction") return;
  const version = ++launchVersion,
    editorAtLaunch = editorVersion,
    navigationAtLaunch = navigationVersion,
    id = launchSelection.id;
  launchRecord = null;
  launchState("loading");
  try {
    const record = await api("/api/expenses/" + id);
    if (version !== launchVersion) return;
    launchRecord = record;
    launchState("ready");
    if (
      navigationAtLaunch === navigationVersion &&
      editorAtLaunch === editorVersion &&
      !$("editor").open
    )
      openEditor(record);
  } catch (e) {
    if (version !== launchVersion) return;
    launchState(e.status === 404 ? "unavailable" : "network");
  }
}
function syncLaunch() {
  const selection = transactionSelector(location.search),
    key = JSON.stringify(selection);
  if (key === launchKey) return;
  launchKey = key;
  launchSelection = selection;
  launchVersion++;
  launchRecord = null;
  if (selection.kind === "transaction") loadLaunch();
  else launchState(selection.kind === "none" ? "none" : "unavailable");
}
function leaveLaunch(toLedger = false) {
  if ($("editor").open) return closeEditor();
  const url = new URL(location.href);
  url.searchParams.delete("transaction");
  if (toLedger && url.hash === "#month") url.hash = "";
  history.replaceState(null, "", url);
  route();
}
$("transaction-retry").onclick = loadLaunch;
$("transaction-open").onclick = () => {
  if (launchRecord) openEditor(launchRecord);
};
$("transaction-return").onclick = () => leaveLaunch(true);
// Month view. Amounts stay exact BigInt strings; Number is used only for shading.
const tashkentMonth = (value) => dayKey(value).slice(0, 7);
let month = tashkentMonth(Date.now()),
  monthCurrency = null,
  monthData = null,
  pinned = null,
  monthVersion = 0,
  calAnimated = false;
const shiftMonth = (ym, by) => {
  const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5) - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};
const utcDay = (key) => new Date(key + "T12:00:00Z");
const longDay = (key) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(utcDay(key));
const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");
const amount = (minor, currency) => money(minor, currency).split(" ")[0];
function showLedger(filters) {
  form.reset();
  for (const [name, value] of Object.entries(filters)) {
    const field = form.elements[name];
    if (field instanceof RadioNodeList) field.value = value;
    else if (field.type === "checkbox") field.checked = value;
    else field.value = value;
  }
  $("more-filters").open = Boolean(filters.from || filters.category);
  location.hash = "";
  form.requestSubmit();
}
function monthRange() {
  const last = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5), 0));
  return { from: month + "-01", to: last.toISOString().slice(0, 10) };
}
function renderMonth() {
  const title = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(utcDay(month + "-01"));
  $("month-title").textContent = title;
  const today = dayKey(Date.now()),
    firstTracked = activatedAt ? dayKey(activatedAt) : null;
  $("next-month").disabled = month >= tashkentMonth(Date.now());
  $("prev-month").disabled = month <= "2000-01";
  const all = monthData?.currencies ?? [];
  if (!all.some((c) => c.currency === monthCurrency))
    monthCurrency = (all.find((c) => c.currency === "UZS") ?? all[0])?.currency;
  const seg = $("month-currency");
  seg.hidden = all.length < 2;
  seg.replaceChildren(node("legend", "Currency", "sr"));
  for (const c of all) {
    const label = node("label"),
      input = node("input");
    input.type = "radio";
    input.name = "month-currency";
    input.value = c.currency;
    input.checked = c.currency === monthCurrency;
    input.onchange = () => {
      monthCurrency = c.currency;
      pinned = null;
      renderMonth();
    };
    label.append(input, node("span", c.currency));
    seg.append(label);
  }
  const data = all.find((c) => c.currency === monthCurrency);
  const cur = data?.currency ?? "UZS";

  // Totals
  const days = new Map((data?.days ?? []).map((d) => [d.date, d]));
  const last = monthRange().to;
  const trackedFrom =
    firstTracked && firstTracked > month + "-01" ? firstTracked : month + "-01";
  const trackedTo = today < last ? today : last;
  const trackedDays =
    trackedFrom <= trackedTo
      ? Math.round((utcDay(trackedTo) - utcDay(trackedFrom)) / 86400000) + 1
      : 0;
  const box = $("month-totals");
  box.replaceChildren();
  const block = node("div");
  block.append(node("p", "Spent in " + title.split(" ")[0], "total-label"));
  if (!data || (!data.days?.length && BigInt(data.spending_minor) === 0n)) {
    block.append(node("p", "Nothing yet", "figure spent none"));
  } else {
    block.append(figure(amount(data.spending_minor, cur), cur, "spent"));
    if (trackedDays > 0 && firstTracked) {
      const trackedSpending = [...days.values()]
        .filter((d) => d.date >= trackedFrom && d.date <= trackedTo)
        .reduce((sum, d) => sum + BigInt(d.spending_minor), 0n);
      const avg = trackedSpending / BigInt(trackedDays);
      block.append(
        node(
          "p",
          "About " +
            amount(avg - (avg % 100n), cur).replace(/\.00$/, "") +
            " " +
            cur +
            " a day over " +
            plural(trackedDays, "tracked day"),
          "pace",
        ),
      );
    }
  }
  box.append(block);
  if (data) {
    const income = BigInt(data.income_minor),
      spending = BigInt(data.spending_minor);
    const split = node("div", undefined, "split");
    split.setAttribute("aria-hidden", "true");
    if (income + spending > 0n) {
      const share = Number((income * 10000n) / (income + spending)) / 100;
      for (const [cls, grow] of [
        ["in", share],
        ["out", 100 - share],
      ])
        if (grow > 0) {
          const s = node("span", undefined, cls);
          s.style.flex = grow + " 1 0";
          split.append(s);
        }
    }
    const legend = node("dl", undefined, "legend");
    for (const [cls, name, value] of [
      ["in", "Came in", data.income_minor],
      ["net", "Income minus spending", data.net_minor],
      [
        "pending",
        "Pending reimbursements",
        data.pending_reimbursement_minor ?? "0",
      ],
    ]) {
      const item = node("div", undefined, cls);
      item.append(node("dt", name), node("dd", amount(value, cur), "figure"));
      legend.append(item);
    }
    box.append(split, legend);
  }

  // Calendar
  let max = 0n;
  for (const d of days.values())
    if (BigInt(d.spending_minor) > max) max = BigInt(d.spending_minor);
  const cal = $("cal");
  cal.replaceChildren();
  for (const k of [1, 2, 3, 4, 5, 6, 7]) {
    const wd = node(
      "div",
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "UTC",
        weekday: "short",
      }).format(utcDay("2026-09-2" + k)),
      "wd",
    );
    wd.setAttribute("aria-hidden", "true");
    cal.append(wd);
  }
  const lead = (utcDay(month + "-01").getUTCDay() + 6) % 7;
  for (let i = 0; i < lead; i++) cal.append(node("div"));
  const count = +last.slice(8);
  const describe = {};
  for (let n = 1; n <= count; n++) {
    const key = month + "-" + String(n).padStart(2, "0"),
      d = days.get(key),
      cell = node("button", undefined, "cell");
    cell.type = "button";
    cell.style.setProperty("--i", String(lead + n));
    cell.append(node("span", String(n)));
    let state;
    if (key > today) state = "future";
    else if (firstTracked && key < firstTracked && !d) state = "untracked";
    else if (!d) state = "none";
    else {
      state = "spent";
      // sqrt keeps one large day from washing out the rest of the month.
      const ratio = Math.sqrt(
        max ? Number((BigInt(d.spending_minor) * 10000n) / max) / 10000 : 0,
      );
      cell.dataset.level = String(Math.max(1, Math.ceil(ratio * 4)));
    }
    if (state === "future" || state === "untracked") cell.classList.add(state);
    if (key === today) cell.classList.add("today");
    describe[key] = { state, d };
    cell.setAttribute(
      "aria-label",
      longDay(key) + ": " + readoutText(key, state, d, cur),
    );
    cell.setAttribute("aria-pressed", String(pinned === key));
    cell.onmouseenter = () => showReadout(key, describe[key], cur);
    cell.onfocus = () => showReadout(key, describe[key], cur);
    cell.onclick = () => {
      pinned = pinned === key ? null : key;
      for (const c of cal.querySelectorAll(".cell"))
        c.setAttribute("aria-pressed", String(c === cell && pinned === key));
      showReadout(pinned, pinned && describe[pinned], cur);
    };
    cal.append(cell);
  }
  cal.onmouseleave = () => showReadout(pinned, pinned && describe[pinned], cur);
  const busiest = [...days.values()].sort((a, b) =>
    BigInt(b.spending_minor) > BigInt(a.spending_minor) ? 1 : -1,
  )[0];
  function showReadout(key, info, currency) {
    const box = $("readout");
    box.replaceChildren();
    if (!key) {
      if (!busiest) {
        box.append(
          node(
            "span",
            firstTracked && month < firstTracked.slice(0, 7)
              ? "No spending recorded. Email tracking started later; manual history may be incomplete."
              : "No spending recorded this month yet.",
            "sub",
          ),
        );
        return;
      }
      key = busiest.date;
      info = { state: "spent", d: busiest };
      box.dataset.kind = "busiest";
    } else delete box.dataset.kind;
    const text = node("div");
    text.append(
      node("strong", (box.dataset.kind ? "Biggest day: " : "") + longDay(key)),
    );
    if (info.state === "spent") {
      const line = node("span", undefined, "sub");
      line.append(
        figure(amount(info.d.spending_minor, currency), currency, ""),
        " across " + plural(info.d.count, "purchase"),
      );
      text.append(line);
      if (firstTracked && key < firstTracked)
        text.append(
          node(
            "span",
            "Before email tracking; manual history may be incomplete.",
            "sub",
          ),
        );
      box.append(text);
      const go = node("button", "Show transactions", "btn");
      go.type = "button";
      go.onclick = () =>
        showLedger({ direction: "expense", from: key, to: key });
      box.append(go);
    } else {
      text.append(node("span", readoutText(key, info.state), "sub"));
      box.append(text);
    }
  }
  showReadout(pinned, pinned && describe[pinned], cur);
  if (!calAnimated && monthData) {
    calAnimated = true;
    cal.classList.add("grow-cal");
  } else cal.classList.remove("grow-cal");

  const table = $("day-table");
  table.replaceChildren();
  for (const d of data?.days ?? []) {
    const tr = node("tr");
    tr.append(
      node("td", longDay(d.date)),
      node("td", String(d.count)),
      node("td", money(d.spending_minor, cur)),
    );
    table.append(tr);
  }
  if (!data?.days.length) {
    const tr = node("tr"),
      td = node("td", "No spending recorded.");
    td.colSpan = 3;
    tr.append(td);
    table.append(tr);
  }

  // Categories
  const cats = $("cats");
  cats.replaceChildren();
  const list = data?.categories ?? [];
  if (!list.length) {
    const empty = node("li", undefined, "empty");
    empty.append(
      node("span", "Spending for the month, by category, appears here."),
    );
    cats.append(empty);
  }
  const top = list.length ? BigInt(list[0].spending_minor) || 1n : 1n,
    total = data ? BigInt(data.spending_minor) || 1n : 1n;
  const strip = $("cat-strip"),
    note = $("cat-note");
  strip.replaceChildren();
  strip.classList.remove("focus");
  strip.hidden = note.hidden = !list.length;
  const catName = (c) => (c.category === null ? "Needs category" : c.category);
  if (list.length === 1) note.textContent = "All in " + catName(list[0]);
  else if (list.length) {
    // Fewest leading categories that cover half the month, at most three.
    let sum = 0n,
      n = 0;
    while (n < 3 && n < list.length && sum * 2n < total)
      sum += BigInt(list[n++].spending_minor);
    const names = list.slice(0, n).map(catName);
    note.textContent =
      (names.length > 1
        ? names.slice(0, -1).join(", ") + " and " + names.at(-1) + " are "
        : names[0] + " is ") +
      Math.round(Number((sum * 1000n) / total) / 10) +
      "% of spending";
  }
  for (const c of list) {
    const value = BigInt(c.spending_minor),
      pending = c.category === null;
    const seg = node("span", undefined, pending ? "pending" : undefined);
    seg.style.flex = Number((value * 10000n) / total) / 100 + " 1 0";
    strip.append(seg);
    const row = node(
      "button",
      undefined,
      "cat-row" + (pending ? " pending" : ""),
    );
    row.type = "button";
    const val = node("span", amount(c.spending_minor, cur), "cat-val");
    val.append(
      node("small", Math.round(Number((value * 1000n) / total) / 10) + "%"),
    );
    const bar = node("span", undefined, "cat-bar");
    bar.style.width = Number((value * 10000n) / top) / 100 + "%";
    bar.setAttribute("aria-hidden", "true");
    row.append(
      node("span", pending ? "Needs category" : c.category, "cat-name"),
      val,
      bar,
    );
    row.setAttribute(
      "aria-label",
      (pending ? "Needs category" : c.category) +
        ": " +
        money(c.spending_minor, cur) +
        ", " +
        plural(c.count, "purchase") +
        ". Show transactions",
    );
    row.onclick = () =>
      showLedger({
        direction: "expense",
        ...monthRange(),
        ...(pending ? { needsDetails: true } : { category: c.category }),
      });
    row.onmouseenter = row.onfocus = () => {
      for (const s of strip.children) s.classList.toggle("on", s === seg);
      strip.classList.add("focus");
    };
    row.onmouseleave = row.onblur = () => strip.classList.remove("focus");
    const li = node("li");
    li.append(row);
    cats.append(li);
  }
}
function readoutText(key, state, d, cur) {
  if (state === "spent")
    return (
      money(d.spending_minor, cur) +
      " across " +
      plural(d.count, "purchase") +
      (activatedAt && key < dayKey(activatedAt)
        ? ". Before email tracking; manual history may be incomplete."
        : "")
    );
  if (state === "future") return "Still to come.";
  if (state === "untracked")
    return (
      "No spending recorded. Email tracking started " +
      longDay(dayKey(activatedAt)) +
      "."
    );
  return "No spending recorded.";
}
async function loadMonth() {
  const version = ++monthVersion;
  $("month-view").classList.add("busy");
  $("month-error").hidden = true;
  try {
    const [data, health] = await Promise.all([
      api("/api/insights?month=" + month),
      activatedAt === null ? api("/api/health") : null,
    ]);
    if (version !== monthVersion) return;
    if (health) activatedAt = health.sync?.activated_at ?? null;
    monthData = data;
  } catch (e) {
    if (version !== monthVersion) return;
    monthData = null;
    $("month-error").textContent = e.message;
    $("month-error").hidden = false;
  }
  renderMonth();
  $("month-view").classList.remove("busy");
}
$("prev-month").onclick = () => {
  month = shiftMonth(month, -1);
  pinned = null;
  loadMonth();
};
$("next-month").onclick = () => {
  month = shiftMonth(month, 1);
  pinned = null;
  loadMonth();
};
function route() {
  routedHref = location.href;
  if (navigationKey !== location.href) {
    navigationKey = location.href;
    navigationVersion++;
  }
  syncLaunch();
  telegram.update();
  const monthView = location.hash === "#month";
  $("ledger-view").hidden = monthView;
  $("month-view").hidden = !monthView;
  $("filter-toggle").hidden = $("sync-mini").hidden = monthView;
  for (const [id, current] of [
    ["to-ledger", !monthView],
    ["to-month", monthView],
  ])
    if (current) $(id).setAttribute("aria-current", "page");
    else $(id).removeAttribute("aria-current");
  // Edits in the ledger change the month, so reload each time it opens.
  if (monthView) loadMonth();
}
// A hash navigation fires both events; route once per URL.
function onNavigate() {
  if (location.href !== routedHref) route();
}
window.onhashchange = onNavigate;
window.onpopstate = onNavigate;
route();
load();
