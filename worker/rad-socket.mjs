/**
 * Rad Q&A worker (Socket Mode).
 *
 * Lets people chat with Rad in Slack (DMs + @mentions) WITHOUT a public server,
 * using the app-level token. Rad answers ONLY from what it knows:
 *   - Confluence pages it can read (all-staff spaces; Finance/T&S excluded)
 *   - the birthdays / anniversaries people data (data/people.json, when present)
 *
 * If it doesn't know, it says so with a light, witty line, then plainly:
 *   "I don't have any information for it."
 *
 * Run:  npm run worker
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SocketModeClient } from "@slack/socket-mode";
import { WebClient } from "@slack/web-api";
import Anthropic from "@anthropic-ai/sdk";
import {
  startPulse, onMood, isAwaitingComment, recordComment, results as pulseResults,
} from "./pulse.mjs";
import {
  startTownhall, onRate, results as townhallResults,
} from "./townhall.mjs";
import { adminEmails, postingEnabled, recipients as sharedRecipients } from "./shared.mjs";
import { onVote as onPollVote } from "./polls.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// --- tiny .env.local loader (worker runs outside Next) ---
function loadEnv() {
  const f = path.join(ROOT, ".env.local");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
loadEnv();

// Never die quietly. Log stray rejections but keep serving; on a fatal
// exception, exit non-zero so the supervisor (launchd) restarts a clean process.
process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e));
process.on("uncaughtException", (e) => {
  console.error("[uncaughtException]", e);
  process.exit(1);
});

const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const APP_TOKEN = process.env.SLACK_APP_TOKEN;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

if (!BOT_TOKEN || !APP_TOKEN) {
  console.error("Missing SLACK_BOT_TOKEN or SLACK_APP_TOKEN in .env.local");
  process.exit(1);
}

const web = new WebClient(BOT_TOKEN);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ---------------------------------------------------------------------------
// Confluence (read-only, same scoping rules as src/lib/confluence.ts)
// ---------------------------------------------------------------------------
// Local index built by `npm run ingest` (data/confluence-index.json).
let INDEX = { chunks: [], spaces: [], builtAt: null, pageCount: 0 };
function loadIndex() {
  const f = path.join(ROOT, "data", "confluence-index.json");
  if (!fs.existsSync(f)) return;
  try {
    INDEX = JSON.parse(fs.readFileSync(f, "utf8"));
  } catch (e) {
    console.error("failed to read confluence index:", e.message);
  }
}

const STOP = new Set([
  "the","a","an","of","to","in","on","at","for","and","or","is","are","was",
  "were","be","do","does","did","how","what","when","where","who","why","which",
  "can","could","would","should","i","we","you","our","my","me","us","it","this",
  "that","with","about","from","as","by","get","got","have","has","radix","please",
]);
function terms(s) {
  return (s || "")
    .toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** Ask Claude to expand the question into wiki search terms + synonyms. */
async function expandQuery(question) {
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 150,
      thinking: { type: "disabled" },
      system:
        "You expand a user's question into search keywords for a company wiki. " +
        "Return ONLY a JSON array of 6-12 short lowercase terms (single or two words), " +
        "including likely synonyms and the wording a wiki page would use " +
        "(e.g. 'leave' -> 'time off', 'annual leave', 'holiday'). No prose.",
      messages: [{ role: "user", content: question }],
    });
    const txt = res.content.filter((b) => b.type === "text").map((b) => b.text).join(" ");
    const m = txt.match(/\[[\s\S]*\]/);
    if (m) {
      const arr = JSON.parse(m[0]);
      if (Array.isArray(arr)) return arr.map(String);
    }
  } catch { /* fall back to plain terms */ }
  return [];
}

function scoreChunk(chunk, qterms) {
  const hayTitle = chunk.title.toLowerCase();
  const hay = (chunk.title + " " + chunk.text).toLowerCase();
  let score = 0;
  for (const t of qterms) {
    const tl = t.toLowerCase();
    if (!tl) continue;
    let idx = 0, c = 0;
    while ((idx = hay.indexOf(tl, idx)) !== -1) { c++; idx += tl.length; }
    if (c > 0) score += c + (hayTitle.includes(tl) ? 4 : 0);
  }
  return score;
}

