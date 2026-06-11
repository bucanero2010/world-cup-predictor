// Expected-value optimizer: given a scoreline probability grid, find the pick
// that maximizes expected Superbru points.

import { points } from "./scoring.js";
import { MAX_GOALS } from "./poisson.js";

/**
 * Expected points for a single pick over the full outcome distribution.
 * @param {[number,number]} pick
 * @param {Map<string,number>} grid actual-score probabilities
 */
export function expectedPoints(pick, grid) {
  let ev = 0;
  for (const [key, p] of grid) {
    if (p === 0) continue;
    const actual = key.split("-").map(Number);
    ev += p * points(pick, actual);
  }
  return ev;
}

/**
 * Rank every candidate pick by expected points.
 * @param {Map<string,number>} grid
 * @param {number} [maxGoals] max goals per side to consider as a pick
 * @returns {Array<{pick:[number,number], ev:number, prob:number}>} sorted desc by ev
 */
export function rankPicks(grid, maxGoals = MAX_GOALS) {
  const results = [];
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const pick = [h, a];
      results.push({
        pick,
        ev: expectedPoints(pick, grid),
        prob: grid.get(`${h}-${a}`) ?? 0,
      });
    }
  }
  results.sort((x, y) => y.ev - x.ev);
  return results;
}

/** Convenience: the single best pick. */
export function bestPick(grid, maxGoals = MAX_GOALS) {
  return rankPicks(grid, maxGoals)[0];
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
