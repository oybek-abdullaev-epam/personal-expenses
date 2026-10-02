// Presentation only. Never read, transmit, or persist Telegram identity/initData.
function createTelegramAdapter({ onBack, canGoBack, hasUnsavedChanges }) {
  const root = document.documentElement;
  let host = null;
  const call = (object, method, ...args) => {
    try {
      if (typeof object?.[method] === "function") object[method](...args);
    } catch {
      // Unsupported host controls must not interrupt the shared dashboard.
    }
  };
  function appearance() {
    if (!host) return;
    root.dataset.telegramTheme = host.colorScheme === "dark" ? "dark" : "light";
    const mapping = {
      bg_color: "--porcelain",
      section_bg_color: "--surface",
      secondary_bg_color: "--sunk",
      text_color: "--ink",
      hint_color: "--ink-2",
      button_color: "--lapis",
      button_text_color: "--on-lapis",
    };
    for (const [key, token] of Object.entries(mapping)) {
      const value = host.themeParams?.[key];
      if (typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value))
        root.style.setProperty(token, value);
      else root.style.removeProperty(token);
    }
    call(host, "setHeaderColor", "bg_color");
    call(host, "setBackgroundColor", "bg_color");
    call(host, "setBottomBarColor", "secondary_bg_color");
  }
  function viewport() {
    const visible = window.visualViewport;
    const height =
      visible?.height || host?.viewportHeight || window.innerHeight;
    const stable = host?.viewportStableHeight || height;
    for (const [token, value] of [
      ["--app-height", height],
      ["--app-stable-height", stable],
    ])
      if (Number.isFinite(value) && value > 0)
        root.style.setProperty(token, value + "px");
    for (const edge of ["top", "right", "bottom", "left"]) {
      const values = [
        host?.safeAreaInset?.[edge],
        host?.contentSafeAreaInset?.[edge],
      ];
      const inset = Math.max(
        0,
        ...values.filter((value) => Number.isFinite(value) && value >= 0),
      );
      root.style.setProperty("--app-inset-" + edge, inset + "px");
    }
    const focused = document.activeElement;
    if (
      document.getElementById("editor")?.open &&
      /^(INPUT|SELECT|TEXTAREA)$/.test(focused?.tagName || "")
    )
      focused.scrollIntoView?.({ block: "nearest" });
  }
  function update() {
    call(host?.BackButton, canGoBack() ? "show" : "hide");
    call(
      host,
      hasUnsavedChanges()
        ? "enableClosingConfirmation"
        : "disableClosingConfirmation",
    );
  }
  function connect() {
    const candidate = window.Telegram?.WebApp;
    // The SDK creates a default object in ordinary browsers too.
    if (
      !candidate ||
      !candidate.platform ||
      candidate.platform === "unknown" ||
      host
    )
      return;
    host = candidate;
    root.dataset.telegram = "true";
    call(host, "onEvent", "themeChanged", appearance);
    for (const event of [
      "viewportChanged",
      "safeAreaChanged",
      "contentSafeAreaChanged",
    ])
      call(host, "onEvent", event, viewport);
    call(host.BackButton, "onClick", onBack);
    appearance();
    viewport();
    update();
    call(host, "ready");
    call(host, "expand");
  }
  document.getElementById("telegram-sdk")?.addEventListener("load", connect);
  window.addEventListener("resize", viewport);
  window.visualViewport?.addEventListener("resize", viewport);
  window.visualViewport?.addEventListener("scroll", viewport);
  window.addEventListener("beforeunload", (event) => {
    if (hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  viewport();
  connect();
  return { update, connect };
}
