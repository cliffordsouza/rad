# RAD production deploy

- **Portal:** Vercel project `radix-rad` -> https://radix-rad.vercel.app (auto-deploys from `main`)
- **Database:** Supabase project `rad` (slnstualdftsznrvzhkn)
- **Worker:** Render background worker (this file's `render.yaml`)

Two setup steps need a human account. Do them once.

## 1. Google OAuth (portal sign-in)

The live portal has dev sign-in OFF, so Google is the only way in. Access is
still gated: only emails granted a role in the portal can sign in.

1. Google Cloud Console -> **APIs & Services -> Credentials** (use the Radix
   Google Workspace).
2. **Create Credentials -> OAuth client ID -> Web application.** Name it "RAD".
3. **Authorized redirect URIs** -> add exactly:
   - `https://radix-rad.vercel.app/api/auth/google/callback`
   - (optional, local testing) `http://localhost:3023/api/auth/google/callback`
4. Create -> copy the **Client ID** and **Client secret**.
5. Add them to Vercel (Production):
   ```bash
   cd ~/dev/rad
   printf '<CLIENT_ID>'     | vercel env add GOOGLE_CLIENT_ID production
   printf '<CLIENT_SECRET>' | vercel env add GOOGLE_CLIENT_SECRET production
   vercel --prod --yes   # redeploy so the vars take effect
   ```
Then open https://radix-rad.vercel.app -> "Sign in with Google" (restricted to
@radix.email accounts that have a RAD role).

## 2. Render worker

The Slack worker (Q&A, polls, pulses, town-halls) can't run on Vercel - it needs
a persistent connection. Render runs it from `render.yaml`.

1. Create a Render account, connect the GitHub `cliffordsouza/rad` repo.
2. **New -> Blueprint -> select the repo.** Render reads `render.yaml` and creates
   the `rad-worker` background worker.
3. When prompted, set the secret env vars (values are in `.env.local`):
   `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_KEY`. (`ANTHROPIC_MODEL` is preset.)
4. Deploy. Logs should show `connected and listening (Socket Mode)`.
5. **Stop the local launchd worker** so there's only one Socket Mode connection:
   ```bash
   cd ~/dev/rad && bash deploy/install-worker-service.sh stop
   ```

## Notes
- Only one worker may run at a time (two split Slack events). Local launchd OR
  Render, not both.
- Deploy protection: if https://radix-rad.vercel.app asks for a *Vercel* login,
  turn off Project -> Settings -> Deployment Protection -> Vercel Authentication
  (the portal has its own Google auth).
- Re-ingesting Confluence / re-parsing people writes to Supabase, so both portal
  and worker pick it up: `npm run ingest`, `npm run parse:people`.
