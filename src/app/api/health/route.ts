import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "rad",
    phase: 1,
    checks: {
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      slack: Boolean(process.env.SLACK_BOT_TOKEN),
      confluence: Boolean(process.env.CONFLUENCE_API_TOKEN),
      drive: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      peopleSheet: Boolean(process.env.GOOGLE_PEOPLE_SHEET_ID),
    },
  });
}
