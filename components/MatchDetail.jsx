"use client";

import { useState } from "react";

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const fmtPick = (p) => `${p[0]}\u2013${p[1]}`;

const EDGE_LABEL = { clear: "clear edge", slight: "slight edge", tossup: "toss-up" };

function Heatmap({ matrix, pick, homeTeam, awayTeam }) {
  if (!matrix) return null;
  const max = Math.max(...matrix.flat());
  const n = matrix[0].length;
  return (
    <figure className="heatwrap">
      <figcaption className="heat-title">Probability of each exact score (%)</figcaption>

      {/* away axis label + column numbers, indented to clear the row labels */}
      <div className="heat-toplabel">{awayTeam} goals →</div>
      <div className="heat-colnums">
        <span className="heat-num heat-spacer" />
        {Array.from({ length: n }, (_, a) => (
          <span key={a} className="heat-num heat-cellw">{a}</span>
        ))}
      </div>

      <div className="heat-body">
        <div className="heat-sidelabel"><span>{homeTeam} goals ↓</span></div>
        <div className="heat-rows">
          {matrix.map((row, h) => (
            <div key={h} className="heat-row">
              <span className="heat-num heat-rownum">{h}</span>
              {row.map((p, a) => {
                const isPick = pick && pick[0] === h && pick[1] === a;
                const intensity = max > 0 ? p / max : 0;
                return (
                  <span
                    key={a}
                    className={`heat-cell ${isPick ? "pick" : ""}`}
                    style={{ background: `rgba(31,107,59,${(intensity * 0.85).toFixed(3)})` }}
                    title={`${homeTeam} ${h} – ${a} ${awayTeam}: ${pct(p)}`}
                  >
                    {p >= 0.04 ? Math.round(p * 100) : ""}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <figcaption className="heat-foot">
        Rows = {homeTeam} goals, columns = {awayTeam} goals. Your pick is outlined in red.
      </figcaption>
    </figure>
  );
}

export default function MatchDetail({ recommendation, eventId, homeTeam, awayTeam, stage }) {
  const [rec, setRec] = useState(recommendation);
  const [refining, setRefining] = useState(false);
  const [refineMsg, setRefineMsg] = useState(null);

  if (!rec) return null;
  const r = rec;
  const edgeLevel = r.edge?.level ?? "clear";
  const isKnockout = stage && !/group/i.test(stage);

  async function refine() {
    setRefining(true);
    setRefineMsg(null);
    try {
      const res = await fetch(`/api/matches/${eventId}/refine`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setRec(data.recommendation);
        setRefineMsg(`Sharpened with ${data.lines} totals lines.`);
      } else if (res.status === 429) {
        setRefineMsg(`Try again in ${Math.ceil((data.retryAfterMs ?? 0) / 1000)}s`);
      } else {
        setRefineMsg(data.error || "Refine failed");
      }
    } catch {
      setRefineMsg("Refine failed");
    } finally {
      setRefining(false);
    }
  }

  return (
    <div className="detail">
      {isKnockout && (
        <div className="ko-note">
          <strong>Knockout match.</strong> Superbru scores the result <em>after extra
          time</em> (120 min); a penalty shootout counts as the 120-min draw. These odds
          price the 90-minute result, so the model may under-state goals — treat the pick
          as approximate and lean toward your read of how a tie would break in extra time.
        </div>
      )}

      {r.reason && (
        <div className="why">
          <span className={`edge-badge ${edgeLevel}`}>{EDGE_LABEL[edgeLevel]}</span>
          <span className="why-text">{r.reason}</span>
        </div>
      )}

      <div className="pillrow">
        <span className="pill">home {pct(r.outcome.home)}</span>
        <span className="pill">draw {pct(r.outcome.draw)}</span>
        <span className="pill">away {pct(r.outcome.away)}</span>
        <span className="pill">λ {r.lambda.home.toFixed(2)} / {r.lambda.away.toFixed(2)}</span>
        <span className="pill">de-vig: {r.devigMethod}</span>
        {r.refined && <span className="pill refined">refined</span>}
        {r.fit && !r.fit.consistent && (
          <span
            className="pill fit-warn"
            title={`Model fit is ${(r.fit.maxOutcomeResidual * 100).toFixed(1)}pp off the market on at least one outcome — the 1X2 and totals odds disagree, so treat the pick with extra caution.`}
          >
            ⚠ uncertain fit
          </span>
        )}
      </div>

      <div className="detail-cols">
        <table>
          <thead>
            <tr><th>#</th><th>Pick</th><th>EV (pts)</th><th>P(score)</th></tr>
          </thead>
          <tbody>
            {r.topPicks.map((p) => (
              <tr key={fmtPick(p.pick)} className={p.rank === 1 ? "best" : ""}>
                <td>{p.rank}</td>
                <td>{fmtPick(p.pick)}</td>
                <td>{p.ev.toFixed(3)}</td>
                <td>{pct(p.prob)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Heatmap matrix={r.heatmap} pick={r.pick} homeTeam={homeTeam} awayTeam={awayTeam} />
      </div>

      <div className="bands">
        <span className="band">exact {pct(r.bands.exact.p)} → {r.bands.exact.ev.toFixed(3)}</span>
        <span className="band">close {pct(r.bands.close.p)} → {r.bands.close.ev.toFixed(3)}</span>
        <span className="band">result {pct(r.bands.result.p)} → {r.bands.result.ev.toFixed(3)}</span>
        <span className="band">wrong {pct(r.bands.wrong.p)}</span>
      </div>

      {eventId && (
        <div className="refine">
          <button className="secondary small" onClick={refine} disabled={refining}>
            {refining ? "Sharpening…" : r.refined ? "Re-sharpen odds" : "Sharpen with alt lines"}
          </button>
          {refineMsg && <span className="refine-msg">{refineMsg}</span>}
          <span className="refine-hint">uses ~2 API credits · fits the full goals ladder</span>
        </div>
      )}
    </div>
  );
}
