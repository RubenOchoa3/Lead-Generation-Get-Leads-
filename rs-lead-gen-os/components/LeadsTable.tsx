"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScorePill, StatusBadge, Empty } from "./ui";
import LeadDrawer from "./LeadDrawer";

export type LeadRow = {
  id: string; company_name: string; business_type: string | null; city: string | null; county: string | null; website: string | null;
  domain: string | null; source: string; lead_score: number; score_band: string; pipeline_status: string; first_found_at: string;
  updated_at: string; full_name: string | null; title: string | null; email: string | null; email_status: string | null; phone: string | null;
  linkedin_url: string | null; approval_status: string | null; researched: boolean; last_out: string | null; sent: boolean | null;
};

const COLUMNS: Array<{ key: string; label: string; default: boolean }> = [
  { key: "type", label: "Business Type", default: true }, { key: "city", label: "City", default: true }, { key: "county", label: "County", default: false },
  { key: "website", label: "Website", default: false }, { key: "dm", label: "Decision Maker", default: true }, { key: "email", label: "Email", default: true },
  { key: "phone", label: "Phone", default: false }, { key: "linkedin", label: "LinkedIn", default: false }, { key: "source", label: "Source", default: false },
  { key: "score", label: "Score", default: true }, { key: "research", label: "Research", default: true }, { key: "approval", label: "Approval", default: true },
  { key: "outreach", label: "Outreach", default: false }, { key: "found", label: "Date Found", default: true },
];

