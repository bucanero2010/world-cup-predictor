// Assemble a RecommendationCard (the client-facing shape) from a NormalizedOdds
// object. Shared by both route handlers so the contract stays consistent.

import { recommendForMatch } from "./recommend.js";
import { flagFor } from "./flags.js";
import { stageLabel } from "./fixtures.js";

/**
 * @param {object} norm NormalizedOdds (status "ok" or "pending")
 * @returns {object} RecommendationCard
 */
export function buildCard(norm) {
  const base = {
    eventId: norm.eventId,
    homeTeam: norm.homeTeam,
    awayTeam: norm.awayTeam,
    homeFlag: flagFor(norm.homeTeam).emoji,
    awayFlag: flagFor(norm.awayTeam).emoji,
    commenceTimeUtc: norm.commenceTimeUtc,
    group: stageLabel(norm.homeTeam, norm.awayTeam, norm.commenceTimeUtc),
  };

  if (norm.status !== "ok") {
    return { ...base, status: "pending" };
  }

  return {
    ...base,
    status: "ok",
    oddsAsOf: norm.oddsAsOf,
    bookmaker: norm.bookmaker,
    source: norm.source,
    recommendation: recommendForMatch(norm),
  };
}

/** Sort cards by kickoff ascending (Req 1.4). */
export function byKickoff(a, b) {
  return new Date(a.commenceTimeUtc) - new Date(b.commenceTimeUtc);
}
