import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeEvent, buildUrl } from "../lib/oddsProvider.js";
import { normalizeScore } from "../lib/scoresProvider.js";
import { buildScorecard, bandOf } from "../lib/scorecard.js";
import { allowAction, _reset as resetRl } from "../lib/rateLimit.js";
import { fetchWithFailover, apiKeys } from "../lib/providerFetch.js";
import { stageLabel } from "../lib/fixtures.js";

const rawEvent = {
  id: "evt1",
  home_team: "Mexico",
  away_team: "South Africa",
  commence_time: "2026-06-11T19:00:00Z",
  bookmakers: [
    {
      key: "pinnacle",
      last_update: "2026-06-11T17:01:38Z",
      markets: [
        { key: "h2h", outcomes: [
          { name: "Mexico", price: 1.44 },
          { name: "South Africa", price: 9.0 },
          { name: "Draw", price: 4.7 },
        ]},
        { key: "totals", outcomes: [
          { name: "Over", price: 1.93, point: 2.25 },
          { name: "Under", price: 1.97, point: 2.25 },
        ]},
      ],
    },
  ],
};

// ---- oddsProvider.normalizeEvent ----
test("normalizeEvent: valid event -> ok with sharp book", () => {
  const n = normalizeEvent(rawEvent);
  assert.equal(n.status, "ok");
  assert.equal(n.bookmaker, "pinnacle");
  assert.deepEqual(n.oneXtwo, [1.44, 4.7, 9.0]);
  assert.equal(n.totalLine, 2.25);
});

test("normalizeEvent: missing core fields -> null", () => {
  assert.equal(normalizeEvent(null), null);
  assert.equal(normalizeEvent({ id: 1 }), null);
  assert.equal(normalizeEvent({ id: "x", home_team: "A", away_team: "B", commence_time: "nope" }), null);
});

test("normalizeEvent: no usable bookmaker -> pending", () => {
  const n = normalizeEvent({ ...rawEvent, bookmakers: [{ key: "x", markets: [] }] });
  assert.equal(n.status, "pending");
  assert.equal(n.oneXtwo, undefined);
});

test("buildUrl includes params and key; key never leaks into normalized data", () => {
  process.env.ODDS_API_KEY = "TESTKEY123";
  const url = buildUrl("/sports/soccer_fifa_world_cup/odds");
  assert.ok(url.includes("regions=eu"));
  assert.ok(url.includes("markets=h2h%2Ctotals"));
  assert.ok(url.includes("apiKey=TESTKEY123"));
  assert.ok(!JSON.stringify(normalizeEvent(rawEvent)).includes("TESTKEY123"));
});

// ---- scoresProvider.normalizeScore ----
test("normalizeScore: completed with valid scores -> parsed ints", () => {
  const s = normalizeScore({
    id: "evt1",
    completed: true,
    home_team: "Mexico",
    away_team: "South Africa",
    scores: [
      { name: "Mexico", score: "2" },
      { name: "South Africa", score: "0" },
    ],
  });
  assert.deepEqual(s, { eventId: "evt1", completed: true, home: 2, away: 0 });
});

test("normalizeScore: not completed -> null", () => {
  assert.equal(normalizeScore({ id: "e", completed: false, scores: null }), null);
});

test("normalizeScore: malformed scores -> null", () => {
  assert.equal(
    normalizeScore({ id: "e", completed: true, home_team: "A", away_team: "B", scores: [{ name: "A", score: "x" }] }),
    null
  );
});

// ---- scorecard ----
test("bandOf maps points to band names", () => {
  assert.equal(bandOf(3), "exact");
  assert.equal(bandOf(1.5), "close");
  assert.equal(bandOf(1), "result");
  assert.equal(bandOf(0), "wrong");
});

