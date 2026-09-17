import { WebClient } from "@slack/web-api";
import { RAD_PERSONA } from "@/config/persona";

let web: WebClient | null = null;

export function getSlack(): WebClient {
  if (!web) {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) {
      throw new Error("SLACK_BOT_TOKEN is not set");
    }
    web = new WebClient(token);
  }
  return web;
}

export const SOCIAL_CHANNEL = process.env.SLACK_SOCIAL_CHANNEL || "#social";

/** Post a message to the social channel. */
export async function postToSocial(text: string) {
  const slack = getSlack();
  return slack.chat.postMessage({ channel: SOCIAL_CHANNEL, text });
}

/** DM a single user by Slack user id (e.g. "U0123..."). */
export async function dmUser(userId: string, text: string) {
  const slack = getSlack();
  return slack.chat.postMessage({ channel: userId, text });
}

/** Whether Slack is configured yet (Phase 1 gate). */
export function slackReady(): boolean {
  return Boolean(process.env.SLACK_BOT_TOKEN);
}

export { RAD_PERSONA };
