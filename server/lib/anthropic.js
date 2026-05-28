/* lib/anthropic.js — optional Claude polish step
   Turns the dashboard's raw findings + next steps into a tight, human briefing
   email body. If ANTHROPIC_API_KEY is unset, returns null and the caller keeps
   the dashboard-generated plain text. */
import Anthropic from "@anthropic-ai/sdk";

const key = process.env.ANTHROPIC_API_KEY;
const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-5-20250929";
const client = key ? new Anthropic({ apiKey: key }) : null;

export const claudeEnabled = !!client;

export async function draftBriefing({ subject, findings = [], nextSteps = [] }) {
  if (!client) return null;
  const prompt =
    `Write a concise internal briefing email body for a sales & ad-strategy team.\n` +
    `Subject: "${subject}".\n\n` +
    `KEY FINDINGS:\n${findings.map((f) => `- ${f}`).join("\n")}\n\n` +
    `NEXT STEPS:\n${nextSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n` +
    `Rules: under 180 words, plain text (no markdown headings), confident and ` +
    `action-oriented, keep the numbers, end with a one-line sign-off "— SIGNAL".`;

  const msg = await client.messages.create({
    model,
    max_tokens: 700,
    messages: [{ role: "user", content: prompt }],
  });
  return msg.content?.[0]?.text?.trim() || null;
}
