// The Odds API scores endpoint: final/in-progress results, joined to matches by event id.
// All provider data is untrusted; normalizeScore is the validation gate.

const BASE = "https://api.the-odds-api.com/v4";
const SPORT = "soccer_fifa_world_cup";

function apiKey() {
  const key = process.env.ODDS_API_KEY;
  if (!key) throw new Error("ODDS_API_KEY is not set");
  return key;
}

/**
 * Validate + normalize one raw scores entry.
 * Returns null unless the match is completed with a well-formed score.
 * @param {any} raw
 * @returns {null | {eventId:string, completed:boolean, home:number, away:number}}
 */
export function normalizeScore(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string") return null;
  if (raw.completed !== true) return null; // only freeze finished matches
  if (!Array.isArray(raw.scores) || raw.scores.length < 2) return null;

  const byName = (name) => {
    const entry = raw.scores.find((s) => s && s.name === name);
    if (!entry) return null;
    const n = Number(entry.score);
    return Number.isInteger(n) && n >= 0 ? n : null;
  };

  const home = byName(raw.home_team);
  const away = byName(raw.away_team);
  if (home == null || away == null) return null;

  return { eventId: raw.id, completed: true, home, away };
}

async function getJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const err = new Error(`Scores provider HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Fetch scores for recent/active matches.
 * @param {number} daysFrom how many days back to include completed games (1-3)
 * @returns {Promise<Array>} normalized completed scores (nulls dropped)
 */
export async function fetchScores(daysFrom = 3) {
  const params = new URLSearchParams({
    daysFrom: String(daysFrom),
    apiKey: apiKey(),
  });
  const url = `${BASE}/sports/${SPORT}/scores/?${params.toString()}`;
  const data = await getJson(url);
  if (!Array.isArray(data)) throw new Error("Unexpected scores payload");
  return data.map(normalizeScore).filter(Boolean);
}

export { BASE, SPORT };
