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
      <SiteHeader tagline="How the recommendations have performed. Switch between Superbru and Penka scoring up top." />

      <Scorecard closedMatches={closed} />

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