/** Retrieve top matching chunks from the local index (max 2 per page, 6 total). */
function retrieve(question, expanded) {
  if (!INDEX.chunks || INDEX.chunks.length === 0) return [];
  const qterms = Array.from(
    new Set([...terms(question), ...expanded.flatMap(terms), ...expanded.map((e) => e.toLowerCase())])
  );
  if (qterms.length === 0) return [];
  const scored = INDEX.chunks
    .map((ch) => ({ ch, s: scoreChunk(ch, qterms) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);

  const perPage = {};
  const hits = [];
  for (const { ch } of scored) {
    perPage[ch.pageId] = perPage[ch.pageId] || 0;
    if (perPage[ch.pageId] >= 2) continue;
    perPage[ch.pageId]++;
    hits.push({ title: ch.title, url: ch.url, text: ch.text });
    if (hits.length >= 6) break;
  }
  return hits;
}

// ---------------------------------------------------------------------------
// People data (birthdays / anniversaries) - optional until the sheet is wired
// ---------------------------------------------------------------------------
function loadPeople() {
  const f = path.join(ROOT, "data", "people.json");
  if (!fs.existsSync(f)) return [];
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return [];
  }
}
const PEOPLE = loadPeople();

// ---------------------------------------------------------------------------
// Roles + broadcast recipients (roles/config live in data/ via shared.mjs)
// ---------------------------------------------------------------------------
const ADMIN_IDS = new Set(); // Slack user ids, resolved at boot

async function lookupId(email) {
  try {
    const r = await web.users.lookupByEmail({ email });
    return r.ok ? r.user.id : null;
  } catch {
    return null;
  }
}

/** Who receives a pulse / town-hall broadcast (test-safe via shared.mjs). */
async function pulseRecipients() {
  return sharedRecipients(web);
}

const MN = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dubaiTodayParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const g = (t) => parseInt(parts.find((p) => p.type === t).value, 10);
  return { year: g("year"), month: g("month"), day: g("day") };
}

/**
 * Pre-computed people facts so the model never has to filter 95 rows itself
 * (LLMs are unreliable at that). Groups birthdays and anniversaries by month
 * and lists today's celebrations, all computed in code.
 */
function peopleContext() {
  if (PEOPLE.length === 0) return "";
  const today = dubaiTodayParts();

  const bdayByMonth = {};
  const annByMonth = {};
  const todayB = [];
  const todayA = [];
  for (const p of PEOPLE) {
    (bdayByMonth[p.dobMonth] = bdayByMonth[p.dobMonth] || []).push(`${p.name} (${p.dobDay} ${MN[p.dobMonth]})`);
    const yrs = today.year - p.dojYear;
    (annByMonth[p.dojMonth] = annByMonth[p.dojMonth] || []).push(`${p.name} (${p.dojDay} ${MN[p.dojMonth]}, ${yrs}y)`);
    if (p.dobMonth === today.month && p.dobDay === today.day) todayB.push(p.name);
    if (p.dojMonth === today.month && p.dojDay === today.day && yrs > 0) todayA.push(`${p.name} (${yrs}y)`);
  }

  const section = (label, byMonth) => {
    const rows = [];
    for (let m = 1; m <= 12; m++) {
      if (byMonth[m]) rows.push(`  ${MN[m]}: ${byMonth[m].join(", ")}`);
    }
    return `${label}:\n${rows.join("\n")}`;
  };

  return [
    `TODAY (${today.day} ${MN[today.month]} ${today.year}, Dubai time): ` +
      `birthdays: ${todayB.join(", ") || "none"}; anniversaries: ${todayA.join(", ") || "none"}`,
    section("BIRTHDAYS BY MONTH (name (day))", bdayByMonth),
    section("WORK ANNIVERSARIES BY MONTH (name (day, years so far))", annByMonth),
  ].join("\n\n");
}

