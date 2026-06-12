import SiteHeader from "@/components/SiteHeader.jsx";

export const metadata = {
  title: "Methodology — World Cup Predictor",
};

export default function MethodologyPage() {
  return (
    <main className="wrap">
      <SiteHeader tagline="How the picks are calculated — the short, visual version." />

      {/* Scoring rules as cards */}
      <section className="m-section">
        <h2 className="m-h2">The scoring</h2>
        <p className="m-lead">
          Superbru rewards being close, not just exact. Every pick lands in one of four
          bands:
        </p>
        <div className="scoregrid">
          <div className="scorecell s3"><span className="pts">3</span><span className="lbl">Exact score</span></div>
          <div className="scorecell s15"><span className="pts">1.5</span><span className="lbl">Right result, close score</span></div>
          <div className="scorecell s1"><span className="pts">1</span><span className="lbl">Right result only</span></div>
          <div className="scorecell s0"><span className="pts">0</span><span className="lbl">Wrong result</span></div>
        </div>
      </section>

      {/* Pipeline */}
      <section className="m-section">
        <h2 className="m-h2">The pipeline</h2>
        <p className="m-lead">
          We turn betting odds into the single highest-scoring pick in four steps.
        </p>
        <Pipeline />
      </section>

      {/* Step 1 */}
      <section className="m-section">
        <h2 className="m-h2"><span className="step-num">1</span> Strip the bookmaker margin</h2>
        <p>
          Bookmakers&apos; odds are the sharpest forecast available, but they bake in a
          profit margin so the implied probabilities sum to more than 100%. We use{" "}
          <strong>Shin&apos;s method</strong> to remove it and recover fair probabilities
          that better handle big favourites.
        </p>
        <div className="formula">
          <span className="fl">p<sub>i</sub></span> ={" "}
          <span className="frac">
            <span className="num">√(z² + 4(1−z)·π<sub>i</sub>²/B) − z</span>
            <span className="den">2(1 − z)</span>
          </span>
        </div>
        <p className="m-cap">
          where π<sub>i</sub> = 1/odds<sub>i</sub>, B = Σπ<sub>i</sub> (the booksum), and
          z is solved so the fair probabilities sum to 1.
        </p>
      </section>

      {/* Step 2 */}
      <section className="m-section">
        <h2 className="m-h2"><span className="step-num">2</span> Back out expected goals</h2>
        <p>
          From those probabilities we solve for each team&apos;s scoring rate, λ (expected
          goals). A strong favourite might come out around λ<sub>home</sub> = 2.1 versus
          λ<sub>away</sub> = 0.6.
        </p>
      </section>

      {/* Step 3 */}
      <section className="m-section">
        <h2 className="m-h2"><span className="step-num">3</span> Build every scoreline</h2>
        <p>
          The probability of each exact scoreline comes from a Poisson model (with a
          Dixon-Coles correction that fixes low-scoring games):
        </p>
        <div className="formula">
          P(h, a) ={" "}
          <span className="frac"><span className="num">λ<sub>h</sub><sup>h</sup> e<sup>−λ<sub>h</sub></sup></span><span className="den">h!</span></span>
          ·
          <span className="frac"><span className="num">λ<sub>a</sub><sup>a</sup> e<sup>−λ<sub>a</sub></sup></span><span className="den">a!</span></span>
          · τ
        </div>
        <p className="m-cap">τ is the Dixon-Coles adjustment for the 0-0, 1-0, 0-1 and 1-1 scores.</p>
      </section>

      {/* Step 4 */}
      <section className="m-section">
        <h2 className="m-h2"><span className="step-num">4</span> Pick the highest expected points</h2>
        <p>
          For every scoreline you <em>could</em> pick, we compute the average points it
          earns across all the ways the match might end, and choose the best one:
        </p>
        <div className="formula">
          EV(pick) = Σ<sub>all scores</sub> P(score) · points(pick, score)
        </div>
      </section>

      {/* The key insight with a chart */}
      <section className="m-section highlight">
        <h2 className="m-h2">Why the best pick isn&apos;t the most likely score</h2>
        <p>
          Because &ldquo;close&rdquo; pays 1.5, a <strong>central</strong> pick that&apos;s
          near many likely scores beats an isolated one. Below: for a favourite, 1-0 is the
          single most likely score, but <strong>2-0 earns more on average</strong> — it
          collects partial credit from 1-0, 2-1, 3-0 and 3-1.
        </p>
        <CentralPickChart />
      </section>

      {/* Draws */}
      <section className="m-section">
        <h2 className="m-h2">Why draws are rare picks</h2>
        <p>
          Even between equal teams, the draw is the <em>least</em> likely of the three
          outcomes — there are more ways to win or lose than to draw. So draws are only
          optimal in low-scoring, evenly-matched games.
        </p>
        <OutcomeBars />
      </section>

      {/* Tracking + non-goals */}
      <section className="m-section">
        <h2 className="m-h2">Tracking performance</h2>
        <p>
          After each match, the final score is pulled and the recommended pick is scored.
          <strong> Past Results</strong> tallies a running total.
        </p>
        <p className="m-note">
          A match can only be graded if its odds were captured before kickoff — games that
          finished before the first odds refresh can&apos;t be scored.
        </p>
        <p className="m-note">
          Picks maximize expected points per match in isolation; pool strategy (riskier
          picks when behind) is a possible future addition.
        </p>
      </section>
    </main>
  );
}

