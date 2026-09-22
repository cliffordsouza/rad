import { NextResponse } from "next/server";
import { getUser, emailAllowed } from "@/lib/session";
import { getRoles, setRole, removeRole, can, type RadRole } from "@/lib/store";

export const dynamic = "force-dynamic";

const VALID: RadRole[] = ["admin", "manager", "viewer"];

async function requireAdmin() {
  const user = await getUser();
  if (!user || !(await can(user.email, "manage_roles"))) return null;
  return user;
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ roles: await getRoles(), me: user.email });
}

export async function POST(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { email, role } = await req.json().catch(() => ({}));
  const e = (email || "").trim().toLowerCase();
  if (!emailAllowed(e)) return NextResponse.json({ error: "Email must be on the allowed domain" }, { status: 400 });
  if (!VALID.includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  await setRole(e, role);
  return NextResponse.json({ ok: true, roles: await getRoles() });
}

export async function DELETE(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { email } = await req.json().catch(() => ({}));
  const e = (email || "").trim().toLowerCase();
  if (e === user.email) return NextResponse.json({ error: "You can't remove your own access" }, { status: 400 });
  const roles = await getRoles();
  const admins = Object.values(roles).filter((r) => r === "admin").length;
  if (roles[e] === "admin" && admins <= 1) {
    return NextResponse.json({ error: "Can't remove the last admin" }, { status: 400 });
  }
  await removeRole(e);
  return NextResponse.json({ ok: true, roles: await getRoles() });
}
