# Setting up the "Rad" Confluence bot account

Rad (Radix's social HR bot) needs to read Confluence to answer employee questions
from HR/company pages. For privacy, Rad must read **only what any normal employee
can read** - never restricted spaces (Finance, Trust & Safety) or people's
personal spaces.

The clean way to guarantee that: give Rad its **own Atlassian account** with
**standard all-staff access and nothing more**. Then whatever Rad's token can see
is, by definition, exactly what a regular employee can see.

## What to do (needs an org / Atlassian admin)

1. **Create a mailbox** for the bot, e.g. `rad@radix.email` (a real inbox or a
   shared mailbox - it just needs to receive the Atlassian invite email).

2. **Invite that email to Atlassian** with **Confluence access**:
   - admin.atlassian.com -> Directory -> Users -> Invite users
   - Grant **Confluence** product access.
   - **Do NOT** make it a site admin or org admin.
   - Add it **only** to the default all-staff group (the group every normal
     employee is in - often `confluence-users` or a company "All staff" group).
   - **Do NOT** add it to any group that grants access to restricted spaces
     (Finance, Trust & Safety, etc.). If in doubt, add it to nothing beyond the
     default group and confirm it can open a normal space like *People success*.

3. **Sanity check the access** (important):
   - Log in as the bot (or have the admin impersonate) and confirm it **can**
     open *People success* and *Radix*.
   - Confirm it **cannot** open *Finance* or *Trust & Safety*.
   - This is the whole point - if it can see those, it's in too many groups.

4. **Create an API token on the bot account**:
   - Signed in as the bot: id.atlassian.com/manage-profile/security/api-tokens
   - "Create API token" (a plain classic token - no scopes needed).
   - Copy it once.

5. **Send back to me / put in the app config:**
   - the bot's **email** (e.g. `rad@radix.email`)
   - the **API token**

That's it. I'll swap these into Rad's config in place of the temporary personal
token, and Rad will read exactly the all-staff Confluence content - automatically
staying correct as new open spaces are added, with no code changes.

## Notes
- Rad also **excludes personal spaces** (`~user` spaces) from its knowledge base
  regardless, since they're scratch space and noisy - so even if some are left
  open, Rad won't ingest them.
- Read-only is all Rad ever needs. It never writes to Confluence.
