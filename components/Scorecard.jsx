"use client";

import { buildScorecard } from "@/lib/scorecard.js";
import { getGame } from "@/lib/scoring.js";
import { useGame } from "./GameContext.jsx";

export default function Scorecard({ closedMatches }) {
  const { game } = useGame();
  const gameDef = getGame(game);
  const sc = buildScorecard(closedMatches ?? [], game);

  if (sc.played === 0) {
    return (
      <div className="scorecard empty">
        No {gameDef.label} matches scored yet. Use <strong>Update results</strong> after
        games finish to track how the picks performed.
      </div>
    );
  }

  const avg = sc.played > 0 ? (sc.totalPoints / sc.played).toFixed(2) : "0";

  return (
    <div className="scorecard">
      <div className="sctotal">
        <span className="scpoints">{sc.totalPoints.toFixed(1)}</span>
        <span className="sclabel">
          {gameDef.label} pts over {sc.played} match{sc.played === 1 ? "" : "es"} ({avg}/match)
        </span>
      </div>
      <div className="scbands">
        {gameDef.bands.map((b) => (
          <span className={`scband ${b.key}`} key={b.key}>
            {sc.counts[b.key] ?? 0} {b.label.toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  );
}
