"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo.jsx";
import { useGame } from "./GameContext.jsx";

const TABS = [
  { href: "/", label: "Predictor" },
  { href: "/results", label: "Past Results" },
  { href: "/calculator", label: "Calculator" },
  { href: "/methodology", label: "Methodology" },
];

export default function SiteHeader({ tagline }) {
  const pathname = usePathname();
  const { game, setGame } = useGame();
  return (
    <header className="masthead">
      <div className="mastline">
        <Link href="/" className="wordmark">
          <span className="wordmark-logo"><Logo size={30} /></span>
          World Cup Predictor
        </Link>
        <div className="gameswitch" role="group" aria-label="Scoring game">
          <button
            className={`gamebtn ${game === "superbru" ? "active" : ""}`}
            onClick={() => setGame("superbru")}
          >
            Superbru
          </button>
          <button
            className={`gamebtn ${game === "penka" ? "active" : ""}`}
            onClick={() => setGame("penka")}
          >
            Penka
          </button>
        </div>
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
