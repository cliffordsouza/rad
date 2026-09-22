/** Read + aggregate pulse and town-hall results for the portal (from Supabase). */
import * as db from "@worker/db.mjs";

const TOWNHALL_POINTERS = [
  { key: "content", label: "Clarity of the updates shared" },
  { key: "relevance", label: "Relevance to your work" },
  { key: "qa", label: "Openness of the Q&A" },
  { key: "overall", label: "Overall value of the session" },
];

export async function pulseResults() {
  const pulse = await db.getActivePulse();
  if (!pulse) return { question: "How's your week going?", startedAt: null, count: 0, average: 0, distribution: [0, 0, 0, 0, 0], responses: [] };
  const rs = await db.getPulseResponses(pulse.id);
  const dist = [1, 2, 3, 4, 5].map((n) => rs.filter((r: any) => r.score === n).length);
  const avg = rs.length ? rs.reduce((a: number, r: any) => a + r.score, 0) / rs.length : 0;
  return {
    question: pulse.question || "How's your week going?",
    startedAt: pulse.started_at || null,
    count: rs.length,
    average: Number(avg.toFixed(2)),
    distribution: dist,
    responses: rs.map((r: any) => ({ name: r.name, score: r.score, comment: r.comment || null })),
  };
}

export async function townhallResults() {
  const survey = await db.getActiveTownhall();
  if (!survey) return { startedAt: null, respondents: 0, pointers: [] };
  const rs = await db.getTownhallResponses(survey.id);
  const respondents = new Set(rs.map((r: any) => r.user_id)).size;
  const pointers = TOWNHALL_POINTERS.map((p) => {
    const ratings = rs.filter((r: any) => r.key === p.key).map((r: any) => r.rating);
    const avg = ratings.length ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : 0;
    return { label: p.label, count: ratings.length, average: Number(avg.toFixed(2)) };
  });
  return { startedAt: survey.started_at || null, respondents, pointers };
}