// ---------------------------------------------------------------------------
// Rad's brain
// ---------------------------------------------------------------------------
const SYSTEM = `You are RAD, Radix's friendly in-house sidekick - a cheerful meerkat in round glasses and blue headphones. You are warm, upbeat and a little witty. Always write your own name in ALL CAPS as "RAD" (never "Rad" or "rad"). You are NOT an HR-only bot - you help the whole company, so never describe yourself as "HR" or frame what you do as HR-only.

Two kinds of messages, handle them differently:

1) Greetings and small talk ("hi", "how are you", "who are you", "what can you do", thanks, etc.):
   - Reply warmly, briefly and CASUALLY, in character - like a friendly colleague popping by, not a corporate bio. Never the summary/details structure here, and never say you lack information for these.
   - VARY it every single time. Do not reuse the same wording, opener, length or emoji twice - improvise a fresh, off-the-cuff line for each person. Some can be one playful sentence; some can be a touch cheeky.
   - If asked who you are or what you can do, weave in casually (not as a checklist, not the same way twice) that you're Radix's friendly in-house sidekick - you do birthday and anniversary shout-outs and can dig up answers from the company wiki (Confluence) and people data on pretty much anything, not just HR. Make it sound like you said it off the top of your head, not a script.

2) Factual questions (company policies, how things work at Radix, team/people info, birthdays, anniversaries - any topic in the wiki) - answer in this exact shape:
   - Line 1: a BRIEF one-line summary in your own words. Apply logic and synthesise; do NOT paste raw wiki text.
   - Then, if you are listing 2 or more items (holidays, dates, people, steps, amounts), put them as a BULLETED LIST - each item on its own line starting with "• ". Do not cram a list into one sentence.
   - Then a short follow-up line offering more, and the Confluence page link.
   - Only expand into longer detail if the person asks for more.
   - Answer ONLY from the context provided in the user's message (Radix Confluence pages + birthdays/anniversaries data). For birthday/anniversary questions, use the people data.
   - Use the TODAY date in the context to decide what is "upcoming" or "next". Do not hedge about today's date - it is given to you.
   - STRICT filtering: show ONLY the items that qualify. SILENTLY omit anything that does not - do not list it with a note like "(already passed)", "(not applicable)", "skipping", or "excluded". If it does not qualify, it must not appear at all.
   - "upcoming"/"next"/"remaining"/"future" means dates strictly after TODAY - drop every date on or before TODAY entirely. If they ask for UAE/Dubai, show only UAE/Dubai items (omit Mumbai/India-only ones), and vice versa. If nothing qualifies, say so plainly in one line.
   - Never invent names, dates, policies or facts. Do not guess.
   - If a factual answer is genuinely not in the context, reply with a light, slightly witty one-liner and then say plainly: "I don't have any information for it."

Slack formatting (important):
- Use Slack mrkdwn, not standard Markdown. Bold is *single asterisks*, never **double**.
- Lists: one item per line, each starting with "• ".
- Do NOT use Markdown tables - Slack does not render them. Use a bulleted list instead.
- Links: use Slack's format <URL|Page Title> so it shows as a clickable title.

Always: keep it compact, at most one or two emoji, and NEVER use em dashes - use hyphens instead.
Give ONLY the final, clean answer. Never think out loud or narrate corrections (no "wait", "let me fix that", "actually"). For list questions, return one tidy list, sorted sensibly, with no duplicates.`;

async function askRad(question) {
  const expanded = await expandQuery(question);
  const hits = retrieve(question, expanded);
  const ppl = peopleContext();

  const blocks = [];
  if (ppl) blocks.push(ppl);
  for (const h of hits) {
    blocks.push(`CONFLUENCE PAGE: ${h.title}\nLINK: ${h.url}\n${h.text}`);
  }
  const context = blocks.length
    ? blocks.join("\n\n---\n\n")
    : "(no matching Confluence pages or people data found)";

  const t = dubaiTodayParts();
  const todayLine = `TODAY is ${t.day} ${MN[t.month]} ${t.year} (Asia/Dubai). Use this to judge what is upcoming/next.`;

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    // Adaptive thinking reasons privately (display defaults to omitted), so
    // filtering/date logic happens off-screen and the user sees a clean answer.
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    system: SYSTEM,
    messages: [
      { role: "user", content: `${todayLine}\n\nContext:\n${context}\n\nQuestion: ${question}` },
    ],
  });
  return res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim()
    .replace(/\u2014/g, "-"); // belt-and-braces: strip any stray em dashes
}

// ---------------------------------------------------------------------------
// Slack wiring
// ---------------------------------------------------------------------------
let BOT_USER_ID = null;

