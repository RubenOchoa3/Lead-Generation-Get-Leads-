import "./globals.css";
import type { Metadata } from "next";
import { SideNav, MobileNav } from "@/components/Nav";
import { sql } from "@/lib/db";

export const metadata: Metadata = { title: "R&S Lead OS", description: "R&S Central Valley Cleaning — lead generation operating system" };
export const dynamic = "force-dynamic";

async function shellData() {
  try {
    const [r] = await sql<{ review: number; running: number; last: string | null }>(
      `select (select count(*)::int from approval_queue where status = 'Needs Review') review,
              (select count(*)::int from automation_runs where status = 'running') running,
              (select max(finished_at)::text from automation_runs where status = 'complete') last`);
    return { ok: true as const, ...r };
  } catch {
    return { ok: false as const, review: 0, running: 0, last: null };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await shellData();
  return (
    <html lang="en">
      <body>
        <MobileNav />
        <div className="shell">
          <aside className="side">
            <div className="brand">
              <div className="brand-mark" aria-hidden="true">R&amp;S</div>
              <div><b>R&amp;S Lead OS</b><span>Central Valley Cleaning</span></div>
            </div>
            <SideNav counts={{ review: s.review }} />
          </aside>
          <div className="main">
            <header className="topbar">
              <form action="/leads" role="search">
                <label className="sr-only" htmlFor="global-search" style={{ position: "absolute", left: -9999 }}>Search leads</label>
                <input id="global-search" type="search" name="q" placeholder="Search companies, contacts, emails, cities…" />
              </form>
              <div className="top-status">
                {!s.ok ? <span className="badge bad"><span className="dot bad" />Database not connected</span> :
                  s.running ? <span className="badge info"><span className="dot" style={{ background: "var(--info)" }} />Run in progress</span> :
                  <span className="badge"><span className="dot ok" />Automation idle{s.last ? ` · last run ${new Date(s.last).toLocaleDateString()}` : ""}</span>}
                {s.review > 0 && <a className="badge warn" href="/approval">{s.review} awaiting review</a>}
                <span className="badge">Outreach: manual approval only</span>
              </div>
            </header>
            <main className="content">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
