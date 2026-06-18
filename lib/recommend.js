// Recommendation orchestration: turn one match's normalized odds into the full
// Recommendation payload the UI renders.
//
// The probability model (de-vig -> lambda -> scoreline grid) is identical for every
// scoring game; only the EV ranking / bands / reason differ. So we solve the grid once
// and produce a per-game block for each registered game (Superbru, Penka).

import { devigBest } from "./shin.js";
import { fromOdds } from "./odds.js";
import { scoreGrid } from "./poisson.js";
import { rankPicks, outcomeProbs } from "./optimizer.js";
import { GAMES, getGame, DEFAULT_GAME } from "./scoring.js";

const DEFAULT_TOP_N = 6;

/**
 * Per-band breakdown for a pick over a grid, for a specific game.
 * @returns {Object<string,{p:number,ev:number}>} keyed by the game's band keys
 */
export function bandBreakdown(pick, grid, gameId = DEFAULT_GAME) {
  const game = getGame(gameId);
  const out = {};
  for (const b of game.bands) out[b.key] = { p: 0, ev: 0 };
  for (const [key, p] of grid) {
    const actual = key.split("-").map(Number);
    const pts = game.points(pick, actual);
    const band = game.bandOf(pts);
    out[band].p += p;
    out[band].ev += p * pts;
  }
  return out;
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
  // Thresholds scaled to the game's point magnitudes are applied by the caller;
  // here we use a fraction of the top EV so it works for both 3-pt and 5-pt games.
  const rel = gap / (topPicks[0].ev || 1);
  const level = rel >= 0.06 ? "clear" : rel >= 0.025 ? "slight" : "tossup";
  return { gap, level };
}

const fmtScore = (p) => `${p[0]}\u2013${p[1]}`;

/** Plain-English one-liner explaining the pick for a given game. */
function reasonFor({ pick, modal, differsFromModal, outcome, edge, gameId }) {
  const side =
    outcome.home > outcome.away && outcome.home > outcome.draw
      ? "home win"
      : outcome.away > outcome.home && outcome.away > outcome.draw
      ? "away win"
      : "draw";

  const bonus =
    gameId === "penka"
      ? "matches the actual goal difference more often"
      : "banks the “close” bonus more often";

  if (edge.level === "tossup") {
    return `Near-tie between ${fmtScore(pick)} and the next option — the model has no strong preference, so any of the top picks is reasonable.`;
  }
  if (differsFromModal) {
    return `${fmtScore(pick)} beats the more likely ${fmtScore(
      modal
    )} on expected points: it sits central to the cluster of likely ${side} scores, so it ${bonus}.`;
  }
  return `${fmtScore(pick)} is both the most likely ${side} score and the highest expected-points pick.`;
}

/** Build the per-game recommendation block (pick, top picks, bands, reason, edge). */
function gameBlock(gameId, grid, outcome, topN) {
  const game = getGame(gameId);
  const ranked = rankPicks(grid, game.points).filter((r) => r.ev > 0);
  ranked.sort((x, y) => (y.ev !== x.ev ? y.ev - x.ev : y.prob - x.prob));

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
  const edge = edgeFrom(top);
  const reason = reasonFor({ pick: recommended.pick, modal, differsFromModal, outcome, edge, gameId });

  return {
    pick: recommended.pick,
    ev: recommended.ev,
    prob: recommended.prob,
    topPicks: top,
    bands: bandBreakdown(recommended.pick, grid, gameId),
    modal,
    differsFromModal,
    edge,
    reason,
  };
}

/**
 * @param {object} odds NormalizedOdds: { oneXtwo, totalLine?, overUnder?, ... }
 * @param {object} [opts] { topN, totalsLines }
 * @returns {object} Recommendation with a per-game block plus shared model fields.
 */
export function recommendForMatch(odds, opts = {}) {
  const topN = opts.topN ?? DEFAULT_TOP_N;

  const solved = fromOdds({
    oneXtwo: odds.oneXtwo,
    totalLine: odds.totalLine ?? 2.5,
    overUnder: odds.overUnder,
    devig: devigBest,
    totalsLines: opts.totalsLines,
  });

  const grid = scoreGrid(solved.lambdaHome, solved.lambdaAway);
  const outcome = outcomeProbs(grid);

  const games = {};
  for (const id of Object.keys(GAMES)) games[id] = gameBlock(id, grid, outcome, topN);

  return {
    // shared model fields
    outcome,
    lambda: { home: solved.lambdaHome, away: solved.lambdaAway },
    devigMethod: solved.method,
    fit: solved.fit,
    heatmap: heatmapData(grid),
    refined: !!opts.totalsLines,
    inputs: {
      oneXtwo: odds.oneXtwo,
      totalLine: odds.totalLine ?? 2.5,
      overUnder: odds.overUnder ?? null,
    },
    // per-game picks/bands/reason
    games,
  };
}

/** Pull the active game's block merged with shared fields (UI convenience). */
export function pickFor(recommendation, gameId = DEFAULT_GAME) {
  if (!recommendation) return null;
  const g = recommendation.games?.[gameId] || recommendation.games?.[DEFAULT_GAME];
  if (!g) return recommendation; // legacy shape fallback
  return { ...recommendation, ...g };
}

export { DEFAULT_TOP_N, MAX_HEAT };
