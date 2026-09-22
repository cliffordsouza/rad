import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setRole, saveConfig, replacePeople, replaceChunks } from "./db.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8")); } catch { return d; } };

const roles = read("roles.json", {});
for (const [email, role] of Object.entries(roles)) await setRole(email, role);
console.log("roles:", Object.keys(roles).length);

const cfg = read("config.json", null);
if (cfg) await saveConfig(cfg);
console.log("config:", JSON.stringify(cfg));

const people = read("people.json", []);
await replacePeople(people);
console.log("people:", people.length);

const idx = read("confluence-index.json", { chunks: [] });
await replaceChunks(idx.chunks || []);
console.log("chunks:", (idx.chunks || []).length);
console.log("seed done");
