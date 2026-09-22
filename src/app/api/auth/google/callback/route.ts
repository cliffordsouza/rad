import { NextResponse } from "next/server";
import { setSession, emailAllowed } from "@/lib/session";
import { getRole } from "@/lib/store";

export const dynamic = "force-dynamic";

function decodeIdTokenEmail(idToken: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return payload.email_verified ? String(payload.email || "").toLowerCase() : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=no_code", req.url));

  const redirectUri = new URL("/api/auth/google/callback", req.url).toString();
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tok = await tokenRes.json().catch(() => ({}));
  const email = tok.id_token ? decodeIdTokenEmail(tok.id_token) : null;

  if (!email || !emailAllowed(email)) {
    return NextResponse.redirect(new URL("/login?error=domain", req.url));
  }
  if (!(await getRole(email))) {
    return NextResponse.redirect(new URL("/login?error=no_access", req.url));
  }
  await setSession(email);
  return NextResponse.redirect(new URL("/portal", req.url));
}
