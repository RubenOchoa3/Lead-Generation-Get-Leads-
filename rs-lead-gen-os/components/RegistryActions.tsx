"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegistryActions() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/registry/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ daysBack: 7 }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: j.error ?? `Failed (${res.status})` }); return; }
    const e = j.enriched ?? {};
    setMsg({ ok: true, text: `${j.pulled?.added ?? 0} new businesses pulled · ${e.checked ?? 0} looked up in Getlead · ${e.contactFound ?? 0} contacts found (${e.queued ?? 0} queued) · ${e.callOrVisit ?? 0} added to the call / visit list` });
    router.refresh();
  }
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <button className="btn primary" disabled={busy} onClick={run}>{busy ? "Pulling… (up to a few minutes)" : "Pull new businesses now"}</button>
      <a className="btn" href="/api/registry/export?status=call_or_visit">Download call / visit list (CSV)</a>
      {msg && <span className={`small ${msg.ok ? "" : "bad"}`} role="status">{msg.text}</span>}
    </div>
  );
}
