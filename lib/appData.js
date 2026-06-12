// Server-side data loader shared by the Predictor and Results pages. Reads everything
// from the database; never calls the odds provider.

import { getAllMatches, getMeta, initSchema } from "./db.js";
import { buildScorecard } from "./scorecard.js";
import { kickoffState } from "./time.js";

function withLiveStatus(card) {
  if (card.status === "closed" || card.status === "pending") return card;
  return {
    ...card,
    status: kickoffState(card.commenceTimeUtc) === "live" ? "live" : "upcoming",
  };
}

/**
 * @returns {Promise<{matches, scorecard, meta, empty, error?}>}
 */
export async function loadAppData() {
  try {
    await initSchema();
    const raw = await getAllMatches();
    const matches = raw.map(withLiveStatus);
    const scorecard = buildScorecard(matches.filter((m) => m.status === "closed"));
    const meta = {
      oddsLastRefreshed: await getMeta("odds_last_refreshed"),
      resultsLastUpdated: await getMeta("results_last_updated"),
    };
    return { matches, scorecard, meta, empty: matches.length === 0 };
  } catch {
    return {
      matches: [],
      scorecard: { played: 0, totalPoints: 0, counts: { exact: 0, close: 0, result: 0, wrong: 0 } },
      meta: {},
      empty: true,
      error: "Storage unavailable. Check the database connection.",
    };
  }
}
