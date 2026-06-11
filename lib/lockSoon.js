// "Lock soon" highlight rule (Req 3.3, 3.4).
//
// Superbru locks a pick at kickoff. We surface a heads-up so the user doesn't miss it:
//   - Normal-hours kickoff: highlight once now >= kickoff - 2h.
//   - After-midnight kickoff (Madrid local hour in [0, WAKE_HOUR)): a 2h-before nudge
//     would fire in the middle of the night, so instead highlight from the preceding
//     Madrid midnight onward (so it's already flagged when the user wakes / before they
//     go to bed the night before).
//
// Pure function of (kickoff, now) — `now` is injectable for testing.

import { madridHour, madridDayKey } from "./time.js";

const LOCK_LEAD_MS = 2 * 60 * 60 * 1000; // 2 hours
const WAKE_HOUR = 6; // kickoffs before 06:00 Madrid are "after midnight"

/** The UTC instant of Madrid midnight that begins the kickoff's local calendar day. */
function madridMidnightOf(isoUtc) {
  const dayKey = madridDayKey(isoUtc); // "YYYY-MM-DD" in Madrid
  // Find the UTC instant whose Madrid day is dayKey and Madrid hour is 0.
  // Madrid is UTC+1 (CET) or UTC+2 (CEST); midnight local = 22:00 or 23:00 UTC the
  // previous day. Probe both candidates and pick the one that lands on hour 0.
  const [y, m, d] = dayKey.split("-").map(Number);
  for (const utcHour of [22, 23, 0, 1]) {
    // candidate previous-day 22:00/23:00 UTC, or same-day 00:00/01:00 UTC
    const base = Date.UTC(y, m - 1, d, utcHour, 0, 0);
    for (const dayShift of [-1, 0]) {
      const cand = base + dayShift * 24 * 3600 * 1000;
      if (madridHour(new Date(cand).toISOString()) === 0 &&
          madridDayKey(new Date(cand).toISOString()) === dayKey) {
        return cand;
      }
    }
  }
  // Fallback: 24h before kickoff (should not happen in practice).
  return new Date(isoUtc).getTime() - 24 * 3600 * 1000;
}

/**
 * @param {string} kickoffIsoUtc
 * @param {Date|string|number} [now]
 * @returns {boolean} whether the lock-soon highlight is active now
 */
export function isLockSoon(kickoffIsoUtc, now = new Date()) {
  const kickoff = new Date(kickoffIsoUtc).getTime();
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();

  if (t >= kickoff) return false; // already kicked off; not "soon" anymore

  const localHour = madridHour(kickoffIsoUtc);
  const afterMidnight = localHour < WAKE_HOUR;

  const threshold = afterMidnight
    ? madridMidnightOf(kickoffIsoUtc)
    : kickoff - LOCK_LEAD_MS;

  return t >= threshold;
}

export { LOCK_LEAD_MS, WAKE_HOUR };
