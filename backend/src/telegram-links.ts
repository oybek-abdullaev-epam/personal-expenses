// Presentation configuration only; never derive an app URL from an API address.
export function miniAppUrl(value: unknown): string | null {
  if (typeof value !== "string" || !/^https:\/\/[^/?#@\s\\]+\/?$/i.test(value))
    return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      value.includes("?") ||
      value.includes("#") ||
      /^(www\.)?(t\.me|telegram\.me)$/i.test(url.hostname)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export function trackerButton(value: unknown) {
  const url = miniAppUrl(value);
  return url ? { text: "Open tracker", web_app: { url } } : null;
}

export function transactionButton(value: unknown, id: string) {
  const base = miniAppUrl(value);
  if (
    !base ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
  )
    return null;
  const url = new URL(base);
  url.searchParams.set("transaction", id.toLowerCase());
  return { text: "View transaction", web_app: { url: url.href } };
}
