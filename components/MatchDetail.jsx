"use client";

import { useState } from "react";

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const fmtPick = (p) => `${p[0]}\u2013${p[1]}`;

const EDGE_LABEL = { clear: "clear edge", slight: "slight edge", tossup: "toss-up" };

function Heatmap({ matrix, pick }) {
  if (!matrix) return null;
  const max = Math.max(...matrix.flat());
  return (
    <div className="heatwrap">
      <div className="heat-axis-label heat-away">away goals →</div>
      <table className="heatmap">
        <tbody>
          {matrix.map((row, h) => (
            <tr key={h}>
              <th className="heat-h">{h}</th>
              {row.map((p, a) => {
                const isPick = pick && pick[0] === h && pick[1] === a;
                const intensity = max > 0 ? p / max : 0;
                return (
                  <td
                    key={a}
                    className={`heat-cell ${isPick ? "pick" : ""}`}
                    style={{ background: `rgba(31,107,59,${(intensity * 0.85).toFixed(3)})` }}
                    title={`${h}-${a}: ${pct(p)}`}
                  >
                    {p >= 0.04 ? Math.round(p * 100) : ""}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <th className="heat-h">↓h</th>
            {matrix[0].map((_, a) => (
              <th key={a} className="heat-a">{a}</th>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function MatchDetail({ recommendation, eventId }) {
  const [rec, setRec] = useState(recommendation);
  const [refining, setRefining] = useState(false);
  const [refineMsg, setRefineMsg] = useState(null);

  if (!rec) return null;
  const r = rec;
  const edgeLevel = r.edge?.level ?? "clear";

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

        <Heatmap matrix={r.heatmap} pick={r.pick} />
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
