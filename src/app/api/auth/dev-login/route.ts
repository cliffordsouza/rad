import { NextResponse } from "next/server";
import { setSession, emailAllowed } from "@/lib/session";
import { getRole } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Local dev sign-in (no Google). Enabled only when RAD_DEV_AUTH=1. */
export async function POST(req: Request) {
  if (process.env.RAD_DEV_AUTH !== "1") {
    return NextResponse.json({ error: "Dev sign-in is disabled" }, { status: 403 });
  }
  const { email } = await req.json().catch(() => ({ email: "" }));
  const e = (email || "").trim().toLowerCase();
  if (!emailAllowed(e)) {
    return NextResponse.json({ error: `Use an @${process.env.ALLOWED_EMAIL_DOMAIN || "radix.email"} email` }, { status: 400 });
  }
  if (!getRole(e)) {
    return NextResponse.json({ error: "That email has no RAD access yet. Ask an admin to add you." }, { status: 403 });
  }
  await setSession(e);
  return NextResponse.json({ ok: true });
}
