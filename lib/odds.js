// Back out expected goals (lambdaHome, lambdaAway) from market inputs.
//
// Two supported entry points:
//   1. fromExpectedGoals  - you already have an xG estimate per side. Pass through.
//   2. fromOdds           - you have decimal 1X2 odds + an over/under 2.5 line.
//
// For (2) we strip the bookmaker margin (overround) from the 1X2 prices to get
// fair outcome probabilities, then search for the (lambdaHome, lambdaAway) pair
// whose Poisson grid best reproduces both the 1X2 split and the total-goals line.

import { scoreGrid } from "./poisson.js";

/** Remove vig: normalize implied probabilities so they sum to 1. */
export function devig(decimalOdds) {
  const raw = decimalOdds.map((o) => 1 / o);
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((p) => p / sum);
}

/** Aggregate a score grid into [pHome, pDraw, pAway] and P(total goals > line). */
function summarize(grid, line) {
  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;
  let pOver = 0;
  for (const [key, p] of grid) {
    const [h, a] = key.split("-").map(Number);
    if (h > a) pHome += p;
    else if (h === a) pDraw += p;
    else pAway += p;
    if (h + a > line) pOver += p;
  }
  return { pHome, pDraw, pAway, pOver };
}

/**
 * Solve for lambdas from market odds via a coarse-to-fine grid search.
 *
 * The de-vig step is pluggable: pass a `devig` function that maps decimal odds to
 * `{ probs, method }`. Defaults to the simple proportional `devig` in this module so
 * existing callers (e.g. the calculator) keep working; `recommend.js` injects Shin's
 * method via `devigBest`.
 *
 * @param {object} input
 * @param {[number,number,number]} input.oneXtwo decimal odds [home, draw, away]
 * @param {number} [input.totalLine] over/under line, e.g. 2.5
 * @param {[number,number]} [input.overUnder] decimal odds [over, under] for the line
 * @param {number} [input.rho] Dixon-Coles rho
 * @param {(odds:number[]) => ({probs:number[], method?:string}|number[])} [input.devig]
 *        de-vig function; defaults to proportional normalization
 * @param {{home:number,away:number}} [input.hint] when given, skip the coarse pass and
 *        search a tight window around this lambda (used by the robustness Monte Carlo,
 *        where each perturbed solve lands near the baseline)
 * @returns {{lambdaHome:number, lambdaAway:number, target:object, method:string, cost:number}}
 */
export function fromOdds({ oneXtwo, totalLine = 2.5, overUnder, rho = -0.05, devig: devigFn, hint }) {
  // Normalize the de-vig result into { probs, method }. Accept either a bare
  // probability array (like the legacy `devig`) or a { probs, method } object.
  const applyDevig = (odds) => {
    const fn = devigFn || devig;
    const out = fn(odds);
    if (Array.isArray(out)) return { probs: out, method: "proportional" };
    return { probs: out.probs, method: out.method || "proportional" };
  };

  const main = applyDevig(oneXtwo);
  const [pH, pD, pA] = main.probs;
  const method = main.method;

  let pOverTarget = null;
  if (overUnder) {
    pOverTarget = applyDevig(overUnder).probs[0];
  }
  const target = { pHome: pH, pDraw: pD, pAway: pA, pOver: pOverTarget };

  let best = null;
  const search = (loH, hiH, loA, hiA, step) => {
    for (let lh = loH; lh <= hiH; lh += step) {
      for (let la = loA; la <= hiA; la += step) {
        const s = summarize(scoreGrid(lh, la, rho), totalLine);
        let cost =
          (s.pHome - pH) ** 2 + (s.pDraw - pD) ** 2 + (s.pAway - pA) ** 2;
        if (pOverTarget !== null) cost += (s.pOver - pOverTarget) ** 2;
        if (!best || cost < best.cost) best = { lambdaHome: lh, lambdaAway: la, cost };
      }
    }
  };

  if (hint) {
    // Fast path: the answer is near the hint, so search a small window only.
    search(
      Math.max(0.05, hint.home - 0.3), hint.home + 0.3,
      Math.max(0.05, hint.away - 0.3), hint.away + 0.3,
      0.03
    );
  } else {
    search(0.2, 4.0, 0.2, 4.0, 0.1); // coarse
    search(
      Math.max(0.05, best.lambdaHome - 0.1),
      best.lambdaHome + 0.1,
      Math.max(0.05, best.lambdaAway - 0.1),
      best.lambdaAway + 0.1,
      0.02
    ); // fine
  }

  return {
    lambdaHome: best.lambdaHome,
    lambdaAway: best.lambdaAway,
    target,
    method,
    cost: best.cost,
  };
}

/** Trivial pass-through when you already have expected goals. */
export function fromExpectedGoals(lambdaHome, lambdaAway) {
  return { lambdaHome, lambdaAway };
}
