/**
 * Town-hall feedback survey - multi-pointer 1-5 ratings. Responses persist to
 * Supabase (shared with the portal).
 */
import * as db from "./db.mjs";

export const POINTERS = [
  { key: "content", label: "Clarity of the updates shared" },
  { key: "relevance", label: "Relevance to your work" },
  { key: "qa", label: "Openness of the Q&A" },
  { key: "overall", label: "Overall value of the session" },
];

function blocks(surveyId, selections = {}) {
  const out = [
    { type: "header", text: { type: "plain_text", text: "🏛️ Town Hall Feedback", emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: "RAD here 👋 Got 20 seconds? Rate the last town hall - *1 = poor, 5 = great*." } },
    { type: "divider" },
  ];
  for (const p of POINTERS) {
    const chosen = selections[p.key];
    out.push({ type: "section", text: { type: "mrkdwn", text: `*${p.label}*` } });
    out.push({
      type: "actions", block_id: `th:${surveyId}:${p.key}`,
      elements: [1, 2, 3, 4, 5].map((n) => ({
        type: "button", text: { type: "plain_text", text: chosen === n ? `✅ ${n}` : String(n) },
        value: String(n), action_id: `th_${p.key}_${n}`, ...(chosen === n ? { style: "primary" } : {}),
      })),
    });
  }
  const done = Object.keys(selections).length;
  out.push({ type: "context", elements: [{ type: "mrkdwn", text: done ? `Saved ${done}/${POINTERS.length} ratings - change any time, or add the rest 🙌` : "Tap a rating for each - your answers save as you go." }] });
  return out;
}

export async function startTownhall(web, recipients) {
  const surveyId = `th_${Date.now()}`;
  await db.startTownhallRow(surveyId);
  let sent = 0;
  const failed = [];
  for (const p of recipients) {
    if (!p.slackUserId) { failed.push(p.name); continue; }
    try {
      await web.chat.postMessage({ channel: p.slackUserId, text: "Town Hall feedback - rate the last session", blocks: blocks(surveyId) });
      sent++;
    } catch (e) { failed.push(`${p.name} (${e.data?.error || e.message})`); }
  }
  return { surveyId, sent, failed };
}

export async function onRate(web, payload) {
  const action = payload.actions?.[0];
  const m = (action?.block_id || "").match(/^th:(.+):([a-z]+)$/);
  if (!m) return;
  const [, surveyId, key] = m;
  const rating = parseInt(action.value, 10);
  const userId = payload.user?.id;
  const name = payload.user?.name || userId;
  if (!userId || !rating) return;

  await db.upsertTownhallResponse({ surveyId, userId, name, key, rating });
  const rows = await db.getTownhallResponses(surveyId);
  const selections = {};
  for (const r of rows) if (r.user_id === userId) selections[r.key] = r.rating;

  try {
    await web.chat.update({ channel: payload.channel.id, ts: payload.message.ts, text: "Town Hall feedback", blocks: blocks(surveyId, selections) });
  } catch { /* ignore */ }
}

export async function results() {
  const survey = await db.getActiveTownhall();
  if (!survey) return "No town-hall survey has been run yet.";
  const rs = await db.getTownhallResponses(survey.id);
  if (rs.length === 0) return `No town-hall responses yet (started ${survey.started_at}).`;
  const respondents = new Set(rs.map((r) => r.user_id)).size;
  const lines = POINTERS.map((p) => {
    const ratings = rs.filter((r) => r.key === p.key).map((r) => r.rating);
    if (!ratings.length) return `• *${p.label}*: no ratings yet`;
    const avg = (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1);
    return `• *${p.label}*: ${avg} / 5  (${ratings.length} rating${ratings.length === 1 ? "" : "s"})`;
  });
  return [`🏛️ *Town Hall results* (started ${String(survey.started_at).slice(0, 10)})`, `Respondents: *${respondents}*`, ...lines].join("\n");
}
