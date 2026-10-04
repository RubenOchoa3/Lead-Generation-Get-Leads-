"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { TARGET_CATEGORIES, DEFAULT_CITIES, DEFAULT_TITLES, COUNTRIES, US_STATES, ALL_STATES } from "@/lib/targets";
import { buildGetleadFilters } from "@/lib/searchFilters";

type Summary = Record<string, number | string[]>;
const STAGES = ["Searching", "Deduplicating", "Qualifying", "Decision Makers", "Verifying", "Scoring", "Saving", "Queueing"];

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

function Chips({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o} type="button" className="chip" aria-pressed={value.includes(o)} onClick={() => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])}>{o}</button>
      ))}
    </div>
  );
}

export default function FindLeads({ serverApi, saved }: { serverApi: boolean; saved: Array<{ name: string; filters: any }> }) {
  const [country, setCountry] = useState("United States");
  const [state, setState] = useState("California");
  const [cities, setCities] = useState<string[]>(["Bakersfield"]);
  const [extraCity, setExtraCity] = useState("");
  const [categories, setCategories] = useState<string[]>(TARGET_CATEGORIES.filter((c) => c.default).map((c) => c.label));
  const [titles, setTitles] = useState<string[]>(DEFAULT_TITLES);
  const [verified, setVerified] = useState(true);
  const [phone, setPhone] = useState(false);
  const [minScore, setMinScore] = useState(65);
  const [count, setCount] = useState(100);
  const [addToQueue, setAddToQueue] = useState(true);
  const [nightly, setNightly] = useState(false);
  const [busy, setBusy] = useState<null | "count" | "run" | "import" | "save">(null);
  const [matches, setMatches] = useState<number | null>(null);
  const [error, setError] = useState<{ msg: string; notConfigured?: boolean } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [savedList, setSavedList] = useState(saved);
  const [copied, setCopied] = useState(false);

  const filters = useMemo(() => buildGetleadFilters({ country, state, cities, categories, titles, verified, phone }),
    [country, state, cities, categories, titles, verified, phone]);
  const where = cities.length ? cities.join(", ") : country === "United States" ? (state === ALL_STATES ? "All US states" : `All of ${state}`) : country;

  async function preview() {
    setBusy("count"); setError(null); setMatches(null);
    const res = await fetch("/api/leads/count", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(filters) });
    const j = await res.json(); setBusy(null);
    if (!res.ok) setError({ msg: j.error, notConfigured: j.notConfigured }); else setMatches(j.total);
  }
  async function run() {
    setBusy("run"); setError(null); setSummary(null);
    const res = await fetch("/api/leads/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filters, requestedCount: count, queueThreshold: addToQueue ? minScore : 101, requireVerifiedEmail: verified }) });
    const j = await res.json(); setBusy(null);
    if (!res.ok) setError({ msg: j.error, notConfigured: j.notConfigured }); else setSummary(j.summary);
  }
  async function importFile(file: File) {
    setBusy("import"); setError(null); setSummary(null);
    try {
      const text = await file.text();
      const rows = file.name.endsWith(".json") ? JSON.parse(text) : parseCsv(text);
      if (!Array.isArray(rows) || !rows.length) throw new Error("No rows found in the file.");
      if (!("Company Name" in rows[0])) throw new Error("This doesn't look like a Getlead export — expected a “Company Name” column.");
      const res = await fetch("/api/ingest/getlead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows, label: file.name, queueThreshold: addToQueue ? minScore : 101, requireVerifiedEmail: verified }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error); setSummary(j.summary);
    } catch (e) { setError({ msg: String((e as Error).message ?? e) }); }
    setBusy(null);
  }
  async function saveSearch() {
    const name = window.prompt("Name this search", `${where} · ${categories.length} categories${nightly ? " · nightly" : ""}`);
    if (!name) return;
    setBusy("save");
    const next = [...savedList.filter((s) => s.name !== name), { name, filters: { country, state, cities, categories, titles, verified, phone, minScore, count, nightly } }];
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "saved_searches", value: next }) });
    setBusy(null); if (res.ok) setSavedList(next);
  }
  function loadSearch(s: { filters: any }) {
    const f = s.filters; setCountry(f.country ?? "United States"); setState(f.state ?? "California"); setNightly(!!f.nightly); setCities(f.cities ?? []); setCategories(f.categories); setTitles(f.titles); setVerified(f.verified); setPhone(f.phone); setMinScore(f.minScore); setCount(f.count);
  }

  const n = (k: string) => (summary ? Number(summary[k] ?? 0) : 0);

  return (
    <>
      <div className="page-head">
        <div><h1>Find Leads</h1><p className="muted">Search Getlead for facilities and their decision makers by country, state or city. Results are deduplicated, scored and queued for your review.</p></div>
        {savedList.length > 0 && (
          <select aria-label="Saved searches" onChange={(e) => { const s = savedList.find((x) => x.name === e.target.value); if (s) loadSearch(s); }} defaultValue="">
            <option value="" disabled>Saved searches…</option>{savedList.map((s) => <option key={s.name}>{s.name}</option>)}
          </select>
        )}
      </div>

      {!serverApi && (
        <div className="notice info"><div>
          <b>Getlead runs through Claude for now.</b>
          This server doesn&rsquo;t have a Getlead API key yet, so live search from this page is off. Two real paths work today: ask Claude to run this search through the connected Getlead MCP (copy the search below), or export a CSV from Getlead and import it here.
        </div></div>
      )}

      <div className="split">
        <aside className="panel filters" aria-label="Search filters">
          <div className="filter-section">
            <h3>Location</h3>
            <label>Country<select value={country} onChange={(e) => setCountry(e.target.value)}>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select></label>
            {country === "United States" && (
              <label>State<select value={state} onChange={(e) => { setState(e.target.value); if (e.target.value !== "California") setCities(cities.filter((c) => !DEFAULT_CITIES.includes(c))); }}>
                <option>{ALL_STATES}</option>{US_STATES.map((st) => <option key={st}>{st}</option>)}
              </select></label>
            )}
            <p className="small faint" style={{ margin: "2px 0 6px" }}>Cities are optional — pick none to search {country === "United States" && state !== ALL_STATES ? `all of ${state}` : "the whole area above"}.</p>
            {country === "United States" && state === "California" && <Chips options={[...new Set([...DEFAULT_CITIES, ...cities])]} value={cities} onChange={setCities} />}
            {!(country === "United States" && state === "California") && cities.length > 0 && <Chips options={cities} value={cities} onChange={setCities} />}
            {cities.length > 0 && <button type="button" className="btn sm" onClick={() => setCities([])}>Clear cities (search whole {country === "United States" && state !== ALL_STATES ? "state" : "area"})</button>}
            <form style={{ display: "flex", gap: 6 }} onSubmit={(e) => { e.preventDefault(); const c = extraCity.trim(); if (c && !cities.includes(c)) setCities([...cities, c]); setExtraCity(""); }}>
              <input aria-label="Add city" placeholder="Add city…" value={extraCity} onChange={(e) => setExtraCity(e.target.value)} style={{ flex: 1 }} />
              <button className="btn sm" type="submit">Add</button>
            </form>
          </div>
          <div className="filter-section">
            <h3>Business type</h3>
            <Chips options={TARGET_CATEGORIES.map((c) => c.label)} value={categories} onChange={setCategories} />
          </div>
          <div className="filter-section">
            <h3>Decision makers <span className="faint">(priority order)</span></h3>
            <Chips options={DEFAULT_TITLES} value={titles} onChange={setTitles} />
          </div>
          <div className="filter-section">
            <h3>Contact requirements</h3>
            <label className="check"><input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />Verified email only</label>
            <label className="check"><input type="checkbox" checked={phone} onChange={(e) => setPhone(e.target.checked)} />Require phone</label>
          </div>
          <div className="filter-section">
            <h3>Quality</h3>
            <label>Minimum score to queue<input type="number" min={0} max={100} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} /></label>
            <label className="check"><input type="checkbox" checked={addToQueue} onChange={(e) => setAddToQueue(e.target.checked)} />Add qualified leads to Approval Queue</label>
          </div>
        </aside>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <section className="panel">
            <div className="panel-body" style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <label>Requested leads<input type="number" min={1} max={500} value={count} onChange={(e) => setCount(Number(e.target.value))} style={{ width: 120 }} /></label>
              <button className="btn" disabled={!!busy || !categories.length} onClick={preview}>{busy === "count" ? "Counting…" : "Preview match count"}</button>
              <button className="btn primary" disabled={!!busy || !categories.length} onClick={run}>{busy === "run" ? "Running…" : "Get Leads"}</button>
              <button className="btn" disabled={!!busy} onClick={saveSearch}>Save search</button>
              <label className="check" title="Saved searches marked nightly run automatically overnight (Settings → Schedule) and put new leads in the Approval Queue."><input type="checkbox" checked={nightly} onChange={(e) => setNightly(e.target.checked)} />Run nightly when saved</label>
              <label className="btn" style={{ flexDirection: "row", color: "var(--ink)", fontSize: 13, fontWeight: 600 }}>
                {busy === "import" ? "Importing…" : "Import Getlead CSV"}
                <input type="file" accept=".csv,.json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
              </label>
              {matches !== null && <span className="badge info">{matches.toLocaleString()} matching contacts</span>}
            </div>
            <div className="panel-body" style={{ paddingTop: 0 }}>
              <details>
                <summary className="small link" style={{ cursor: "pointer" }}>Search as Getlead filters (for a Claude-run search)</summary>
                <pre style={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 8, padding: 10, fontSize: 12, overflow: "auto" }}>{JSON.stringify({ ...filters, limit: count }, null, 2)}</pre>
                <button className="btn sm" onClick={() => { navigator.clipboard.writeText(JSON.stringify({ ...filters, limit: count })); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy filters"}</button>
              </details>
            </div>
          </section>

          {error && <div className={`notice ${error.notConfigured ? "info" : "bad"}`}><div><b>{error.notConfigured ? "Live Getlead search isn't configured on this server" : "Run failed"}</b>{error.msg}</div></div>}

          {(busy === "run" || busy === "import" || summary) && (
            <section className="panel">
              <div className="panel-head"><div><h2>{busy ? "Run in progress" : "Run summary"}</h2><p>{busy ? "Leave this page open until it finishes." : "Saved to the database — nothing here is estimated."}</p></div></div>
              <div className="stages" aria-label="Pipeline stages">
                {STAGES.map((s) => <div key={s} className={`stage ${summary ? "done" : s === "Searching" ? "current" : ""}`}>{s}</div>)}
              </div>
              {summary && (
                <div className="panel-body">
                  <div className="summary-grid">
                    {[["Rows received", "received"], ["Businesses found", "businesses_found"], ["Unique businesses", "unique_businesses"], ["Duplicates removed", "duplicates_removed"],
                      ["Decision makers", "decision_makers"], ["Verified emails", "verified_emails"], ["Phones", "phones"], ["LinkedIn profiles", "linkedin_profiles"],
                      ["Priority (80+)", "priority"], ["Good (65–79)", "good"], ["Review (50–64)", "review"], ["Hold (<50)", "hold"], ["Added to queue", "queued"], ["Suppressed", "suppressed"], ["Skipped (no company)", "skipped_invalid"]]
                      .map(([l, k]) => <div key={k}><b>{n(k).toLocaleString()}</b><span>{l}</span></div>)}
                  </div>
                  {Array.isArray(summary.errors) && summary.errors.length > 0 && <div className="notice bad" style={{ marginTop: 12 }}><div><b>{summary.errors.length} failures</b>{summary.errors.slice(0, 5).join(" · ")}</div></div>}
                  <div className="actions" style={{ marginTop: 12 }}>
                    <Link className="btn primary" href="/approval">Review queue</Link><Link className="btn" href="/leads?sort=newest">View leads</Link>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
