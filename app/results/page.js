import { loadAppData } from "@/lib/appData.js";
import SiteHeader from "@/components/SiteHeader.jsx";
import Scorecard from "@/components/Scorecard.jsx";
import MatchList from "@/components/MatchList.jsx";

export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  const data = await loadAppData();
  const closed = data.matches.filter((m) => m.status === "closed");

  return (
    <main className="wrap">
      <SiteHeader tagline="How the recommendations have performed. A pick scores 3 (exact), 1.5 (close), 1 (right result) or 0." />

      <Scorecard scorecard={data.scorecard} />

      {closed.length === 0 ? (
        <div className="emptyprompt">
          No finished matches yet. After games end, use <strong>Update results</strong> on
          the Predictor page to score the picks.
        </div>
      ) : (
        <MatchList initial={{ matches: closed }} />
      )}
    </main>
  );
}
