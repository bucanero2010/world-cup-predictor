// Emoji flags from a static team -> ISO country code map (Req 3.1, 3.2).
//
// v1 decision: Unicode emoji flags. Zero assets, no network. Known trade-off:
// Windows Chrome/Edge render these as letter pairs (no emoji flag font). The
// interface returns the country `code` too, so swapping to flag-icons SVG later
// is a render-only change.
//
// Team names match The Odds API's `soccer_fifa_world_cup` feed exactly.

const TEAM_CODE = {
  Algeria: "DZ",
  Argentina: "AR",
  Australia: "AU",
  Austria: "AT",
  Belgium: "BE",
  "Bosnia & Herzegovina": "BA",
  Brazil: "BR",
  Canada: "CA",
  "Cape Verde": "CV",
  Colombia: "CO",
  Croatia: "HR",
  "Curaçao": "CW",
  "Czech Republic": "CZ",
  "DR Congo": "CD",
  Ecuador: "EC",
  Egypt: "EG",
  England: "GB-ENG",
  France: "FR",
  Germany: "DE",
  Ghana: "GH",
  Haiti: "HT",
  Iran: "IR",
  Iraq: "IQ",
  "Ivory Coast": "CI",
  Japan: "JP",
  Jordan: "JO",
  Mexico: "MX",
  Morocco: "MA",
  Netherlands: "NL",
  "New Zealand": "NZ",
  Norway: "NO",
  Panama: "PA",
  Paraguay: "PY",
  Portugal: "PT",
  Qatar: "QA",
  "Saudi Arabia": "SA",
  Scotland: "GB-SCT",
  Senegal: "SN",
  "South Africa": "ZA",
  "South Korea": "KR",
  Spain: "ES",
  Sweden: "SE",
  Switzerland: "CH",
  Tunisia: "TN",
  Turkey: "TR",
  USA: "US",
  Uruguay: "UY",
  Uzbekistan: "UZ",
  Wales: "GB-WLS",
};

const PLACEHOLDER = "\u{1F3F3}\u{FE0F}"; // white flag 🏳️

// Subdivision flags (England/Scotland/Wales) use emoji tag sequences.
const SUBDIVISION_EMOJI = {
  "GB-ENG": "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
  "GB-SCT": "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}",
  "GB-WLS": "\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}",
};

/** Convert a 2-letter ISO code to its regional-indicator emoji flag. */
function codeToEmoji(code) {
  if (SUBDIVISION_EMOJI[code]) return SUBDIVISION_EMOJI[code];
  if (!/^[A-Z]{2}$/.test(code)) return PLACEHOLDER;
  const A = 0x1f1e6;
  const base = "A".charCodeAt(0);
  return (
    String.fromCodePoint(A + code.charCodeAt(0) - base) +
    String.fromCodePoint(A + code.charCodeAt(1) - base)
  );
}

/**
 * @param {string} teamName
 * @returns {{ emoji:string, code:string|null }}
 */
export function flagFor(teamName) {
  const code = TEAM_CODE[teamName] ?? null;
  if (!code) return { emoji: PLACEHOLDER, code: null };
  return { emoji: codeToEmoji(code), code };
}

export { TEAM_CODE, PLACEHOLDER };
