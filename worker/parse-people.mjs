/**
 * Parse the celebrations master-sheet PDF into data/people.json.
 *
 * Temporary source until the live Google Sheet is wired. Reads
 * data/celebrations-master-sheet.pdf via `pdftotext -layout` and extracts:
 *   Name, DOB (day/month), Joining date (day/month/year), Location, Email.
 *
 * Run:  npm run parse:people
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PDF = path.join(ROOT, "data", "celebrations-master-sheet.pdf");
const OUT = path.join(ROOT, "data", "people.json");

if (!fs.existsSync(PDF)) {
  console.error(`Missing ${PDF}`);
  process.exit(1);
}

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function parseDate(raw) {
  const m = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (!m) return null;
  let year = parseInt(m[3], 10);
  if (m[3].length <= 2) year = 2000 + year;
  return { day: parseInt(m[1], 10), month: MONTHS[m[2].toLowerCase()], year };
}

const text = execSync(`pdftotext -layout "${PDF}" -`, { encoding: "utf8" });

// ## Name  DOB  BdayMonth  GDOJ  AnnMonth  TotalYrs  Loc  [Email]
const WITH_EMAIL = /^\s*(\d+)\s+(.+?)\s+(\d{1,2}-[A-Za-z]{3}-\d{4})\s+[A-Za-z]{3}\s+(\d{1,2}-[A-Za-z]{3}-\d{2,4})\s+[A-Za-z]{3}\s+\d+\s+(.+?)\s+(\S+@\S+)\s*$/;
const NO_EMAIL = /^\s*(\d+)\s+(.+?)\s+(\d{1,2}-[A-Za-z]{3}-\d{4})\s+[A-Za-z]{3}\s+(\d{1,2}-[A-Za-z]{3}-\d{2,4})\s+[A-Za-z]{3}\s+\d+\s+([A-Za-z][A-Za-z ]*?)\s*$/;

const people = [];
const skipped = [];
let noEmailCount = 0;
for (const line of text.split("\n")) {
  if (!line.trim() || /Emp Name/.test(line)) continue;
  let m = line.match(WITH_EMAIL);
  let email = "";
  if (m) {
    email = m[6].trim().toLowerCase();
  } else {
    m = line.match(NO_EMAIL);
    if (m) noEmailCount++;
  }
  if (!m) {
    if (/^\s*\d+\s/.test(line)) skipped.push(line.trim());
    continue;
  }
  const [, , name, dobRaw, dojRaw, loc] = m;
  const dob = parseDate(dobRaw);
  const doj = parseDate(dojRaw);
  if (!dob || !doj) { skipped.push(line.trim()); continue; }
  people.push({
    name: name.trim(),
    email,
    loc: loc.trim(),
    dobDay: dob.day,
    dobMonth: dob.month,
    dojDay: doj.day,
    dojMonth: doj.month,
    dojYear: doj.year,
  });
}

// Dedupe by name + birthday (the sheet has a few duplicate rows, e.g. Thomas Self).
const seen = new Set();
const deduped = [];
let dupes = 0;
for (const p of people) {
  const key = `${p.name.toLowerCase()}|${p.dobDay}/${p.dobMonth}`;
  if (seen.has(key)) { dupes++; continue; }
  seen.add(key);
  deduped.push(p);
}

fs.writeFileSync(OUT, JSON.stringify(deduped, null, 2));
console.log(`Parsed ${deduped.length} people (${noEmailCount} without an email, ${dupes} duplicate rows removed) -> ${OUT}`);
if (skipped.length) {
  console.log(`\nSkipped ${skipped.length} numbered line(s) that didn't match:`);
  skipped.forEach((s) => console.log("  " + s));
}
