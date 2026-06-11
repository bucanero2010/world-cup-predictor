"use client";

import { useState } from "react";
import { formatKickoff, relativeToKickoff } from "@/lib/time.js";
import { isLockSoon } from "@/lib/lockSoon.js";
import MatchDetail from "./MatchDetail.jsx";
import RefreshButton from "./RefreshButton.jsx";

const fmtPick = (p) => `${p[0]}\u2013${p[1]}`;

function oddsAsOfLabel(iso) {
  if (!iso) return null;
  const p = formatKickoff(iso); // reuse Madrid formatter; shows "Day DD Mon, HH:MM TZ"
  return `odds as of ${p}`;
}

export default function MatchRow({ card }) {
  const [open, setOpen] = useState(false);
  // Local override so a successful manual refresh updates this row in place while
  // retaining the prior pick on failure (Req 1.6, 6.5).
  const [data, setData] = useState(card);

  const lockSoon = isLockSoon(data.commenceTimeUtc);
  const rel = relativeToKickoff(data.commenceTimeUtc);
  const pending = data.status !== "ok";

  return (
    <div className={`matchrow ${lockSoon ? "locksoon" : ""}`}>
      <div className="matchmain" onClick={() => !pending && setOpen((o) => !o)}>
        <div className="teams">
          <span className="team">
            <span className="flag">{data.homeFlag}</span> {data.homeTeam}
          </span>
          <span className="vs">v</span>
          <span className="team">
            <span className="flag">{data.awayFlag}</span> {data.awayTeam}
          </span>
        </div>

        <div className="meta">
          {data.group && <span className="group">{data.group}</span>}
          <span className="kickoff">{formatKickoff(data.commenceTimeUtc)}</span>
          <span className={`rel ${rel}`}>{rel}</span>
          {lockSoon && <span className="lockbadge">lock soon</span>}
        </div>

        <div className="pick">
          {pending ? (
            <span className="pending">Odds Pending</span>
          ) : (
            <span className="pickscore">{fmtPick(data.recommendation.pick)}</span>
          )}
        </div>
      </div>

      <div className="rowfooter">
        {!pending && (
          <span className="asof">
            {oddsAsOfLabel(data.oddsAsOf)} · {data.source}
          </span>
        )}
        <RefreshButton eventId={data.eventId} onRefreshed={(m) => setData(m)} />
      </div>

      {open && !pending && <MatchDetail recommendation={data.recommendation} />}
    </div>
  );
}
