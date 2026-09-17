import { NextResponse } from "next/server";
import { allowedDomain } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Start Google OAuth. Works once GOOGLE_CLIENT_ID/SECRET are set. */
export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL("/login?error=google_not_configured", req.url));
  }
  const redirectUri = new URL("/api/auth/google/callback", req.url).toString();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    hd: allowedDomain(),
    prompt: "select_account",
  });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
