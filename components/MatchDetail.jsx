"use client";

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const fmtPick = (p) => `${p[0]}\u2013${p[1]}`;

export default function MatchDetail({ recommendation }) {
  if (!recommendation) return null;
  const r = recommendation;

  return (
    <div className="detail">
      <div className="pillrow">
        <span className="pill">home {pct(r.outcome.home)}</span>
        <span className="pill">draw {pct(r.outcome.draw)}</span>
        <span className="pill">away {pct(r.outcome.away)}</span>
        <span className="pill">
          λ {r.lambda.home.toFixed(2)} / {r.lambda.away.toFixed(2)}
        </span>
        <span className="pill">de-vig: {r.devigMethod}</span>
      </div>

      {r.differsFromModal && (
        <p className="note">
          Best EV pick {fmtPick(r.pick)} differs from the single most likely score{" "}
          {fmtPick(r.modal)} — the &ldquo;close&rdquo; band rewards a more central
          prediction.
        </p>
      )}

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Pick</th>
            <th>EV (pts)</th>
            <th>P(score)</th>
          </tr>
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

      <div className="bands">
        <span className="band">exact {pct(r.bands.exact.p)} → {r.bands.exact.ev.toFixed(3)}</span>
        <span className="band">close {pct(r.bands.close.p)} → {r.bands.close.ev.toFixed(3)}</span>
        <span className="band">result {pct(r.bands.result.p)} → {r.bands.result.ev.toFixed(3)}</span>
        <span className="band">wrong {pct(r.bands.wrong.p)}</span>
      </div>
    </div>
  );
}
