process.on("uncaughtException", () => {
  console.error(
    "Setup failed. Check the local configuration and try again; credentials were not printed.",
  );
  process.exit(1);
});
import { readFile } from "node:fs/promises";
const config = JSON.parse(
  await readFile(new URL("../.env.production.json", import.meta.url), "utf8"),
);
const action = process.argv[2];
async function telegram(method, body = {}) {
  if (!config.TELEGRAM_BOT_TOKEN)
    throw Error("Set TELEGRAM_BOT_TOKEN in .env.production.json first.");
  const r = await fetch(
    `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers:
        body instanceof FormData ? {} : { "Content-Type": "application/json" },
      body: body instanceof FormData ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    },
  );
  const data = await r.json();
  if (!r.ok || !data.ok)
    throw Error(
      "Telegram request failed. Check the bot token and webhook status.",
    );
  return data.result;
}
try {
  if (action === "owner") {
    const updates = await telegram("getUpdates", {
      allowed_updates: ["message"],
    });
    const ids = [
      ...new Set(
        updates
          .filter(
            (u) =>
              u.message?.chat.type === "private" &&
              u.message?.from.id === u.message.chat.id,
          )
          .map((u) => u.message.chat.id),
      ),
    ];
    console.log(
      ids.length
        ? "Private chat IDs (choose your own): " + ids.join(", ")
        : "No private chat found. Start your bot in Telegram, then retry.",
    );
  } else if (action === "webhook") {
    if (
      !config.BACKEND_URL?.startsWith("https://") ||
      !/^\d+$/.test(String(config.TELEGRAM_OWNER_ID)) ||
      !config.TELEGRAM_WEBHOOK_SECRET
    )
      throw Error(
        "Set BACKEND_URL, TELEGRAM_OWNER_ID and TELEGRAM_WEBHOOK_SECRET first.",
      );
    await telegram("setWebhook", {
      url: new URL("/telegram/webhook", config.BACKEND_URL).href,
      secret_token: config.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    });
    console.log("Telegram webhook connected.");
  } else if (action === "photo") {
    const photo = await readFile(process.argv[3]);
    if (photo[0] !== 0xff || photo[1] !== 0xd8)
      throw Error("Provide a JPEG profile image.");
    const bot = await telegram("getMe");
    const before = await telegram("getUserProfilePhotos", {
      user_id: bot.id,
      limit: 1,
    });
    const form = new FormData();
    form.set(
      "photo",
      JSON.stringify({ type: "static", photo: "attach://avatar" }),
    );
    form.set("avatar", new Blob([photo], { type: "image/jpeg" }), "avatar.jpg");
    await telegram("setMyProfilePhoto", form);
    const after = await telegram("getUserProfilePhotos", {
      user_id: bot.id,
      limit: 1,
    });
    if (
      !after.photos?.[0]?.length ||
      after.photos[0][0].file_unique_id ===
        before.photos?.[0]?.[0]?.file_unique_id
    )
      throw Error("Profile photo update could not be verified.");
    console.log(
      "Telegram profile image updated and verified for @" + bot.username + ".",
    );
  } else if (action === "profile") {
    const siteUrl = new URL(process.argv[3]);
    if (siteUrl.protocol !== "https:" || siteUrl.username || siteUrl.password)
      throw Error("Provide the public HTTPS dashboard URL.");
    const dashboard = siteUrl.href.replace(/\/$/, "");
    const description =
      "Your personal UZCARD expense tracker. Get transaction alerts, choose a category, and reply with a short description. Receive a daily reminder at 20:00 Tashkent time when expenses need details.\n\nView and edit expenses on your public dashboard:\n" +
      dashboard;
    const shortDescription =
      "Personal UZCARD expense tracker. Dashboard: " + dashboard;
    if (description.length > 512 || shortDescription.length > 120)
      throw Error("Bot profile text exceeds Telegram's limits.");
    await telegram("setMyDescription", { description });
    await telegram("setMyShortDescription", {
      short_description: shortDescription,
    });
    const savedDescription = await telegram("getMyDescription");
    const savedShortDescription = await telegram("getMyShortDescription");
    if (
      savedDescription.description !== description ||
      savedShortDescription.short_description !== shortDescription
    )
      throw Error(
        "Bot profile verification failed; retry the profile command.",
      );
    console.log("Telegram description and About text updated and verified.");
  } else if (action === "activate") {
    if (!config.BACKEND_URL?.startsWith("https://") || !config.BACKEND_TOKEN)
      throw Error("Set BACKEND_URL and BACKEND_TOKEN first.");
    const r = await fetch(new URL("/api/activate", config.BACKEND_URL), {
      method: "POST",
      headers: { Authorization: `Bearer ${config.BACKEND_TOKEN}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok)
      throw Error("Activation failed. Check the deployment and service token.");
    const data = await r.json();
    console.log(
      "Tracking starts at " +
        new Date(data.activated_at).toISOString() +
        ". Re-running preserves this timestamp.",
    );
  } else
    throw Error(
      "Usage: node scripts/integrations.mjs owner|webhook|activate|profile [dashboard-url]|photo [jpeg-path]",
    );
} catch (e) {
  console.error(
    e instanceof Error && e.message.startsWith("Usage:")
      ? e.message
      : "Integration setup failed. Check the configuration and connection, then retry.",
  );
  process.exitCode = 1;
}
