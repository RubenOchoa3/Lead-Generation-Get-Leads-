import { z } from "zod";
import type { Db } from "./db";

export const researchSchema = z.object({
  business_summary: z.string().min(10).max(1200),
  likely_cleaning_need: z.string().max(800).default(""),
  personalization_note: z.string().max(600).default(""),
  outreach_angle: z.string().max(600).default(""),
  confidence: z.number().int().min(0).max(100),
  uncertainty_notes: z.string().max(800).optional(),
  sources_used: z.array(z.string().max(500)).max(20).default([]),
});
export type Research = z.infer<typeof researchSchema>;

export async function saveResearch(db: Db, orgId: string, r: Research, model: string) {
  await db.query(
    `insert into research (organization_id, business_summary, likely_cleaning_need, personalization_note, outreach_angle, confidence, uncertainty_notes, sources_used, model)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [orgId, r.business_summary, r.likely_cleaning_need, r.personalization_note, r.outreach_angle, r.confidence, r.uncertainty_notes ?? null, JSON.stringify(r.sources_used), model],
  );
  await db.query(`update approval_queue set status = 'Needs Review' where organization_id = $1 and status = 'Needs Research'`, [orgId]);
}

export const RESEARCH_PROMPT = `You research commercial-cleaning prospects for R&S Central Valley Cleaning (Bakersfield / Kern County, CA; recurring commercial cleaning, written room-by-room scopes, one supervisor per account).
Rules: use ONLY verifiable public facts about this business (its website, listings, news). No invented pain points, no assumptions about their current cleaner, nothing creepy or personal about the contact. If you cannot verify something, say so in uncertainty_notes and lower confidence.
Return ONLY a JSON object with keys: business_summary, likely_cleaning_need, personalization_note, outreach_angle, confidence (0-100 integer), uncertainty_notes, sources_used (array of URLs).`;

export function claudeResearchConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Calls the Claude Messages API with web search. Only used when ANTHROPIC_API_KEY is set on the server. */
export async function runClaudeResearch(org: Record<string, unknown>): Promise<{ research: Research; model: string }> {
  if (!claudeResearchConfigured()) throw new Error("Claude research API is not configured (ANTHROPIC_API_KEY). Research can still be added from a Claude session.");
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
  const facts = {
    company: org.company_name, website: org.website, city: org.city, state: org.state, address: org.address,
    business_type: org.business_type, industry: org.industry, employees: org.employee_range,
  };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      system: RESEARCH_PROMPT,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages: [{ role: "user", content: `Research this prospect:\n${JSON.stringify(facts, null, 2)}` }],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  const text = (json.content as Array<{ type: string; text?: string }>).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Claude returned no JSON research object");
  return { research: researchSchema.parse(JSON.parse(match[0])), model };
}
