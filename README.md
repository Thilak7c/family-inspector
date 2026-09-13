# Family Guard Bot

A calm Telegram group guardian that spots potentially dangerous links, scams, and misleading forwards before someone acts on them. It stays silent on normal messages and gives an in-thread, non-shaming heads-up only when there is a credible concern.

## What it does

- Reads group messages (Telegram privacy mode must be disabled)
- Extracts links and checks them with Google Safe Browsing
- Uses Groq `openai/gpt-oss-120b` with strict JSON output to assess scams, phishing, fake promotions, typo-squatting, misleading forwards, and text/captions
- Uses hard local safeguards for known unsafe URLs and APK attachments
- Replies to suspicious messages in the same thread and tags the sender
- Logs flagged events to console and a small in-memory digest; Firestore is optional

## Run locally

```bash
cp .env.example .env
npm install
npm run dev
```

The service is now available at `http://localhost:8080/health`. Telegram requires a public HTTPS webhook, so use a tunnel for local testing or deploy to Cloud Run.

### Run locally with Telegram long polling

For a laptop demo, set `TELEGRAM_MODE=polling` in `.env`, then run:

```bash
npm run start:polling
```

No tunnel or Cloud Run deployment is needed. Keep that terminal open while testing: the bot will receive group messages through Telegram's long-polling API. Stop it with `Ctrl+C`. Do not run a second copy at the same time.

## Deploy to Cloud Run

Create the secrets once, then deploy. Replace `PROJECT_ID` and values with your own:

```bash
printf '%s' 'YOUR_TELEGRAM_TOKEN' | gcloud secrets create telegram-bot-token --data-file=-
printf '%s' 'YOUR_SAFE_BROWSING_KEY' | gcloud secrets create safe-browsing-api-key --data-file=-
gcloud run deploy family-guard-bot --source . --region asia-southeast1 --allow-unauthenticated \
  --set-secrets TELEGRAM_BOT_TOKEN=telegram-bot-token:latest,SAFE_BROWSING_API_KEY=safe-browsing-api-key:latest
```

Copy the Cloud Run URL into `PUBLIC_BASE_URL` in `.env`, add `TELEGRAM_BOT_TOKEN`, then register the webhook:

```bash
npm run set-webhook
```

For a protected webhook, also configure `TELEGRAM_WEBHOOK_SECRET` identically in Cloud Run and `.env` before registering it.

## Telegram setup checklist

1. Create the bot through [@BotFather](https://t.me/BotFather).
2. In BotFather, run `/setprivacy`, choose the bot, and select **Disable**. This is required for passive group reading.
3. Add the bot to the family group. Make it an admin only if the group’s permissions require that to see messages.
4. Send a normal message (the bot stays quiet), then a Safe Browsing test URL or an obvious scam-like forward.
5. View recent demo logs at `GET /events` or in Cloud Run logs.

## Logging

By default, logs are kept in process memory (up to 100 recent alerts) and printed as JSON—best for a quick live demo. To enable Firestore, create a Firestore database and deploy with `USE_FIRESTORE=true`; events are written to the `family_guard_events` collection by default.

## Privacy note

The bot sends message text, URLs, and attachment metadata to Groq and sends URLs to Google Safe Browsing for analysis. Tell group members this before enabling it, and avoid using it in sensitive groups without an appropriate privacy policy.

Text and captions can be checked for explicit content, but images and videos without a caption are not inspected. Add a specialist image/video moderation service before relying on the bot to detect media-only adult content.
# family-inspector
