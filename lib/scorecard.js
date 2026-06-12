// Tournament scorecard: how the app's recommendations performed across closed matches.

import { points } from "./scoring.js";

/** Classify a points value into a Superbru band name. */
export function bandOf(pts) {
  if (pts === 3) return "exact";
  if (pts === 1.5) return "close";
  if (pts === 1) return "result";
  return "wrong";
}

/**
 * @param {Array} closedMatches MatchCard[] with status "closed", a recommendation, and a result
 * @returns {{played:number, totalPoints:number, counts:{exact,close,result,wrong}}}
 */
export function buildScorecard(closedMatches) {
  const counts = { exact: 0, close: 0, result: 0, wrong: 0 };
  let totalPoints = 0;
  let played = 0;

  for (const m of closedMatches) {
    if (m.status !== "closed" || !m.recommendation || !m.result) continue;
    played += 1;
    const pts = points(m.recommendation.pick, [m.result.home, m.result.away]);
    totalPoints += pts;
    counts[bandOf(pts)] += 1;
  }

  return { played, totalPoints, counts };
}
