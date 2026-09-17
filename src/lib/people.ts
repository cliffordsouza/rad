/**
 * People data + "who do we celebrate today" logic.
 *
 * Source of truth is the master sheet (cols: Name B, DOB C, Bday-Month D,
 * GDOJ E, Ann-Month F, Total-Yrs G, Loc H, Email I). Live ingestion from the
 * Google Sheet is wired once it's shared; this module is the parsing +
 * date-matching core, which is source-agnostic (feed it rows).
 *
 * Celebration timezone is Asia/Dubai (see src/config/schedule.ts).
 */

export interface PersonRecord {
  name: string;
  email: string;
  loc?: string;
  // Birthday: day + month matter; year is optional (age is not used).
  dobMonth: number; // 1-12
  dobDay: number; // 1-31
  // Joining date: full date, so we can compute completed years.
  dojYear: number;
  dojMonth: number;
  dojDay: number;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Parse sheet dates like "22-Mar-1982" or "01-Sep-03".
 * 2-digit years are treated as 2000-2099 (all joining dates are post-2000).
 */
export function parseSheetDate(
  raw: string
): { year: number; month: number; day: number } | null {
  const m = raw.trim().match(/^(\d{1,2})[-/\s]([A-Za-z]{3})[A-Za-z]*[-/\s](\d{2,4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  let year = parseInt(m[3], 10);
  if (m[3].length <= 2) year = 2000 + year;
  return { year, month, day };
}

/** Today's date parts in Asia/Dubai. */
export function dubaiToday(now: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  iso: string;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)!.value, 10);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { year, month, day, iso };
}

export interface TodaysCelebrations {
  date: string; // ISO date used
  birthdays: PersonRecord[];
  anniversaries: Array<{ person: PersonRecord; years: number }>;
}

/**
 * Who is celebrating on the given day (defaults to today, Dubai time).
 * Birthday = DOB day+month match. Anniversary = joining day+month match, with
 * completed years > 0.
 */
export function todaysCelebrations(
  people: PersonRecord[],
  today = dubaiToday()
): TodaysCelebrations {
  const birthdays: PersonRecord[] = [];
  const anniversaries: Array<{ person: PersonRecord; years: number }> = [];

  for (const p of people) {
    if (p.dobMonth === today.month && p.dobDay === today.day) {
      birthdays.push(p);
    }
    if (p.dojMonth === today.month && p.dojDay === today.day) {
      const years = today.year - p.dojYear;
      if (years > 0) anniversaries.push({ person: p, years });
    }
  }

  // Stable ordering by name for a tidy post.
  birthdays.sort((a, b) => a.name.localeCompare(b.name));
  anniversaries.sort((a, b) => a.person.name.localeCompare(b.person.name));

  return { date: today.iso, birthdays, anniversaries };
}
