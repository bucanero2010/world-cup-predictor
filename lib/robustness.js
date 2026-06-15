// Monte Carlo robustness check for a recommendation.
//
// The pipeline (odds -> de-vig -> lambda -> grid -> EV -> pick) stacks several
// estimates, so a natural question is: how sensitive is the recommended pick to small
// errors in the input odds? We answer it empirically — jitter the odds within a
// plausible band, re-run the pick, and measure how often it stays the same.
//
// Output is a stability score and a label, surfaced in the UI so the user knows which
// recommendations are solid and which are effectively coin-flips between two scores.

import { devigBest } from "./shin.js";
import { fromOdds } from "./odds.js";
import { scoreGrid } from "./poisson.js";
import { rankPicks } from "./optimizer.js";

// Deterministic PRNG (mulberry32) so a given match yields the same robustness number
// every render — no flicker, reproducible.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box-Muller, driven by the seeded uniform generator. */
function gauss(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Solve the EV-best pick for a given set of odds. `hint` speeds up perturbed solves. */
function bestPickFor(oneXtwo, totalLine, overUnder, hint) {
  const solved = fromOdds({ oneXtwo, totalLine: totalLine ?? 2.5, overUnder, devig: devigBest, hint });
  const grid = scoreGrid(solved.lambdaHome, solved.lambdaAway);
  const ranked = rankPicks(grid).filter((r) => r.ev > 0);
  ranked.sort((x, y) => (y.ev !== x.ev ? y.ev - x.ev : y.prob - x.prob));
  return { pick: ranked[0].pick, lambda: { home: solved.lambdaHome, away: solved.lambdaAway } };
}

/**
 * @param {object} odds NormalizedOdds { oneXtwo, totalLine?, overUnder? }
 * @param {object} [opts] { trials=200, sigma=0.03 }  sigma = relative odds jitter (3%)
 * @returns {{ stability:number, label:"solid"|"leaning"|"tossup", trials:number,
 *             alternatives:Array<{pick:[number,number], share:number}> }}
 */
export function robustness(odds, opts = {}) {
  const trials = opts.trials ?? 200;
  const sigma = opts.sigma ?? 0.03;

  // Seed from the odds so the result is stable for a given match.
  const seed = Math.floor(
    (odds.oneXtwo?.[0] ?? 1) * 1000 + (odds.oneXtwo?.[1] ?? 1) * 100 + (odds.oneXtwo?.[2] ?? 1) * 10
  );
  const rng = mulberry32(seed);

  // Baseline pick + lambda on the unperturbed odds (full solve, once). The baseline
  // lambda becomes the search hint for every perturbed trial, so each trial only
  // searches a tiny window instead of the whole coarse grid.
  const baseResult = bestPickFor(odds.oneXtwo, odds.totalLine, odds.overUnder);
  const base = baseResult.pick;
  const hint = baseResult.lambda;
  const key = (p) => `${p[0]}-${p[1]}`;

  const counts = new Map();
  let baseHits = 0;
  for (let i = 0; i < trials; i++) {
    // Multiplicative log-normal jitter keeps odds > 1 and proportional.
    const jitter = (o) => Math.max(1.01, o * Math.exp(sigma * gauss(rng)));
    const oneXtwo = odds.oneXtwo.map(jitter);
    const overUnder = odds.overUnder ? odds.overUnder.map(jitter) : undefined;
    const { pick } = bestPickFor(oneXtwo, odds.totalLine, overUnder, hint);
    const k = key(pick);
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (k === key(base)) baseHits += 1;
  }

  const stability = baseHits / trials;
  const label = stability >= 0.7 ? "solid" : stability >= 0.45 ? "leaning" : "tossup";

  const alternatives = [...counts.entries()]
    .map(([k, c]) => ({ pick: k.split("-").map(Number), share: c / trials }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 3);

  return { stability, label, trials, alternatives };
}
