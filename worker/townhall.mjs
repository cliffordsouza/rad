/**
 * Town-hall feedback survey - a multi-pointer rating poll RAD DMs to people.
 * Each pointer is rated 1-5. Attributed. Records + rolls up like the pulse.
 *
 * Admin DM triggers (handled in the worker): "town hall" to send, "town hall
 * results" for the rollup. Test-safe (admins/managers until go-live).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORE = path.join(ROOT, "data", "townhall.json");

export const POINTERS = [
  { key: "content", label: "Clarity of the updates shared" },
  { key: "relevance", label: "Relevance to your work" },
  { key: "qa", label: "Openness of the Q&A" },
  { key: "overall", label: "Overall value of the session" },
];

function load() {
  try {
    return JSON.parse(fs.readFileSync(STORE, "utf8"));
  } catch {
    return { activeSurveyId: null, startedAt: null, responses: [] };
  }
}
function save(s) {
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify(s, null, 2));
}

function selectionsFor(state, surveyId, userId) {
  const map = {};
  for (const r of state.responses) {
    if (r.surveyId === surveyId && r.userId === userId) map[r.key] = r.rating;
  }
  return map;
}

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
      type: "actions",
      block_id: `th:${surveyId}:${p.key}`,
      elements: [1, 2, 3, 4, 5].map((n) => ({
        type: "button",
        text: { type: "plain_text", text: chosen === n ? `✅ ${n}` : String(n) },
        value: String(n),
        action_id: `th_${p.key}_${n}`,
        ...(chosen === n ? { style: "primary" } : {}),
      })),
    });
  }
  const done = Object.keys(selections).length;
  out.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: done ? `Saved ${done}/${POINTERS.length} ratings - change any any time, or add the rest 🙌` : "Tap a rating for each - your answers save as you go." }],
  });
  return out;
}

export async function startTownhall(web, recipients) {
  const surveyId = `th_${Date.now()}`;
  const state = load();
  state.activeSurveyId = surveyId;
  state.startedAt = new Date().toISOString();
  state.responses = state.responses.filter((r) => r.surveyId !== surveyId);
  save(state);

  let sent = 0;
  const failed = [];
  for (const p of recipients) {
    if (!p.slackUserId) { failed.push(p.name); continue; }
    try {
      await web.chat.postMessage({
        channel: p.slackUserId,
        text: "Town Hall feedback - rate the last session",
        blocks: blocks(surveyId),
      });
      sent++;
    } catch (e) {
      failed.push(`${p.name} (${e.data?.error || e.message})`);
    }
  }
  return { surveyId, sent, failed };
}

/** Handle a rating button click (block_actions payload). */
export async function onRate(web, payload) {
  const action = payload.actions?.[0];
  const blockId = action?.block_id || "";
  const m = blockId.match(/^th:(.+):([a-z]+)$/);
  if (!m) return;
  const [, surveyId, key] = m;
  const rating = parseInt(action.value, 10);
  const userId = payload.user?.id;
  const name = payload.user?.name || userId;
  if (!userId || !rating) return;

  const state = load();
  state.responses = state.responses.filter((r) => !(r.surveyId === surveyId && r.userId === userId && r.key === key));
  state.responses.push({ surveyId, userId, name, key, rating, ts: new Date().toISOString() });
  save(state);

  try {
    await web.chat.update({
      channel: payload.channel.id,
      ts: payload.message.ts,
      text: "Town Hall feedback",
      blocks: blocks(surveyId, selectionsFor(state, surveyId, userId)),
    });
  } catch { /* ignore */ }
}

export function results() {
  const state = load();
  if (!state.activeSurveyId) return "No town-hall survey has been run yet.";
  const rs = state.responses.filter((r) => r.surveyId === state.activeSurveyId);
  if (rs.length === 0) return `No town-hall responses yet (started ${state.startedAt}).`;

  const respondents = new Set(rs.map((r) => r.userId)).size;
  const lines = POINTERS.map((p) => {
    const ratings = rs.filter((r) => r.key === p.key).map((r) => r.rating);
    if (!ratings.length) return `• *${p.label}*: no ratings yet`;
    const avg = (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1);
    return `• *${p.label}*: ${avg} / 5  (${ratings.length} rating${ratings.length === 1 ? "" : "s"})`;
  });
  return [
    `🏛️ *Town Hall results* (started ${state.startedAt.slice(0, 10)})`,
    `Respondents: *${respondents}*`,
    ...lines,
  ].join("\n");
}
