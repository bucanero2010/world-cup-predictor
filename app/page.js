import { loadAppData } from "@/lib/appData.js";
import SiteHeader from "@/components/SiteHeader.jsx";
import MatchList from "@/components/MatchList.jsx";
import ActionBar from "@/components/ActionBar.jsx";

export const dynamic = "force-dynamic";

export default async function PredictorPage() {
  const data = await loadAppData();
  // Predictor focuses on matches still to play; closed matches live under Past Results.
  const open = data.matches.filter((m) => m.status !== "closed");

  return (
    <main className="wrap">
      <SiteHeader tagline="Scorelines that maximize your expected Superbru points. Times in Madrid — tap a match for the full breakdown." />

      <ActionBar meta={data.meta} />

      {data.error && <div className="warning">{data.error}</div>}

      {data.empty ? (
        <div className="emptyprompt">
          No matches loaded yet. Click <strong>Refresh odds</strong> to fetch the
          fixtures and recommendations.
        </div>
      ) : open.length === 0 ? (
        <div className="emptyprompt">
          No upcoming matches. Check <strong>Past Results</strong> for finished games.
        </div>
      ) : (
        <MatchList initial={{ matches: open }} />
      )}
    </main>
  );
}
