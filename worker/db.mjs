/**
 * Supabase data layer for RAD (shared by the worker and the portal).
 * Uses the service_role key server-side. All functions are async.
 */
import { createClient } from "@supabase/supabase-js";

let _sb = null;
export function sb() {
  if (!_sb) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY not set");
    _sb = createClient(url, key, { auth: { persistSession: false } });
  }
  return _sb;
}

// ---- Roles ----
export async function getRoles() {
  const { data } = await sb().from("roles").select("email, role");
  const map = {};
  for (const r of data || []) map[r.email] = r.role;
  return map;
}
export async function setRole(email, role) {
  await sb().from("roles").upsert({ email: email.toLowerCase(), role });
}
export async function removeRole(email) {
  await sb().from("roles").delete().eq("email", email.toLowerCase());
}

// ---- Config ----
export async function getConfig() {
  const { data } = await sb().from("config").select("*").eq("id", 1).maybeSingle();
  return {
    postingEnabled: data?.posting_enabled ?? false,
    socialChannel: data?.social_channel ?? "#social",
    testChannel: data?.test_channel ?? "#rad-test",
  };
}
export async function saveConfig(patch) {
  const row = {};
  if (patch.postingEnabled !== undefined) row.posting_enabled = patch.postingEnabled;
  if (patch.socialChannel !== undefined) row.social_channel = patch.socialChannel;
  if (patch.testChannel !== undefined) row.test_channel = patch.testChannel;
  await sb().from("config").update(row).eq("id", 1);
  return getConfig();
}

// ---- People ----
export async function getPeople() {
  const { data } = await sb().from("people").select("*");
  return (data || []).map((p) => ({
    name: p.name, email: p.email || "", loc: p.loc,
    dobDay: p.dob_day, dobMonth: p.dob_month,
    dojDay: p.doj_day, dojMonth: p.doj_month, dojYear: p.doj_year,
  }));
}
export async function replacePeople(people) {
  await sb().from("people").delete().gte("id", 0);
  // Dedupe by non-null email (keep first); rows without an email are all kept.
  const seen = new Set();
  const rows = [];
  for (const p of people) {
    const email = p.email ? p.email.toLowerCase() : null;
    if (email) {
      if (seen.has(email)) continue;
      seen.add(email);
    }
    rows.push({
      email, name: p.name, loc: p.loc,
      dob_day: p.dobDay, dob_month: p.dobMonth,
      doj_day: p.dojDay, doj_month: p.dojMonth, doj_year: p.dojYear,
    });
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb().from("people").insert(rows.slice(i, i + 500));
    if (error) throw new Error("people insert: " + error.message);
  }
}

// ---- Confluence chunks ----
export async function getChunks() {
  const all = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data } = await sb().from("confluence_chunks").select("*").range(from, from + page - 1);
    if (!data || data.length === 0) break;
    all.push(...data.map((c) => ({ id: c.id, pageId: c.page_id, title: c.title, url: c.url, space: c.space, text: c.text })));
    if (data.length < page) break;
    from += page;
  }
  return all;
}
export async function replaceChunks(chunks) {
  await sb().from("confluence_chunks").delete().neq("id", "");
  const rows = chunks.map((c) => ({ id: c.id, page_id: c.pageId, title: c.title, url: c.url, space: c.space, text: c.text }));
  for (let i = 0; i < rows.length; i += 500) await sb().from("confluence_chunks").insert(rows.slice(i, i + 500));
}

// ---- Sent log ----
export async function getSent(limit = 200) {
  const { data } = await sb().from("sent").select("*").order("at", { ascending: false }).limit(limit);
  return (data || []).map((s) => ({
    id: s.id, type: s.type, channel: s.channel, by: s.by, at: s.at,
    summary: s.summary, pollId: s.poll_id, live: s.live,
  }));
}
export async function appendSent(e) {
  await sb().from("sent").insert({
    id: e.id, type: e.type, channel: e.channel, by: e.by, at: e.at,
    summary: e.summary, poll_id: e.pollId ?? null, live: e.live,
  });
}

// ---- Pulse ----
export async function startPulseRow(id, question) {
  await sb().from("pulses").update({ active: false }).eq("active", true);
  await sb().from("pulses").insert({ id, question, active: true });
}
export async function getActivePulse() {
  const { data } = await sb().from("pulses").select("*").eq("active", true).order("started_at", { ascending: false }).limit(1).maybeSingle();
  return data || null;
}
export async function upsertPulseResponse(r) {
  await sb().from("pulse_responses").upsert({
    pulse_id: r.pulseId, user_id: r.userId, name: r.name, score: r.score, comment: r.comment ?? null,
  });
}
export async function setPulseComment(pulseId, userId, comment) {
  await sb().from("pulse_responses").update({ comment }).eq("pulse_id", pulseId).eq("user_id", userId);
}
export async function getPulseResponses(pulseId) {
  const { data } = await sb().from("pulse_responses").select("*").eq("pulse_id", pulseId);
  return data || [];
}

// ---- Town hall ----
export async function startTownhallRow(id) {
  await sb().from("townhalls").update({ active: false }).eq("active", true);
  await sb().from("townhalls").insert({ id, active: true });
}
export async function getActiveTownhall() {
  const { data } = await sb().from("townhalls").select("*").eq("active", true).order("started_at", { ascending: false }).limit(1).maybeSingle();
  return data || null;
}
export async function upsertTownhallResponse(r) {
  await sb().from("townhall_responses").upsert({
    survey_id: r.surveyId, user_id: r.userId, name: r.name, key: r.key, rating: r.rating,
  });
}
export async function getTownhallResponses(surveyId) {
  const { data } = await sb().from("townhall_responses").select("*").eq("survey_id", surveyId);
  return data || [];
}

// ---- Polls ----
export async function createPollRow(p) {
  await sb().from("polls").insert({
    id: p.id, question: p.question, options: p.options, channel: p.channel,
    created_by: p.createdBy, ts: p.ts,
  });
}
export async function setPollTs(id, ts) {
  await sb().from("polls").update({ ts }).eq("id", id);
}
export async function getPoll(id) {
  const { data } = await sb().from("polls").select("*").eq("id", id).maybeSingle();
  return data || null;
}
export async function upsertPollVote(v) {
  await sb().from("poll_votes").upsert({ poll_id: v.pollId, user_id: v.userId, name: v.name, opt_idx: v.optIdx });
}
export async function getPollVotes(pollId) {
  const { data } = await sb().from("poll_votes").select("*").eq("poll_id", pollId);
  return data || [];
}
export async function getAllPolls() {
  const { data } = await sb().from("polls").select("*").order("created_at", { ascending: false });
  return data || [];
}