export default function LeadsTable({ rows, total, page, pageSize, params, types, cities }: {
  rows: LeadRow[]; total: number; page: number; pageSize: number; params: Record<string, string>; types: string[]; cities: string[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(params.open ?? null);
  const [cols, setCols] = useState(() => new Set(COLUMNS.filter((c) => c.default).map((c) => c.key)));
  const [showCols, setShowCols] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState(params.q ?? "");

  useEffect(() => setSelected(new Set()), [rows]);

  function setParam(k: string, v: string | null) {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v); else next.delete(k);
    if (k !== "page") next.delete("page");
    next.delete("open");
    router.push(`/leads?${next.toString()}`);
  }
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function bulk(decision: string) {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/leads/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [...selected], decision }) });
    const j = await res.json(); setBusy(false);
    setMsg(res.ok ? `Updated ${j.updated} lead${j.updated === 1 ? "" : "s"}.` : `Error: ${j.error}`);
    router.refresh();
  }

  const show = (k: string) => cols.has(k);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const active = useMemo(() => ["type", "city", "approval", "band", "verified", "min", "found", "q"].filter((k) => params[k]), [params]);

  return (
    <section className="panel">
      <div className="toolbar">
        <form onSubmit={(e) => { e.preventDefault(); setParam("q", q || null); }} style={{ display: "flex", gap: 6 }}>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search leads" style={{ width: 200 }} />
        </form>
        <select aria-label="Business type" value={params.type ?? ""} onChange={(e) => setParam("type", e.target.value || null)}>
          <option value="">All business types</option>{types.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select aria-label="City" value={params.city ?? ""} onChange={(e) => setParam("city", e.target.value || null)}>
          <option value="">All cities</option>{cities.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select aria-label="Score band" value={params.band ?? ""} onChange={(e) => setParam("band", e.target.value || null)}>
          <option value="">All scores</option>{["Priority", "Good", "Review", "Hold"].map((t) => <option key={t}>{t}</option>)}
        </select>
        <select aria-label="Approval status" value={params.approval ?? ""} onChange={(e) => setParam("approval", e.target.value || null)}>
          <option value="">Any approval</option>{["Needs Review", "Approved", "Rejected", "Suppressed", "Needs Research", "Not queued"].map((t) => <option key={t}>{t}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={params.verified === "1"} onChange={(e) => setParam("verified", e.target.checked ? "1" : null)} />Verified email</label>
        <span className="spacer" />
        <select aria-label="Sort" value={params.sort ?? "score"} onChange={(e) => setParam("sort", e.target.value)}>
          <option value="score">Sort: Score</option><option value="newest">Sort: Newest</option><option value="company">Sort: Company</option><option value="city">Sort: City</option>
        </select>
        <div style={{ position: "relative" }}>
          <button className="btn sm" type="button" aria-expanded={showCols} onClick={() => setShowCols((v) => !v)}>Columns</button>
          {showCols && (
            <div className="panel" style={{ position: "absolute", right: 0, top: 36, zIndex: 30, padding: 10, width: 200 }}>
              {COLUMNS.map((c) => (
                <label className="check" key={c.key}><input type="checkbox" checked={cols.has(c.key)} onChange={() => setCols((s) => { const n = new Set(s); if (n.has(c.key)) n.delete(c.key); else n.add(c.key); return n; })} />{c.label}</label>
              ))}
            </div>
          )}
        </div>
        {active.length > 0 && <button className="btn sm ghost" type="button" onClick={() => router.push("/leads")}>Clear filters</button>}
      </div>

      {selected.size > 0 && (
        <div style={{ padding: "10px 12px 0" }}>
          <div className="bulkbar" role="region" aria-label="Bulk actions">
            <b>{selected.size} selected</b><span style={{ flex: 1 }} />
            <button className="btn sm approve" disabled={busy} onClick={() => bulk("approve")}>Approve</button>
            <button className="btn sm" disabled={busy} onClick={() => bulk("reject")}>Reject</button>
            <button className="btn sm" disabled={busy} onClick={() => bulk("needs_research")}>Mark for research</button>
            <button className="btn sm" disabled={busy} onClick={() => bulk("suppress")}>Suppress</button>
            <button className="btn sm" disabled title="No sender connected yet">Add to Campaign</button>
            <a className="btn sm" href={`/api/export?ids=${[...selected].join(",")}`}>Export</a>
          </div>
        </div>
      )}
      {msg && <p className="small" style={{ padding: "8px 12px 0" }} role="status">{msg}</p>}

      {rows.length === 0 ? <Empty title="No leads match">Run a search on Find Leads, or import a Getlead export.</Empty> : (
        <div className="table-wrap" style={{ maxHeight: "calc(100vh - 260px)" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 34 }}><input type="checkbox" aria-label="Select all on page" checked={allChecked} onChange={toggleAll} /></th>
                <th>Company</th>
                {show("type") && <th>Business Type</th>}{show("city") && <th>City</th>}{show("county") && <th>County</th>}
                {show("website") && <th>Website</th>}{show("dm") && <th>Decision Maker</th>}{show("email") && <th>Email</th>}
                {show("phone") && <th>Phone</th>}{show("linkedin") && <th>LinkedIn</th>}{show("source") && <th>Source</th>}
                {show("score") && <th>Score</th>}{show("research") && <th>Research</th>}{show("approval") && <th>Approval</th>}
                {show("outreach") && <th>Outreach</th>}{show("found") && <th>Found</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={selected.has(r.id) ? "selected" : openId === r.id ? "focus" : ""}>
                  <td><input type="checkbox" aria-label={`Select ${r.company_name}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                  <td><button className="row-btn" onClick={() => setOpenId(r.id)}><div className="cell-main">{r.company_name}</div>{r.domain && <div className="cell-sub">{r.domain}</div>}</button></td>
                  {show("type") && <td>{r.business_type || "—"}</td>}
                  {show("city") && <td>{r.city || "—"}</td>}
                  {show("county") && <td>{r.county || "—"}</td>}
                  {show("website") && <td>{r.website ? <a className="link" href={r.website} target="_blank" rel="noreferrer">Open ↗</a> : "—"}</td>}
                  {show("dm") && <td>{r.full_name ? <><div>{r.full_name}</div><div className="cell-sub">{r.title}</div></> : <span className="faint">None found</span>}</td>}
                  {show("email") && <td>{r.email ? <><div>{r.email}</div><StatusBadge value={r.email_status} /></> : <span className="faint">—</span>}</td>}
                  {show("phone") && <td className="num">{r.phone || "—"}</td>}
                  {show("linkedin") && <td>{r.linkedin_url ? <a className="link" href={r.linkedin_url} target="_blank" rel="noreferrer">Profile ↗</a> : "—"}</td>}
                  {show("source") && <td>{r.source}</td>}
                  {show("score") && <td><ScorePill score={r.lead_score} /></td>}
                  {show("research") && <td>{r.researched ? <span className="badge ok">Done</span> : <span className="faint small">—</span>}</td>}
                  {show("approval") && <td><StatusBadge value={r.approval_status || "Not queued"} /></td>}
                  {show("outreach") && <td>{r.sent ? "Sent" : "—"}</td>}
                  {show("found") && <td className="num">{new Date(r.first_found_at).toLocaleDateString()}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pager">
        <span>Page {page} of {pages} · {total.toLocaleString()} total</span>
        <div className="actions">
          <button className="btn sm" disabled={page <= 1} onClick={() => setParam("page", String(page - 1))}>Previous</button>
          <button className="btn sm" disabled={page >= pages} onClick={() => setParam("page", String(page + 1))}>Next</button>
        </div>
      </div>
      {openId && <LeadDrawer id={openId} onClose={() => setOpenId(null)} onChanged={() => router.refresh()} />}
    </section>
  );
}
