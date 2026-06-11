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
  const grid = new Map();
  let total = 0;

  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      const base = poissonPmf(i, lambdaHome) * poissonPmf(j, lambdaAway);
      const p = base * tau(i, j, lambdaHome, lambdaAway, rho);
      const safe = Math.max(p, 0); // tau can dip below 0 for extreme rho; clamp
      grid.set(`${i}-${j}`, safe);
      total += safe;
    }
  }

  // normalize so probabilities sum to 1 (corrects clamping + truncated tail)
  for (const [key, p] of grid) {
    grid.set(key, p / total);
  }
  return grid;
}

export { MAX_GOALS };