const THINKING_LINES = [
  "💭 RAD is thinking...",
  "🦦 RAD is digging through the burrow...",
  "📚 RAD is checking the wiki...",
];
const TYPING_LINE = "✍️ RAD is typing...";

/** Quick greetings / thanks / small talk -> lighter "typing" placeholder. */
function isSmallTalk(text) {
  const s = text.toLowerCase().trim();
  const words = s.split(/\s+/).length;
  if (
    /^(hi|hey|hello|yo|hiya|sup|howdy|hii+|heya)\b/.test(s) ||
    /^(thanks|thank you|thanks rad|thx|ty|cheers|nice one|great|awesome|cool|got it|ok|okay)\b/.test(s) ||
    /^good (morning|afternoon|evening|night)\b/.test(s) ||
    /\bhow are you\b/.test(s) ||
    /\bwho are you\b/.test(s) ||
    /\bwhat can you do\b/.test(s)
  ) {
    return words <= 6;
  }
  return false;
}

function placeholderText(text) {
  if (isSmallTalk(text)) return TYPING_LINE;
  return THINKING_LINES[Math.floor(Math.random() * THINKING_LINES.length)];
}

const PULSE_START_RE = /^(run|start|send|fire|trigger)\s+(a\s+)?pulse(\s*check)?$/i;
const PULSE_RESULTS_RE = /^pulse\s+(results?|summary|report)$/i;
const TOWNHALL_START_RE = /^(run|start|send|fire|trigger)\s+(a\s+)?town\s*hall(\s*(survey|feedback|poll))?$/i;
const TOWNHALL_RESULTS_RE = /^town\s*hall\s+(results?|summary|report)$/i;

async function handle(event, { thread = false } = {}) {
  if (!event || event.bot_id || event.subtype) return;
  if (event.user && event.user === BOT_USER_ID) return;
  let text = (event.text || "").replace(/<@[^>]+>/g, "").trim();
  if (!text) return;

  const isDM = event.channel_type === "im" || !thread;

  // 1) If this user just voted in a pulse, treat their DM as the comment.
  if (isDM && isAwaitingComment(event.user)) {
    await recordComment(web, event.user, text);
    return;
  }

  // 2) Admin pulse commands (DM only).
  if (isDM && ADMIN_IDS.has(event.user)) {
    if (PULSE_START_RE.test(text)) {
      const recipients = await pulseRecipients();
      const { sent, failed } = await startPulse(web, recipients);
      const mode = postingEnabled() ? "everyone" : "admins/managers only (test mode)";
      let msg = `📣 Pulse check sent to *${sent}* ${sent === 1 ? "person" : "people"} - ${mode}.`;
      if (failed.length) msg += `\nCouldn't reach: ${failed.join(", ")}`;
      msg += `\n\nAsk me for *pulse results* any time to see the rollup.`;
      await web.chat.postMessage({ channel: event.channel, text: msg });
      return;
    }
    if (PULSE_RESULTS_RE.test(text)) {
      await web.chat.postMessage({ channel: event.channel, text: pulseResults() });
      return;
    }
    if (TOWNHALL_START_RE.test(text)) {
      const recipients = await pulseRecipients();
      const { sent, failed } = await startTownhall(web, recipients);
      const mode = postingEnabled() ? "everyone" : "admins/managers only (test mode)";
      let msg = `🏛️ Town-hall survey sent to *${sent}* ${sent === 1 ? "person" : "people"} - ${mode}.`;
      if (failed.length) msg += `\nCouldn't reach: ${failed.join(", ")}`;
      msg += `\n\nAsk me for *town hall results* any time.`;
      await web.chat.postMessage({ channel: event.channel, text: msg });
      return;
    }
    if (TOWNHALL_RESULTS_RE.test(text)) {
      await web.chat.postMessage({ channel: event.channel, text: townhallResults() });
      return;
    }
  }

  const target = {
    channel: event.channel,
    ...(thread ? { thread_ts: event.thread_ts || event.ts } : {}),
  };

  // Post an instant "thinking" placeholder, then edit it in place with the
  // real answer once it's ready - so there's immediate feedback on slow answers.
  let placeholder;
  try {
    placeholder = await web.chat.postMessage({
      ...target,
      text: placeholderText(text),
    });
  } catch (e) {
    console.error("placeholder error:", e.message);
  }

  try {
    const answer = await askRad(text);
    if (placeholder?.ts) {
      await web.chat.update({ channel: placeholder.channel, ts: placeholder.ts, text: answer });
    } else {
      await web.chat.postMessage({ ...target, text: answer });
    }
  } catch (e) {
    console.error("answer error:", e.message);
    const oops = "Oof, my circuits tripped for a second. Try me again in a moment 🛠️";
    if (placeholder?.ts) {
      await web.chat.update({ channel: placeholder.channel, ts: placeholder.ts, text: oops });
    } else {
      await web.chat.postMessage({ ...target, text: oops });
    }
  }
}

