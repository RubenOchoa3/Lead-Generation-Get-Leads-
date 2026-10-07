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

export type InstantlyAccount = { email: string; status: number; warmup_status: number; daily_limit?: number; stat_warmup_score?: number; provider_code?: number };

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

export type InstantlyCampaignDetail = InstantlyCampaign & {
  sequences?: Array<{ steps: Array<{ variants: Array<{ subject: string; body: string }> }> }>;
};

export interface SenderClient {
  listCampaigns(): Promise<InstantlyCampaign[]>;
  listAccounts(): Promise<InstantlyAccount[]>;
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

/** Read a campaign's email copy (for the morning preview). */
export async function getCampaignDetail(id: string) {
  return call<InstantlyCampaignDetail>(`/api/v2/campaigns/${encodeURIComponent(id)}`);
}

/** Sending caps only — used by the weekly ramp. Never changes campaign status. */
export async function setAccountDailyLimit(email: string, dailyLimit: number) {
  await call(`/api/v2/accounts/${encodeURIComponent(email)}`, { method: "PATCH", body: JSON.stringify({ daily_limit: dailyLimit }) });
}
/**
 * A one-email campaign turns "Completed" once every loaded lead has been sent. After the owner approves
 * a new batch, resume it so the new leads go out (never touches a paused campaign).
 */
export async function resumeIfCompleted(id: string) {
  const c = await getCampaignDetail(id);
  if (c.status !== 3) return false;
  await call(`/api/v2/campaigns/${encodeURIComponent(id)}/activate`, { method: "POST", body: "{}" });
  return true;
}
export async function setCampaignDailyLimit(id: string, dailyLimit: number) {
  await call(`/api/v2/campaigns/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ daily_limit: dailyLimit }) });
}

export const instantly: SenderClient = {
  async listCampaigns() {
    const r = await call<{ items: InstantlyCampaign[] }>("/api/v2/campaigns?limit=100");
    return r.items ?? [];
  },
  async listAccounts() {
    const all: InstantlyAccount[] = [];
    let after: string | undefined;
    for (let page = 0; page < 20; page++) {
      const r = await call<{ items: InstantlyAccount[]; next_starting_after?: string }>(
        `/api/v2/accounts?limit=100${after ? `&starting_after=${encodeURIComponent(after)}` : ""}`);
      all.push(...(r.items ?? []));
      if (!r.next_starting_after || !r.items?.length || r.items.length < 100) break;
      after = r.next_starting_after;
    }
    return all;
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
