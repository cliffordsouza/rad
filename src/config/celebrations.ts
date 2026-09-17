/**
 * Celebration logic - which message Rad uses for a birthday or anniversary,
 * and the milestone rule.
 *
 * Copy lives in RAD_PERSONA.templates (single source of truth); this file just
 * picks the right one and fills placeholders.
 */

import { RAD_PERSONA } from "@/config/persona";

// Anniversary years that get the special "milestone" treatment.
// Everything else uses the standard anniversary copy.
export const MILESTONE_YEARS = [1, 3, 5, 10, 15, 20, 25];

export function isMilestone(years: number): boolean {
  return MILESTONE_YEARS.includes(years);
}

/** Deterministic pick so the same person on the same day gets a stable line. */
function pick(list: readonly string[], seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

function fill(
  tpl: string,
  vars: { mention: string; name: string; years?: number; role?: string }
): string {
  return tpl
    .replaceAll("{mention}", vars.mention)
    .replaceAll("{name}", vars.name)
    .replaceAll("{years}", String(vars.years ?? ""))
    .replaceAll("{role}", vars.role ?? "");
}

export interface Person {
  name: string;
  email: string;
  slackUserId?: string; // resolved from email at send time
}

/** Slack tag if we know the user id, else the person's first name. */
function mentionFor(p: Person): string {
  if (p.slackUserId) return `<@${p.slackUserId}>`;
  return p.name.split(/\s+/)[0] || p.name;
}

export function birthdayMessage(p: Person, seedDate: string): string {
  const tpl = pick(RAD_PERSONA.templates.birthday, p.email + seedDate);
  return fill(tpl, { mention: mentionFor(p), name: p.name });
}

export function anniversaryMessage(
  p: Person,
  years: number,
  seedDate: string
): string {
  const list = isMilestone(years)
    ? RAD_PERSONA.templates.milestoneAnniversary
    : RAD_PERSONA.templates.workAnniversary;
  const tpl = pick(list, p.email + seedDate);
  return fill(tpl, { mention: mentionFor(p), name: p.name, years });
}
