"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Empty, ScorePill, StatusBadge } from "./ui";
import LeadDrawer from "./LeadDrawer";

type Item = {
  id: string; company_name: string; business_type: string | null; city: string | null; lead_score: number; score_band: string; source: string;
  website: string | null; main_phone: string | null; full_name: string | null; title: string | null; email: string | null; email_status: string | null;
  phone: string | null; status: string; why_selected: string | null; personalization_note: string | null; outreach_angle: string | null; confidence: number | null;
};

export default function ApprovalQueue({ items, tab }: { items: Item[]; tab: string }) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [type, setType] = useState("");
  const [min, setMin] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const visible = useMemo(() => items.filter((i) => !hidden.has(i.id) && (!type || i.business_type === type) && i.lead_score >= min), [items, hidden, type, min]);
  const types = useMemo(() => [...new Set(items.map((i) => i.business_type).filter(Boolean))] as string[], [items]);

  const decide = useCallback(async (ids: string[], decision: string) => {
    if (!ids.length) return;
    setErr(null);
    setHidden((h) => new Set([...h, ...ids])); // optimistic
    const res = ids.length === 1
      ? await fetch(`/api/approval/${ids[0]}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) })
      : await fetch(`/api/leads/bulk`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, decision }) });
    if (!res.ok) {
      setHidden((h) => { const n = new Set(h); ids.forEach((i) => n.delete(i)); return n; });
      setErr((await res.json()).error ?? "Save failed");
    }
    setSel(new Set());
    router.refresh();
  }, [router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (openId) return;
      const t = e.target as HTMLElement;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      const cur = visible[Math.min(focus, visible.length - 1)];
      const k = e.key.toLowerCase();
      if (k === "j") { setFocus((f) => Math.min(f + 1, visible.length - 1)); e.preventDefault(); }
      else if (k === "k") { setFocus((f) => Math.max(f - 1, 0)); e.preventDefault(); }
      else if (cur && k === "a" && tab !== "Approved") decide([cur.id], "approve");
      else if (cur && k === "r") decide([cur.id], "reject");
      else if (cur && k === "s") decide([cur.id], "suppress");
      else if (cur && k === "o") setOpenId(cur.id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, focus, decide, openId, tab]);

  useEffect(() => { document.getElementById(`q-${visible[focus]?.id}`)?.scrollIntoView({ block: "nearest" }); }, [focus, visible]);

  return (
    <section className="panel">
      <div className="toolbar">
        <input type="checkbox" aria-label="Select all visible" checked={visible.length > 0 && visible.every((v) => sel.has(v.id))}
          onChange={(e) => setSel(e.target.checked ? new Set(visible.map((v) => v.id)) : new Set())} />
        <select aria-label="Business type" value={type} onChange={(e) => setType(e.target.value)}><option value="">All business types</option>{types.map((t) => <option key={t}>{t}</option>)}</select>
        <select aria-label="Minimum score" value={min} onChange={(e) => setMin(Number(e.target.value))}>
          <option value={0}>Any score</option><option value={65}>65+ Good</option><option value={80}>80+ Priority</option>
        </select>
        <span className="spacer" />
        <span className="small muted">{visible.length} shown</span>
        {sel.size > 0 && <>
          {tab !== "Approved" && <button className="btn sm approve" onClick={() => decide([...sel], "approve")}>Approve {sel.size}</button>}
          <button className="btn sm" onClick={() => decide([...sel], "reject")}>Reject {sel.size}</button>
          <button className="btn sm" onClick={() => decide([...sel], "suppress")}>Suppress {sel.size}</button>
        </>}
      </div>
      {err && <div className="notice bad" style={{ margin: 12 }}>{err}</div>}
      {visible.length === 0 ? <Empty title={tab === "Needs Review" ? "Queue is clear" : `No leads in “${tab}”`}>{tab === "Needs Review" ? "Qualified leads from the next Getlead run will appear here." : null}</Empty> :
        visible.map((i, idx) => (
          <article id={`q-${i.id}`} key={i.id} className={`queue-card${idx === focus ? " focus" : ""}`} onClick={() => setFocus(idx)}>
            <input type="checkbox" aria-label={`Select ${i.company_name}`} checked={sel.has(i.id)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <ScorePill score={i.lead_score} />
                <button className="row-btn" onClick={() => setOpenId(i.id)}><span className="cell-main" style={{ fontSize: 14.5 }}>{i.company_name}</span></button>
                <span className="badge">{i.business_type ?? "Unclassified"}</span>
              </div>
              <div className="queue-meta">
                <span>{i.city ?? "—"}</span>
                <span><b style={{ color: "var(--ink)" }}>{i.full_name ?? "No contact"}</b>{i.title ? ` · ${i.title}` : ""}</span>
                <span>{i.email ?? "no email"} {i.email && <StatusBadge value={i.email_status} />}</span>
                {(i.phone || i.main_phone) && <span className="num">{i.phone || i.main_phone}</span>}
                <span>Source: {i.source}</span>
              </div>
              {i.why_selected && <div className="queue-note"><span className="faint">Why selected:</span> {i.why_selected}</div>}
              {i.personalization_note || i.outreach_angle
                ? <div className="queue-note"><span className="faint">Claude:</span> {i.personalization_note} {i.outreach_angle && <><span className="faint"> Angle:</span> {i.outreach_angle}</>}</div>
                : <div className="queue-note faint small">No Claude research yet.</div>}
            </div>
            <div className="queue-actions">
              {tab !== "Approved" && <button className="btn sm approve" onClick={() => decide([i.id], "approve")}>Approve</button>}
              <button className="btn sm" onClick={() => decide([i.id], "reject")}>Reject</button>
              <button className="btn sm" onClick={() => setOpenId(i.id)}>Open</button>
              <button className="btn sm danger" onClick={() => decide([i.id], "suppress")}>Suppress</button>
              {tab !== "Needs Review" && <button className="btn sm ghost" onClick={() => decide([i.id], "reopen")}>Back to review</button>}
            </div>
          </article>
        ))}
      {openId && <LeadDrawer id={openId} onClose={() => setOpenId(null)} onChanged={() => router.refresh()} />}
    </section>
  );
}
