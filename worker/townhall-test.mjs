import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebClient } from "@slack/web-api";
import { startTownhall } from "./townhall.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}
const web = new WebClient(process.env.SLACK_BOT_TOKEN);
const emails = [...(process.env.RAD_ADMIN_EMAILS||"").split(","), ...(process.env.RAD_MANAGER_EMAILS||"").split(",")].map(e=>e.trim().toLowerCase()).filter(Boolean);
const people = JSON.parse(fs.readFileSync(path.join(ROOT,"data","people.json"),"utf8"));
const nameFor = (e)=>people.find(p=>(p.email||"").toLowerCase()===e)?.name||e.split("@")[0];
const recipients=[];
for (const email of emails){ const r=await web.users.lookupByEmail({email}).catch(()=>null); if(r?.ok) recipients.push({name:nameFor(email),slackUserId:r.user.id}); }
const res = await startTownhall(web, recipients);
console.log(`Town-hall ${res.surveyId} sent to ${res.sent}:`, recipients.map(r=>r.name).join(", "));