/* ---------- SVG diagrams ---------- */

function Pipeline() {
  const steps = [
    { t: "Market odds", s: "Pinnacle 1X2 + totals" },
    { t: "Fair probs", s: "Shin de-vig" },
    { t: "Expected goals λ", s: "solve from probs" },
    { t: "Scoreline grid", s: "Dixon-Coles Poisson" },
    { t: "Best pick", s: "max expected points" },
  ];
  return (
    <div className="pipeline">
      {steps.map((st, i) => (
        <div className="pipe-wrap" key={st.t}>
          <div className={`pipe-node ${i === steps.length - 1 ? "final" : ""}`}>
            <span className="pipe-t">{st.t}</span>
            <span className="pipe-s">{st.s}</span>
          </div>
          {i < steps.length - 1 && <span className="pipe-arrow">→</span>}
        </div>
      ))}
    </div>
  );
}

function CentralPickChart() {
  // EV values from the model for a ~2.0/0.6 favourite (illustrative, matches app output).
  const data = [
    { pick: "1-0", ev: 1.05, prob: 0.151 },
    { pick: "2-0", ev: 1.10, prob: 0.138, best: true },
    { pick: "2-1", ev: 0.99, prob: 0.091 },
    { pick: "3-0", ev: 0.92, prob: 0.081 },
    { pick: "0-0", ev: 0.77, prob: 0.090 },
  ];
  const W = 460, H = 220, padL = 40, padB = 34, padT = 12;
  const maxEv = 1.2;
  const bw = (W - padL - 16) / data.length;
  const y = (v) => padT + (1 - v / maxEv) * (H - padT - padB);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Expected points by pick">
      {/* axes */}
      <line x1={padL} y1={H - padB} x2={W - 4} y2={H - padB} stroke="var(--rule)" />
      {[0, 0.4, 0.8, 1.2].map((g) => (
        <g key={g}>
          <line x1={padL} y1={y(g)} x2={W - 4} y2={y(g)} stroke="var(--line)" strokeDasharray="2 3" />
          <text x={padL - 6} y={y(g) + 3} textAnchor="end" className="chart-tick">{g}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = padL + 8 + i * bw;
        const top = y(d.ev);
        return (
          <g key={d.pick}>
            <rect
              x={x} y={top} width={bw - 16} height={H - padB - top}
              className={d.best ? "bar best" : "bar"} rx="2"
            />
            <text x={x + (bw - 16) / 2} y={top - 5} textAnchor="middle" className="bar-val">
              {d.ev.toFixed(2)}
            </text>
            <text x={x + (bw - 16) / 2} y={H - padB + 15} textAnchor="middle" className="bar-lbl">
              {d.pick}
            </text>
          </g>
        );
      })}
      <text x={padL} y={padT + 2} className="chart-axis">avg points (EV)</text>
    </svg>
  );
}

function OutcomeBars() {
  // Two equal teams (λ 1.2 each): home / draw / away.
  const data = [
    { k: "Home win", v: 0.36 },
    { k: "Draw", v: 0.29, dim: true },
    { k: "Away win", v: 0.36 },
  ];
  return (
    <div className="obars">
      {data.map((d) => (
        <div className="obar-row" key={d.k}>
          <span className="obar-k">{d.k}</span>
          <span className="obar-track">
            <span className={`obar-fill ${d.dim ? "dim" : ""}`} style={{ width: `${d.v * 100 / 0.4 * 0.9}%` }} />
          </span>
          <span className="obar-v">{Math.round(d.v * 100)}%</span>
        </div>
      ))}
      <p className="m-cap">Two evenly-matched teams — the draw is the smallest slice.</p>
    </div>
  );
}
