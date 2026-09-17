# Rad - brand assets

Official mascot art for Rad, Radix's social HR bot.

**Rad is a meerkat**: round black glasses, blue over-ear headphones, navy Radix
hoodie over a white tee, jeans, blue sneakers, usually holding a coffee.
Friendly, curious, a music-and-coffee nerd. Radix blue (`#065DFF`) is the accent.

| File | What it is | Where it's used |
|------|------------|-----------------|
| `rad-avatar.png` | Circular headshot (waving, coffee in hand) | Slack app profile picture; site favicon/avatar |
| `rad-expressions.png` | 4-pose sheet: thinking · pointing · welcoming · celebrating | Pick a pose per message type (thinking = Q&A, celebrating = birthdays, welcoming = new joiners) |
| `rad-intro.mp4` | ~40s vertical "Hi, I'm Rad" talking-head reel (720x1280, captioned) | Pinned intro in `#social`; self-intro DM to new joiners; launch announcement |

Copies of the images are mirrored to `/public/brand/` so the app can serve them.
The video stays in `/assets/brand/` (too large to serve statically - upload to
Slack directly or host on a CDN when needed).

## Usage notes
- Slack profile picture: upload `rad-avatar.png` in the Slack app config
  (Basic Information -> Display Information).
- The intro video works best as a native Slack upload (drag into the channel or
  `files.upload`) rather than a link, so it autoplays inline.
- Map poses to moods when we build rich (Block Kit) messages in Phase 2.
