/**
 * Pulse checks - on-demand mood polls Rad DMs to people individually.
 *
 * Flow: an admin triggers a pulse -> Rad DMs each recipient a 5-point mood poll
 * (Block Kit buttons) -> on click, Rad records the score (attributed) and offers
 * an optional comment -> the person's next DM (within a short window) is saved as
 * the comment. Admins can ask for a results summary any time.
 *
 * Test-safe: until go-live (POSTING_ENABLED=true) a pulse only reaches the
 * admins/managers, never all employees. Results persist to data/pulse.json for
 * the future web portal.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORE = path.join(ROOT, "data", "pulse.json");
const COMMENT_WINDOW_MS = 20 * 60 * 1000; // 20 min to add a comment after voting

export const PULSE_QUESTION = "How's your week going?";

const SCALE = [
  { score: 1, emoji: "😞", label: "Rough" },
  { score: 2, emoji: "🙁", label: "Meh" },
  { score: 3, emoji: "😐", label: "OK" },
  { score: 4, emoji: "🙂", label: "Good" },
  { score: 5, emoji: "😄", label: "Great" },
];

function load() {
  try {
    return JSON.parse(fs.readFileSync(STORE, "utf8"));
  } catch {
    return { activePulseId: null, question: null, startedAt: null, responses: [], awaiting: {} };
  }
}
function save(state) {
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify(state, null, 2));
}

function blocks(pulseId) {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `👋 *Quick pulse check from RAD*\n${PULSE_QUESTION}`,
      },
    },
    {
      type: "actions",
      block_id: `pulse:${pulseId}`,
      elements: SCALE.map((s) => ({
        type: "button",
        text: { type: "plain_text", text: `${s.emoji} ${s.label}`, emoji: true },
        value: String(s.score),
        action_id: `pulse_mood_${s.score}`,
      })),
    },
  ];
}

/**
 * Start a new pulse and DM each recipient.
 * recipients: [{ name, slackUserId }]. Returns { pulseId, sent, failed }.
 */
export async function startPulse(web, recipients) {
  const pulseId = `p_${Date.now()}`;
  const state = load();
  state.activePulseId = pulseId;
  state.question = PULSE_QUESTION;
  state.startedAt = new Date().toISOString();
  state.responses = state.responses.filter((r) => r.pulseId !== pulseId);
  state.awaiting = {};
  save(state);

  let sent = 0;
  const failed = [];
  for (const p of recipients) {
    if (!p.slackUserId) { failed.push(p.name); continue; }
    try {
      await web.chat.postMessage({
        channel: p.slackUserId,
        text: `Quick pulse check: ${PULSE_QUESTION}`,
        blocks: blocks(pulseId),
      });
      sent++;
    } catch (e) {
      failed.push(`${p.name} (${e.data?.error || e.message})`);
    }
  }
  return { pulseId, sent, failed };
}

/** Handle a mood button click (block_actions payload). */
export async function onMood(web, payload) {
  const action = payload.actions?.[0];
  const blockId = action?.block_id || payload.actions?.[0]?.block_id;
  const pulseId = (payload.message?.blocks?.[1]?.block_id || blockId || "").replace(/^pulse:/, "");
  const score = parseInt(action?.value, 10);
  const userId = payload.user?.id;
  const name = payload.user?.name || userId;
  if (!userId || !score) return;

  const state = load();
  // Upsert this person's response for the pulse.
  state.responses = state.responses.filter((r) => !(r.pulseId === pulseId && r.userId === userId));
  state.responses.push({
    pulseId, userId, name, score,
    comment: null,
    ts: new Date().toISOString(),
  });
  state.awaiting[userId] = { pulseId, until: Date.now() + COMMENT_WINDOW_MS };
  save(state);

  const picked = SCALE.find((s) => s.score === score);
  // Replace the poll message so it can't be voted twice, and invite a comment.
  try {
    await web.chat.update({
      channel: payload.channel.id,
      ts: payload.message.ts,
      text: "Thanks for checking in!",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Thanks for checking in! You picked *${picked.emoji} ${picked.label}*.\nWant to add a quick comment? Just reply here in the next few minutes (optional) 💬`,
          },
        },
      ],
    });
  } catch { /* ignore update failure */ }
}

/** Is this user expected to be sending a pulse comment right now? */
export function isAwaitingComment(userId) {
  const state = load();
  const a = state.awaiting?.[userId];
  return Boolean(a && a.until > Date.now());
}

/** Record a comment for a user's active-pulse response. */
export async function recordComment(web, userId, text) {
  const state = load();
  const a = state.awaiting?.[userId];
  if (!a) return false;
  const resp = [...state.responses].reverse().find((r) => r.pulseId === a.pulseId && r.userId === userId);
  if (resp) resp.comment = text.trim();
  delete state.awaiting[userId];
  save(state);
  try {
    await web.chat.postMessage({ channel: userId, text: "Got it - thanks for sharing 💛" });
  } catch { /* ignore */ }
  return true;
}

/** Aggregate summary for the active pulse (mrkdwn text). */
export function results() {
  const state = load();
  if (!state.activePulseId) return "No pulse check has been run yet.";
  const rs = state.responses.filter((r) => r.pulseId === state.activePulseId);
  if (rs.length === 0) return `No responses yet for the pulse started ${state.startedAt}.`;

  const avg = (rs.reduce((s, r) => s + r.score, 0) / rs.length).toFixed(1);
  const dist = SCALE.map((s) => {
    const n = rs.filter((r) => r.score === s.score).length;
    return `${s.emoji} ${s.label}: ${n}`;
  }).join("  ·  ");
  const comments = rs.filter((r) => r.comment).map((r) => `• *${r.name}*: ${r.comment}`);

  return [
    `📊 *Pulse check results* (started ${state.startedAt.slice(0, 10)})`,
    `Responses: *${rs.length}*  |  Average mood: *${avg} / 5*`,
    dist,
    comments.length ? `\n*Comments:*\n${comments.join("\n")}` : "\n_No comments yet._",
  ].join("\n");
}
