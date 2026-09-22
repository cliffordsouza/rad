import { NextResponse } from "next/server";
import { WebClient } from "@slack/web-api";
import { getUser } from "@/lib/session";
import { can, getConfig, appendSent } from "@/lib/store";
import { resolveChannel } from "@worker/shared.mjs";
import { createPoll } from "@worker/polls.mjs";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const type = body.type as "message" | "poll" | "image";

  const perm = type === "poll" ? "run_polls" : "trigger_posts";
  if (!can(user.email, perm)) return NextResponse.json({ error: "You don't have permission for that" }, { status: 403 });

  const cfg = getConfig();
  const target = body.target === "live" ? "live" : "test";
  if (target === "live" && !cfg.postingEnabled) {
    return NextResponse.json({ error: "Live posting is off. Flip 'Go live' first, or post to the test channel." }, { status: 400 });
  }
  const channelName = target === "live" ? cfg.socialChannel : cfg.testChannel;

  const web = new WebClient(process.env.SLACK_BOT_TOKEN);
  const channelId = await resolveChannel(web, channelName);
  if (!channelId) {
    return NextResponse.json({ error: `RAD isn't in ${channelName}. Invite it there first.` }, { status: 400 });
  }

  try {
    if (type === "message") {
      const text = (body.text || "").trim();
      if (!text) return NextResponse.json({ error: "Message is empty" }, { status: 400 });
      await web.chat.postMessage({ channel: channelId, text });
      appendSent({
        id: `s${Date.now()}`, type: "message", channel: channelName, by: user.email,
        at: new Date().toISOString(), summary: text.slice(0, 140), live: target === "live",
      });
      return NextResponse.json({ ok: true, channel: channelName });
    }

    if (type === "image") {
      const url = (body.url || "").trim();
      const caption = (body.caption || "").trim();
      if (!/^https?:\/\//.test(url)) return NextResponse.json({ error: "Enter a valid image URL (https://...)" }, { status: 400 });
      const blocks: any[] = [];
      if (caption) blocks.push({ type: "section", text: { type: "mrkdwn", text: caption } });
      blocks.push({ type: "image", image_url: url, alt_text: caption || "image" });
      await web.chat.postMessage({ channel: channelId, text: caption || "Image", blocks });
      appendSent({
        id: `s${Date.now()}`, type: "image", channel: channelName, by: user.email,
        at: new Date().toISOString(), summary: caption || url, live: target === "live",
      });
      return NextResponse.json({ ok: true, channel: channelName });
    }

    if (type === "poll") {
      const question = (body.question || "").trim();
      const options = (body.options || []).map((o: string) => (o || "").trim()).filter(Boolean);
      if (!question) return NextResponse.json({ error: "Poll needs a question" }, { status: 400 });
      if (options.length < 2) return NextResponse.json({ error: "Add at least 2 options" }, { status: 400 });
      const poll = await createPoll(web, { question, options, channelId, createdBy: user.email });
      appendSent({
        id: `s${Date.now()}`, type: "poll", channel: channelName, by: user.email,
        at: new Date().toISOString(), summary: question, pollId: poll.id, live: target === "live",
      });
      return NextResponse.json({ ok: true, channel: channelName, pollId: poll.id });
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to post" }, { status: 500 });
  }
}
