/**
 * Instantly (sender) adapter — API v2, key in INSTANTLY_API_KEY.
 *
 * Deliberately narrow: list campaigns and add leads to a campaign. There is no function here that
 * activates, launches or resumes a campaign — launching stays a manual owner action inside Instantly.
 */

const BASE = process.env.INSTANTLY_API_BASE || "https://api.instantly.ai";

export function instantlyConfigured() {
  return Boolean(process.env.INSTANTLY_API_KEY);
}

/** Instantly campaign status codes → labels used by this dashboard. */
export const INSTANTLY_STATUS: Record<number, string> = { 0: "Draft", 1: "Active", 2: "Paused", 3: "Completed" };

export type InstantlyCampaign = { id: string; name: string; status: number; email_list?: string[]; daily_limit?: number };

export type InstantlyLead = {
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  website?: string;
  phone?: string;
  personalization?: string;
  custom_variables?: Record<string, string>;
};

export interface SenderClient {
  listCampaigns(): Promise<InstantlyCampaign[]>;
  addLeads(campaignId: string, leads: InstantlyLead[]): Promise<{ uploaded: number; skipped: number; raw: unknown }>;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!instantlyConfigured()) throw new Error("Instantly is not connected (INSTANTLY_API_KEY is not set in Railway → web → Variables).");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`, ...(init.headers || {}) },
    cache: "no-store",
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`Instantly API ${res.status}: ${text.slice(0, 300)}`);
  return json as T;
}

export const instantly: SenderClient = {
  async listCampaigns() {
    const r = await call<{ items: InstantlyCampaign[] }>("/api/v2/campaigns?limit=100");
    return r.items ?? [];
  },
  async addLeads(campaignId, leads) {
    const r = await call<Record<string, unknown>>("/api/v2/leads/add", {
      method: "POST",
      body: JSON.stringify({ campaign_id: campaignId, leads, skip_if_in_workspace: true }),
    });
    const uploaded = Number(r.leads_uploaded ?? r.uploaded ?? leads.length);
    return { uploaded, skipped: leads.length - uploaded, raw: r };
  },
};
