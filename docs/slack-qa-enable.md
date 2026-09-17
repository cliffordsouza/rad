# Turning on Rad's Q&A (chat)

This upgrades the existing Rad app so people can message it and get answers,
running locally over Socket Mode (no deploy needed).

## 1. Apply the updated manifest
- App Settings -> **App Manifest** (left nav) -> switch to **YAML**.
- Replace everything with the contents of `docs/slack-app-manifest.yaml`.
- **Save Changes.**

This one paste turns on:
- **Socket Mode** (so Rad receives messages without a public URL)
- **Event subscriptions**: `message.im`, `app_mention`
- The **Messages tab** with sending allowed (fixes "sending messages is turned off")
- Extra scopes: `im:history`, `app_mentions:read`

## 2. Reinstall (required - new scopes)
- Left nav -> **Install App** -> **Reinstall to Workspace** -> Allow.
- Adding scopes issues a **new Bot User OAuth Token** (`xoxb-...`).
  The old one stops working, so copy the new one.

## 3. Send me the new bot token
- The **new `xoxb-...`** from the Install App page.
- (The app-level `xapp-...` token stays the same - no need to resend.)

## 4. Then I run the worker
- `npm run worker` starts Rad's brain locally.
- You open Rad in Slack (DM it, or `@Rad` in a channel) and ask a question.
- Rad answers from Confluence (all-staff spaces) + the people data, briefly,
  and if it doesn't know it says so with a bit of wit.

## Notes
- This runs on your machine while the worker is up. For always-on, we deploy
  later - same code.
- People-data answers (birthdays/anniversaries) light up once the Google Sheet
  is wired (or I parse the snapshot into data/people.json).
