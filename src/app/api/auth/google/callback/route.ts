import { NextResponse } from "next/server";
import { setSession, emailAllowed } from "@/lib/session";
import { getRole } from "@/lib/store";

export const dynamic = "force-dynamic";

function decodeIdToken(idToken: string): { email: string; name: string; picture: string } | null {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    if (!payload.email_verified) return null;
    return {
      email: String(payload.email || "").toLowerCase(),
      name: String(payload.name || ""),
      picture: String(payload.picture || ""),
    };
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
  const profile = tok.id_token ? decodeIdToken(tok.id_token) : null;

  if (!profile?.email || !emailAllowed(profile.email)) {
    return NextResponse.redirect(new URL("/login?error=domain", req.url));
  }
  if (!(await getRole(profile.email))) {
    return NextResponse.redirect(new URL("/login?error=no_access", req.url));
  }
  await setSession(profile.email, { name: profile.name, picture: profile.picture });
  return NextResponse.redirect(new URL("/portal", req.url));
}
