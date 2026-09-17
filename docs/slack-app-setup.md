# Creating the Rad Slack app

One-time setup. Takes ~5 minutes. You need to be a Slack workspace admin (or able
to get an app approved).

## 1. Create the app from the manifest
1. Go to [api.slack.com/apps](https://api.slack.com/apps) -> **Create New App** ->
   **From an app manifest**.
2. Pick the Radix workspace.
3. Paste the contents of `docs/slack-app-manifest.yaml` (switch the dialog to
   **YAML** if it defaults to JSON). Create.

## 2. Install it to the workspace
1. In the app's left nav: **Install App** -> **Install to Workspace** -> Allow.
   (If your workspace requires admin approval for apps, approve it.)

## 3. Grab the two values I need
- **Install App** page -> copy the **Bot User OAuth Token** (starts with `xoxb-`).
- **Basic Information** page -> **App Credentials** -> copy the **Signing Secret**
  (needed later for Q&A; grab it now so we don't come back).

## 4. Give Rad a face
- **Basic Information** -> **Display Information** -> upload `rad-avatar.png`
  (in `assets/brand/`) as the app icon. Background colour is already Radix blue.

## 5. Add Rad to #social
- In Slack, open **#social** and type: `/invite @Rad`
  (Rad can't post to a channel it isn't a member of.)

## 6. Send me
- the **Bot User OAuth Token** (`xoxb-...`)
- the **Signing Secret**
- confirm the channel is exactly **#social** (or tell me the real name)

Then I'll drop them into Rad's config, resolve the #social channel id, and run a
**safe self-test**: Rad DMs a hello to the two admins (clifford@radix.email and
minita@radix.email) only - nothing posts to #social until you explicitly say go.

## What this does NOT do yet
- No messages are sent on install.
- No Q&A in Slack yet (that's Phase 4, needs a reachable endpoint).
- Nothing posts publicly until you explicitly approve the first #social post.
