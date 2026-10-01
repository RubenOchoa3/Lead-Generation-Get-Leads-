"use client";
import { useState } from "react";

type S = { business?: any; territory?: any; thresholds?: any; limits?: any; schedule?: any; decision_maker_priority?: string[] };

export default function SettingsForm({ initial }: { initial: S }) {
  const [s, setS] = useState<S>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  async function save(key: keyof S) {
    setMsg(null);
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value: s[key] }) });
    setMsg(res.ok ? `Saved ${key.replace(/_/g, " ")}.` : `Error saving ${key}: ${(await res.json()).error}`);
  }
  const set = (key: keyof S, field: string, v: unknown) => setS((x) => ({ ...x, [key]: { ...(x[key] as object), [field]: v } }));
  return (
    <div className="grid g-2">
      <section className="panel"><div className="panel-head"><h2>Territory</h2><button className="btn sm" onClick={() => save("territory")}>Save</button></div><div className="panel-body" style={{ display: "grid", gap: 10 }}>
        <label>Target cities (comma separated)<input value={(s.territory?.cities ?? []).join(", ")} onChange={(e) => set("territory", "cities", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} /></label>
        <label>Target counties<input value={(s.territory?.counties ?? []).join(", ")} onChange={(e) => set("territory", "counties", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} /></label>
      </div></section>
      <section className="panel"><div className="panel-head"><h2>Thresholds &amp; limits</h2><button className="btn sm" onClick={async () => { await save("thresholds"); await save("limits"); }}>Save</button></div><div className="panel-body" style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
        <label>Qualification threshold<input type="number" value={s.thresholds?.qualify ?? 65} onChange={(e) => set("thresholds", "qualify", Number(e.target.value))} /></label>
        <label>Research threshold<input type="number" value={s.thresholds?.research ?? 65} onChange={(e) => set("thresholds", "research", Number(e.target.value))} /></label>
        <label>Queue threshold<input type="number" value={s.thresholds?.queue ?? 65} onChange={(e) => set("thresholds", "queue", Number(e.target.value))} /></label>
        <label>Daily lead target<input type="number" value={s.limits?.daily_lead_target ?? 100} onChange={(e) => set("limits", "daily_lead_target", Number(e.target.value))} /></label>
        <label>Max run size<input type="number" value={s.limits?.max_run_size ?? 500} onChange={(e) => set("limits", "max_run_size", Number(e.target.value))} /></label>
        <label>Daily research limit<input type="number" value={s.limits?.daily_research_limit ?? 100} onChange={(e) => set("limits", "daily_research_limit", Number(e.target.value))} /></label>
      </div></section>
      <section className="panel"><div className="panel-head"><h2>Decision-maker priority</h2><button className="btn sm" onClick={() => save("decision_maker_priority")}>Save</button></div><div className="panel-body">
        <label>One title per line, best first<textarea rows={10} value={(s.decision_maker_priority ?? []).join("\n")} onChange={(e) => setS((x) => ({ ...x, decision_maker_priority: e.target.value.split("\n").map((t) => t.trim()).filter(Boolean) }))} /></label>
      </div></section>
      <section className="panel"><div className="panel-head"><h2>Schedule</h2><button className="btn sm" onClick={() => save("schedule")}>Save</button></div><div className="panel-body" style={{ display: "grid", gap: 10 }}>
        <label>Daily Lead Engine time<input value={s.schedule?.daily_lead_engine ?? ""} onChange={(e) => set("schedule", "daily_lead_engine", e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={!!s.schedule?.enabled} onChange={(e) => set("schedule", "enabled", e.target.checked)} />Enable daily engine (finds &amp; queues leads only — never sends)</label>
        {msg && <p className="small" role="status">{msg}</p>}
      </div></section>
    </div>
  );
}
