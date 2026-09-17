/** Read + aggregate pulse and town-hall results for the portal. */
import fs from "node:fs";
import path from "node:path";

const DATA = path.join(process.cwd(), "data");

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA, file), "utf8")) as T;
  } catch {
    return fallback;
  }
}

const TOWNHALL_POINTERS = [
  { key: "content", label: "Clarity of the updates shared" },
  { key: "relevance", label: "Relevance to your work" },
  { key: "qa", label: "Openness of the Q&A" },
  { key: "overall", label: "Overall value of the session" },
];

export function pulseResults() {
  const s = readJson<any>("pulse.json", { responses: [] });
  const rs = (s.responses || []).filter((r: any) => r.pulseId === s.activePulseId);
  const dist = [1, 2, 3, 4, 5].map((n) => rs.filter((r: any) => r.score === n).length);
  const avg = rs.length ? rs.reduce((a: number, r: any) => a + r.score, 0) / rs.length : 0;
  return {
    question: s.question || "How's your week going?",
    startedAt: s.startedAt || null,
    count: rs.length,
    average: Number(avg.toFixed(2)),
    distribution: dist, // index 0 = score 1
    responses: rs.map((r: any) => ({ name: r.name, score: r.score, comment: r.comment || null })),
  };
}

export function townhallResults() {
  const s = readJson<any>("townhall.json", { responses: [] });
  const rs = (s.responses || []).filter((r: any) => r.surveyId === s.activeSurveyId);
  const respondents = new Set(rs.map((r: any) => r.userId)).size;
  const pointers = TOWNHALL_POINTERS.map((p) => {
    const ratings = rs.filter((r: any) => r.key === p.key).map((r: any) => r.rating);
    const avg = ratings.length ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : 0;
    return { label: p.label, count: ratings.length, average: Number(avg.toFixed(2)) };
  });
  return { startedAt: s.startedAt || null, respondents, pointers };
}
