/**
 * Confluence ingestion -> local index.
 *
 * Pulls every page Rad is allowed to read (all-staff global spaces; Finance/T&S
 * excluded), extracts plain text, chunks it, and writes data/confluence-index.json.
 * The Q&A worker searches this index (with Claude query-expansion) instead of
 * doing shallow live search, so "leave" can find "Working Hours & Time Off".
 *
 * Run:  npm run ingest
 * Re-run periodically to stay current (later: a scheduled job).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const f = path.join(ROOT, ".env.local");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
loadEnv();

const BASE = process.env.CONFLUENCE_BASE_URL || "";
const EMAIL = process.env.CONFLUENCE_EMAIL || "";
const TOKEN = process.env.CONFLUENCE_API_TOKEN || "";
if (!BASE || !EMAIL || !TOKEN) {
  console.error("Confluence not configured (base URL, email, token).");
  process.exit(1);
}
const AUTH = "Basic " + Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");
const HARD_DENYLIST = new Set(["FINANCE", "TS"]);
const ALLOWLIST = new Set(
  (process.env.CONFLUENCE_SPACE_KEYS || "")
    .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
);

async function api(pathname) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${BASE}${pathname}`, {
      headers: { Authorization: AUTH, Accept: "application/json" },
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after") || 2) * 1000;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`Confluence ${res.status} on ${pathname}`);
    return res.json();
  }
  throw new Error(`Confluence rate-limited on ${pathname}`);
}

function htmlToText(html) {
  return (html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim();
}

function chunk(text, size = 1200, overlap = 150) {
  const out = [];
  if (text.length <= size) return text ? [text] : [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + size, text.length);
    // try to break on a space near the end
    if (end < text.length) {
      const sp = text.lastIndexOf(" ", end);
      if (sp > i + size * 0.6) end = sp;
    }
    out.push(text.slice(i, end).trim());
    if (end >= text.length) break;
    i = end - overlap;
  }
  return out.filter(Boolean);
}

async function readableSpaces() {
  const spaces = [];
  let cursor = null;
  do {
    const qs = new URLSearchParams({ type: "global", status: "current", limit: "100" });
    if (cursor) qs.set("cursor", cursor);
    const page = await api(`/wiki/api/v2/spaces?${qs}`);
    for (const s of page.results || []) {
      const key = (s.key || "").toUpperCase();
      if (HARD_DENYLIST.has(key)) continue;
      if (ALLOWLIST.size > 0 && !ALLOWLIST.has(key)) continue;
      spaces.push({ id: s.id, key: s.key, name: s.name });
    }
    const next = page._links?.next;
    cursor = next ? new URL(next, BASE).searchParams.get("cursor") : null;
  } while (cursor);
  return spaces;
}

async function pagesInSpace(spaceId) {
  const pages = [];
  let cursor = null;
  do {
    const qs = new URLSearchParams({
      "space-id": spaceId,
      "body-format": "storage",
      status: "current",
      limit: "100",
    });
    if (cursor) qs.set("cursor", cursor);
    const page = await api(`/wiki/api/v2/pages?${qs}`);
    for (const p of page.results || []) pages.push(p);
    const next = page._links?.next;
    cursor = next ? new URL(next, BASE).searchParams.get("cursor") : null;
  } while (cursor);
  return pages;
}

async function main() {
  const started = Date.now();
  const spaces = await readableSpaces();
  console.log(`Ingesting ${spaces.length} spaces...`);

  const chunks = [];
  let pageCount = 0;
  for (const sp of spaces) {
    let pages = [];
    try {
      pages = await pagesInSpace(sp.id);
    } catch (e) {
      console.log(`  [${sp.key}] skipped (${e.message})`);
      continue;
    }
    let spChunks = 0;
    for (const p of pages) {
      const text = htmlToText(p.body?.storage?.value || "");
      const url = p._links?.webui ? `${BASE}/wiki${p._links.webui}` : `${BASE}/wiki`;
      const parts = chunk(`${p.title}. ${text}`);
      parts.forEach((t, idx) => {
        chunks.push({
          id: `${p.id}-${idx}`,
          pageId: p.id,
          title: p.title,
          url,
          space: sp.key,
          text: t,
        });
        spChunks++;
      });
      pageCount++;
    }
    console.log(`  [${sp.key}] ${pages.length} pages, ${spChunks} chunks`);
  }

  const index = {
    builtAt: new Date().toISOString(),
    spaces: spaces.map((s) => s.key),
    pageCount,
    chunkCount: chunks.length,
    chunks,
  };
  const outDir = path.join(ROOT, "data");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "confluence-index.json");
  fs.writeFileSync(outFile, JSON.stringify(index));
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.log(
    `\nDone in ${secs}s: ${pageCount} pages, ${chunks.length} chunks across ${spaces.length} spaces.`
  );
  console.log(`Wrote ${outFile} (${(fs.statSync(outFile).size / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
