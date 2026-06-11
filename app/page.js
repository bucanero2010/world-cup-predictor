import Link from "next/link";
import { fetchAllOdds } from "@/lib/oddsProvider.js";
import { getCachedMatches, setCachedMatches, isStale } from "@/lib/cache.js";
import { buildCard, byKickoff } from "@/lib/card.js";
import MatchList from "@/components/MatchList.jsx";

export const dynamic = "force-dynamic";

const SNAPSHOT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

// Server-side: build the initial snapshot directly (same logic as GET /api/matches),
// so the first paint has data without a client round-trip.
async function getInitial() {
  if (!process.env.ODDS_API_KEY) {
    return { matches: [], fetchedAt: null, stale: true, warning: "Server is missing odds configuration." };
  }
  const cached = await getCachedMatches();
  if (cached && !isStale(cached, SNAPSHOT_MAX_AGE_MS)) {
    return { ...cached, stale: false };
  }
  try {
    const normalized = await fetchAllOdds();
    const matches = normalized.map(buildCard).sort(byKickoff);
    const snapshot = { matches, fetchedAt: new Date().toISOString() };
    await setCachedMatches(snapshot);
    return { ...snapshot, stale: false };
  } catch {
    if (cached) {
      return { ...cached, stale: true, warning: "Showing cached odds; the provider is currently unavailable." };
    }
    return { matches: [], fetchedAt: null, stale: true, warning: "Odds are temporarily unavailable." };
  }
}

export default async function Page() {
  const initial = await getInitial();
  return (
    <main className="wrap">
      <div className="header">
        <div>
          <h1>World Cup Predictor</h1>
          <p className="sub">
            Scorelines that maximize your expected Superbru points (3 / 1.5 / 1 / 0).
            Times in Madrid. Tap a match for the full breakdown.
          </p>
        </div>
        <Link href="/calculator" className="navlink">
          Calculator →
        </Link>
      </div>
      <MatchList initial={initial} />
    </main>
  );
}
