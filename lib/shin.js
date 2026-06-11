// De-vig methods: convert bookmaker decimal odds into margin-free ("fair")
// probabilities.
//
// Two methods:
//   proportionalDevig - normalize implied probabilities (1/odds) to sum to 1.
//                       Simple, but slightly overstates favorites / understates
//                       longshots because it spreads the margin uniformly.
//   shinDevig         - Shin's method. Models the overround as arising from a
//                       proportion z of "insider" (informed) bettors, which
//                       concentrates more of the margin on longshots. Better
//                       calibrated for heavy favorites common in World Cup play.
//
// devigBest tries Shin and falls back to proportional on any degeneracy.

/** Normalize 1/odds so probabilities sum to 1. */
export function proportionalDevig(decimalOdds) {
  const raw = decimalOdds.map((o) => 1 / o);
  const sum = raw.reduce((a, b) => a + b, 0);
  return { probs: raw.map((p) => p / sum), method: "proportional" };
}

/**
 * Shin's method de-vig.
 *
 * Let πi = 1/oddsi be the raw implied probabilities and B = Σ πi the booksum
 * (> 1 when the book carries margin). Shin models a proportion z of insider money
 * and recovers fair probabilities:
 *
 *     pi(z) = ( sqrt( z² + 4(1−z) · πi² / B ) − z ) / ( 2(1−z) )
 *
 * z is chosen so the fair probabilities normalize: Σ pi(z) = 1. The sum is
 * monotonically decreasing in z (Σ pi(0) = B/... ≥ 1 with margin, decreasing past 1),
 * so we solve by bisection.
 *
 * @param {number[]} decimalOdds
 * @returns {{probs:number[], z:number, method:"shin"}}
 * @throws if the input is degenerate or the solver cannot converge to a valid z
 */
export function shinDevig(decimalOdds) {
  if (!Array.isArray(decimalOdds) || decimalOdds.length < 2) {
    throw new Error("shinDevig requires at least 2 outcomes");
  }
  if (decimalOdds.some((o) => !Number.isFinite(o) || o <= 1)) {
    throw new Error("shinDevig requires finite decimal odds > 1");
  }

  const pi = decimalOdds.map((o) => 1 / o);
  const B = pi.reduce((a, b) => a + b, 0); // booksum (overround)

  // No margin -> Shin reduces to the (already-normalized) implied probabilities.
  if (Math.abs(B - 1) < 1e-12) {
    return { probs: pi.slice(), z: 0, method: "shin" };
  }

  const probsAt = (z) =>
    pi.map(
      (p) => (Math.sqrt(z * z + (4 * (1 - z) * p * p) / B) - z) / (2 * (1 - z))
    );
  // f(z) = Σ pi(z) − 1, monotonically decreasing in z.
  const f = (z) => probsAt(z).reduce((a, b) => a + b, 0) - 1;

  let lo = 0;
  let hi = 1 - 1e-9;
  const flo = f(lo);
  const fhi = f(hi);
  if (flo * fhi > 0 && Math.abs(flo) > 1e-12) {
    throw new Error("shinDevig: root not bracketed");
  }

  let z = 0;
  for (let i = 0; i < 100; i++) {
    z = (lo + hi) / 2;
    const fz = f(z);
    if (Math.abs(fz) < 1e-12) break;
    if (fz > 0) lo = z; // f decreasing: positive => root to the right
    else hi = z;
  }

  if (!(z >= 0 && z < 1)) {
    throw new Error("shinDevig: z out of range");
  }

  const probs = probsAt(z);
  if (probs.some((p) => !Number.isFinite(p) || p <= 0 || p >= 1)) {
    throw new Error("shinDevig: invalid probabilities");
  }
  const psum = probs.reduce((a, b) => a + b, 0);
  return { probs: probs.map((p) => p / psum), z, method: "shin" };
}

/**
 * Preferred entry point: try Shin's method, fall back to proportional on any
 * degeneracy (too few outcomes, non-finite odds, non-convergence, z out of range).
 * @param {number[]} decimalOdds
 * @returns {{probs:number[], method:"shin"|"proportional", z?:number}}
 */
export function devigBest(decimalOdds) {
  try {
    return shinDevig(decimalOdds);
  } catch {
    return proportionalDevig(decimalOdds);
  }
}
