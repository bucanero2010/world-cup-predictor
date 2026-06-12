// The Odds API integration: fetch + validation boundary.
//
// ALL provider data is untrusted. normalizeEvent is the single gate: it validates
// shapes, keeps valid fields, drops invalid ones, and returns null for an event with
// no usable market (caller marks it "odds pending"). Modeling code only ever sees
// normalized output.
//
// Keys are read from ODDS_API_KEY (primary) and ODDS_API_KEY_BACKUP (optional), with
// automatic failover handled in lib/providerFetch.js. Used only here (server).

import { selectBookmaker } from "./bookmaker.js";
import { fetchWithFailover, apiKeys } from "./providerFetch.js";

const BASE = "https://api.the-odds-api.com/v4";
const SPORT = "soccer_fifa_world_cup";
const REGIONS = "eu";
const MARKETS = "h2h,totals";
const ODDS_FORMAT = "decimal";

/**
 * Build a provider URL. Key included; never logged or returned to clients. When no key
 * is passed, the primary key is used (kept for tests / simple call sites).
 */
function buildUrl(path, extra = {}, key) {
  const apiKey = key ?? apiKeys()[0];
  const params = new URLSearchParams({
    regions: REGIONS,
    markets: MARKETS,
    oddsFormat: ODDS_FORMAT,
    apiKey,
    ...extra,
  });
  return `${BASE}${path}?${params.toString()}`;
}

/**
 * Validate + normalize one raw provider event into NormalizedOdds, or null.
 * @param {any} raw
 * @returns {null | object}
 */
export function normalizeEvent(raw) {
  if (!raw || typeof raw !== "object") return null;
  const { id, home_team: homeTeam, away_team: awayTeam, commence_time: commenceTimeUtc } = raw;
  if (typeof id !== "string") return null;
  if (typeof homeTeam !== "string" || typeof awayTeam !== "string") return null;
  if (typeof commenceTimeUtc !== "string" || Number.isNaN(Date.parse(commenceTimeUtc))) {
    return null;
  }

  const base = {
    eventId: id,
    homeTeam,
    awayTeam,
    commenceTimeUtc,
    group: typeof raw.group === "string" ? raw.group : undefined,
  };

  // selectBookmaker performs its own per-field validation and returns null if no
  // usable market exists -> event degrades to "odds pending".
  const selection = selectBookmaker(raw.bookmakers, { homeTeam, awayTeam });
  if (!selection) {
    return { ...base, status: "pending" };
  }

  // oddsAsOf: use the freshest last_update among the chosen book's markets if present.
  let oddsAsOf = new Date().toISOString();
  if (Array.isArray(raw.bookmakers)) {
    const updates = raw.bookmakers
      .map((b) => b?.last_update)
      .filter((u) => typeof u === "string" && !Number.isNaN(Date.parse(u)));
    if (updates.length) {
      oddsAsOf = updates.sort().at(-1);
    }
  }

  return {
    ...base,
    status: "ok",
    oneXtwo: selection.oneXtwo,
    totalLine: selection.totalLine,
    overUnder: selection.overUnder,
    bookmaker: selection.bookmaker,
    source: selection.source,
    oddsAsOf,
  };
}

/** Full-list fetch -> array of normalized events (nulls dropped). Fails over to backup key. */
export async function fetchAllOdds() {
  const data = await fetchWithFailover((key) => buildUrl(`/sports/${SPORT}/odds`, {}, key));
  if (!Array.isArray(data)) throw new Error("Unexpected provider payload");
  return data.map(normalizeEvent).filter(Boolean);
}

export { BASE, SPORT, buildUrl };
