/**
 * One-off: fire a pulse check to the admins/managers (test recipients) so we
 * can verify the click + comment + results flow. Uses the same startPulse the
 * worker uses, so the running worker records clicks against this pulse.
 *
 * Run:  node worker/pulse-test.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebClient } from "@slack/web-api";
import { startPulse } from "./pulse.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

const web = new WebClient(process.env.SLACK_BOT_TOKEN);
const emails = [
  ...(process.env.RAD_ADMIN_EMAILS || "").split(","),
  ...(process.env.RAD_MANAGER_EMAILS || "").split(","),
].map((e) => e.trim().toLowerCase()).filter(Boolean);

const people = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "people.json"), "utf8"));
const nameFor = (email) => people.find((p) => (p.email || "").toLowerCase() === email)?.name || email.split("@")[0];

const recipients = [];
for (const email of emails) {
  const r = await web.users.lookupByEmail({ email }).catch(() => null);
  if (r?.ok) recipients.push({ name: nameFor(email), slackUserId: r.user.id });
}

const res = await startPulse(web, recipients);
console.log(`Pulse ${res.pulseId} sent to ${res.sent} people:`, recipients.map((r) => r.name).join(", "));
if (res.failed.length) console.log("failed:", res.failed.join(", "));
