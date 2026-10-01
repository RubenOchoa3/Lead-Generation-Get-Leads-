"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV: Array<{ group: string; items: Array<{ href: string; label: string; countKey?: string }> }> = [
  { group: "Overview", items: [{ href: "/", label: "Dashboard" }] },
  { group: "Prospecting", items: [
    { href: "/find-leads", label: "Find Leads" },
    { href: "/leads", label: "Leads" },
    { href: "/approval", label: "Approval Queue", countKey: "review" },
  ] },
  { group: "Outreach", items: [{ href: "/campaigns", label: "Campaigns" }, { href: "/replies", label: "Replies" }] },
  { group: "Infrastructure", items: [{ href: "/mailboxes", label: "Mailboxes" }, { href: "/domains", label: "Domains" }] },
  { group: "Intelligence", items: [{ href: "/analytics", label: "Analytics" }, { href: "/insights", label: "Claude Insights" }] },
  { group: "System", items: [{ href: "/automations", label: "Automations" }, { href: "/health", label: "System Health" }, { href: "/settings", label: "Settings" }] },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function SideNav({ counts }: { counts: Record<string, number> }) {
  const path = usePathname();
  return (
    <nav aria-label="Main">
      {NAV.map((g) => (
        <div className="nav-group" key={g.group}>
          <div>{g.group}</div>
          {g.items.map((i) => (
            <Link key={i.href} href={i.href} className={`nav-link${isActive(path, i.href) ? " active" : ""}`} aria-current={isActive(path, i.href) ? "page" : undefined}>
              <span>{i.label}</span>
              {i.countKey && counts[i.countKey] ? <span className="nav-count">{counts[i.countKey]}</span> : null}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

export function MobileNav() {
  const path = usePathname();
  const items = NAV.flatMap((g) => g.items);
  return (
    <nav className="mobile-nav" aria-label="Main">
      {items.map((i) => <Link key={i.href} href={i.href} className={isActive(path, i.href) ? "active" : ""}>{i.label}</Link>)}
    </nav>
  );
}
