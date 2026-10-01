"use client";
import { useCallback, useEffect, useState } from "react";
import { ScorePill, StatusBadge } from "./ui";

type Detail = {
  org: Record<string, any>;
  contacts: Array<Record<string, any>>;
  research: Array<Record<string, any>>;
  queue: Record<string, any> | null;
  discovery: Array<Record<string, any>>;
  outreach: Array<Record<string, any>>;
  suppression: Array<Record<string, any>>;
};

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");

export default function LeadDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged?: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const res = await fetch(`/api/leads/${id}`);
    const j = await res.json();
    if (!res.ok) setErr(j.error); else setD(j);
  }, [id]);
  useEffect(() => { setD(null); load(); }, [load]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function decide(decision: string) {
    setBusy(true); setNote(null);
    const res = await fetch(`/api/approval/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
    const j = await res.json(); setBusy(false);
    setNote(res.ok ? "Saved." : `Error: ${j.error}`);
    await load(); onChanged?.();
  }
  async function research() {
    setBusy(true); setNote(null);
    const res = await fetch(`/api/research/${id}`, { method: "POST" });
    const j = await res.json(); setBusy(false);
    setNote(res.ok ? "Research saved." : j.notConfigured ? "Server-side Claude research isn't configured yet — marked for research from a Claude session instead." : `Error: ${j.error}`);
    if (!res.ok && j.notConfigured) await fetch(`/api/approval/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "needs_research" }) });
    await load(); onChanged?.();
  }

  const o = d?.org;
  const primary = d?.contacts.find((c) => c.is_primary) ?? d?.contacts[0];
  const others = d?.contacts.filter((c) => c !== primary) ?? [];
  const r = d?.research[0];
  const sb = o?.score_breakdown ?? {};
  const status = d?.queue?.status as string | undefined;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={o ? `Lead: ${o.company_name}` : "Lead details"}>
        <div className="drawer-head">
          <div>
            <h2 style={{ fontSize: 17 }}>{o?.company_name ?? "Loading…"}</h2>
            {o && <p className="muted small" style={{ marginTop: 3 }}>{[o.business_type, o.city, o.state].filter(Boolean).join(" · ")}</p>}
            {o && <div style={{ display: "flex", gap: 6, marginTop: 8 }}><ScorePill score={o.lead_score} /><span className="badge">{o.score_band}</span><StatusBadge value={status ?? "Not queued"} /></div>}
          </div>
          <button className="btn sm ghost" onClick={onClose} aria-label="Close lead details">✕</button>
        </div>

        <div className="drawer-body">
          {err && <div className="notice bad" style={{ marginTop: 12 }}>{err}</div>}
          {d && o && (
            <>
              {d.suppression.length > 0 && <div className="notice bad" style={{ marginTop: 12 }}><div><b>Suppressed — will never enter outreach</b>{d.suppression.map((s) => `${s.suppression_type}: ${s.reason ?? ""}`).join("; ")}</div></div>}

              <div className="drawer-section">
                <h3>Company</h3>
                <dl className="kv">
                  <dt>Category</dt><dd>{o.business_type ?? "—"}</dd>
                  <dt>Industry</dt><dd>{o.industry ?? "—"}{o.naics_code ? <span className="faint small"> · NAICS {o.naics_code}</span> : null}</dd>
                  <dt>Size</dt><dd>{o.employee_range ?? "—"}</dd>
                  <dt>Location</dt><dd>{[o.address, o.city, o.state, o.postal_code].filter(Boolean).join(", ") || "—"}</dd>
                  <dt>Website</dt><dd>{o.website ? <a className="link" href={o.website} target="_blank" rel="noreferrer">{o.domain || o.website} ↗</a> : "—"}</dd>
                  <dt>Main phone</dt><dd className="num">{o.main_phone ?? "—"}</dd>
                  <dt>Source</dt><dd>{o.source} · first found {fmt(o.first_found_at)}</dd>
                </dl>
              </div>

              <div className="drawer-section">
                <h3>Primary contact</h3>
                {primary ? (
                  <dl className="kv">
                    <dt>Name</dt><dd><b>{primary.full_name ?? "—"}</b></dd>
                    <dt>Title</dt><dd>{primary.title ?? "—"}</dd>
                    <dt>Email</dt><dd>{primary.email ?? "—"} {primary.email && <StatusBadge value={primary.email_status} />}{primary.email_verified_at && <span className="faint small"> · verified {fmt(primary.email_verified_at)}</span>}</dd>
                    <dt>Phone</dt><dd className="num">{primary.phone ?? "—"}</dd>
                    <dt>LinkedIn</dt><dd>{primary.linkedin_url ? <a className="link" href={primary.linkedin_url} target="_blank" rel="noreferrer">Profile ↗</a> : "—"}</dd>
                  </dl>
                ) : <p className="muted small">No decision maker found yet.</p>}
                {others.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div className="faint small" style={{ marginBottom: 6 }}>Other contacts</div>
                    {others.map((c) => <div key={c.id} className="small" style={{ padding: "4px 0" }}><b>{c.full_name}</b> · {c.title ?? "—"} · {c.email ?? "no email"} {c.email && <StatusBadge value={c.email_status} />}</div>)}
                  </div>
                )}
              </div>

              <div className="drawer-section">
                <h3>Score — {o.lead_score}/100</h3>
                <div className="grid g-4" style={{ gap: 8, marginBottom: 10 }}>
                  {[["Fit", sb.fit, 40], ["Contact", sb.contact, 25], ["Data", sb.dataQuality, 20], ["Opportunity", sb.opportunity, 15]].map(([l, v, m]) => (
                    <div key={l as string} className="kpi" style={{ minHeight: 0, padding: "8px 10px" }}><span className="kpi-label">{l}</span><span className="num" style={{ fontWeight: 700 }}>{v ?? 0}<span className="faint">/{m}</span></span></div>
                  ))}
                </div>
                <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>{(sb.reasons ?? []).map((x: string) => <li key={x}>{x}</li>)}</ul>
              </div>

              <div className="drawer-section">
                <h3>Claude research</h3>
                {r ? (
                  <dl className="kv">
                    <dt>Business summary</dt><dd>{r.business_summary}</dd>
                    <dt>Likely cleaning need</dt><dd>{r.likely_cleaning_need || "—"}</dd>
                    <dt>Personalization</dt><dd>{r.personalization_note || "—"}</dd>
                    <dt>Outreach angle</dt><dd>{r.outreach_angle || "—"}</dd>
                    <dt>Confidence</dt><dd>{r.confidence}%{r.uncertainty_notes ? <div className="faint small">{r.uncertainty_notes}</div> : null}</dd>
                    <dt>Sources</dt><dd>{(r.sources_used ?? []).map((s: string) => <div key={s}><a className="link small" href={s} target="_blank" rel="noreferrer">{s}</a></div>)}</dd>
                  </dl>
                ) : <p className="muted small">Not researched yet. Research runs only on qualified leads.</p>}
              </div>

              <div className="drawer-section">
                <h3>Activity</h3>
                <ul className="timeline">
                  {d.discovery.map((x, i) => <li key={`d${i}`}><span>{fmt(x.found_at)}</span><span>{x.was_duplicate ? "Seen again" : "Found"} via {x.source}</span></li>)}
                  {d.research.map((x) => <li key={x.id}><span>{fmt(x.researched_at)}</span><span>Researched ({x.model})</span></li>)}
                  {d.queue && <li><span>{fmt(d.queue.queued_at)}</span><span>Queued — {d.queue.why_selected}</span></li>}
                  {d.queue?.reviewed_at && <li><span>{fmt(d.queue.reviewed_at)}</span><span>{d.queue.status}</span></li>}
                  {d.outreach.map((x, i) => <li key={`o${i}`}><span>{fmt(x.occurred_at)}</span><span>{x.event_type.replace(/_/g, " ")}{x.reply_classification ? ` · ${x.reply_classification}` : ""}</span></li>)}
                </ul>
              </div>
            </>
          )}
        </div>

        <div className="drawer-actions">
          <button className="btn approve" disabled={busy || !d || status === "Approved" || d.suppression.length > 0} onClick={() => decide("approve")}>Approve</button>
          <button className="btn" disabled={busy || !d} onClick={() => decide("reject")}>Reject</button>
          <button className="btn" disabled={busy || !d} onClick={research}>Research{r ? " again" : ""}</button>
          <button className="btn danger" disabled={busy || !d} onClick={() => decide("suppress")}>Suppress</button>
          <button className="btn" disabled title="No sender connected yet">Add to Campaign</button>
          {o?.website && <a className="btn" href={o.website} target="_blank" rel="noreferrer">Website ↗</a>}
          {primary?.linkedin_url && <a className="btn" href={primary.linkedin_url} target="_blank" rel="noreferrer">LinkedIn ↗</a>}
          {note && <span className="small muted" role="status" style={{ alignSelf: "center" }}>{note}</span>}
        </div>
      </aside>
    </>
  );
}
