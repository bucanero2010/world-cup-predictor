import SiteHeader from "@/components/SiteHeader.jsx";

export const metadata = {
  title: "Methodology — World Cup Predictor",
};

export default function MethodologyPage() {
  return (
    <main className="wrap">
      <SiteHeader tagline="How the picks are calculated, in plain English." />

      <article className="prose">
        <h2>The goal</h2>
        <p>
          In Superbru you predict the exact scoreline of each match. Points are awarded
          like this:
        </p>
        <ul>
          <li><strong>3 points</strong> — exact score.</li>
          <li><strong>1.5 points</strong> — right winner and a close score (1 goal out, or 2 out with the right goal difference).</li>
          <li><strong>1 point</strong> — right winner, but not close.</li>
          <li><strong>0 points</strong> — wrong winner.</li>
        </ul>
        <p>
          This app finds the single scoreline that earns the most points <em>on average</em>
          — your best long-run bet, not just the most likely result.
        </p>

        <h2>Step 1 — Start from the betting market</h2>
        <p>
          Bookmakers&apos; odds are the sharpest available forecast of a match. We take the
          odds from <strong>Pinnacle</strong> (a book known for accurate pricing) for the
          match winner and the over/under goals line.
        </p>
        <p>
          Raw odds include the bookmaker&apos;s built-in profit margin, so we strip that out
          to get the &ldquo;true&rdquo; probabilities. We use a method called{" "}
          <strong>Shin&apos;s method</strong>, which is better than naive approaches at
          handling big favourites — common in World Cup group games.
        </p>

        <h2>Step 2 — Turn probabilities into expected goals</h2>
        <p>
          From those probabilities we work backwards to estimate how many goals each team is
          expected to score (their &ldquo;attacking rate&rdquo;). A heavy favourite against a
          weak side might come out around 2.2 expected goals to 0.6, for example.
        </p>

        <h2>Step 3 — Build every possible scoreline</h2>
        <p>
          Using those expected-goal rates we calculate the probability of <em>every</em>
          scoreline: 0-0, 1-0, 2-1, 3-2, and so on. This uses a well-established football
          model (Poisson with a Dixon-Coles correction) that nudges the low-scoring,
          common scorelines to match real-world data.
        </p>

        <h2>Step 4 — Score every candidate pick</h2>
        <p>
          For each scoreline you <em>could</em> pick, we ask: across all the ways the match
          might actually end, how many Superbru points would this pick earn on average? The
          pick with the highest average wins.
        </p>

        <h2>Why the best pick often isn&apos;t the most likely score</h2>
        <p>
          This is the clever part. Because the &ldquo;close&rdquo; rule gives partial credit
          for being one goal off, the best pick is usually a <strong>central</strong>
          scoreline — one surrounded by other likely results — rather than the single most
          probable one.
        </p>
        <p>
          Example: for a strong favourite, <span className="mono">1-0</span> might be the
          single most likely score, but <span className="mono">2-0</span> often scores more
          on average, because it&apos;s &ldquo;close&rdquo; to 1-0, 2-1, 3-0 <em>and</em> 3-1,
          so it collects partial points far more often.
        </p>

        <h2>Why draws are rarely recommended</h2>
        <p>
          Even between two equal teams, a draw is the <em>least</em> likely of the three
          outcomes — there are simply more ways to win or lose than to draw. So a draw is
          only the best pick in low-scoring, very evenly-matched games.
        </p>

        <h2>How results are tracked</h2>
        <p>
          After a match finishes, the app pulls the final score and records how many points
          the recommended pick would have earned. The <strong>Past Results</strong> page
          tallies these into a running scorecard — so you can see how the model actually
          performs over the tournament.
        </p>
        <p className="note">
          One caveat: a match can only be scored if its odds were captured <em>before</em>
          kickoff. Matches that finished before the first odds refresh can&apos;t be graded,
          because we no longer know what the model would have picked.
        </p>

        <h2>What this is not</h2>
        <p>
          The picks maximize expected points per match in isolation. They don&apos;t (yet)
          account for pool strategy — e.g. taking riskier picks when you&apos;re behind your
          friends, or safer ones when you&apos;re ahead. That&apos;s a possible future
          addition.
        </p>
      </article>
    </main>
  );
}
