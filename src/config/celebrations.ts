/**
 * Celebration logic - builds the daily #social post.
 *
 * Decisions (2026-09-17):
 *  - All anniversaries use one standard style (no milestone tiers).
 *  - When several people celebrate on the same day, Rad posts ONE combined post.
 *  - No personal DMs - the #social channel post only.
 *
 * Copy lives in RAD_PERSONA.templates (single source of truth).
 */

import { RAD_PERSONA } from "@/config/persona";

export interface Person {
  name: string;
  email: string;
  slackUserId?: string; // resolved from email at send time
}

export interface AnniversaryPerson extends Person {
  years: number;
}

/** Slack tag if we know the user id, else the person's first name. */
function mentionFor(p: Person): string {
  if (p.slackUserId) return `<@${p.slackUserId}>`;
  return p.name.split(/\s+/)[0] || p.name;
}

/** "@A", "@A and @B", "@A, @B and @C" */
function joinMentions(list: string[]): string {
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** Deterministic pick so the same day yields a stable line. */
function pick(list: readonly string[], seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

function fill(tpl: string, vars: { mention: string; name: string; years?: number }): string {
  return tpl
    .replaceAll("{mention}", vars.mention)
    .replaceAll("{name}", vars.name)
    .replaceAll("{years}", String(vars.years ?? ""));
}

/** Single birthday line (used when exactly one birthday today). */
export function birthdayMessage(p: Person, seed: string): string {
  const tpl = pick(RAD_PERSONA.templates.birthday, p.email + seed);
  return fill(tpl, { mention: mentionFor(p), name: p.name });
}

/** Single anniversary line (used when exactly one anniversary today). */
export function anniversaryMessage(p: AnniversaryPerson, seed: string): string {
  const tpl = pick(RAD_PERSONA.templates.workAnniversary, p.email + seed);
  return fill(tpl, { mention: mentionFor(p), name: p.name, years: p.years });
}

/**
 * Build the single combined #social post for a given day.
 * Returns null when there's nothing to celebrate (Rad stays quiet).
 */
export function buildDailyPost(
  birthdays: Person[],
  anniversaries: AnniversaryPerson[],
  seed: string
): string | null {
  if (birthdays.length === 0 && anniversaries.length === 0) return null;

  const lines: string[] = [];

  // Birthdays
  if (birthdays.length === 1) {
    lines.push(birthdayMessage(birthdays[0], seed));
  } else if (birthdays.length > 1) {
    const names = joinMentions(birthdays.map(mentionFor));
    lines.push(
      `🎂 Happy birthday to ${names}! Wishing you all a brilliant day and a fantastic year ahead 🎉`
    );
  }

  // Anniversaries
  if (anniversaries.length === 1) {
    lines.push(anniversaryMessage(anniversaries[0], seed));
  } else if (anniversaries.length > 1) {
    const parts = anniversaries.map(
      (a) => `${mentionFor(a)} (${a.years} ${a.years === 1 ? "yr" : "yrs"})`
    );
    lines.push(
      `🎊 Happy work anniversary to ${joinMentions(parts)}! Thank you all for everything you bring to Radix 💙`
    );
  }

  // Header only when there's more than one celebration line (keeps single
  // celebrations clean and personal).
  if (lines.length > 1) {
    return `🎉 A few celebrations at Radix today!\n\n${lines.join("\n\n")}`;
  }
  return lines[0];
}
