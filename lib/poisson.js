// Probability model for scorelines.
//
// We model goals with a (Dixon-Coles adjusted) bivariate Poisson. The base model
// is two independent Poisson distributions with rates lambdaHome / lambdaAway.
// The Dixon-Coles tau correction fixes the well-known under/over-counting of the
// four low scorelines (0-0, 1-0, 0-1, 1-1) that independence gets wrong, which is
// exactly the cluster where Superbru "close" points are decided.

const MAX_GOALS = 8; // 0..8 each side captures essentially all probability mass

function factorial(n) {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

/** Poisson pmf: P(X = k) for rate lambda */
export function poissonPmf(k, lambda) {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

/** Poisson pmf vector [P(0)..P(maxGoals)] for a rate, built iteratively (no pow/factorial). */
function pmfVector(lambda, maxGoals) {
  const v = new Array(maxGoals + 1);
  v[0] = Math.exp(-lambda);
  for (let k = 1; k <= maxGoals; k++) v[k] = (v[k - 1] * lambda) / k;
  return v;
}

/**
 * Dixon-Coles low-score correction factor tau.
 * rho < 0 boosts draws and 1-0/0-1 slightly; rho is typically small and negative.
 */
function tau(i, j, lambda, mu, rho) {
  if (i === 0 && j === 0) return 1 - lambda * mu * rho;
  if (i === 0 && j === 1) return 1 + lambda * rho;
  if (i === 1 && j === 0) return 1 + mu * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
}

/**
 * Build the full scoreline probability grid.
 * @param {number} lambdaHome expected home goals
 * @param {number} lambdaAway expected away goals
 * @param {number} rho Dixon-Coles correlation (default -0.05; use 0 for plain Poisson)
 * @param {number} maxGoals grid size per side
 * @returns {Map<string, number>} key "h-a" -> probability (normalized to sum 1)
 */
export function scoreGrid(lambdaHome, lambdaAway, rho = -0.05, maxGoals = MAX_GOALS) {
  // Precompute the two marginal PMF vectors once, then take their outer product.
  const ph = pmfVector(lambdaHome, maxGoals);
  const pa = pmfVector(lambdaAway, maxGoals);
  const grid = new Map();
  let total = 0;

  for (let i = 0; i <= maxGoals; i++) {
    const phi = ph[i];
    for (let j = 0; j <= maxGoals; j++) {
      let p = phi * pa[j];
      // tau is 1 except for the four low-score cells; only branch there.
      if (i <= 1 && j <= 1) p *= tau(i, j, lambdaHome, lambdaAway, rho);
      if (p < 0) p = 0; // tau can dip below 0 for extreme rho; clamp
      grid.set(`${i}-${j}`, p);
      total += p;
    }
  }

  // normalize so probabilities sum to 1 (corrects clamping + truncated tail)
  for (const [key, p] of grid) {
    grid.set(key, p / total);
  }
  return grid;
}

export { MAX_GOALS };
