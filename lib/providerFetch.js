// Shared key management + failover for The Odds API.
//
// Reads the primary key from ODDS_API_KEY and an optional backup from
// ODDS_API_KEY_BACKUP. On a quota/auth failure (HTTP 401 or 429) with the primary
// key, it automatically retries the request with the backup key. Any other error
// (network, 5xx, malformed) is surfaced immediately without burning the backup.

const FAILOVER_STATUSES = new Set([401, 429]);

/** Ordered list of usable API keys: primary first, backup second. */
export function apiKeys() {
  const keys = [process.env.ODDS_API_KEY, process.env.ODDS_API_KEY_BACKUP].filter(
    (k) => typeof k === "string" && k.length > 0
  );
  if (keys.length === 0) throw new Error("ODDS_API_KEY is not set");
  return keys;
}

async function getJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const err = new Error(`Odds provider HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Fetch JSON, trying each available key in turn. A 401/429 with one key triggers a
 * retry with the next; the last error is thrown if all keys fail.
 * @param {(key:string) => string} buildUrlForKey returns the full URL for a given key
 * @returns {Promise<any>}
 */
export async function fetchWithFailover(buildUrlForKey) {
  const keys = apiKeys();
  let lastErr;
  for (let i = 0; i < keys.length; i++) {
    try {
      return await getJson(buildUrlForKey(keys[i]));
    } catch (err) {
      lastErr = err;
      const canFailover = FAILOVER_STATUSES.has(err.status) && i < keys.length - 1;
      if (!canFailover) throw err;
      // else: quota/auth issue and we have another key — try it.
    }
  }
  throw lastErr;
}