// CLI ask-mode: `npm run worker -- --ask "your question"` - test the brain
// without Slack, to confirm answers before delivery is wired.
async function cliAsk() {
  const q = process.argv.slice(3).join(" ").trim() || "How are you?";
  loadIndex();
  console.log(`(index: ${INDEX.chunkCount || INDEX.chunks.length || 0} chunks)`);
  console.log(`Q: ${q}\n`);
  const a = await askRad(q);
  console.log(`Rad: ${a}`);
}

async function main() {
  if (process.argv[2] === "--ask") {
    await cliAsk();
    return;
  }
  const auth = await web.auth.test();
  BOT_USER_ID = auth.user_id;
  console.log(`Rad worker: bot=${auth.user} team=${auth.team}`);

  loadIndex();

  // Resolve admin Slack ids (for pulse commands).
  for (const email of adminEmails()) {
    const id = await lookupId(email);
    if (id) ADMIN_IDS.add(id);
  }

  console.log(
    `Confluence index: ${INDEX.chunks.length} chunks / ${INDEX.pageCount || "?"} pages` +
    `${INDEX.builtAt ? ` (built ${INDEX.builtAt})` : " (MISSING - run npm run ingest)"}` +
    ` | people: ${PEOPLE.length} | admins: ${ADMIN_IDS.size} | posting: ${postingEnabled() ? "LIVE" : "test"}`
  );

  const sm = new SocketModeClient({ appToken: APP_TOKEN });

  // Connection lifecycle logging + watchdog (helps diagnose + auto-heal drops).
  let lastConnectedAt = Date.now();
  sm.on("connected", () => { lastConnectedAt = Date.now(); console.log("[socket] connected"); });
  sm.on("disconnected", (e) => console.log("[socket] disconnected", e?.message || ""));
  sm.on("reconnecting", () => console.log("[socket] reconnecting..."));

  // If the socket stays down for >2 min despite the client's own reconnects,
  // exit so launchd relaunches a fresh, definitely-connected process.
  setInterval(() => {
    const down = Date.now() - lastConnectedAt;
    if (down > 120000) {
      console.error(`[watchdog] socket down ${Math.round(down / 1000)}s - exiting for a clean restart`);
      process.exit(1);
    }
  }, 30000).unref();

  sm.on("message", async ({ event, ack }) => {
    await ack();
    console.log(`[msg] from=${event.user} type=${event.channel_type} subtype=${event.subtype || "-"} text=${JSON.stringify((event.text || "").slice(0, 60))}`);
    if (event.channel_type === "im") await handle(event, { thread: false });
  });

  sm.on("app_mention", async ({ event, ack }) => {
    await ack();
    console.log(`[mention] from=${event.user} text=${JSON.stringify((event.text || "").slice(0, 60))}`);
    await handle(event, { thread: true });
  });

  // Pulse-check button clicks.
  sm.on("interactive", async ({ body, ack }) => {
    await ack();
    try {
      const actionId = body?.actions?.[0]?.action_id || "";
      if (body?.type !== "block_actions") return;
      if (actionId.startsWith("pulse_mood_")) await onMood(web, body);
      else if (actionId.startsWith("th_")) await onRate(web, body);
      else if (actionId.startsWith("gp_")) await onPollVote(web, body);
    } catch (e) {
      console.error("interactive error:", e.message);
    }
  });

  await sm.start();
  console.log("Rad worker: connected and listening (Socket Mode) ✅");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
