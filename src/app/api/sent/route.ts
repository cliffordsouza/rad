import { NextResponse } from "next/server";
import { getUser } from "@/lib/session";
import { can, getSent } from "@/lib/store";
import { pollSummaries } from "@worker/polls.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUser();
  if (!user || !(await can(user.email, "view_results"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const polls = await pollSummaries();
  const byId = new Map(polls.map((p: any) => [p.id, p]));
  const sent = (await getSent()).map((s) => ({
    ...s,
    poll: s.pollId ? byId.get(s.pollId) || null : null,
  }));
  return NextResponse.json({ sent });
}
