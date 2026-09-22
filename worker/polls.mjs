/**
 * General polls - custom question + options, posted from the portal. Defs +
 * votes persist to Supabase; votes recorded via Socket Mode (worker).
 */
import * as db from "./db.mjs";

function blocks(poll, votes) {
  const total = votes.length;
  const buttons = poll.options.map((opt, i) => {
    const n = votes.filter((v) => v.opt_idx === i).length;
    return {
      type: "button",
      text: { type: "plain_text", text: n ? `${opt}  ·  ${n}` : opt, emoji: true },
      value: String(i), action_id: `gp_${poll.id}_${i}`,
    };
  });
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) rows.push({ type: "actions", block_id: `gpoll:${poll.id}`, elements: buttons.slice(i, i + 5) });
  return [
    { type: "section", text: { type: "mrkdwn", text: `📊 *${poll.question}*` } },
    ...rows,
    { type: "context", elements: [{ type: "mrkdwn", text: total ? `${total} vote${total === 1 ? "" : "s"} so far` : "Be the first to vote" }] },
  ];
}

export async function createPoll(web, { question, options, channelId, createdBy }) {
  const poll = { id: `gp${Date.now()}`, question, options: options.filter(Boolean).slice(0, 10), channel: channelId, createdBy: createdBy || null, ts: null };
  const posted = await web.chat.postMessage({ channel: channelId, text: `Poll: ${question}`, blocks: blocks(poll, []) });
  poll.ts = posted.ts;
  await db.createPollRow(poll);
  return poll;
}

export async function onVote(web, payload) {
  const action = payload.actions?.[0];
  const m = action?.action_id?.match(/^gp_(.+)_(\d+)$/);
  if (!m) return;
  const [, id, idxStr] = m;
  const userId = payload.user?.id;
  const name = payload.user?.name || userId;
  if (!userId) return;

  await db.upsertPollVote({ pollId: id, userId, name, optIdx: parseInt(idxStr, 10) });
  const poll = await db.getPoll(id);
  if (!poll) return;
  const votes = await db.getPollVotes(id);
  try {
    await web.chat.update({ channel: payload.channel.id, ts: payload.message.ts, text: `Poll: ${poll.question}`, blocks: blocks(poll, votes) });
  } catch { /* ignore */ }
}

export async function pollSummaries() {
  const polls = await db.getAllPolls();
  const out = [];
  for (const p of polls) {
    const votes = await db.getPollVotes(p.id);
    out.push({
      id: p.id, question: p.question, totalVotes: votes.length,
      options: (p.options || []).map((opt, i) => ({ label: opt, count: votes.filter((v) => v.opt_idx === i).length })),
    });
  }
  return out;
}
