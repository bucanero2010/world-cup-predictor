import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeEvent, buildUrl } from "../lib/oddsProvider.js";
import {
  getCachedMatches,
  setCachedMatches,
  patchCachedMatch,
  isStale,
  _reset as resetCache,
} from "../lib/cache.js";
import { allowRefresh, _reset as resetRl } from "../lib/rateLimit.js";

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

// ---- Task 9.2: normalizeEvent ----
test("normalizeEvent: valid event -> ok with sharp book", () => {
  const n = normalizeEvent(rawEvent);
  assert.equal(n.status, "ok");
  assert.equal(n.eventId, "evt1");
  assert.equal(n.bookmaker, "pinnacle");
  assert.deepEqual(n.oneXtwo, [1.44, 4.7, 9.0]);
  assert.equal(n.totalLine, 2.25);
  assert.equal(n.oddsAsOf, "2026-06-11T17:01:38Z");
});

test("normalizeEvent: missing core fields -> null", () => {
  assert.equal(normalizeEvent(null), null);
  assert.equal(normalizeEvent({ id: 1 }), null); // id not string
  assert.equal(normalizeEvent({ id: "x", home_team: "A" }), null); // missing fields
  assert.equal(
    normalizeEvent({ id: "x", home_team: "A", away_team: "B", commence_time: "nope" }),
    null
  );
});

test("normalizeEvent: no usable bookmaker -> pending, core fields retained", () => {
  const n = normalizeEvent({ ...rawEvent, bookmakers: [{ key: "x", markets: [] }] });
  assert.equal(n.status, "pending");
  assert.equal(n.homeTeam, "Mexico");
  assert.equal(n.oneXtwo, undefined);
});

test("normalizeEvent: partial totals dropped but h2h kept", () => {
  const partial = JSON.parse(JSON.stringify(rawEvent));
  // corrupt totals (missing point) -> totals dropped, h2h still usable
  partial.bookmakers[0].markets[1].outcomes[0].point = undefined;
  const n = normalizeEvent(partial);
  assert.equal(n.status, "ok");
  assert.deepEqual(n.oneXtwo, [1.44, 4.7, 9.0]);
  assert.equal(n.totalLine, undefined);
});

// ---- Task 9.4: URL construction ----
test("buildUrl includes sport params and key, never leaks into normalized data", () => {
  process.env.ODDS_API_KEY = "TESTKEY123";
  const url = buildUrl("/sports/soccer_fifa_world_cup/odds");
  assert.ok(url.includes("regions=eu"));
  assert.ok(url.includes("markets=h2h%2Ctotals"));
  assert.ok(url.includes("oddsFormat=decimal"));
  assert.ok(url.includes("apiKey=TESTKEY123"));
  // normalized data must not carry the key
  const n = normalizeEvent(rawEvent);
  assert.ok(!JSON.stringify(n).includes("TESTKEY123"));
});

// ---- Task 10.2: cache ----
test("cache set/get/patch and isStale", async () => {
  resetCache();
  assert.equal(await getCachedMatches(), null);
  await setCachedMatches({
    matches: [{ eventId: "a", v: 1 }, { eventId: "b", v: 1 }],
    fetchedAt: new Date().toISOString(),
  });
  const patched = await patchCachedMatch("b", { eventId: "b", v: 2 });
  assert.equal(patched, true);
  const snap = await getCachedMatches();
  assert.equal(snap.matches.find((m) => m.eventId === "b").v, 2);
  assert.equal(snap.matches.find((m) => m.eventId === "a").v, 1); // untouched

  assert.equal(await patchCachedMatch("missing", {}), false);
  assert.equal(isStale(snap, 60000), false);
  assert.equal(isStale({ fetchedAt: new Date(Date.now() - 120000).toISOString() }, 60000), true);
  assert.equal(isStale(null, 60000), true);
});

// ---- Task 11.2: rate limit ----
test("allowRefresh permits, blocks within interval, allows after", () => {
  resetRl();
  const t0 = 1_000_000;
  assert.equal(allowRefresh("e", t0).allowed, true);
  const blocked = allowRefresh("e", t0 + 1000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0);
  assert.equal(allowRefresh("e", t0 + 5 * 60 * 1000).allowed, true);
  // independent per event
  assert.equal(allowRefresh("other", t0 + 1000).allowed, true);
});
