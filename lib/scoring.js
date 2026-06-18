// Superbru scoring rules.
//
// Match Points:
//   3   Exact   - exact score predicted
//   1.5 Close   - correct outcome AND (score 1 goal out, OR 2 goals out with correct goal difference)
//   1   Result  - correct outcome but not close
//   0   Wrong   - wrong outcome
//
// Penalty shootouts: a match that goes to penalties is scored as a draw — i.e. the
// scoreline at the END OF EXTRA TIME (120 min) is what matters. That is captured here
// because we score on whatever scoreline is passed in as "actual". Note: in knockouts
// Superbru grades the 120-min result, while the model's odds price the 90-min result —
// that input mismatch is surfaced in the UI, not corrected in this scoring function.

/** outcome sign: +1 home win, 0 draw, -1 away win */
export function outcome(home, away) {
  return Math.sign(home - away);
}

/**
 * Points awarded for a pick given an actual scoreline.
 * @param {[number, number]} pick   [homeGoals, awayGoals] you predicted
 * @param {[number, number]} actual [homeGoals, awayGoals] that occurred
 * @returns {number} 0, 1, 1.5, or 3
 */
export function points(pick, actual) {
  const [ph, pa] = pick;
  const [ah, aa] = actual;

  if (outcome(ph, pa) !== outcome(ah, aa)) {
    return 0; // wrong outcome
  }

  if (ph === ah && pa === aa) {
    return 3; // exact
  }

  const err = Math.abs(ph - ah) + Math.abs(pa - aa); // total goals "out"

  if (err === 1) {
    return 1.5; // close: 1 goal out
  }
  if (err === 2 && ph - pa === ah - aa) {
    return 1.5; // close: 2 out but correct goal difference
  }

  return 1; // right result, not close
}
