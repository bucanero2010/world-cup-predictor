// POST /api/update-results — on-demand scores fetch. Freezes completed matches with
// their final score and the points the stored recommendation earned.

import { NextResponse } from "next/server";
import { fetchScores } from "@/lib/scoresProvider.js";
import { getAllMatches, freezeResult, setMeta, initSchema } from "@/lib/db.js";
import { points } from "@/lib/scoring.js";
import { allowAction } from "@/lib/rateLimit.js";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!process.env.ODDS_API_KEY) {
    return NextResponse.json({ error: "Server is missing odds configuration." }, { status: 500 });
  }

  const gate = allowAction("update-results");
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "Updated too recently.", retryAfterMs: gate.retryAfterMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)) } }
    );
  }

  let scores;
  try {
    scores = await fetchScores();
  } catch {
    return NextResponse.json({ error: "Could not fetch results right now." }, { status: 502 });
  }

  try {
    await initSchema();
    // Index stored matches by id so we can score the recommendation we actually made.
    const stored = await getAllMatches();
    const byId = new Map(stored.map((m) => [m.eventId, m]));

    let closed = 0;
    for (const s of scores) {
      const match = byId.get(s.eventId);
      // Earned points require a stored recommendation; if absent (odds never fetched),
      // freeze the result with null points rather than guessing.
      const earned = match?.recommendation
        ? points(match.recommendation.pick, [s.home, s.away])
        : null;
      await freezeResult(s.eventId, s.home, s.away, earned);
      closed += 1;
    }
    const ts = new Date().toISOString();
    await setMeta("results_last_updated", ts);
    return NextResponse.json({ closed, resultsLastUpdated: ts });
  } catch {
    return NextResponse.json({ error: "Failed to store results." }, { status: 500 });
  }
}
