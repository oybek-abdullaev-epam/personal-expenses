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
  loading = false,
  requestVersion = 0;
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
    "." +
    (n % 100n).toString().padStart(2, "0") +
    " " +
    currency
  );
};
async function api(path, options = {}) {
  const r = await fetch(path, options);
  let data;
  try {
    data = await r.json();
  } catch {
    throw Error("Unable to read the response. Please refresh.");
  }
  if (!r.ok)
    throw Error(data.error || "Something went wrong. Please try again.");
  return data;
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
function row(e) {
  const income = e.direction === "income",
    review = Boolean(e.review_reason),
    label = income ? e.income_category : e.category,
    at = e.occurred_at || e.received_at;
  const button = node(
    "button",
    undefined,
    "tx" + (review ? " review" : !label || !e.description ? " needs" : ""),
  );
  button.type = "button";
  const main = node("span", undefined, "tx-main"),
    tags = node("span", undefined, "tags"),
    meta = node("span", undefined, "meta");
  main.append(
    node("span", review ? "Review " : "Edit ", "sr"),
    node("span", e.merchant || "Email needs review", "merchant"),
    tags,
    meta,
  );
  if (review) tags.append(node("span", "Review required", "flag"));
  else {
    tags.append(
      label
        ? node("span", label, "cat" + (income ? " in" : ""))
        : node("span", "Needs category", "flag"),
      e.description
        ? node("span", e.description, "desc")
        : node("span", "Add a description", "missing"),
    );
  }
  meta.append(node("span", clock(at)));
  if (e.card_suffix) {
    const card = node("span", "••" + e.card_suffix);
    card.prepend(node("span", "Card ending ", "sr"));
    meta.append(card);
  }
  button.append(
    main,
    review
      ? node("span", "Not included", "amt off")
      : figure(
          (income ? "+" : "−") +
            money(e.amount_minor, e.currency).split(" ")[0],
          e.currency,
          "amt" + (income ? " in" : ""),
        ),
  );
  button.onclick = () => openEditor(e);
  const li = node("li");
  li.append(button);
  return li;
}
function render() {
  $("rows").replaceChildren();
  let list;
  for (const e of expenses) {
    const at = e.occurred_at || e.received_at;
    if (!list || list.dataset.day !== dayKey(at)) {
      const day = node("li", undefined, "day");
      list = node("ul");
      list.dataset.day = dayKey(at);
      day.append(node("h2", dayLabel(at)), list);
      $("rows").append(day);
    }
    list.append(row(e));
  }
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
let animated = false,
  activatedAt = null;
function renderTotals(totals) {
  const box = $("totals");
  box.replaceChildren();
  const label = (params.size ? "Filtered net" : "Net") + " cash flow";
  if (!totals.length) {
    const block = node("div", undefined, "total");
    block.append(
      node("p", label, "total-label"),
      node("p", "No totals", "figure net none"),
    );
    box.append(block);
    return;
  }
  for (const total of totals) {
    const block = node("div", undefined, "total"),
      [net] = money(total.net_minor, total.currency).split(" "),
      income = BigInt(total.income_minor),
      spending = BigInt(total.amount_minor);
    block.append(
      node("p", label, "total-label"),
      figure(net, total.currency, "net"),
    );
    const split = node("div", undefined, "split");
    split.setAttribute("aria-hidden", "true");
    if (income + spending > 0n) {
      // Display proportion only; totals themselves stay exact BigInt strings.
      const share = Number((income * 10000n) / (income + spending)) / 100;
      for (const [cls, grow] of [
        ["in", share],
        ["out", 100 - share],
      ])
        if (grow > 0) {
          const seg = node("span", undefined, cls);
          seg.style.flex = grow + " 1 0";
          split.append(seg);
        }
    }
    const legend = node("dl", undefined, "legend");
    for (const [cls, name, value] of [
      ["in", "Income", total.income_minor],
      ["out", "Spending", total.amount_minor],
    ]) {
      const item = node("div", undefined, cls);
      // The net figure above names the currency; the legend repeats only numbers.
      const dd = node(
        "dd",
        money(value, total.currency).split(" ")[0],
        "figure",
      );
      item.append(node("dt", name), dd);
      legend.append(item);
    }
    block.append(split, legend);
    box.append(block);
  }
  if (!animated) {
    animated = true;
    box.classList.add("grow");
  } else box.classList.remove("grow");
}
function syncStatus(text, state) {
  $("sync").textContent = text;
  $("sync").dataset.state = state;
}
async function load(append = false) {
  // A new filter or refresh supersedes an in-flight load; Load more waits.
  if (append && loading) return;
  loading = true;
  const version = ++requestVersion;
  $("refresh").disabled = true;
  $("more").disabled = true;
  $("error").hidden = true;
  try {
    const query = new URLSearchParams(params);
    if (append && nextOffset !== null) query.set("offset", String(nextOffset));
    const [list, totals, health] = await Promise.all([
      api("/api/expenses?" + query),
      api("/api/totals?" + params),
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
      );
    if (failed) $("sync").textContent += ". Telegram delivery needs attention";
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
      $("refresh").disabled = false;
      $("more").disabled = false;
    }
  }
}
form.onsubmit = (event) => {
  event.preventDefault();
  params = new URLSearchParams();
  for (const [key, value] of new FormData(form))
    if (value) params.set(key, key === "needsDetails" ? "true" : String(value));
  const extra = ["from", "to", "category"].filter((k) => params.has(k)).length;
  $("more-summary").textContent =
    "Dates and category" + (extra ? ` (${extra} active)` : "");
  load();
};
// Toggles and pickers apply immediately; typed search applies on Enter or Apply.
form.onchange = (event) => {
  if (event.target.name !== "q") form.requestSubmit();
};
$("refresh").onclick = () => load();
$("more").onclick = () => load(true);
function updateCategories(value = "") {
  const select = edit.elements.category;
  select.replaceChildren(new Option("Choose a category", ""));
  for (const c of edit.elements.direction.value === "income"
    ? incomeCategories
    : categories)
    select.add(new Option(c, c));
  select.value = value;
}
edit.elements.direction.onchange = () => updateCategories();
function openEditor(e) {
  selected = e;
  edit.reset();
  edit.elements.direction.value = e.direction || "expense";
  edit.elements.direction.disabled = !e.review_reason;
  updateCategories(e.income_category || e.category || "");
  edit.elements.description.value = e.description;
  $("edit-summary").textContent = e.review_reason
    ? "Source message: " + e.source_message_id
    : e.merchant + " · " + money(e.amount_minor, e.currency);
  $("form-error").textContent = "";
  for (const id of ["review-note", "review-fields", "dismiss"])
    $(id).hidden = !e.review_reason;
  $("editor").showModal();
}
$("cancel").onclick = () => $("editor").close();
async function save(dismiss = false) {
  if (!selected) return;
  const body = {
    version: selected.version,
    [edit.elements.direction.value === "income"
      ? "income_category"
      : "category"]: edit.elements.category.value || null,
    description: edit.elements.description.value,
  };
  if (dismiss) body.dismiss = true;
  else if (selected.review_reason)
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
  $("save").disabled = true;
  $("dismiss").disabled = true;
  $("form-error").textContent = "";
  try {
    await api("/api/expenses/" + selected.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    $("editor").close();
    $("toast").textContent = dismiss ? "Review dismissed" : "Transaction saved";
    $("toast").hidden = false;
    setTimeout(() => ($("toast").hidden = true), 2500);
    await load();
  } catch (e) {
    $("form-error").textContent = e.message;
  } finally {
    $("save").disabled = false;
    $("dismiss").disabled = false;
  }
}
edit.onsubmit = (event) => {
  event.preventDefault();
  save();
};
$("dismiss").onclick = () => {
  if (confirm("Dismiss this review item? It will remain excluded from totals."))
    save(true);
};
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
  $("prev-month").disabled = Boolean(
    firstTracked && month <= firstTracked.slice(0, 7),
  );
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
  if (!data || BigInt(data.spending_minor) === 0n) {
    block.append(node("p", "Nothing yet", "figure spent none"));
  } else {
    block.append(figure(amount(data.spending_minor, cur), cur, "spent"));
    if (trackedDays > 0) {
      const avg = BigInt(data.spending_minor) / BigInt(trackedDays);
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
      ["net", "Net cash flow", data.net_minor],
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
        Number((BigInt(d.spending_minor) * 10000n) / max) / 10000,
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
              ? "Tracking started later, so this month has no data."
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
  const top = list.length ? BigInt(list[0].spending_minor) : 1n,
    total = data ? BigInt(data.spending_minor) : 1n;
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
      money(d.spending_minor, cur) + " across " + plural(d.count, "purchase")
    );
  if (state === "future") return "Still to come.";
  if (state === "untracked")
    return (
      "Not tracked. Tracking started " + longDay(dayKey(activatedAt)) + "."
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
  const monthView = location.hash === "#month";
  $("ledger-view").hidden = monthView;
  $("month-view").hidden = !monthView;
  for (const [id, current] of [
    ["to-ledger", !monthView],
    ["to-month", monthView],
  ])
    if (current) $(id).setAttribute("aria-current", "page");
    else $(id).removeAttribute("aria-current");
  // Edits in the ledger change the month, so reload each time it opens.
  if (monthView) loadMonth();
}
window.onhashchange = route;
route();
load();
