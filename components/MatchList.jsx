"use client";

import { useMemo, useState } from "react";
import { madridDayKey, formatKickoff, kickoffState } from "@/lib/time.js";
import MatchRow from "./MatchRow.jsx";

// Pretty day header from a day key + a sample ISO in that day.
function dayHeader(sampleIso) {
  const p = formatKickoff(sampleIso); // "Thu 11 Jun, HH:MM TZ"
  return p.split(",")[0]; // "Thu 11 Jun"
}

export default function MatchList({ initial }) {
  const [filter, setFilter] = useState("all"); // all | upcoming
  const [group, setGroup] = useState("all");
  const [query, setQuery] = useState("");

  const matches = initial?.matches ?? [];

  const groups = useMemo(() => {
    const s = new Set();
    for (const m of matches) if (m.group) s.add(m.group);
    return ["all", ...[...s].sort()];
  }, [matches]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return matches.filter((m) => {
      if (filter === "upcoming" && kickoffState(m.commenceTimeUtc) === "finished") {
        return false;
      }
      if (group !== "all" && m.group !== group) return false;
      if (q && !(`${m.homeTeam} ${m.awayTeam}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [matches, filter, group, query]);

  // Group filtered matches by Madrid calendar day, preserving kickoff order.
  const byDay = useMemo(() => {
    const map = new Map();
    for (const m of filtered) {
      const key = madridDayKey(m.commenceTimeUtc);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div>
      <div className="controls">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All matches</option>
          <option value="upcoming">Upcoming only</option>
        </select>
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g === "all" ? "All groups" : g}
            </option>
          ))}
        </select>
        <input
          placeholder="Search team…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {byDay.length === 0 && <p className="note">No matches to show.</p>}

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
