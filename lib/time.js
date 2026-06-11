// Europe/Madrid time localization. Uses Intl.DateTimeFormat with an explicit
// timeZone, so CET/CEST daylight saving is handled by the runtime tz database —
// no manual offset switching anywhere in the app.

const TZ = "Europe/Madrid";
const MATCH_DURATION_MS = 105 * 60 * 1000; // ~regulation + half-time, for "live"

/** Get Madrid-local calendar parts for an instant. */
export function toMadrid(isoUtc) {
  const d = new Date(isoUtc);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return {
    weekday: get("weekday"),
    day: get("day"),
    month: get("month"),
    hour: get("hour"),
    minute: get("minute"),
    tzName: get("timeZoneName"), // "CET" or "CEST"
  };
}

/** "Thu 11 Jun, 21:00 CEST" */
export function formatKickoff(isoUtc) {
  const p = toMadrid(isoUtc);
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute} ${p.tzName}`;
}

/** Stable key for grouping by Madrid calendar day: "YYYY-MM-DD". */
export function madridDayKey(isoUtc) {
  const d = new Date(isoUtc);
  // en-CA yields YYYY-MM-DD ordering.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** The Madrid local hour (0-23) for an instant. */
export function madridHour(isoUtc) {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    hour12: false,
  }).format(new Date(isoUtc));
  // en-GB can render midnight as "24"; normalize.
  const n = parseInt(h, 10);
  return n === 24 ? 0 : n;
}

/**
 * @returns {"upcoming"|"live"|"finished"}
 */
export function kickoffState(isoUtc, now = new Date()) {
  const kickoff = new Date(isoUtc).getTime();
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (t < kickoff) return "upcoming";
  if (t < kickoff + MATCH_DURATION_MS) return "live";
  return "finished";
}

/** "in 3h" | "in 25m" | "live" | "finished" */
export function relativeToKickoff(isoUtc, now = new Date()) {
  const state = kickoffState(isoUtc, now);
  if (state !== "upcoming") return state;
  const kickoff = new Date(isoUtc).getTime();
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const mins = Math.round((kickoff - t) / 60000);
  if (mins >= 1440) return `in ${Math.round(mins / 1440)}d`;
  if (mins >= 60) return `in ${Math.round(mins / 60)}h`;
  return `in ${mins}m`;
}

export { TZ };
