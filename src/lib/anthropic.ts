import Anthropic from "@anthropic-ai/sdk";
import { RAD_PERSONA } from "@/config/persona";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

export const RAD_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

/**
 * Ask Rad a question. Context blocks (Confluence / Drive excerpts) can be
 * passed in and are appended to the system prompt for grounding.
 * Phase 4 wires real retrieval; for now this is a plain, persona-shaped answer.
 */
export async function askRad(
  userMessage: string,
  opts: { contextBlocks?: string[] } = {}
): Promise<string> {
  const anthropic = getAnthropic();
  const context = (opts.contextBlocks ?? []).join("\n\n---\n\n");

  const system = context
    ? `${RAD_PERSONA.systemVoice}\n\nGrounding context (answer only from this where relevant, and cite it):\n\n${context}`
    : RAD_PERSONA.systemVoice;

  const res = await anthropic.messages.create({
    model: RAD_MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return text || "Hmm, I didn't catch that. Mind rephrasing?";
}
