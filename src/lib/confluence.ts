/**
 * Confluence Cloud reader (read-only).
 *
 * Access model: Rad should only ever read what a normal employee can read.
 * The primary guarantee comes from the dedicated bot account (see
 * docs/confluence-bot-account-setup.md). This module adds two belt-and-braces
 * safeguards on top:
 *   1. Personal spaces (~user) are always excluded (we only fetch type=global).
 *   2. A hard denylist of obviously-restricted space keys is always dropped,
 *      even if a mis-scoped token could technically see them.
 *
 * Optional CONFLUENCE_SPACE_KEYS acts as an allowlist. If empty, Rad reads all
 * global spaces the token can see (minus the denylist).
 */

const BASE = process.env.CONFLUENCE_BASE_URL || "";
const EMAIL = process.env.CONFLUENCE_EMAIL || "";
const TOKEN = process.env.CONFLUENCE_API_TOKEN || "";

// Never read these, no matter what the token can see.
const HARD_DENYLIST = new Set(["FINANCE", "TS"]); // Finance, Trust & Safety

function allowlist(): Set<string> {
  const raw = process.env.CONFLUENCE_SPACE_KEYS || "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
  );
}

export function confluenceConfigured(): boolean {
  return Boolean(BASE && EMAIL && TOKEN);
}

function authHeader(): string {
  return "Basic " + Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");
}

async function api<T>(path: string): Promise<T> {
  if (!confluenceConfigured()) {
    throw new Error("Confluence is not configured (base URL, email, token)");
  }
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Confluence ${res.status} on ${path}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export interface RadSpace {
  id: string;
  key: string;
  name: string;
}

/**
 * Global (non-personal) spaces Rad is allowed to read, after applying the
 * allowlist (if set) and the hard denylist.
 */
export async function listReadableSpaces(): Promise<RadSpace[]> {
  const allow = allowlist();
  const out: RadSpace[] = [];
  let cursor: string | null = null;

  do {
    const qs = new URLSearchParams({
      type: "global", // excludes personal (~user) spaces
      status: "current",
      limit: "100",
    });
    if (cursor) qs.set("cursor", cursor);

    const page = await api<{
      results: Array<{ id: string; key: string; name: string }>;
      _links?: { next?: string };
    }>(`/wiki/api/v2/spaces?${qs.toString()}`);

    for (const s of page.results) {
      const key = (s.key || "").toUpperCase();
      if (HARD_DENYLIST.has(key)) continue;
      if (allow.size > 0 && !allow.has(key)) continue;
      out.push({ id: s.id, key: s.key, name: s.name });
    }

    // v2 pagination: _links.next is a relative path with a cursor param.
    const next = page._links?.next;
    cursor = next ? new URL(next, BASE).searchParams.get("cursor") : null;
  } while (cursor);

  return out;
}

export interface RadSearchHit {
  id: string;
  title: string;
  spaceKey: string;
  url: string;
  excerpt: string;
}

/** Strip Confluence storage/view HTML down to plain text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Search pages via CQL, constrained to Rad's readable spaces. Used by the Q&A
 * retrieval layer (Phase 4).
 */
export async function searchPages(
  query: string,
  limit = 8
): Promise<RadSearchHit[]> {
  const spaces = await listReadableSpaces();
  if (spaces.length === 0) return [];

  const spaceClause = `space in (${spaces.map((s) => `"${s.key}"`).join(",")})`;
  const safeText = query.replace(/["\\]/g, " ").trim();
  const cql = `type = page AND ${spaceClause} AND text ~ "${safeText}"`;

  const qs = new URLSearchParams({ cql, limit: String(limit) });
  const res = await api<{
    results: Array<{
      content?: { id: string; title: string; space?: { key: string } };
      title?: string;
      excerpt?: string;
      url?: string;
    }>;
  }>(`/wiki/rest/api/search?${qs.toString()}`);

  return res.results
    .filter((r) => r.content)
    .map((r) => ({
      id: r.content!.id,
      title: r.content!.title,
      spaceKey: r.content!.space?.key || "",
      url: r.url ? `${BASE}/wiki${r.url}` : `${BASE}/wiki/spaces`,
      excerpt: htmlToText(r.excerpt || ""),
    }));
}

/** Full plain-text body of a page, for grounding an answer. */
export async function getPageText(pageId: string): Promise<{ title: string; text: string; url: string }> {
  const page = await api<{
    id: string;
    title: string;
    body?: { storage?: { value?: string } };
    _links?: { webui?: string };
  }>(`/wiki/api/v2/pages/${pageId}?body-format=storage`);

  return {
    title: page.title,
    text: htmlToText(page.body?.storage?.value || ""),
    url: page._links?.webui ? `${BASE}/wiki${page._links.webui}` : `${BASE}/wiki`,
  };
}
