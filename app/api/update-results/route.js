// POST /api/update-results — on-demand scores fetch. Freezes completed matches with
// their final score and the points the stored recommendation earned.

import { NextResponse } from "next/server";
import { fetchScores } from "@/lib/scoresProvider.js";
import { getLastUsage } from "@/lib/providerFetch.js";
import { getAllMatches, freezeResult, setMeta, setCredit, initSchema } from "@/lib/db.js";
import { points } from "@/lib/scoring.js";
import { pickFor } from "@/lib/recommend.js";
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
    let skipped = 0;
    for (const s of scores) {
      const match = byId.get(s.eventId);
      // We can only score a match we previously stored (i.e. captured its odds while
      // it was still upcoming). A match that finished before the first odds refresh
      // is not in the DB and cannot be scored — skip it rather than faking success.
      if (!match) {
        skipped += 1;
        continue;
      }
      // Frozen earned_points is the Superbru score (legacy convenience). The UI
      // recomputes per-game from the stored pick + final score, so this is non-binding.
      const sbPick = match.recommendation ? pickFor(match.recommendation, "superbru").pick : null;
      const earned = sbPick ? points(sbPick, [s.home, s.away]) : null;
      await freezeResult(s.eventId, s.home, s.away, earned);
      closed += 1;
    }
    const ts = new Date().toISOString();
    await setMeta("results_last_updated", ts);
    const usage = getLastUsage();
    if (usage) await setCredit(usage.keyIndex, usage.remaining);
    return NextResponse.json({ closed, skipped, resultsLastUpdated: ts });
  } catch {
    return NextResponse.json({ error: "Failed to store results." }, { status: 500 });
  }
}
