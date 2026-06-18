// Tournament scorecard: how the app's recommendations performed across closed matches,
// for a given scoring game (Superbru or Penka).

import { getGame, DEFAULT_GAME } from "./scoring.js";
import { pickFor } from "./recommend.js";

/** Band classifier for the active game (re-exported for the UI). */
export function bandOf(pts, gameId = DEFAULT_GAME) {
  return getGame(gameId).bandOf(pts);
}

/**
 * @param {Array} closedMatches MatchCard[] with status "closed", a recommendation, a result
 * @param {string} [gameId] which scoring game to tally
 * @returns {{game:string, played:number, totalPoints:number, counts:Object<string,number>, bands:Array}}
 */
export function buildScorecard(closedMatches, gameId = DEFAULT_GAME) {
  const game = getGame(gameId);
  const counts = {};
  for (const b of game.bands) counts[b.key] = 0;
  let totalPoints = 0;
  let played = 0;

  for (const m of closedMatches) {
    if (m.status !== "closed" || !m.recommendation || !m.result) continue;
    const block = pickFor(m.recommendation, gameId);
    if (!block?.pick) continue;
    played += 1;
    const pts = game.points(block.pick, [m.result.home, m.result.away]);
    totalPoints += pts;
    counts[game.bandOf(pts)] += 1;
  }

  return { game: game.id, played, totalPoints, counts, bands: game.bands };
}
