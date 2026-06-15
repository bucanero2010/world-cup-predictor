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

const MAX_HEAT = 5; // show 0..5 goals each side in the heatmap (covers ~all mass)

/** Extract a (MAX_HEAT+1)x(MAX_HEAT+1) probability matrix for the heatmap. */
function heatmapData(grid) {
  const m = [];
  for (let h = 0; h <= MAX_HEAT; h++) {
    const row = [];
    for (let a = 0; a <= MAX_HEAT; a++) row.push(grid.get(`${h}-${a}`) ?? 0);
    m.push(row);
  }
  return m;
}

/** Classify how clear-cut the top pick is, from the EV gap to the runner-up. */
function edgeFrom(topPicks) {
  if (topPicks.length < 2) return { gap: Infinity, level: "clear" };
  const gap = topPicks[0].ev - topPicks[1].ev;
  // Gaps are in expected-points units (~0–0.3 typical). Tuned to feel right.
  const level = gap >= 0.06 ? "clear" : gap >= 0.025 ? "slight" : "tossup";
  return { gap, level };
}

const fmtScore = (p) => `${p[0]}\u2013${p[1]}`;

/** Plain-English one-liner explaining the pick. */
function reasonFor({ pick, modal, differsFromModal, outcome, edge }) {
  const side =
    outcome.home > outcome.away && outcome.home > outcome.draw
      ? "home win"
      : outcome.away > outcome.home && outcome.away > outcome.draw
      ? "away win"
      : "draw";

  if (edge.level === "tossup") {
    return `Near-tie between ${fmtScore(pick)} and the next option — the model has no strong preference, so any of the top picks is reasonable.`;
  }
  if (differsFromModal) {
    return `${fmtScore(pick)} beats the more likely ${fmtScore(
      modal
    )} on expected points: it sits central to the cluster of likely ${side} scores, so it banks the “close” bonus more often.`;
  }
  return `${fmtScore(pick)} is both the most likely ${side} score and the highest expected-points pick.`;
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
    totalsLines: opts.totalsLines, // when present, fit the alt-totals ladder
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

  const outcome = outcomeProbs(grid);
  const edge = edgeFrom(top);
  const reason = reasonFor({ pick: recommended.pick, modal, differsFromModal, outcome, edge });

  return {
    pick: recommended.pick,
    ev: recommended.ev,
    prob: recommended.prob,
    topPicks: top,
    bands: bandBreakdown(recommended.pick, grid),
    outcome,
    lambda: { home: solved.lambdaHome, away: solved.lambdaAway },
    modal,
    differsFromModal,
    devigMethod: solved.method,
    edge,
    reason,
    heatmap: heatmapData(grid),
    refined: !!opts.totalsLines,
    inputs: {
      oneXtwo: odds.oneXtwo,
      totalLine: odds.totalLine ?? 2.5,
      overUnder: odds.overUnder ?? null,
    },
  };
}

export { DEFAULT_TOP_N, MAX_HEAT };
