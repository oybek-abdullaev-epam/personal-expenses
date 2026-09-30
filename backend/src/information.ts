// Public OAuth information is static and never reads account or expense data.
const pages: Record<string, { title: string; body: string }> = {
  "/about": {
    title: "Personal Expenses",
    body: `<p>A personal, single-owner expense tracker for UZCARD transaction emails.</p>
<p>After the owner connects Gmail and activates tracking, the app checks for new UZCARD notifications every five minutes. It records transaction amounts, merchants, dates and card suffixes, asks for categories and descriptions through Telegram, and displays expenses on a public website where visitors can view and edit transactions.</p>
<p>Gmail access is read-only. Only matching UZCARD notifications received after activation are imported. The app does not store email bodies or account balances.</p>
<p>This app is for its owner's personal use and is not open for public registration.</p>`,
  },
  "/privacy": {
    title: "Privacy — Personal Expenses",
    body: `<p>This personal app processes data only for its owner's expense tracking.</p>
<h2>Gmail access and use</h2><p>The app requests the Gmail read-only scope, which permits reading messages and settings across the authorized mailbox. Its ingestion code selects messages from noreply@info.uzcard.uz with the subject UZCARD INFO received after activation. It does not send, change or delete email.</p>
<h2>Storage and sharing</h2><p>The app processes matching email content to extract the transaction amount, currency, merchant, time and card's last four digits. It retains these fields, Gmail message identifiers, processing status, and owner-entered categories and descriptions in Cloudflare D1. Full email bodies and account balances are not retained.</p>
<p>Cloudflare hosts the processing backend and stores OAuth credentials as secrets. Transaction summaries and reminder messages are sent through Telegram to the configured owner's private chat once Telegram is connected. The public website is hosted by Vercel and retrieves expenses from the backend through server-held credentials. Anyone can view and edit transaction records, including resolving and dismissing review items, without signing in. Local setup credentials are also saved in an owner-readable file on the owner's computer.</p>
<p>Google user data is not sold, used for advertising, or used to train AI models. Access, use and transfer of Google API data are limited to this expense-tracking functionality and adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including its Limited Use requirements.</p>
<h2>Control and retention</h2><p>The owner can revoke Gmail access through Google Account third-party connection settings. Revocation stops future authorized access but does not erase saved expenses. Stored records remain until the owner deletes them from the Cloudflare database; local credential files and deployment secrets can be removed separately. The owner administers this app and its storage directly.</p>`,
  },
  "/terms": {
    title: "Use — Personal Expenses",
    body: `<p>Personal Expenses is a personal tool operated by its owner for personal expense tracking. The dashboard is publicly accessible without signup or subscription.</p>
<p>Expense records are derived from notification emails. The owner should review uncertain records and use original bank records to verify transactions. This tracker does not initiate payments or provide financial advice.</p>
<p>The owner controls the connected accounts, infrastructure, stored records and continued operation of the app.</p>`,
  },
};

export function information(request: Request): Response | null {
  const path = new URL(request.url).pathname;
  if (!Object.hasOwn(pages, path)) return null;
  const page = pages[path];
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${page.title}</title><style>body{max-width:720px;margin:48px auto;padding:0 24px;font:18px/1.6 system-ui;color:#172b2a;background:#f6faf8}h1,h2{line-height:1.2}h2{font-size:22px;margin-top:32px}a{color:#096b56}nav{display:flex;gap:24px;flex-wrap:wrap;border-top:1px solid #cddbd5;padding-top:20px;margin-top:36px}</style><main><h1>${page.title}</h1>${page.body}<nav aria-label="Information"><a href="/about">About</a><a href="/privacy">Privacy</a><a href="/terms">Use</a></nav></main></html>`;
  return new Response(request.method === "HEAD" ? null : html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
