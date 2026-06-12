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

      {/* What we fetch */}
      <section className="m-section">
        <h2 className="m-h2">What we fetch</h2>
        <p className="m-lead">
          Just two markets from one bookmaker (Pinnacle, the sharpest), in a single API
          call — 2 credits for every match at once:
        </p>
        <div className="fetchgrid">
          <div className="fetchcard">
            <span className="fetch-k">h2h</span>
            <span className="fetch-d">Match result — three decimal prices: home win, draw, away win.</span>
            <span className="fetch-ex">e.g. 1.50 / 4.20 / 6.50</span>
          </div>
          <div className="fetchcard">
            <span className="fetch-k">totals</span>
            <span className="fetch-d">Over/under total goals at one line (often 2.5), with both prices.</span>
            <span className="fetch-ex">e.g. Over 2.5 @ 1.95</span>
          </div>
        </div>
        <p className="m-cap">
          The result market tells us <em>who</em> wins; the totals market tells us{" "}
          <em>how many goals</em>. Together they&apos;re enough to reconstruct every
          scoreline. We deliberately skip pricier markets (correct-score, handicaps) — they
          add cost and noise without changing the answer much.
        </p>
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
          A decimal odd implies a probability of 1/odds. But across the three results those
          don&apos;t add up to 100% — the excess is the bookmaker&apos;s built-in margin
          (the &ldquo;overround&rdquo;, typically 4–6% on the match result). We remove it
          with <strong>Shin&apos;s method</strong>, which assumes part of the margin comes
          from informed (&ldquo;insider&rdquo;) money and so trims favourites and longshots
          differently — more realistically than a flat rescale.
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
          z (the insider share, between 0 and 1) is solved by bisection so the fair
          probabilities sum to exactly 1.
        </p>
      </section>

      {/* Step 2 */}
      <section className="m-section">
        <h2 className="m-h2"><span className="step-num">2</span> Back out expected goals (λ)</h2>
        <p>
          Now we have four fair targets: the home/draw/away probabilities <em>and</em> the
          over-line probability. We search for the pair of scoring rates{" "}
          <span className="mono">λ<sub>home</sub></span> and{" "}
          <span className="mono">λ<sub>away</sub></span> whose scoreline grid reproduces all
          four as closely as possible, minimising:
        </p>
        <div className="formula small">
          cost = (P̂<sub>H</sub>−P<sub>H</sub>)² + (P̂<sub>D</sub>−P<sub>D</sub>)² +
          (P̂<sub>A</sub>−P<sub>A</sub>)² + (P̂<sub>over</sub>−P<sub>over</sub>)²
        </div>
        <p className="m-cap">
          P are the market targets; P̂ are what a candidate (λ<sub>h</sub>, λ<sub>a</sub>)
          predicts. A coarse-to-fine grid search (step 0.1, then 0.02) finds the best pair.
          The result probabilities set the <em>split</em> of goals; the totals line fixes
          the <em>volume</em>.
        </p>
      </section>

      {/* Step 3 */}
      <section className="m-section">
        <h2 className="m-h2"><span className="step-num">3</span> Build every scoreline</h2>
        <p>
          With λ in hand, the probability of any exact score (home h, away a) is two Poisson
          distributions multiplied together, times a correction:
        </p>
        <div className="formula">
          P(h, a) ={" "}
          <span className="frac"><span className="num">λ<sub>h</sub><sup>h</sup> e<sup>−λ<sub>h</sub></sup></span><span className="den">h!</span></span>
          ·
          <span className="frac"><span className="num">λ<sub>a</sub><sup>a</sup> e<sup>−λ<sub>a</sub></sup></span><span className="den">a!</span></span>
          · τ(h, a)
        </div>
        <p>
          Plain Poisson slightly misprices the lowest scores — real football has more 0-0s
          and 1-1s than independence predicts. The <strong>Dixon-Coles</strong> factor{" "}
          <span className="mono">τ</span> corrects exactly those four cells:
        </p>
        <div className="formula small">
          τ(0,0)=1−λ<sub>h</sub>λ<sub>a</sub>ρ &nbsp;·&nbsp; τ(0,1)=1+λ<sub>h</sub>ρ &nbsp;·&nbsp;
          τ(1,0)=1+λ<sub>a</sub>ρ &nbsp;·&nbsp; τ(1,1)=1−ρ
        </div>
        <p className="m-cap">
          ρ ≈ −0.05 nudges draws up; everything else is τ = 1. The full grid (0–8 goals each
          side) is then normalised to sum to 1.
        </p>
      </section>

      {/* Step 4 */}
      <section className="m-section">
        <h2 className="m-h2"><span className="step-num">4</span> Pick the highest expected points</h2>
        <p>
          For every scoreline you <em>could</em> pick, sum its Superbru points over the whole
          grid, weighted by how likely each actual result is — then choose the best:
        </p>
        <div className="formula">
          EV(pick) = Σ<sub>all (h,a)</sub> P(h, a) · points(pick, (h, a))
        </div>
      </section>

      {/* Worked example */}
      <section className="m-section highlight">
        <h2 className="m-h2">A worked example, end to end</h2>
        <p className="m-lead">
          A favourite at home. Odds <span className="mono">1.50 / 4.20 / 6.50</span>, with
          Over 2.5 priced at <span className="mono">1.95</span>.
        </p>
        <ol className="worked">
          <li>
            <strong>Implied probabilities.</strong> 1/1.50 = 0.667, 1/4.20 = 0.238,
            1/6.50 = 0.154 — summing to <span className="mono">1.059</span>, a{" "}
            <strong>5.9% margin</strong> to remove.
          </li>
          <li>
            <strong>Shin de-vig.</strong> Solving gives insider share{" "}
            <span className="mono">z = 0.030</span> and fair probabilities{" "}
            <span className="mono">64.3%</span> / <span className="mono">22.0%</span> /{" "}
            <span className="mono">13.7%</span>. The Over 2.5 price de-vigs to{" "}
            <span className="mono">~50%</span>.
          </li>
          <li>
            <strong>Solve for λ.</strong> The grid search lands on{" "}
            <span className="mono">λ<sub>home</sub> = 1.92</span>,{" "}
            <span className="mono">λ<sub>away</sub> = 0.76</span> — the rates that reproduce
            a 64/22/14 split with a coin-flip on over 2.5.
          </li>
          <li>
            <strong>Build the grid.</strong> That yields{" "}
            <span className="mono">1-0 = 12.7%</span>,{" "}
            <span className="mono">2-0 = 12.6%</span>,{" "}
            <span className="mono">0-0 = 7.4%</span>, and so on.
          </li>
          <li><strong>Score every pick</strong> by expected points:</li>
        </ol>
        <CentralPickChart />
        <p style={{ marginTop: 12 }}>
          <strong>Verdict: pick 2-0.</strong> <span className="mono">1-0</span> is the single
          most <em>likely</em> score (12.7% vs 12.6%), but <span className="mono">2-0</span>{" "}
          wins on <em>expected points</em> (1.08 vs 1.01): it sits in the middle of the
          cluster of likely home wins (1-0, 2-1, 3-0, 3-1), so it banks the 1.5
          &ldquo;close&rdquo; bonus far more often. That gap is the entire edge this tool
          finds.
        </p>
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
  // EV values from the model for the worked-example favourite (λ 1.92/0.76).
  const data = [
    { pick: "1-0", ev: 1.01, prob: 0.127 },
    { pick: "2-0", ev: 1.08, prob: 0.126, best: true },
    { pick: "2-1", ev: 1.00, prob: 0.096 },
    { pick: "3-0", ev: 0.93, prob: 0.081 },
    { pick: "0-0", ev: 0.77, prob: 0.074 },
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
