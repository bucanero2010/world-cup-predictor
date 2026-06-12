import Link from "next/link";
import { getAllMatches, getMeta, initSchema } from "@/lib/db.js";
import { buildScorecard } from "@/lib/scorecard.js";
import { kickoffState } from "@/lib/time.js";
import MatchList from "@/components/MatchList.jsx";
import ActionBar from "@/components/ActionBar.jsx";
import Scorecard from "@/components/Scorecard.jsx";

export const dynamic = "force-dynamic";

function withLiveStatus(card) {
  if (card.status === "closed" || card.status === "pending") return card;
  return { ...card, status: kickoffState(card.commenceTimeUtc) === "live" ? "live" : "upcoming" };
}

async function getData() {
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
      error: "Storage unavailable. Check POSTGRES_URL.",
    };
  }
}

export default async function Page() {
  const data = await getData();

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

      <Scorecard scorecard={data.scorecard} />
      <ActionBar meta={data.meta} />

      {data.error && <div className="warning">{data.error}</div>}

      {data.empty ? (
        <div className="emptyprompt">
          No matches loaded yet. Click <strong>Refresh odds</strong> to fetch the
          fixtures and recommendations.
        </div>
      ) : (
        <MatchList initial={data} />
      )}
    </main>
  );
}
