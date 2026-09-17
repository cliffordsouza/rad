import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { WebClient } from "@slack/web-api";
import { getUser } from "@/lib/session";
import { can, getConfig } from "@/lib/store";
import { todaysCelebrations, type PersonRecord } from "@/lib/people";
import { buildDailyPost } from "@/config/celebrations";
import { startPulse } from "@worker/pulse.mjs";
import { startTownhall } from "@worker/townhall.mjs";
import { recipients as sharedRecipients } from "@worker/shared.mjs";

export const dynamic = "force-dynamic";

function slack() {
  return new WebClient(process.env.SLACK_BOT_TOKEN);
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { type } = await req.json().catch(() => ({}));

  if (type === "pulse" || type === "townhall") {
    if (!can(user.email, "run_polls")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const web = slack();
    const rec = await sharedRecipients(web);
    const res = type === "pulse" ? await startPulse(web, rec) : await startTownhall(web, rec);
    return NextResponse.json({ ok: true, sent: res.sent, failed: res.failed, live: getConfig().postingEnabled });
  }

  if (type === "celebration") {
    if (!can(user.email, "trigger_posts")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const web = slack();
    const cfg = getConfig();
    const people = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "data", "people.json"), "utf8")
    ) as PersonRecord[];
    const today = todaysCelebrations(people);

    // Resolve Slack ids only for the few people celebrating today (for @mentions).
    const resolve = async (p: PersonRecord) => {
      try {
        const r = await web.users.lookupByEmail({ email: p.email });
        return r.ok && r.user?.id
          ? { name: p.name, email: p.email, slackUserId: r.user.id }
          : { name: p.name, email: p.email };
      } catch {
        return { name: p.name, email: p.email };
      }
    };
    const birthdays = await Promise.all(today.birthdays.map(resolve));
    const anniversaries = await Promise.all(
      today.anniversaries.map(async (a) => ({ ...(await resolve(a.person)), years: a.years }))
    );
    const post = buildDailyPost(birthdays, anniversaries, today.date);
    if (!post) {
      return NextResponse.json({ ok: true, posted: false, message: "No birthdays or anniversaries today." });
    }
    const channel = cfg.postingEnabled ? cfg.socialChannel : cfg.testChannel;
    await web.chat.postMessage({ channel, text: post });
    return NextResponse.json({ ok: true, posted: true, channel });
  }

  return NextResponse.json({ error: "Unknown trigger type" }, { status: 400 });
}
