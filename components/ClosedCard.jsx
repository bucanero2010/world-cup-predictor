"use client";

import { formatKickoff } from "@/lib/time.js";
import { bandOf } from "@/lib/scorecard.js";

const fmt = (p) => `${p[0]}\u2013${p[1]}`;

export default function ClosedCard({ card }) {
  const { result, recommendation } = card;
  const pick = recommendation?.pick;
  const pts = result?.earnedPoints;
  const band = pts == null ? null : bandOf(pts);

  return (
    <div className="matchrow closed">
      <div className="matchmain">
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
          <span className="closedbadge">Closed</span>
        </div>

        <div className="closedresult">
          <span className="finalscore">{result.home}&ndash;{result.away}</span>
          {pick && (
            <span className={`earned ${band ?? ""}`}>
              picked {fmt(pick)}
              {pts != null && ` · ${pts} pt${pts === 1 ? "" : "s"}`}
              {band && ` (${band})`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
