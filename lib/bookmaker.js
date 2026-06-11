// Bookmaker selection: from a provider event's `bookmakers` array, choose the odds
// to feed the model.
//
// Precedence (per resolved decision):
//   1. Sharp book (Pinnacle) present -> use it           (source: "sharp")
//   2. else average decimal odds across all books that
//      expose BOTH h2h and totals                        (source: "average")
//   3. else the first book exposing usable markets        (source: "first")
//   4. else null  (caller marks the match "odds pending")
//
// Provider shape notes (verified against The Odds API soccer_fifa_world_cup):
//   - h2h outcomes are keyed by TEAM NAME (+ "Draw"); order is NOT guaranteed,
//     so we map by name, never by index.
//   - totals carry a `point` line that is NOT always 2.5 (e.g. 2.25). Read it.

const SHARP_KEY = "pinnacle";

/** Pull [home, draw, away] decimal odds and the totals line from one book. */
function extractBook(book, homeTeam, awayTeam) {
  const markets = book?.markets;
  if (!Array.isArray(markets)) return null;

  const h2h = markets.find((m) => m.key === "h2h");
  if (!h2h || !Array.isArray(h2h.outcomes)) return null;

  const byName = (name) =>
    h2h.outcomes.find((o) => o.name === name)?.price;

  const home = byName(homeTeam);
  const draw = byName("Draw");
  const away = byName(awayTeam);
  if (![home, draw, away].every((p) => Number.isFinite(p) && p > 1)) return null;

  const oneXtwo = [home, draw, away];

  // totals is optional; include only if well-formed.
  let totalLine;
  let overUnder;
  const totals = markets.find((m) => m.key === "totals");
  if (totals && Array.isArray(totals.outcomes)) {
    const over = totals.outcomes.find((o) => o.name === "Over");
    const under = totals.outcomes.find((o) => o.name === "Under");
    if (
      over &&
      under &&
      Number.isFinite(over.price) &&
      Number.isFinite(under.price) &&
      Number.isFinite(over.point)
    ) {
      totalLine = over.point;
      overUnder = [over.price, under.price];
    }
  }

  return { oneXtwo, totalLine, overUnder };
}

/**
 * @param {Array} bookmakers provider event.bookmakers
 * @param {object} ctx { homeTeam, awayTeam, sharpKey? }
 * @returns {null | {oneXtwo:number[], totalLine?:number, overUnder?:number[],
 *                    bookmaker:string, source:"sharp"|"average"|"first"}}
 */
export function selectBookmaker(bookmakers, { homeTeam, awayTeam, sharpKey = SHARP_KEY }) {
  if (!Array.isArray(bookmakers) || bookmakers.length === 0) return null;

  // 1. Sharp book.
  const sharp = bookmakers.find((b) => b.key === sharpKey);
  if (sharp) {
    const e = extractBook(sharp, homeTeam, awayTeam);
    if (e) return { ...e, bookmaker: sharpKey, source: "sharp" };
  }

  // Collect all usable books once for the remaining strategies.
  const usable = [];
  for (const b of bookmakers) {
    const e = extractBook(b, homeTeam, awayTeam);
    if (e) usable.push({ key: b.key, ...e });
  }
  if (usable.length === 0) return null;

  // 2. Average across usable books. Only average totals over books that have them.
  if (usable.length > 1) {
    const n = usable.length;
    const avg = (fn) => usable.reduce((s, b) => s + fn(b), 0) / n;
    const oneXtwo = [
      avg((b) => b.oneXtwo[0]),
      avg((b) => b.oneXtwo[1]),
      avg((b) => b.oneXtwo[2]),
    ];
    const withTotals = usable.filter((b) => b.overUnder && b.totalLine != null);
    let totalLine;
    let overUnder;
    if (withTotals.length > 0) {
      const m = withTotals.length;
      totalLine =
        withTotals.reduce((s, b) => s + b.totalLine, 0) / m;
      overUnder = [
        withTotals.reduce((s, b) => s + b.overUnder[0], 0) / m,
        withTotals.reduce((s, b) => s + b.overUnder[1], 0) / m,
      ];
    }
    return { oneXtwo, totalLine, overUnder, bookmaker: "average", source: "average" };
  }

  // 3. First (only) usable book.
  const first = usable[0];
  return {
    oneXtwo: first.oneXtwo,
    totalLine: first.totalLine,
    overUnder: first.overUnder,
    bookmaker: first.key,
    source: "first",
  };
}

export { SHARP_KEY };
