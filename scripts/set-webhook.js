import "dotenv/config";

const baseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
if (!baseUrl || !process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error("Set PUBLIC_BASE_URL and TELEGRAM_BOT_TOKEN before running this script.");
}

const result = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: `${baseUrl}/telegram/webhook`,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET || undefined,
    allowed_updates: ["message"]
  })
});
const body = await result.json();
if (!body.ok) throw new Error(body.description || "Telegram rejected the webhook.");
console.log(`Webhook set: ${baseUrl}/telegram/webhook`);
