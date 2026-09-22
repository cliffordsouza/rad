/**
 * Pulse checks - on-demand mood polls RAD DMs to people. Responses persist to
 * Supabase (shared with the portal). The optional-comment "awaiting" window is
 * kept in worker memory (transient; resets on restart, which is fine).
 */
import * as db from "./db.mjs";

export const PULSE_QUESTION = "How's your week going?";
const COMMENT_WINDOW_MS = 20 * 60 * 1000;

const SCALE = [
  { score: 1, emoji: "😞", label: "Rough" },
  { score: 2, emoji: "🙁", label: "Meh" },
  { score: 3, emoji: "😐", label: "OK" },
  { score: 4, emoji: "🙂", label: "Good" },
  { score: 5, emoji: "😄", label: "Great" },
];

const awaiting = new Map(); // userId -> { pulseId, until }

function blocks(pulseId) {
  return [
    { type: "section", text: { type: "mrkdwn", text: `👋 *Quick pulse check from RAD*\n${PULSE_QUESTION}` } },
    {
      type: "actions", block_id: `pulse:${pulseId}`,
      elements: SCALE.map((s) => ({
        type: "button", text: { type: "plain_text", text: `${s.emoji} ${s.label}`, emoji: true },
        value: String(s.score), action_id: `pulse_mood_${s.score}`,
      })),
    },
  ];
}

export async function startPulse(web, recipients) {
  const pulseId = `p_${Date.now()}`;
  await db.startPulseRow(pulseId, PULSE_QUESTION);
  awaiting.clear();
  let sent = 0;
  const failed = [];
  for (const p of recipients) {
    if (!p.slackUserId) { failed.push(p.name); continue; }
    try {
      await web.chat.postMessage({ channel: p.slackUserId, text: `Quick pulse check: ${PULSE_QUESTION}`, blocks: blocks(pulseId) });
      sent++;
    } catch (e) { failed.push(`${p.name} (${e.data?.error || e.message})`); }
  }
  return { pulseId, sent, failed };
}

export async function onMood(web, payload) {
  const action = payload.actions?.[0];
  const pulseId = (payload.message?.blocks?.[1]?.block_id || action?.block_id || "").replace(/^pulse:/, "");
  const score = parseInt(action?.value, 10);
  const userId = payload.user?.id;
  const name = payload.user?.name || userId;
  if (!userId || !score) return;

  await db.upsertPulseResponse({ pulseId, userId, name, score });
  awaiting.set(userId, { pulseId, until: Date.now() + COMMENT_WINDOW_MS });

  const picked = SCALE.find((s) => s.score === score);
  try {
    await web.chat.update({
      channel: payload.channel.id, ts: payload.message.ts, text: "Thanks for checking in!",
      blocks: [{ type: "section", text: { type: "mrkdwn", text: `Thanks for checking in! You picked *${picked.emoji} ${picked.label}*.\nWant to add a quick comment? Just reply here in the next few minutes (optional) 💬` } }],
    });
  } catch { /* ignore */ }
}

export function isAwaitingComment(userId) {
  const a = awaiting.get(userId);
  return Boolean(a && a.until > Date.now());
}

export async function recordComment(web, userId, text) {
  const a = awaiting.get(userId);
  if (!a) return false;
  await db.setPulseComment(a.pulseId, userId, text.trim());
  awaiting.delete(userId);
  try { await web.chat.postMessage({ channel: userId, text: "Got it - thanks for sharing 💛" }); } catch { /* ignore */ }
  return true;
}

export async function results() {
  const pulse = await db.getActivePulse();
  if (!pulse) return "No pulse check has been run yet.";
  const rs = await db.getPulseResponses(pulse.id);
  if (rs.length === 0) return `No responses yet for the pulse started ${pulse.started_at}.`;
  const avg = (rs.reduce((s, r) => s + r.score, 0) / rs.length).toFixed(1);
  const dist = SCALE.map((s) => `${s.emoji} ${s.label}: ${rs.filter((r) => r.score === s.score).length}`).join("  ·  ");
  const comments = rs.filter((r) => r.comment).map((r) => `• *${r.name}*: ${r.comment}`);
  return [
    `📊 *Pulse check results* (started ${String(pulse.started_at).slice(0, 10)})`,
    `Responses: *${rs.length}*  |  Average mood: *${avg} / 5*`, dist,
    comments.length ? `\n*Comments:*\n${comments.join("\n")}` : "\n_No comments yet._",
  ].join("\n");
}
