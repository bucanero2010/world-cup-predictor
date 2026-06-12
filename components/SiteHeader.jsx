"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Predictor" },
  { href: "/results", label: "Past Results" },
  { href: "/calculator", label: "Calculator" },
  { href: "/methodology", label: "Methodology" },
];

export default function SiteHeader({ tagline }) {
  const pathname = usePathname();
  return (
    <header className="masthead">
      <div className="mastline">
        <Link href="/" className="wordmark">
          World Cup Predictor
        </Link>
        <span className="kicker">Superbru EV picks</span>
      </div>
      {tagline && <p className="sub">{tagline}</p>}
      <nav className="sitenav">
        {TABS.map((t) => {
          const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} className={`navtab ${active ? "active" : ""}`}>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
