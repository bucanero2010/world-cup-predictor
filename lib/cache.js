// Durable snapshot cache. Persistence is isolated here (no database) so it can be
// swapped for Vercel KV later without touching routes.
//
// On Vercel, module-level state is per-instance and can cold-start empty, so this is
// a best-effort in-process memo. The route layer treats a cold/empty cache as a cache
// miss and refetches. The interface is intentionally async to allow a KV-backed
// implementation to drop in unchanged.
//
// Snapshot shape:
//   { matches: RecommendationCard[], fetchedAt: ISO string, stale: boolean }

let snapshot = null; // { matches, fetchedAt }

/** @returns {Promise<null | {matches:any[], fetchedAt:string}>} */
export async function getCachedMatches() {
  return snapshot;
}

/** Replace the full snapshot. */
export async function setCachedMatches(next) {
  snapshot = {
    matches: Array.isArray(next?.matches) ? next.matches : [],
    fetchedAt: next?.fetchedAt ?? new Date().toISOString(),
  };
  return snapshot;
}

/**
 * Update a single match entry in place (Req 4.8). No-op if no snapshot exists yet
 * or the match id is unknown (caller still has fresh data to return).
 * @returns {Promise<boolean>} whether an entry was patched
 */
export async function patchCachedMatch(eventId, card) {
  if (!snapshot || !Array.isArray(snapshot.matches)) return false;
  const idx = snapshot.matches.findIndex((m) => m.eventId === eventId);
  if (idx === -1) return false;
  snapshot.matches[idx] = card;
  return true;
}

/** @returns {boolean} whether the snapshot is older than maxAgeMs. */
export function isStale(snap, maxAgeMs) {
  if (!snap || !snap.fetchedAt) return true;
  return Date.now() - new Date(snap.fetchedAt).getTime() > maxAgeMs;
}

/** Test/maintenance helper. */
export function _reset() {
  snapshot = null;
}
