/**
 * Rad roles & permissions.
 *
 * admin   - full control: sources, credentials, persona, roles, everything.
 * manager - day-to-day: people data, celebration copy, trigger/approve posts.
 * (none)  - a regular employee: can chat with Rad, nothing privileged.
 *
 * Both admin and manager receive test notifications.
 */

export type RadRole = "admin" | "manager" | null;

export type RadPermission =
  | "configure_sources" // Confluence / Drive / Sheet wiring
  | "manage_credentials" // tokens, keys
  | "manage_roles" // who is admin / manager
  | "edit_persona" // Rad's voice
  | "manage_people" // the people sheet / celebration data
  | "edit_copy" // celebration message templates
  | "trigger_posts" // fire / approve a #social post
  | "receive_tests"; // gets test notifications

const PERMISSIONS: Record<Exclude<RadRole, null>, RadPermission[]> = {
  admin: [
    "configure_sources",
    "manage_credentials",
    "manage_roles",
    "edit_persona",
    "manage_people",
    "edit_copy",
    "trigger_posts",
    "receive_tests",
  ],
  manager: ["manage_people", "edit_copy", "trigger_posts", "receive_tests"],
};

function parseEmails(raw?: string): string[] {
  return (raw || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function adminEmails(): string[] {
  return parseEmails(process.env.RAD_ADMIN_EMAILS);
}

export function managerEmails(): string[] {
  return parseEmails(process.env.RAD_MANAGER_EMAILS);
}

/** Resolve an email to its role (admin wins if listed in both). */
export function roleOf(email: string): RadRole {
  const e = email.trim().toLowerCase();
  if (adminEmails().includes(e)) return "admin";
  if (managerEmails().includes(e)) return "manager";
  return null;
}

export function can(email: string, perm: RadPermission): boolean {
  const role = roleOf(email);
  if (!role) return false;
  return PERMISSIONS[role].includes(perm);
}

/** Emails that should receive test notifications (admins + managers). */
export function testRecipients(): string[] {
  return Array.from(new Set([...adminEmails(), ...managerEmails()]));
}
