"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Campaign = { id: string; name: string; status: string; senders: number };
type Result = {
  campaign: { name: string; status: string }; dryRun: boolean; added: number; skippedBySender: number;
  ready: { company: string; email: string }[]; blocked: { company: string; email: string | null; reasons: string[] }[];
};

/** Preview first, then add. Adding leads never launches the campaign — that stays a manual step in Instantly. */
export default function CampaignPush({ campaigns }: { campaigns: Campaign[] }) {
  const router = useRouter();
  const [id, setId] = useState(campaigns.find((c) => c.status === "Draft")?.id ?? campaigns[0]?.id ?? "");
  const [limit, setLimit] = useState(90);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const selected = campaigns.find((c) => c.id === id);

  async function run(dryRun: boolean) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/campaigns/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId: id, dryRun, limit: limit > 0 ? limit : undefined }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Request failed");
      setRes(j);
      if (!dryRun) router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  if (!campaigns.length) return <p className="muted">No campaigns in Instantly yet. Create one there first.</p>;
  return (
    <div>
      <div className="actions" style={{ gap: 8, flexWrap: "wrap" }}>
        <select value={id} onChange={(e) => { setId(e.target.value); setRes(null); }}>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.status}</option>)}
        </select>
        <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>How many (best scores first)
          <input type="number" min={1} max={5000} value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setRes(null); }} style={{ width: 90 }} /></label>
        <button className="btn" disabled={busy || !id} onClick={() => run(true)}>{busy ? "Checking…" : "Preview approved leads"}</button>
        {res?.dryRun && res.ready.length > 0 && (
          <button className="btn primary" disabled={busy} onClick={() => run(false)}>Add {res.ready.length} lead{res.ready.length === 1 ? "" : "s"} to campaign</button>
        )}
      </div>
      {selected && selected.senders === 0 && (
        <div className="notice"><div><b>This campaign has no sending mailboxes yet.</b>Leads can be added now, but Instantly can&rsquo;t send until mailboxes are attached and warmed up.</div></div>
      )}
      {err && <div className="notice bad"><div><b>Couldn&rsquo;t complete that</b>{err}</div></div>}
      {res && (
        <div style={{ marginTop: 12 }}>
          {res.dryRun
            ? <p><b>{res.ready.length}</b> approved lead{res.ready.length === 1 ? "" : "s"} can be added to <b>{res.campaign.name}</b>. {res.blocked.length} blocked.</p>
            : <p><b>{res.added}</b> added to <b>{res.campaign.name}</b>{res.skippedBySender ? ` (${res.skippedBySender} already in Instantly, skipped)` : ""}. The campaign was <b>not</b> launched — start it in Instantly when you&rsquo;re ready.</p>}
          {res.ready.length > 0 && <ul>{res.ready.map((r) => <li key={r.email}>{r.company} — {r.email}</li>)}</ul>}
          {res.blocked.length > 0 && (<><p className="muted">Blocked (won&rsquo;t be added):</p>
            <ul>{res.blocked.map((b, i) => <li key={i}>{b.company} — {b.email ?? "no email"}: {b.reasons.join(", ")}</li>)}</ul></>)}
          {res.dryRun && res.ready.length === 0 && res.blocked.length === 0 && <p className="muted">No approved leads waiting. Approve leads in the Approval Queue first.</p>}
        </div>
      )}
    </div>
  );
}
