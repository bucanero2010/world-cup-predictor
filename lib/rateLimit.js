// Per-action rate-limit guard. Enforces a minimum interval between invocations of each
// on-demand action ("refresh-odds", "update-results") to protect the free-tier quota.
//
// Best-effort in-memory map; on Vercel this is per-instance, which combined with
// on-demand-only fetching is sufficient for a personal tool.

const DEFAULT_INTERVAL_MS = 60 * 1000; // 1 minute between same-action invocations

const lastRun = new Map(); // actionKey -> epoch ms

/**
 * @param {string} actionKey "refresh-odds" | "update-results"
 * @param {Date|number} [now]
 * @param {number} [intervalMs]
 * @returns {{ allowed:boolean, retryAfterMs:number }}
 */
export function allowAction(actionKey, now = Date.now(), intervalMs = DEFAULT_INTERVAL_MS) {
  const t = now instanceof Date ? now.getTime() : now;
  const prev = lastRun.get(actionKey);
  if (prev === undefined || t - prev >= intervalMs) {
    lastRun.set(actionKey, t);
    return { allowed: true, retryAfterMs: 0 };
  }
  return { allowed: false, retryAfterMs: intervalMs - (t - prev) };
}

/** Test helper. */
export function _reset() {
  lastRun.clear();
}

export { DEFAULT_INTERVAL_MS };
