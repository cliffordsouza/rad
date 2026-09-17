/**
 * Portal-side reader/writer for RAD's shared state (data/*.json).
 * Mirrors worker/shared.mjs - both read the same files, so portal edits take
 * effect in the worker live.
 */
import fs from "node:fs";
import path from "node:path";

const DATA = path.join(process.cwd(), "data");
const ROLES = path.join(DATA, "roles.json");
const CONFIG = path.join(DATA, "config.json");

export type RadRole = "admin" | "manager" | "viewer";
export type RadPermission =
  | "manage_roles" | "manage_config" | "trigger_posts" | "run_polls" | "view_results";

export const PERMISSIONS: Record<RadRole, RadPermission[]> = {
  admin: ["manage_roles", "manage_config", "trigger_posts", "run_polls", "view_results"],
  manager: ["trigger_posts", "run_polls", "view_results"],
  viewer: ["view_results"],
};

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}
function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ---- Roles ----
export type RolesMap = Record<string, RadRole>;

export function getRoles(): RolesMap {
  return readJson<RolesMap>(ROLES, {});
}
export function saveRoles(roles: RolesMap) {
  writeJson(ROLES, roles);
}
export function getRole(email: string): RadRole | null {
  return getRoles()[email.trim().toLowerCase()] ?? null;
}
export function can(email: string, perm: RadPermission): boolean {
  const role = getRole(email);
  return role ? PERMISSIONS[role].includes(perm) : false;
}
export function setRole(email: string, role: RadRole) {
  const roles = getRoles();
  roles[email.trim().toLowerCase()] = role;
  saveRoles(roles);
}
export function removeRole(email: string) {
  const roles = getRoles();
  delete roles[email.trim().toLowerCase()];
  saveRoles(roles);
}

// ---- Config ----
export interface RadConfig {
  postingEnabled: boolean;
  socialChannel: string;
  testChannel: string;
}
export function getConfig(): RadConfig {
  return readJson<RadConfig>(CONFIG, {
    postingEnabled: false,
    socialChannel: "#social",
    testChannel: "#rad-test",
  });
}
export function saveConfig(patch: Partial<RadConfig>): RadConfig {
  const cfg = { ...getConfig(), ...patch };
  writeJson(CONFIG, cfg);
  return cfg;
}
