"use client";

import { useState } from "react";
import { formatKickoff, relativeToKickoff } from "@/lib/time.js";
import { isLockSoon } from "@/lib/lockSoon.js";
import MatchDetail from "./MatchDetail.jsx";
import ClosedCard from "./ClosedCard.jsx";

const fmtPick = (p) => `${p[0]}\u2013${p[1]}`;

export default function MatchRow({ card }) {
  const [open, setOpen] = useState(false);

  if (card.status === "closed") {
    return <ClosedCard card={card} />;
  }

  const lockSoon = isLockSoon(card.commenceTimeUtc);
  const rel = relativeToKickoff(card.commenceTimeUtc);
  const pending = !card.recommendation;

  return (
    <div className={`matchrow ${lockSoon ? "locksoon" : ""}`}>
      <div className="matchmain" onClick={() => !pending && setOpen((o) => !o)}>
        <div className="teams">
          <span className="team">
            <span className="flag">{card.homeFlag}</span> {card.homeTeam}
          </span>
          <span className="vs">v</span>
          <span className="team">
            <span className="flag">{card.awayFlag}</span> {card.awayTeam}
          </span>
        </div>

        <div className="meta">
          {card.group && <span className="group">{card.group}</span>}
          <span className="kickoff">{formatKickoff(card.commenceTimeUtc)}</span>
          <span className={`rel ${rel}`}>{rel}</span>
          {lockSoon && <span className="lockbadge">lock soon</span>}
        </div>

        <div className="pick">
          {pending ? (
            <span className="pending">Odds Pending</span>
          ) : (
            <span className="pickscore">{fmtPick(card.recommendation.pick)}</span>
          )}
        </div>
      </div>

      {!pending && card.oddsAsOf && (
        <div className="rowfooter">
          <span className="asof">
            odds as of {formatKickoff(card.oddsAsOf)}
            {card.bookmaker ? ` · ${card.bookmaker}` : ""}
          </span>
        </div>
      )}

      {open && !pending && <MatchDetail recommendation={card.recommendation} />}
    </div>
  );
}
