import type { ReactNode } from "react";

export function Panel({ title, sub, action, children, pad = true }: { title?: ReactNode; sub?: ReactNode; action?: ReactNode; children: ReactNode; pad?: boolean }) {
  return (
    <section className="panel">
      {title && <div className="panel-head"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>{action}</div>}
      <div className={pad ? "panel-body" : ""}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, sub, href, na }: { label: string; value: ReactNode; sub?: ReactNode; href?: string; na?: boolean }) {
  const body = <><span className="kpi-label">{label}</span><span className="kpi-value">{value}</span>{sub && <span className="kpi-sub">{sub}</span>}</>;
  return href ? <a className={`kpi${na ? " na" : ""}`} href={href}>{body}</a> : <div className={`kpi${na ? " na" : ""}`}>{body}</div>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><b>{title}</b>{children}</div>;
}

export function ScorePill({ score }: { score: number | null | undefined }) {
  const s = Number(score || 0);
  const cls = s >= 80 ? "priority" : s >= 65 ? "good" : s >= 50 ? "review" : "";
  return <span className={`score ${cls}`} title={s >= 80 ? "Priority" : s >= 65 ? "Good" : s >= 50 ? "Review" : "Hold"}>{s}</span>;
}

export function StatusBadge({ value }: { value?: string | null }) {
  const v = value || "—";
  const tone = /approved|healthy|active|valid|complete|propagated|connected|configured|ok/i.test(v) ? "ok"
    : /reject|suppress|fail|invalid|critical|issue|error|not_connected|not connected/i.test(v) ? "bad"
    : /review|pending|warming|running|catch_all|unknown|research|not_configured|not configured/i.test(v) ? "warn" : "";
  return <span className={`badge ${tone}`}>{v.replace(/_/g, " ")}</span>;
}

export function Bars({ items, empty = "No data yet" }: { items: Array<{ label: string; value: number }>; empty?: string }) {
  if (!items.length) return <Empty title={empty} />;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="bars">
      {items.map((i) => (
        <div className="bar-row" key={i.label}>
          <span title={i.label}>{i.label}</span>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(2, (i.value / max) * 100)}%` }} /></div>
          <b>{i.value.toLocaleString()}</b>
        </div>
      ))}
    </div>
  );
}

export function Funnel({ steps }: { steps: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="funnel">
      {steps.map((s, i) => (
        <div className="funnel-row" key={s.label}>
          <span>{s.label}</span>
          <div><div className="funnel-bar" style={{ width: `${Math.max(0.5, (s.value / max) * 100)}%` }} /></div>
          <b className="num" style={{ textAlign: "right" }}>{s.value.toLocaleString()}{i > 0 && steps[i - 1].value > 0 ? <span className="faint small"> {Math.round((s.value / steps[i - 1].value) * 100)}%</span> : null}</b>
        </div>
      ))}
    </div>
  );
}

/** Multi-series line chart (dependency-free SVG). */
export function LineChart({ labels, series, height = 220 }: { labels: string[]; series: Array<{ name: string; color: string; values: number[] }>; height?: number }) {
  const W = 760, H = height, padL = 34, padR = 10, padT = 10, padB = 26;
  const max = Math.max(4, ...series.flatMap((s) => s.values));
  const nice = Math.ceil(max / 4) * 4;
  const x = (i: number) => padL + (labels.length <= 1 ? 0 : (i * (W - padL - padR)) / (labels.length - 1));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / nice);
  const step = Math.ceil(labels.length / 8);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map((s) => s.name).join(", ") + " over time"}>
        {[0, 1, 2, 3, 4].map((t) => { const v = (nice / 4) * t; return <g key={t}><line className="grid-line" x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} /><text x={padL - 6} y={y(v) + 4} textAnchor="end">{v}</text></g>; })}
        {labels.map((l, i) => (i % step === 0 ? <text key={l + i} x={x(i)} y={H - 6} textAnchor="middle">{l}</text> : null))}
        {series.map((s) => (
          <g key={s.name}>
            <polyline fill="none" stroke={s.color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
            {s.values.map((v, i) => v > 0 ? <circle key={i} cx={x(i)} cy={y(v)} r={2.6} fill={s.color}><title>{`${s.name} · ${labels[i]}: ${v}`}</title></circle> : null)}
          </g>
        ))}
      </svg>
      <div className="legend">{series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>
    </div>
  );
}

export function DbError({ error }: { error: unknown }) {
  const msg = String((error as Error)?.message ?? error);
  return (
    <div className="notice bad"><div><b>Database unavailable</b>{msg}</div></div>
  );
}
