/**
 * Portal-side data access - now backed by Supabase via worker/db.mjs (shared
 * with the worker). All functions are async.
 */
import * as db from "@worker/db.mjs";

export type RadRole = "admin" | "manager" | "viewer";
export type RadPermission =
  | "manage_roles" | "manage_config" | "trigger_posts" | "run_polls" | "view_results";

export const PERMISSIONS: Record<RadRole, RadPermission[]> = {
  admin: ["manage_roles", "manage_config", "trigger_posts", "run_polls", "view_results"],
  manager: ["trigger_posts", "run_polls", "view_results"],
  viewer: ["view_results"],
};

export type RolesMap = Record<string, RadRole>;

export async function getRoles(): Promise<RolesMap> {
  return (await db.getRoles()) as RolesMap;
}
export async function getRole(email: string): Promise<RadRole | null> {
  const roles = await getRoles();
  return roles[email.trim().toLowerCase()] ?? null;
}
export async function can(email: string, perm: RadPermission): Promise<boolean> {
  const role = await getRole(email);
  return role ? PERMISSIONS[role].includes(perm) : false;
}
export async function setRole(email: string, role: RadRole) {
  await db.setRole(email, role);
}
export async function removeRole(email: string) {
  await db.removeRole(email);
}

export interface RadConfig {
  postingEnabled: boolean;
  socialChannel: string;
  testChannel: string;
}
export async function getConfig(): Promise<RadConfig> {
  return db.getConfig();
}
export async function saveConfig(patch: Partial<RadConfig>): Promise<RadConfig> {
  return db.saveConfig(patch);
}

export interface SentEntry {
  id: string;
  type: "message" | "poll" | "image";
  channel: string;
  by: string;
  at: string;
  summary: string;
  pollId?: string;
  live: boolean;
}
export async function getSent(): Promise<SentEntry[]> {
  return db.getSent();
}
export async function appendSent(entry: SentEntry) {
  await db.appendSent(entry);
}
