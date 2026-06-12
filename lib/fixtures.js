// Stage + group labelling for 2026 World Cup matches.
//
// The Odds API provides NO group/stage field, so we derive it:
//   - Group stage: a static team -> group map (the official Dec 2025 draw). Groups were
//     also cross-checked against the fixture matchup graph (each group is the set of 4
//     teams that all play each other).
//   - Knockouts: by kickoff date window, since team identities aren't known until the
//     groups finish.
//
// If a group-stage match's two teams disagree on group (shouldn't happen) or a team is
// unknown, we fall back to a generic "Group Stage" label.

const TEAM_GROUP = {
  // Group A
  Mexico: "A", "South Africa": "A", "South Korea": "A", "Czech Republic": "A",
  // Group B
  Canada: "B", Switzerland: "B", Qatar: "B", "Bosnia & Herzegovina": "B",
  // Group C
  "Ivory Coast": "C", Germany: "C", Ecuador: "C", "Curaçao": "C",
  // Group D
  USA: "D", Paraguay: "D", Turkey: "D", Australia: "D",
  // Group E
  Argentina: "E", Austria: "E", Algeria: "E", Jordan: "E",
  // Group F
  England: "F", Croatia: "F", Ghana: "F", Panama: "F",
  // Group G
  Brazil: "G", Morocco: "G", Scotland: "G", Haiti: "G",
  // Group H
  Spain: "H", Uruguay: "H", "Saudi Arabia": "H", "Cape Verde": "H",
  // Group I
  Portugal: "I", Colombia: "I", Uzbekistan: "I", "DR Congo": "I",
  // Group J
  France: "J", Senegal: "J", Norway: "J", Iraq: "J",
  // Group K
  Netherlands: "K", Japan: "K", Sweden: "K", Tunisia: "K",
  // Group L
  Belgium: "L", Egypt: "L", Iran: "L", "New Zealand": "L",
};

// Knockout date windows (Madrid/UTC dates are close enough for round boundaries).
// Group stage runs through 2026-06-27; knockouts follow.
const STAGE_WINDOWS = [
  { until: "2026-06-28", label: "Round of 32" },
  { until: "2026-07-04", label: "Round of 16" },
  { until: "2026-07-12", label: "Quarter-final" },
  { until: "2026-07-16", label: "Semi-final" },
  { until: "2026-07-20", label: "Final" },
];

const GROUP_STAGE_END = "2026-06-27";

/**
 * @param {string} homeTeam
 * @param {string} awayTeam
 * @param {string} commenceTimeUtc ISO
 * @returns {string} a human label like "Group Stage · Group D" or "Round of 16"
 */
export function stageLabel(homeTeam, awayTeam, commenceTimeUtc) {
  const date = (commenceTimeUtc || "").slice(0, 10);

  // Group stage: both teams in the same known group.
  const gh = TEAM_GROUP[homeTeam];
  const ga = TEAM_GROUP[awayTeam];
  if (date && date <= GROUP_STAGE_END && gh && ga && gh === ga) {
    return `Group Stage · Group ${gh}`;
  }
  if (date && date <= GROUP_STAGE_END) {
    return "Group Stage";
  }

  // Knockouts: by date window.
  for (const w of STAGE_WINDOWS) {
    if (date && date <= w.until) return w.label;
  }
  return "Knockout";
}

export { TEAM_GROUP };
