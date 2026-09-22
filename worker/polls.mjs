/**
 * General polls - custom question + options, posted to a channel from the
 * portal. Votes recorded via Socket Mode button clicks (worker), results shown
 * in the portal's Sent history.
 *
 * Store: data/polls.json -> { polls: { <id>: { id, question, options[], channel,
 *   createdBy, createdAt, ts, votes: { userId: {name, optIdx, ts} } } } }
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORE = path.join(ROOT, "data", "polls.json");

function load() {
  try {
    return JSON.parse(fs.readFileSync(STORE, "utf8"));
  } catch {
    return { polls: {} };
  }
}
function save(s) {
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify(s, null, 2));
}

function countFor(poll, i) {
  return Object.values(poll.votes || {}).filter((v) => v.optIdx === i).length;
}

function blocks(poll) {
  const total = Object.keys(poll.votes || {}).length;
  const buttons = poll.options.map((opt, i) => {
    const n = countFor(poll, i);
    return {
      type: "button",
      text: { type: "plain_text", text: n ? `${opt}  ·  ${n}` : opt, emoji: true },
      value: String(i),
      action_id: `gp_${poll.id}_${i}`,
    };
  });
  // Slack allows max 5 elements per actions block; split into rows of 5.
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push({ type: "actions", block_id: `gpoll:${poll.id}`, elements: buttons.slice(i, i + 5) });
  }
  return [
    { type: "section", text: { type: "mrkdwn", text: `📊 *${poll.question}*` } },
    ...rows,
    { type: "context", elements: [{ type: "mrkdwn", text: total ? `${total} vote${total === 1 ? "" : "s"} so far` : "Be the first to vote" }] },
  ];
}

/** Create a poll, post it to the channel (already a channel id), store the def. */
export async function createPoll(web, { question, options, channelId, createdBy }) {
  const id = `gp${Date.now()}`;
  const poll = {
    id, question,
    options: options.filter(Boolean).slice(0, 10),
    channel: channelId,
    createdBy: createdBy || null,
    createdAt: new Date().toISOString(),
    ts: null,
    votes: {},
  };
  const posted = await web.chat.postMessage({
    channel: channelId,
    text: `Poll: ${question}`,
    blocks: blocks(poll),
  });
  poll.ts = posted.ts;
  const s = load();
  s.polls[id] = poll;
  save(s);
  return poll;
}

/** Handle a vote button click. */
export async function onVote(web, payload) {
  const action = payload.actions?.[0];
  const m = action?.action_id?.match(/^gp_(.+)_(\d+)$/);
  if (!m) return;
  const [, id, idxStr] = m;
  const idx = parseInt(idxStr, 10);
  const userId = payload.user?.id;
  const name = payload.user?.name || userId;
  if (!userId) return;

  const s = load();
  const poll = s.polls[id];
  if (!poll) return;
  poll.votes[userId] = { name, optIdx: idx, ts: new Date().toISOString() };
  save(s);

  try {
    await web.chat.update({ channel: payload.channel.id, ts: payload.message.ts, text: `Poll: ${poll.question}`, blocks: blocks(poll) });
  } catch { /* ignore */ }
}

/** All polls (newest first) with tallies, for the portal Sent view. */
export function pollSummaries() {
  const s = load();
  return Object.values(s.polls)
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
    .map((p) => ({
      id: p.id,
      question: p.question,
      totalVotes: Object.keys(p.votes || {}).length,
      options: p.options.map((opt, i) => ({ label: opt, count: countFor(p, i) })),
    }));
}

export function pollById(id) {
  return load().polls[id] || null;
}
