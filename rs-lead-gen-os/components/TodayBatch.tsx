"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type BatchLead = {
  contact_id: string; arm: "local" | "big"; company_name: string; full_name: string | null; title: string | null;
  email: string; city: string | null; business_type: string | null; lead_score: number | null; employee_range: string | null;
};

export default function TodayBatch({ batchId, status, leads }: { batchId: string | null; status: string | null; leads: BatchLead[] }) {
  const router = useRouter();
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<null | "build" | "send">(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const count = useMemo(() => leads.filter((l) => !excluded.has(l.contact_id)).length, [leads, excluded]);

  async function build() {
    setBusy("build"); setMsg(null);
    const r = await fetch("/api/today/build", { method: "POST" }); const j = await r.json().catch(() => ({}));
    setBusy(null); if (!r.ok) setMsg({ ok: false, text: j.error ?? "Failed" }); else router.refresh();
  }
  async function send() {
    if (!batchId || !window.confirm(`Approve and send ${count} emails today?`)) return;
    setBusy("send"); setMsg(null);
    const r = await fetch("/api/today/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId, exclude: [...excluded] }) });
    const j = await r.json().catch(() => ({})); setBusy(null);
    if (!r.ok) { setMsg({ ok: false, text: j.error ?? "Failed" }); return; }
    const parts = Object.entries(j.summary ?? {}).map(([arm, v]: any) => `${arm === "local" ? "Local" : "Big companies"}: ${v.added} added${v.blocked ? `, ${v.blocked} blocked` : ""}`);
    setMsg({ ok: true, text: `Approved. ${parts.join(" · ")}. They send today between 8 AM and 12 PM (or the next weekday morning).` });
    router.refresh();
  }

  if (!batchId) return (
    <div className="actions"><button className="btn primary" disabled={!!busy} onClick={build}>{busy ? "Finding today's leads… (up to a few minutes)" : "Build today's batch now"}</button>
      {msg && <span className="small bad">{msg.text}</span>}</div>
  );

  const toggle = (id: string) => setExcluded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <div>
      {status === "ready" && (
        <div className="actions" style={{ marginBottom: 12 }}>
          <button className="btn primary" disabled={!!busy || count === 0} onClick={send}>{busy === "send" ? "Sending…" : `Approve & send ${count}`}</button>
          <span className="small muted">Untick anyone you don&rsquo;t want emailed.</span>
          {msg && <span className={`small ${msg.ok ? "" : "bad"}`} role="status">{msg.text}</span>}
        </div>
      )}
      {status !== "ready" && msg && <p className="small">{msg.text}</p>}
      <div className="table-wrap"><table>
        <thead><tr>{status === "ready" && <th>Send</th>}<th>Group</th><th>Company</th><th>Person</th><th>Title</th><th>Email</th><th>City</th><th>Type</th><th>Score</th></tr></thead>
        <tbody>{leads.map((l) => (
          <tr key={l.contact_id} style={excluded.has(l.contact_id) ? { opacity: 0.45 } : undefined}>
            {status === "ready" && <td><input type="checkbox" aria-label={`Send to ${l.full_name ?? l.email}`} checked={!excluded.has(l.contact_id)} onChange={() => toggle(l.contact_id)} /></td>}
            <td className="small">{l.arm === "local" ? "Local" : "Big co. (test)"}</td>
            <td className="cell-main">{l.company_name}</td><td>{l.full_name ?? "—"}</td><td className="small">{l.title ?? "—"}</td>
            <td className="small">{l.email}</td><td className="small">{l.city ?? "—"}</td><td className="small">{l.business_type ?? "—"}</td>
            <td className="num">{l.lead_score ?? "—"}</td>
          </tr>))}</tbody>
      </table></div>
    </div>
  );
}
