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
export const TEST_CHANNEL = process.env.SLACK_TEST_CHANNEL || "#rad-test";

/**
 * Hard go-live lock. When false, celebrations route to the test channel;
 * only when POSTING_ENABLED === "true" do they reach #social.
 */
export function postingEnabled(): boolean {
  return process.env.POSTING_ENABLED === "true";
}

/** Where celebrations actually land right now: #social if live, else #rad-test. */
export function celebrationChannel(): string {
  return postingEnabled() ? SOCIAL_CHANNEL : TEST_CHANNEL;
}

/**
 * Post a celebration. Routes to #social only after go-live; otherwise to
 * #rad-test. This is the path the daily scheduler uses - it can never leak to
 * #social while the lock is off.
 */
export async function postCelebration(text: string) {
  const slack = getSlack();
  return slack.chat.postMessage({ channel: celebrationChannel(), text });
}

/**
 * Explicit #social post. Refuses while the go-live lock is off, so a stray call
 * can never reach #social before launch.
 */
export async function postToSocial(text: string) {
  if (!postingEnabled()) {
    throw new Error(
      "POSTING_ENABLED is not 'true' - #social posting is locked until go-live"
    );
  }
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
