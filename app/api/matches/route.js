// GET /api/matches — returns the cached recommendation snapshot, refetching from the
// provider on a stale/empty cache. Falls back to last-good data on provider failure.

import { NextResponse } from "next/server";
import { fetchAllOdds } from "@/lib/oddsProvider.js";
import { getCachedMatches, setCachedMatches, isStale } from "@/lib/cache.js";
import { buildCard, byKickoff } from "@/lib/card.js";

export const dynamic = "force-dynamic";

// Baseline full-list refresh window. The two-tier strategy keeps this infrequent;
// per-event manual refresh handles imminent matches.
const SNAPSHOT_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h

export async function GET() {
  if (!process.env.ODDS_API_KEY) {
    // Never leak whether/what the key is; just signal misconfiguration.
    return NextResponse.json(
      { matches: [], stale: true, warning: "Server is missing odds configuration." },
      { status: 500 }
    );
  }

  const cached = await getCachedMatches();

  // Serve fresh-enough cache directly.
  if (cached && !isStale(cached, SNAPSHOT_MAX_AGE_MS)) {
    return NextResponse.json({ ...cached, stale: false });
  }

  // Need a (re)fetch.
  try {
    const normalized = await fetchAllOdds();
    const matches = normalized.map(buildCard).sort(byKickoff);
    const snapshot = { matches, fetchedAt: new Date().toISOString() };
    await setCachedMatches(snapshot);
    return NextResponse.json({ ...snapshot, stale: false });
  } catch (err) {
    // Resilience: fall back to last good snapshot with a staleness warning.
    if (cached) {
      return NextResponse.json({
        ...cached,
        stale: true,
        warning: "Showing cached odds; the provider is currently unavailable.",
      });
    }
    return NextResponse.json({
      matches: [],
      fetchedAt: null,
      stale: true,
      warning: "Odds are temporarily unavailable. Please try again shortly.",
    });
  }
}