test("buildScorecard tallies closed matches", () => {
  const closed = [
    { status: "closed", recommendation: { pick: [2, 0] }, result: { home: 2, away: 0 } }, // exact 3
    { status: "closed", recommendation: { pick: [2, 0] }, result: { home: 1, away: 0 } }, // close 1.5
    { status: "closed", recommendation: { pick: [2, 0] }, result: { home: 0, away: 1 } }, // wrong 0
    { status: "upcoming", recommendation: { pick: [1, 0] } }, // ignored
  ];
  const sc = buildScorecard(closed);
  assert.equal(sc.played, 3);
  assert.equal(sc.totalPoints, 4.5);
  assert.equal(sc.counts.exact, 1);
  assert.equal(sc.counts.close, 1);
  assert.equal(sc.counts.wrong, 1);
});

test("buildScorecard empty -> zeros", () => {
  const sc = buildScorecard([]);
  assert.equal(sc.played, 0);
  assert.equal(sc.totalPoints, 0);
});

// ---- fixtures / stage labelling ----
test("stageLabel: group-stage match shows the correct group", () => {
  // Mexico v South Africa are both Group A, kickoff in group window
  assert.equal(stageLabel("Mexico", "South Africa", "2026-06-11T19:00:00Z"), "Group Stage · Group A");
  // USA v Paraguay are both Group D
  assert.equal(stageLabel("USA", "Paraguay", "2026-06-13T01:00:00Z"), "Group Stage · Group D");
});

test("stageLabel: knockout dates map to rounds", () => {
  assert.equal(stageLabel("TBD", "TBD", "2026-07-02T19:00:00Z"), "Round of 16");
  assert.equal(stageLabel("TBD", "TBD", "2026-07-18T19:00:00Z"), "Final");
});

test("stageLabel: unknown team in group window falls back to Group Stage", () => {
  assert.equal(stageLabel("Atlantis", "Wakanda", "2026-06-15T19:00:00Z"), "Group Stage");
});

// ---- provider key failover ----
test("apiKeys returns primary then backup", () => {
  process.env.ODDS_API_KEY = "PRIMARY";
  process.env.ODDS_API_KEY_BACKUP = "BACKUP";
  assert.deepEqual(apiKeys(), ["PRIMARY", "BACKUP"]);
});

test("fetchWithFailover retries backup on 429, succeeds", async () => {
  process.env.ODDS_API_KEY = "PRIMARY";
  process.env.ODDS_API_KEY_BACKUP = "BACKUP";
  const orig = global.fetch;
  const seen = [];
  global.fetch = async (url) => {
    seen.push(url);
    if (url.includes("PRIMARY")) {
      return { ok: false, status: 429, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  try {
    const data = await fetchWithFailover((key) => `https://x/?apiKey=${key}`);
    assert.deepEqual(data, { ok: true });
    assert.equal(seen.length, 2); // primary failed, backup used
    assert.ok(seen[1].includes("BACKUP"));
  } finally {
    global.fetch = orig;
  }
});

test("fetchWithFailover does NOT failover on a 500 (non-quota) error", async () => {
  process.env.ODDS_API_KEY = "PRIMARY";
  process.env.ODDS_API_KEY_BACKUP = "BACKUP";
  const orig = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return { ok: false, status: 500, json: async () => ({}) };
  };
  try {
    await assert.rejects(() => fetchWithFailover((key) => `https://x/?apiKey=${key}`));
    assert.equal(calls, 1); // 500 is not a failover trigger; backup untouched
  } finally {
    global.fetch = orig;
  }
});

test("fetchWithFailover throws last error when all keys exhausted (429)", async () => {
  process.env.ODDS_API_KEY = "PRIMARY";
  process.env.ODDS_API_KEY_BACKUP = "BACKUP";
  const orig = global.fetch;
  global.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  try {
    await assert.rejects(() => fetchWithFailover((key) => `https://x/?apiKey=${key}`));
  } finally {
    global.fetch = orig;
  }
});
test("allowAction permits, blocks within interval, allows after, independent per action", () => {
  resetRl();
  const t0 = 1_000_000;
  assert.equal(allowAction("refresh-odds", t0).allowed, true);
  assert.equal(allowAction("refresh-odds", t0 + 1000).allowed, false);
  assert.equal(allowAction("update-results", t0 + 1000).allowed, true); // independent
  assert.equal(allowAction("refresh-odds", t0 + 60_000).allowed, true);
});
