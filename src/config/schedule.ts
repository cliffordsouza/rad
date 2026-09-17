/**
 * Daily celebration schedule.
 *
 * Decision (2026-09-17): run the daily check at 9:00 AM Dubai time (GST, UTC+4).
 * Dubai has no daylight saving, so 09:00 GST is a fixed 05:00 UTC year-round.
 *
 * For a Vercel cron (which fires in UTC), use:  0 5 * * *
 */
export const SCHEDULE = {
  timezone: "Asia/Dubai",
  hourLocal: 9,
  cronUtc: "0 5 * * *",
} as const;
