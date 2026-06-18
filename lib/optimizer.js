// Expected-value optimizer: given a scoreline probability grid, find the pick
// that maximizes expected points for a given scoring function (Superbru by default).

import { points } from "./scoring.js";
import { MAX_GOALS } from "./poisson.js";

/**
 * Expected points for a single pick over the full outcome distribution.
 * @param {[number,number]} pick
 * @param {Map<string,number>} grid actual-score probabilities
 * @param {(pick:number[],actual:number[])=>number} [pointsFn] scoring function
 */
export function expectedPoints(pick, grid, pointsFn = points) {
  let ev = 0;
  for (const [key, p] of grid) {
    if (p === 0) continue;
    const actual = key.split("-").map(Number);
    ev += p * pointsFn(pick, actual);
  }
  return ev;
}

/**
 * Rank every candidate pick by expected points.
 * @param {Map<string,number>} grid
 * @param {(pick:number[],actual:number[])=>number} [pointsFn] scoring function (Superbru default)
 * @param {number} [maxGoals] max goals per side to consider as a pick
 * @returns {Array<{pick:[number,number], ev:number, prob:number}>} sorted desc by ev
 */
export function rankPicks(grid, pointsFn = points, maxGoals = MAX_GOALS) {
  const results = [];
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const pick = [h, a];
      results.push({
        pick,
        ev: expectedPoints(pick, grid, pointsFn),
        prob: grid.get(`${h}-${a}`) ?? 0,
      });
    }
  }
  results.sort((x, y) => y.ev - x.ev);
  return results;
}

/** Convenience: the single best pick. */
export function bestPick(grid, pointsFn = points, maxGoals = MAX_GOALS) {
  return rankPicks(grid, pointsFn, maxGoals)[0];
}

/** Outcome probabilities for display (home win / draw / away win). */
export function outcomeProbs(grid) {
  let home = 0;
  let draw = 0;
  let away = 0;
  for (const [key, p] of grid) {
    const [h, a] = key.split("-").map(Number);
    if (h > a) home += p;
    else if (h === a) draw += p;
    else away += p;
  }
  return { home, draw, away };
}
