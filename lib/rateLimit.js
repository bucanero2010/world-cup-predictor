// Per-event manual-refresh guard (Req 6.6, 9.1).
//
// Enforces a minimum interval between manual refreshes of the same match, protecting
// the provider free-tier quota. Best-effort in-memory map keyed by event id; on
// Vercel this is per-instance, which combined with the snapshot cache is sufficient
// for a personal tool. Swap for Vercel KV if cross-instance enforcement is ever needed.

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const lastRefresh = new Map(); // eventId -> epoch ms

/**
 * @param {string} eventId
 * @param {Date|number} [now]
 * @param {number} [intervalMs]
 * @returns {{ allowed:boolean, retryAfterMs:number }}
 */
export function allowRefresh(eventId, now = Date.now(), intervalMs = DEFAULT_INTERVAL_MS) {
  const t = now instanceof Date ? now.getTime() : now;
  const prev = lastRefresh.get(eventId);
  if (prev === undefined || t - prev >= intervalMs) {
    lastRefresh.set(eventId, t);
    return { allowed: true, retryAfterMs: 0 };
  }
  return { allowed: false, retryAfterMs: intervalMs - (t - prev) };
}

/** Test helper. */
export function _reset() {
  lastRefresh.clear();
}

export { DEFAULT_INTERVAL_MS };
