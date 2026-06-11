// Recommendation orchestration: turn one match's normalized odds into the full
// Recommendation payload the UI renders.
//
// Pipeline: devigBest (Shin -> proportional) -> fromOdds (solve lambda) ->
// scoreGrid -> rankPicks -> filter zero-EV -> tie-break by exact prob ->
// assemble topN + band breakdown + outcome probs + lambda + modal/differs flag.

import { devigBest } from "./shin.js";
import { fromOdds } from "./odds.js";
import { scoreGrid } from "./poisson.js";
import { rankPicks, outcomeProbs } from "./optimizer.js";
import { points } from "./scoring.js";

const DEFAULT_TOP_N = 6;

/**
 * Four-band breakdown for a pick over a scoreline grid (Req 5.10).
 * @param {[number,number]} pick
 * @param {Map<string,number>} grid
 * @returns {{exact:{p,ev}, close:{p,ev}, result:{p,ev}, wrong:{p}}}
 */
export function bandBreakdown(pick, grid) {
  const b = {
    exact: { p: 0, ev: 0 },
    close: { p: 0, ev: 0 },
    result: { p: 0, ev: 0 },
    wrong: { p: 0 },
  };
  for (const [key, p] of grid) {
    const actual = key.split("-").map(Number);
    const pts = points(pick, actual);
    if (pts === 3) {
      b.exact.p += p;
      b.exact.ev += p * pts;
    } else if (pts === 1.5) {
      b.close.p += p;
      b.close.ev += p * pts;
    } else if (pts === 1) {
      b.result.p += p;
      b.result.ev += p * pts;
    } else {
      b.wrong.p += p;
    }
  }
  return b;
}

/** Most likely scoreline in the grid (the modal pick). */
function modalScore(grid) {
  let best = null;
  for (const [key, p] of grid) {
    if (!best || p > best.p) best = { key, p };
  }
  const [h, a] = best.key.split("-").map(Number);
  return [h, a];
}

/**
 * @param {object} odds NormalizedOdds: { oneXtwo, totalLine?, overUnder?, ... }
 * @param {object} [opts] { topN }
 * @returns {object} Recommendation (see design data model)
 */
export function recommendForMatch(odds, opts = {}) {
  const topN = opts.topN ?? DEFAULT_TOP_N;

  const solved = fromOdds({
    oneXtwo: odds.oneXtwo,
    totalLine: odds.totalLine ?? 2.5,
    overUnder: odds.overUnder,
    devig: devigBest,
  });

  const grid = scoreGrid(solved.lambdaHome, solved.lambdaAway);

  // Rank, then exclude zero-EV picks (Req 5.8).
  const ranked = rankPicks(grid).filter((r) => r.ev > 0);

  // Tie-break equal EV by higher exact-score probability (Req 5.7).
  ranked.sort((x, y) => {
    if (y.ev !== x.ev) return y.ev - x.ev;
    return y.prob - x.prob;
  });

  const top = ranked.slice(0, topN).map((r, i) => ({
    pick: r.pick,
    ev: r.ev,
    prob: r.prob,
    rank: i + 1,
  }));

  const recommended = top[0];
  const modal = modalScore(grid);
  const differsFromModal =
    recommended.pick[0] !== modal[0] || recommended.pick[1] !== modal[1];

  return {
    pick: recommended.pick,
    ev: recommended.ev,
    prob: recommended.prob,
    topPicks: top,
    bands: bandBreakdown(recommended.pick, grid),
    outcome: outcomeProbs(grid),
    lambda: { home: solved.lambdaHome, away: solved.lambdaAway },
    modal,
    differsFromModal,
    devigMethod: solved.method,
  };
}

export { DEFAULT_TOP_N };
