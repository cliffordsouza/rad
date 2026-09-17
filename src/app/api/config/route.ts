import { NextResponse } from "next/server";
import { getUser } from "@/lib/session";
import { getConfig, saveConfig, can } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ config: getConfig() });
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user || !can(user.email, "manage_config")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.postingEnabled === "boolean") patch.postingEnabled = body.postingEnabled;
  if (typeof body.socialChannel === "string") patch.socialChannel = body.socialChannel;
  if (typeof body.testChannel === "string") patch.testChannel = body.testChannel;
  const config = saveConfig(patch);
  return NextResponse.json({ ok: true, config });
}
