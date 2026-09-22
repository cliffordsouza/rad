/**
 * Shared state for RAD - roles, config, and recipients.
 * Both the worker (worker/*.mjs) and the web portal (Next.js API routes) read
 * and write these files, so the portal can manage access + settings live
 * without restarting the worker.
 *
 * Files (gitignored, under data/):
 *   roles.json  -> { "email": "admin" | "manager" | "viewer", ... }
 *   config.json -> { postingEnabled, socialChannel, testChannel }
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROLES_FILE = path.join(ROOT, "data", "roles.json");
const CONFIG_FILE = path.join(ROOT, "data", "config.json");

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ---- Roles -----------------------------------------------------------------
// Permissions per role.
export const PERMISSIONS = {
  admin: ["manage_roles", "manage_config", "trigger_posts", "run_polls", "view_results"],
  manager: ["trigger_posts", "run_polls", "view_results"],
  viewer: ["view_results"],
};

/** Seed roles.json from env the first time, so nothing is lost on migration. */
function seedRolesFromEnv() {
  const roles = {};
  for (const e of (process.env.RAD_ADMIN_EMAILS || "").split(",")) {
    const k = e.trim().toLowerCase();
    if (k) roles[k] = "admin";
  }
  for (const e of (process.env.RAD_MANAGER_EMAILS || "").split(",")) {
    const k = e.trim().toLowerCase();
    if (k && !roles[k]) roles[k] = "manager";
  }
  return roles;
}

export function loadRoles() {
  let roles = readJson(ROLES_FILE, null);
  if (!roles) {
    roles = seedRolesFromEnv();
    writeJson(ROLES_FILE, roles);
  }
  return roles;
}

export function saveRoles(roles) {
  writeJson(ROLES_FILE, roles);
}

export function roleOf(email) {
  const roles = loadRoles();
  return roles[(email || "").trim().toLowerCase()] || null;
}

export function can(email, perm) {
  const role = roleOf(email);
  return role ? PERMISSIONS[role].includes(perm) : false;
}

export function adminEmails() {
  const roles = loadRoles();
  return Object.entries(roles).filter(([, r]) => r === "admin").map(([e]) => e);
}

export function privilegedEmails() {
  const roles = loadRoles();
  return Object.entries(roles)
    .filter(([, r]) => r === "admin" || r === "manager")
    .map(([e]) => e);
}

// ---- Config ----------------------------------------------------------------
export function loadConfig() {
  const fallback = {
    postingEnabled: process.env.POSTING_ENABLED === "true",
    socialChannel: process.env.SLACK_SOCIAL_CHANNEL || "#social",
    testChannel: process.env.SLACK_TEST_CHANNEL || "#rad-test",
  };
  const cfg = readJson(CONFIG_FILE, null);
  if (!cfg) {
    writeJson(CONFIG_FILE, fallback);
    return fallback;
  }
  return { ...fallback, ...cfg };
}

export function saveConfig(patch) {
  const cfg = { ...loadConfig(), ...patch };
  writeJson(CONFIG_FILE, cfg);
  return cfg;
}

export function postingEnabled() {
  return loadConfig().postingEnabled === true;
}

// ---- Channels --------------------------------------------------------------
/** Resolve a channel name (#rad-test) or id to a Slack channel id. */
export async function resolveChannel(web, nameOrId) {
  const v = (nameOrId || "").trim();
  if (/^[CGD][A-Z0-9]{6,}$/.test(v)) return v; // already an id
  const target = v.replace(/^#/, "").toLowerCase();
  let cursor;
  do {
    const res = await web.users.conversations({
      types: "public_channel,private_channel",
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });
    if (!res.ok) break;
    const hit = (res.channels || []).find((c) => (c.name || "").toLowerCase() === target);
    if (hit) return hit.id;
    cursor = res.response_metadata?.next_cursor || "";
  } while (cursor);
  return null;
}

// ---- Recipients ------------------------------------------------------------
/**
 * Who receives a broadcast (pulse / town-hall / celebration DM). Test-safe:
 * only privileged users until go-live, then everyone in the people sheet.
 * Resolves Slack ids by email.
 */
export async function recipients(web) {
  const people = readJson(path.join(ROOT, "data", "people.json"), []);
  const live = postingEnabled();
  const priv = privilegedEmails();

  const byEmail = new Map();
  for (const p of people) {
    const e = (p.email || "").toLowerCase();
    if (!e) continue;
    if (live || priv.includes(e)) byEmail.set(e, p);
  }
  // In test mode, always include privileged users even if absent from the sheet.
  if (!live) {
    for (const e of priv) if (!byEmail.has(e)) byEmail.set(e, { name: e.split("@")[0], email: e });
  }

  const out = [];
  for (const p of byEmail.values()) {
    try {
      const r = await web.users.lookupByEmail({ email: p.email });
      if (r.ok) out.push({ name: p.name, email: p.email, slackUserId: r.user.id });
    } catch { /* skip unresolvable */ }
  }
  return out;
}
