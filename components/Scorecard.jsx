"use client";

export default function Scorecard({ scorecard }) {
  if (!scorecard || scorecard.played === 0) {
    return (
      <div className="scorecard empty">
        No matches scored yet. Use <strong>Update results</strong> after games finish to
        track how the picks performed.
      </div>
    );
  }

  const { played, totalPoints, counts } = scorecard;
  const avg = played > 0 ? (totalPoints / played).toFixed(2) : "0";

  return (
    <div className="scorecard">
      <div className="sctotal">
        <span className="scpoints">{totalPoints.toFixed(1)}</span>
        <span className="sclabel">pts over {played} match{played === 1 ? "" : "es"} ({avg}/match)</span>
      </div>
      <div className="scbands">
        <span className="scband exact">{counts.exact} exact</span>
        <span className="scband close">{counts.close} close</span>
        <span className="scband result">{counts.result} result</span>
        <span className="scband wrong">{counts.wrong} wrong</span>
      </div>
    </div>
  );
}
