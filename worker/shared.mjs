/**
 * Shared roles/config/recipients for RAD, backed by Supabase (worker/db.mjs).
 *
 * The worker keeps a small in-memory cache of roles + config (warmed at boot,
 * refreshed periodically) so the hot Slack-handler path stays synchronous.
 * The portal (serverless) calls the async DB helpers directly instead.
 */
import * as db from "./db.mjs";

export const PERMISSIONS = {
  admin: ["manage_roles", "manage_config", "trigger_posts", "run_polls", "view_results"],
  manager: ["trigger_posts", "run_polls", "view_results"],
  viewer: ["view_results"],
};

let cache = {
  roles: {},
  config: { postingEnabled: false, socialChannel: "#social", testChannel: "#rad-test" },
};

/** Warm/refresh the worker cache from the DB. */
export async function refreshCache() {
  try {
    cache.roles = await db.getRoles();
    cache.config = await db.getConfig();
  } catch (e) {
    console.error("[shared] cache refresh failed:", e.message);
  }
}

export function roleOf(email) {
  return cache.roles[(email || "").trim().toLowerCase()] || null;
}
export function can(email, perm) {
  const role = roleOf(email);
  return role ? PERMISSIONS[role].includes(perm) : false;
}
export function adminEmails() {
  return Object.entries(cache.roles).filter(([, r]) => r === "admin").map(([e]) => e);
}
export function privilegedEmails() {
  return Object.entries(cache.roles).filter(([, r]) => r === "admin" || r === "manager").map(([e]) => e);
}
export function postingEnabled() {
  return cache.config.postingEnabled === true;
}
export function cachedConfig() {
  return cache.config;
}

// ---- Channels ----
export async function resolveChannel(web, nameOrId) {
  const v = (nameOrId || "").trim();
  if (/^[CGD][A-Z0-9]{6,}$/.test(v)) return v;
  const target = v.replace(/^#/, "").toLowerCase();
  let cursor;
  do {
    const res = await web.users.conversations({
      types: "public_channel,private_channel", limit: 200, ...(cursor ? { cursor } : {}),
    });
    if (!res.ok) break;
    const hit = (res.channels || []).find((c) => (c.name || "").toLowerCase() === target);
    if (hit) return hit.id;
    cursor = res.response_metadata?.next_cursor || "";
  } while (cursor);
  return null;
}

// ---- Recipients (reads DB directly so it works in worker AND serverless portal) ----
export async function recipients(web) {
  const [people, config, roles] = await Promise.all([db.getPeople(), db.getConfig(), db.getRoles()]);
  const priv = Object.entries(roles).filter(([, r]) => r === "admin" || r === "manager").map(([e]) => e.toLowerCase());
  const live = config.postingEnabled === true;

  const byEmail = new Map();
  for (const p of people) {
    const e = (p.email || "").toLowerCase();
    if (!e) continue;
    if (live || priv.includes(e)) byEmail.set(e, p);
  }
  if (!live) for (const e of priv) if (!byEmail.has(e)) byEmail.set(e, { name: e.split("@")[0], email: e });

  const out = [];
  for (const p of byEmail.values()) {
    try {
      const r = await web.users.lookupByEmail({ email: p.email });
      if (r.ok) out.push({ name: p.name, email: p.email, slackUserId: r.user.id });
    } catch { /* skip */ }
  }
  return out;
}
