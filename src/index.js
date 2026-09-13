import "dotenv/config";
import express from "express";
import { Bot } from "grammy";
import { Firestore } from "@google-cloud/firestore";
import { classifyWithGroq } from "./groq.js";
import { extractUrls } from "./urls.js";

const required = ["TELEGRAM_BOT_TOKEN", "SAFE_BROWSING_API_KEY", "GROQ_API_KEY"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const PORT = Number(process.env.PORT || 8080);
const TELEGRAM_MODE = process.env.TELEGRAM_MODE || "webhook";
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
const recentUpdateIds = new Set();
const memoryEvents = [];
const firestore = process.env.USE_FIRESTORE === "true" ? new Firestore() : null;
const EVENT_COLLECTION = process.env.FIRESTORE_COLLECTION || "family_guard_events";

const CATEGORY_LABEL = {
  phishing: "a possible phishing link",
  scam: "a possible scam",
  fake_news: "a claim that may be misleading or unverified",
  suspicious_download: "a potentially unsafe app download",
  inappropriate_content: "content that may not be suitable for this family group",
  safe: "not suspicious"
};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

async function checkSafeBrowsing(urls) {
  if (!urls.length) return { checked: false, threats: [] };

  const response = await fetch(
    `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(process.env.SAFE_BROWSING_API_KEY)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client: { clientId: "family-guard-bot", clientVersion: "0.1.0" },
        threatInfo: {
          threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: urls.map((url) => ({ url }))
        }
      })
    }
  );
  if (!response.ok) throw new Error(`Safe Browsing returned ${response.status}`);
  const data = await response.json();
  return { checked: true, threats: data.matches || [] };
}

function mustAlert(assessment, safeBrowsing) {
  return safeBrowsing.threats.length > 0 || (assessment.is_suspicious && assessment.confidence >= 0.65);
}

async function logEvent(event) {
  memoryEvents.unshift(event);
  memoryEvents.splice(100, Infinity);
  if (firestore) await firestore.collection(EVENT_COLLECTION).add(event);
  console.log(JSON.stringify({ event: "flagged_message", ...event }));
}

async function evaluateMessage(message) {
  if (!message || message.from?.is_bot) return;
  const text = message.text || message.caption || "";
  const document = message.document;
  const attachment = document && {
    fileName: document.file_name || "attachment",
    isApk: /\.apk$/i.test(document.file_name || "") || document.mime_type === "application/vnd.android.package-archive"
  };
  if ((!text && !attachment) || text.startsWith("/")) return;

  const urls = extractUrls(text);
  let safeBrowsing;
  try {
    safeBrowsing = await checkSafeBrowsing(urls);
  } catch (error) {
    console.error("Safe Browsing check failed; continuing with content review", error.message);
    safeBrowsing = { checked: false, threats: [] };
  }

  let assessment;
  if (safeBrowsing.threats.length) {
    assessment = { is_suspicious: true, category: "phishing", confidence: 1, reason: "This link appears on a known unsafe-site list." };
  } else if (attachment?.isApk) {
    assessment = { is_suspicious: true, category: "suspicious_download", confidence: 0.95, reason: "APK files can install software outside the phone's official app store. Please avoid opening it unless you fully trust the sender and source." };
  } else {
    try {
      assessment = await classifyWithGroq({ text, urls, safeBrowsing, attachment });
    } catch (error) {
      console.error("Groq classification failed; no alert sent", error.message);
      return;
    }
  }
  if (!assessment || !mustAlert(assessment, safeBrowsing)) return;

  const sender = message.from;
  const displayName = escapeHtml([sender.first_name, sender.last_name].filter(Boolean).join(" ") || "there");
  const reason = escapeHtml(
    safeBrowsing.threats.length ? "This link appears on a known unsafe-site list. Please avoid opening it or entering any details." : assessment.reason
  );
  const alert = `🛡️ <b>Quick heads-up</b>, <a href="tg://user?id=${sender.id}">${displayName}</a> — this looks like ${CATEGORY_LABEL[assessment.category]}. ${reason}\n\nPlease pause before opening it, sharing it further, or sending money/details. It may still be worth checking with a trusted source.`;
  await bot.api.sendMessage(message.chat.id, alert, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    message_thread_id: message.message_thread_id,
    reply_parameters: { message_id: message.message_id, allow_sending_without_reply: true }
  });
  await logEvent({
    timestamp: new Date().toISOString(),
    chatId: String(message.chat.id),
    sender: { id: String(sender.id), name: [sender.first_name, sender.last_name].filter(Boolean).join(" ") },
    message: text.slice(0, 2000),
    attachment: attachment?.fileName,
    urls,
    category: assessment.category,
    confidence: assessment.confidence,
    safeBrowsingThreats: safeBrowsing.threats.length
  });
}

// Handle every message type; evaluateMessage quietly skips commands, bot posts,
// and messages without text/captions. This avoids missing ordinary group text
// because of an overly-specific update filter.
bot.on("message", (ctx) => {
  console.log(JSON.stringify({ event: "telegram_message_received", chatId: ctx.chat.id, messageId: ctx.message.message_id }));
  return evaluateMessage(ctx.message).catch((error) => console.error("Message handling failed", error));
});

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));
app.get("/health", (_req, res) => res.json({ ok: true, logging: firestore ? "firestore" : "memory" }));
app.get("/events", (_req, res) => res.json({ events: memoryEvents, storage: firestore ? "firestore (recent events are in memory)" : "memory" }));
app.post("/telegram/webhook", async (req, res) => {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expected && req.get("x-telegram-bot-api-secret-token") !== expected) return res.sendStatus(401);
  if (recentUpdateIds.has(req.body?.update_id)) return res.sendStatus(200);
  if (req.body?.update_id !== undefined) {
    recentUpdateIds.add(req.body.update_id);
    if (recentUpdateIds.size > 500) recentUpdateIds.delete(recentUpdateIds.values().next().value);
  }
  try {
    await bot.handleUpdate(req.body);
    res.sendStatus(200);
  } catch (error) {
    console.error("Webhook failed", error);
    res.sendStatus(500);
  }
});

app.listen(PORT, async () => {
  console.log(`Family Guard Bot listening on ${PORT} (${TELEGRAM_MODE} mode)`);
  if (TELEGRAM_MODE !== "polling") return;

  try {
    // Telegram permits either a webhook or getUpdates. Clearing an old webhook
    // makes local demos work even after a previous deployment attempt.
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    bot.start({ allowed_updates: ["message"] });
    console.log("Telegram long polling started — the bot is live while this terminal stays open.");
  } catch (error) {
    console.error("Could not start Telegram polling", error);
    process.exitCode = 1;
  }
});

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());
