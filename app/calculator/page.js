"use client";

import { useState } from "react";
import { scoreGrid } from "@/lib/poisson.js";
import { fromOdds } from "@/lib/odds.js";
import { rankPicks, outcomeProbs } from "@/lib/optimizer.js";
import { devigBest, proportionalDevig } from "@/lib/shin.js";
import SiteHeader from "@/components/SiteHeader.jsx";

const pct = (x) => `${(x * 100).toFixed(1)}%`;

export default function Home() {
  const [mode, setMode] = useState("xg"); // "xg" | "odds"
  const [home, setHome] = useState("Home");
  const [away, setAway] = useState("Away");
  const [devigMethod, setDevigMethod] = useState("shin"); // "shin" | "proportional"

  // xG inputs
  const [lh, setLh] = useState("1.5");
  const [la, setLa] = useState("1.0");

  // odds inputs
  const [oddsH, setOddsH] = useState("2.10");
  const [oddsD, setOddsD] = useState("3.40");
  const [oddsA, setOddsA] = useState("3.60");
  const [line, setLine] = useState("2.5");
  const [oddsOver, setOddsOver] = useState("");
  const [oddsUnder, setOddsUnder] = useState("");

  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);

  function compute() {
    setErr(null);
    try {
      let lambdaHome;
      let lambdaAway;

      if (mode === "xg") {
        lambdaHome = parseFloat(lh);
        lambdaAway = parseFloat(la);
        if (!(lambdaHome > 0) || !(lambdaAway > 0)) {
          throw new Error("Expected goals must be positive numbers.");
        }
      } else {
        const oneXtwo = [oddsH, oddsD, oddsA].map(parseFloat);
        if (oneXtwo.some((o) => !(o > 1))) {
          throw new Error("1X2 decimal odds must each be greater than 1.");
        }
        const overUnder =
          oddsOver && oddsUnder
            ? [parseFloat(oddsOver), parseFloat(oddsUnder)]
            : undefined;
        const solved = fromOdds({
          oneXtwo,
          totalLine: parseFloat(line) || 2.5,
          overUnder,
          devig: devigMethod === "shin" ? devigBest : proportionalDevig,
        });
        lambdaHome = solved.lambdaHome;
        lambdaAway = solved.lambdaAway;
      }

      const grid = scoreGrid(lambdaHome, lambdaAway);
      const ranked = rankPicks(grid).slice(0, 8);
      const probs = outcomeProbs(grid);
      setOut({ lambdaHome, lambdaAway, ranked, probs });
    } catch (e) {
      setOut(null);
      setErr(e.message);
    }
  }

  return (
    <main className="wrap">
      <SiteHeader tagline="What-if calculator: enter expected goals or market odds for any matchup and see the optimal pick." />

      <div className="panel">
        <div className="row" style={{ marginBottom: 16 }}>
          <div className="field">
            <label>Home team</label>
            <input value={home} onChange={(e) => setHome(e.target.value)} />
          </div>
          <div className="field">
            <label>Away team</label>
            <input value={away} onChange={(e) => setAway(e.target.value)} />
          </div>
        </div>

        <div className="tabs">
          <button
            className={`tab ${mode === "xg" ? "active" : ""}`}
            onClick={() => setMode("xg")}
          >
            Expected goals
          </button>
          <button
            className={`tab ${mode === "odds" ? "active" : ""}`}
            onClick={() => setMode("odds")}
          >
            Market odds
          </button>
        </div>

        {mode === "xg" ? (
          <div className="row">
            <div className="field">
              <label>{home} expected goals (λ)</label>
              <input value={lh} onChange={(e) => setLh(e.target.value)} />
            </div>
            <div className="field">
              <label>{away} expected goals (λ)</label>
              <input value={la} onChange={(e) => setLa(e.target.value)} />
            </div>
          </div>
        ) : (
          <>
            <div className="row">
              <div className="field">
                <label>Home win odds</label>
                <input value={oddsH} onChange={(e) => setOddsH(e.target.value)} />
              </div>
              <div className="field">
                <label>Draw odds</label>
                <input value={oddsD} onChange={(e) => setOddsD(e.target.value)} />
              </div>
              <div className="field">
                <label>Away win odds</label>
                <input value={oddsA} onChange={(e) => setOddsA(e.target.value)} />
              </div>
            </div>
            <div className="row" style={{ marginTop: 16 }}>
              <div className="field">
                <label>Totals line</label>
                <input value={line} onChange={(e) => setLine(e.target.value)} />
              </div>
              <div className="field">
                <label>Over odds (optional)</label>
                <input
                  value={oddsOver}
                  onChange={(e) => setOddsOver(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Under odds (optional)</label>
                <input
                  value={oddsUnder}
                  onChange={(e) => setOddsUnder(e.target.value)}
                />
              </div>
            </div>
            <p className="note">
              Decimal odds. Add over/under to anchor the total-goals estimate
              (improves accuracy).
            </p>
            <div className="field" style={{ marginTop: 12 }}>
              <label>De-vig method</label>
              <select
                value={devigMethod}
                onChange={(e) => setDevigMethod(e.target.value)}
              >
                <option value="shin">Shin (favorite-longshot aware)</option>
                <option value="proportional">Proportional (simple)</option>
              </select>
            </div>
          </>
        )}

        <button className="primary" onClick={compute}>
          Compute best pick
        </button>
        {err && (
          <p className="note" style={{ color: "#b23a32" }}>
            {err}
          </p>
        )}
      </div>

      {out && (
        <div className="panel">
          <div className="result">
            <span className="bigpick">
              {out.ranked[0].pick[0]}&ndash;{out.ranked[0].pick[1]}
            </span>
            <span className="ev">
              expected {out.ranked[0].ev.toFixed(3)} pts &middot; this exact
              score {pct(out.ranked[0].prob)}
            </span>
          </div>

          <div style={{ marginBottom: 16 }}>
            <span className="pill">
              {home} win {pct(out.probs.home)}
            </span>
            <span className="pill">draw {pct(out.probs.draw)}</span>
            <span className="pill">
              {away} win {pct(out.probs.away)}
            </span>
            <span className="pill">
              λ {out.lambdaHome.toFixed(2)} / {out.lambdaAway.toFixed(2)}
            </span>
          </div>

          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Pick</th>
                <th>Expected pts</th>
                <th>P(this score)</th>
              </tr>
            </thead>
            <tbody>
              {out.ranked.map((r, i) => (
                <tr key={`${r.pick[0]}-${r.pick[1]}`}>
                  <td>{i + 1}</td>
                  <td>
                    {r.pick[0]}&ndash;{r.pick[1]}
                  </td>
                  <td>{r.ev.toFixed(3)}</td>
                  <td>{pct(r.prob)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">
            The top pick maximizes expected points. Notice it is usually a low,
            central scoreline, not the single most likely score, because the
            &ldquo;close&rdquo; band rewards predictions surrounded by other
            plausible outcomes.
          </p>
        </div>
      )}
    </main>
  );
}
