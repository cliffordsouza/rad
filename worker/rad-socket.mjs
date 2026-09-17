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
const C_BASE = process.env.CONFLUENCE_BASE_URL || "";
const C_EMAIL = process.env.CONFLUENCE_EMAIL || "";
const C_TOKEN = process.env.CONFLUENCE_API_TOKEN || "";
const HARD_DENYLIST = new Set(["FINANCE", "TS"]);
const ALLOWLIST = new Set(
  (process.env.CONFLUENCE_SPACE_KEYS || "")
    .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
);
const cAuth = "Basic " + Buffer.from(`${C_EMAIL}:${C_TOKEN}`).toString("base64");
const confluenceReady = Boolean(C_BASE && C_EMAIL && C_TOKEN);

function htmlToText(html) {
  return (html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim();
}

async function cApi(pathname) {
  const res = await fetch(`${C_BASE}${pathname}`, {
    headers: { Authorization: cAuth, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Confluence ${res.status} on ${pathname}`);
  return res.json();
}

let SPACE_KEYS = [];
async function loadSpaces() {
  if (!confluenceReady) return;
  const keys = [];
  let cursor = null;
  do {
    const qs = new URLSearchParams({ type: "global", status: "current", limit: "100" });
    if (cursor) qs.set("cursor", cursor);
    const page = await cApi(`/wiki/api/v2/spaces?${qs}`);
    for (const s of page.results || []) {
      const key = (s.key || "").toUpperCase();
      if (HARD_DENYLIST.has(key)) continue;
      if (ALLOWLIST.size > 0 && !ALLOWLIST.has(key)) continue;
      keys.push(s.key);
    }
    const next = page._links?.next;
    cursor = next ? new URL(next, C_BASE).searchParams.get("cursor") : null;
  } while (cursor);
  SPACE_KEYS = keys;
}

async function searchConfluence(query, limit = 5) {
  if (!confluenceReady || SPACE_KEYS.length === 0) return [];
  const spaceClause = `space in (${SPACE_KEYS.map((k) => `"${k}"`).join(",")})`;
  const safe = query.replace(/["\\]/g, " ").trim();
  const cql = `type = page AND ${spaceClause} AND text ~ "${safe}"`;
  const qs = new URLSearchParams({ cql, limit: String(limit) });
  let data;
  try {
    data = await cApi(`/wiki/rest/api/search?${qs}`);
  } catch {
    return [];
  }
  const hits = [];
  for (const r of data.results || []) {
    if (!r.content) continue;
    let text = "";
    try {
      const page = await cApi(`/wiki/api/v2/pages/${r.content.id}?body-format=storage`);
      text = htmlToText(page.body?.storage?.value || "").slice(0, 1800);
    } catch { /* skip body */ }
    hits.push({
      title: r.content.title,
      url: r.url ? `${C_BASE}/wiki${r.url}` : `${C_BASE}/wiki`,
      text,
    });
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

function peopleContext() {
  if (PEOPLE.length === 0) return "";
  const lines = PEOPLE.map((p) => {
    const bd = p.dobDay && p.dobMonth ? `birthday ${p.dobDay}/${p.dobMonth}` : "birthday n/a";
    const doj = p.dojDay ? `joined ${p.dojDay}/${p.dojMonth}/${p.dojYear}` : "joined n/a";
    return `- ${p.name}${p.loc ? ` (${p.loc})` : ""}: ${bd}; ${doj}`;
  });
  return `BIRTHDAYS & ANNIVERSARIES (day/month):\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Rad's brain
// ---------------------------------------------------------------------------
const SYSTEM = `You are Rad, Radix's friendly social HR bot - a cheerful meerkat in round glasses and blue headphones.

Answer questions using ONLY the context provided in the user's message (it comes from Radix's Confluence pages and the birthdays/anniversaries data). Keep answers short, warm and clear, with at most one or two emoji.

Rules:
- For a policy or company fact, answer from the Confluence context and cite the page title, with its link.
- For birthday/anniversary questions, use the people data.
- Never invent names, dates, policies or facts. Do not guess.
- If the answer is not in the context - if you genuinely do not know - reply with a light, slightly witty one-liner and then say plainly: "I don't have any information for it."
- Never use em dashes. Use hyphens instead.`;

async function askRad(question) {
  const [hits, ppl] = [await searchConfluence(question), peopleContext()];
  const blocks = [];
  if (ppl) blocks.push(ppl);
  for (const h of hits) {
    blocks.push(`CONFLUENCE PAGE: ${h.title}\nLINK: ${h.url}\n${h.text}`);
  }
  const context = blocks.length
    ? blocks.join("\n\n---\n\n")
    : "(no matching Confluence pages or people data found)";

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: SYSTEM,
    messages: [
      { role: "user", content: `Context:\n${context}\n\nQuestion: ${question}` },
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

async function handle(event, { thread = false } = {}) {
  if (!event || event.bot_id || event.subtype) return;
  if (event.user && event.user === BOT_USER_ID) return;
  let text = (event.text || "").replace(/<@[^>]+>/g, "").trim();
  if (!text) return;

  try {
    const answer = await askRad(text);
    await web.chat.postMessage({
      channel: event.channel,
      text: answer,
      ...(thread ? { thread_ts: event.thread_ts || event.ts } : {}),
    });
  } catch (e) {
    console.error("answer error:", e.message);
    await web.chat.postMessage({
      channel: event.channel,
      text: "Oof, my circuits tripped for a second. Try me again in a moment 🛠️",
      ...(thread ? { thread_ts: event.thread_ts || event.ts } : {}),
    });
  }
}

async function main() {
  const auth = await web.auth.test();
  BOT_USER_ID = auth.user_id;
  console.log(`Rad worker: bot=${auth.user} team=${auth.team}`);

  await loadSpaces();
  console.log(
    `Confluence: ${confluenceReady ? SPACE_KEYS.length + " readable spaces" : "not configured"}` +
    ` | people: ${PEOPLE.length} loaded`
  );

  const sm = new SocketModeClient({ appToken: APP_TOKEN });

  sm.on("message", async ({ event, ack }) => {
    await ack();
    if (event.channel_type === "im") await handle(event, { thread: false });
  });

  sm.on("app_mention", async ({ event, ack }) => {
    await ack();
    await handle(event, { thread: true });
  });

  await sm.start();
  console.log("Rad worker: connected and listening (Socket Mode) ✅");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
