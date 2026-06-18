"use client";

import { formatKickoff } from "@/lib/time.js";
import { pickFor } from "@/lib/recommend.js";
import { getGame } from "@/lib/scoring.js";
import { useGame } from "./GameContext.jsx";

const fmt = (p) => `${p[0]}\u2013${p[1]}`;

export default function ClosedCard({ card }) {
  const { game } = useGame();
  const gameDef = getGame(game);
  const { result, recommendation } = card;

  // Recompute points for the active game from the stored pick + final score
  // (the frozen earned_points column is Superbru-specific and not used here).
  const block = recommendation ? pickFor(recommendation, game) : null;
  const pick = block?.pick;
  let pts = null;
  let bandKey = null;
  if (pick && result) {
    pts = gameDef.points(pick, [result.home, result.away]);
    bandKey = gameDef.bandOf(pts);
  }

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
            <span className={`earned ${bandKey ?? ""}`}>
              picked {fmt(pick)}
              {pts != null && ` · ${pts} pt${pts === 1 ? "" : "s"}`}
              {bandKey && ` (${bandKey})`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
