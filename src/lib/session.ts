/**
 * Lightweight signed-cookie session for the RAD portal.
 *
 * A session is just the user's email, signed with AUTH_SECRET (HMAC). The role
 * is looked up live from data/roles.json, so revoking access is instant.
 *
 * Google sign-in (gated to the allowed domain) sets this cookie; a dev sign-in
 * is available locally when RAD_DEV_AUTH=1.
 */
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getRole, type RadRole } from "@/lib/store";

const COOKIE = "rad_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function secret() {
  return process.env.AUTH_SECRET || "insecure-dev-secret";
}

function sign(value: string) {
  const mac = crypto.createHmac("sha256", secret()).update(value).digest("base64url");
  return `${value}.${mac}`;
}

function verify(token: string): string | null {
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const value = token.slice(0, i);
  const mac = token.slice(i + 1);
  const expected = crypto.createHmac("sha256", secret()).update(value).digest("base64url");
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  return value;
}

export interface RadUser {
  email: string;
  role: RadRole;
}

export async function setSession(email: string) {
  const jar = await cookies();
  jar.set(COOKIE, sign(email.trim().toLowerCase()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** The signed-in user (email + live role), or null. */
export async function getUser(): Promise<RadUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const email = verify(token);
  if (!email) return null;
  const role = await getRole(email);
  if (!role) return null; // access revoked
  return { email, role };
}

export function allowedDomain() {
  return process.env.ALLOWED_EMAIL_DOMAIN || "radix.email";
}

export function emailAllowed(email: string) {
  return email.trim().toLowerCase().endsWith(`@${allowedDomain()}`);
}
