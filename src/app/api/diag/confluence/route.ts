import { NextResponse } from "next/server";
import { confluenceConfigured, listReadableSpaces } from "@/lib/confluence";

export const dynamic = "force-dynamic";

/**
 * Diagnostic: shows which spaces Rad would actually read, after the
 * personal-space exclusion, hard denylist, and optional allowlist.
 * Confirms Rad's scope without exposing any page content.
 */
export async function GET() {
  if (!confluenceConfigured()) {
    return NextResponse.json(
      { configured: false, message: "Set CONFLUENCE_BASE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN" },
      { status: 200 }
    );
  }
  try {
    const spaces = await listReadableSpaces();
    return NextResponse.json({
      configured: true,
      count: spaces.length,
      spaces: spaces.map((s) => ({ key: s.key, name: s.name })),
    });
  } catch (e) {
    return NextResponse.json(
      { configured: true, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
