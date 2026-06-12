"use client";

import { useMemo } from "react";
import { madridDayKey, formatKickoff } from "@/lib/time.js";
import MatchRow from "./MatchRow.jsx";

// Pretty day header from a sample ISO in that day.
function dayHeader(sampleIso) {
  const p = formatKickoff(sampleIso); // "Thu 11 Jun, HH:MM TZ"
  return p.split(",")[0]; // "Thu 11 Jun"
}

export default function MatchList({ initial }) {
  const matches = initial?.matches ?? [];

  // Group matches by Madrid calendar day, preserving kickoff order.
  const byDay = useMemo(() => {
    const map = new Map();
    for (const m of matches) {
      const key = madridDayKey(m.commenceTimeUtc);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [matches]);

  if (byDay.length === 0) return <p className="note">No matches to show.</p>;

  return (
    <div>
      {byDay.map(([dayKey, dayMatches]) => (
        <section key={dayKey} className="dayblock">
          <h2 className="dayhead">{dayHeader(dayMatches[0].commenceTimeUtc)}</h2>
          {dayMatches.map((m) => (
            <MatchRow key={m.eventId} card={m} />
          ))}
        </section>
      ))}
    </div>
  );
}
