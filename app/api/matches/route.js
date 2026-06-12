// GET /api/matches — pure DB read. No provider calls. Returns matches, the tournament
// scorecard, last-updated metadata, and an empty flag for the first-run prompt.

import { NextResponse } from "next/server";
import { getAllMatches, getMeta, initSchema } from "@/lib/db.js";
import { buildScorecard } from "@/lib/scorecard.js";
import { kickoffState } from "@/lib/time.js";

export const dynamic = "force-dynamic";

/** Promote stored status using live kickoff timing (closed always wins). */
function withLiveStatus(card) {
  if (card.status === "closed" || card.status === "pending") return card;
  const state = kickoffState(card.commenceTimeUtc); // upcoming | live | finished
  // "finished" by clock but not yet confirmed via results stays as-is (upcoming/live);
  // we only surface live so the row can badge it.
  return { ...card, status: state === "live" ? "live" : "upcoming" };
}

export async function GET() {
  try {
    await initSchema();
    const raw = await getAllMatches();
    const matches = raw.map(withLiveStatus);
    const scorecard = buildScorecard(matches.filter((m) => m.status === "closed"));
    const meta = {
      oddsLastRefreshed: await getMeta("odds_last_refreshed"),
      resultsLastUpdated: await getMeta("results_last_updated"),
    };
    return NextResponse.json({ matches, scorecard, meta, empty: matches.length === 0 });
  } catch (err) {
    // DB unavailable: report empty rather than crash; UI shows a prompt/error.
    return NextResponse.json(
      { matches: [], scorecard: { played: 0, totalPoints: 0, counts: { exact: 0, close: 0, result: 0, wrong: 0 } }, meta: {}, empty: true, error: "Storage unavailable." },
      { status: 200 }
    );
  }
}
