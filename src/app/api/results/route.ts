import { NextResponse } from "next/server";
import { getUser } from "@/lib/session";
import { can } from "@/lib/store";
import { pulseResults, townhallResults } from "@/lib/results";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUser();
  if (!user || !can(user.email, "view_results")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ pulse: pulseResults(), townhall: townhallResults() });
}
