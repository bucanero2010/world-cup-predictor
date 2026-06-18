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

// Penka scoring rules (from the in-app rules screen):
//   5   Exact          - exact score predicted
//   3   Goal diff/draw - correct outcome AND correct goal difference
//                        (for draws: any correct draw, since GD = 0)
//   2   Match winner   - correct winner but wrong goal difference
//   0   Wrong          - wrong outcome
//
// Key contrast with Superbru: Penka's middle tier rewards correct GOAL DIFFERENCE
// (2-0 ~ 3-1 ~ 4-2), whereas Superbru rewards being 1 goal OUT (2-0 ~ 1-0 ~ 2-1).

/**
 * Penka points for a pick given an actual scoreline.
 * @param {[number,number]} pick
 * @param {[number,number]} actual
 * @returns {number} 0, 2, 3, or 5
 */
export function penkaPoints(pick, actual) {
  const [ph, pa] = pick;
  const [ah, aa] = actual;

  if (outcome(ph, pa) !== outcome(ah, aa)) return 0; // wrong outcome
  if (ph === ah && pa === aa) return 5; // exact
  if (ph - pa === ah - aa) return 3; // right outcome + correct goal difference
  return 2; // right winner, wrong goal difference
}

// ---- Game registry -----------------------------------------------------------
// Each game defines its points function, max points, the band labels for its
// scoring tiers, and a classifier mapping a points value to a band key. The rest
// of the app is game-agnostic and drives off this registry.

export const GAMES = {
  superbru: {
    id: "superbru",
    label: "Superbru",
    maxPoints: 3,
    points,
    // ordered best -> worst; { key, label, pts }
    bands: [
      { key: "exact", label: "Exact", pts: 3 },
      { key: "close", label: "Close", pts: 1.5 },
      { key: "result", label: "Result", pts: 1 },
      { key: "wrong", label: "Wrong", pts: 0 },
    ],
    bandOf(pts) {
      return pts === 3 ? "exact" : pts === 1.5 ? "close" : pts === 1 ? "result" : "wrong";
    },
  },
  penka: {
    id: "penka",
    label: "Penka",
    maxPoints: 5,
    points: penkaPoints,
    bands: [
      { key: "exact", label: "Exact", pts: 5 },
      { key: "gd", label: "Goal diff", pts: 3 },
      { key: "winner", label: "Winner", pts: 2 },
      { key: "wrong", label: "Wrong", pts: 0 },
    ],
    bandOf(pts) {
      return pts === 5 ? "exact" : pts === 3 ? "gd" : pts === 2 ? "winner" : "wrong";
    },
  },
};

export const DEFAULT_GAME = "superbru";

/** Resolve a game id to its config, defaulting safely. */
export function getGame(gameId) {
  return GAMES[gameId] || GAMES[DEFAULT_GAME];
}
