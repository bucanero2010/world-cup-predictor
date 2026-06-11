import { test } from "node:test";
import assert from "node:assert/strict";

import { fromOdds } from "../lib/odds.js";
import { shinDevig, proportionalDevig, devigBest } from "../lib/shin.js";
import { selectBookmaker } from "../lib/bookmaker.js";
import { madridDayKey, kickoffState, relativeToKickoff, madridHour } from "../lib/time.js";
import { isLockSoon } from "../lib/lockSoon.js";
import { flagFor } from "../lib/flags.js";
import { recommendForMatch, bandBreakdown } from "../lib/recommend.js";
import { scoreGrid } from "../lib/poisson.js";

// ---- Task 1.2: extended fromOdds ----
test("fromOdds reports method and finite cost", () => {
  const r = fromOdds({ oneXtwo: [1.8, 3.6, 4.5] });
  assert.equal(r.method, "proportional");
  assert.ok(Number.isFinite(r.cost));
  assert.ok(r.lambdaHome > 0 && r.lambdaAway > 0);
});

test("fromOdds applies an injected devig function", () => {
  let called = false;
  const stub = (odds) => {
    called = true;
    return { probs: proportionalDevig(odds).probs, method: "stub" };
  };
  const r = fromOdds({ oneXtwo: [1.8, 3.6, 4.5], devig: stub });
  assert.ok(called);
  assert.equal(r.method, "stub");
});

// ---- Task 2.2: Shin ----
test("shinDevig probs are valid and sum to 1", () => {
  for (const odds of [[1.44, 4.7, 9.0], [2.1, 3.4, 3.6], [1.2, 7, 15]]) {
    const { probs } = shinDevig(odds);
    const sum = probs.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9);
    assert.ok(probs.every((p) => p > 0 && p < 1));
  }
});

test("Shin shifts probability vs proportional in favorite-longshot direction", () => {
  const odds = [1.44, 4.7, 9.0]; // heavy favorite + longshot
  const shin = shinDevig(odds).probs;
  const prop = proportionalDevig(odds).probs;
  // Shin attributes part of the margin to insider money, which (vs naive
  // proportional) shaves the longshot and nudges the favorite up.
  assert.ok(shin[2] < prop[2], "longshot should lose under Shin");
  assert.ok(shin[0] > prop[0], "favorite should gain under Shin");
});

test("devigBest falls back to proportional on degenerate input", () => {
  assert.equal(devigBest([2.0]).method, "proportional"); // <2 outcomes
  assert.equal(devigBest([NaN, 3, 4]).method, "proportional");
  assert.equal(devigBest([1, 1, 1]).method, "proportional"); // odds not > 1
});

// ---- Task 3.2: bookmaker selection ----
const mkBook = (key, home, draw, away, line) => ({
  key,
  markets: [
    { key: "h2h", outcomes: [
      { name: "Mexico", price: home },
      { name: "Draw", price: draw },
      { name: "South Africa", price: away },
    ]},
    ...(line ? [{ key: "totals", outcomes: [
      { name: "Over", price: 1.9, point: line },
      { name: "Under", price: 1.95, point: line },
    ]}] : []),
  ],
});
const ctx = { homeTeam: "Mexico", awayTeam: "South Africa" };

test("selectBookmaker prefers Pinnacle (sharp)", () => {
  const r = selectBookmaker([mkBook("betfair_ex_eu", 1.5, 4, 8), mkBook("pinnacle", 1.44, 4.7, 9, 2.25)], ctx);
  assert.equal(r.source, "sharp");
  assert.equal(r.bookmaker, "pinnacle");
  assert.equal(r.totalLine, 2.25);
});

test("selectBookmaker averages when sharp absent and multiple books", () => {
  const r = selectBookmaker([mkBook("a", 1.5, 4, 8), mkBook("b", 1.6, 4.2, 7)], ctx);
  assert.equal(r.source, "average");
  assert.ok(Math.abs(r.oneXtwo[0] - 1.55) < 1e-9);
});

test("selectBookmaker uses first when only one usable book", () => {
  const r = selectBookmaker([mkBook("only", 1.5, 4, 8)], ctx);
  assert.equal(r.source, "first");
  assert.equal(r.bookmaker, "only");
});

test("selectBookmaker returns null when no usable book", () => {
  assert.equal(selectBookmaker([{ key: "x", markets: [] }], ctx), null);
  assert.equal(selectBookmaker([], ctx), null);
});

// ---- Task 4.2: time ----
test("madridDayKey and hour respect Europe/Madrid (CEST in June)", () => {
  // 2026-06-11T19:00:00Z = 21:00 Madrid (CEST, UTC+2)
  assert.equal(madridDayKey("2026-06-11T19:00:00Z"), "2026-06-11");
  assert.equal(madridHour("2026-06-11T19:00:00Z"), 21);
});

test("madrid day rolls correctly near midnight", () => {
  // 22:30 UTC in June = 00:30 Madrid next day
  assert.equal(madridDayKey("2026-06-11T22:30:00Z"), "2026-06-12");
});

test("kickoffState and relativeToKickoff transitions", () => {
  const k = "2026-06-11T19:00:00Z";
  assert.equal(kickoffState(k, new Date("2026-06-11T16:00:00Z")), "upcoming");
  assert.equal(kickoffState(k, new Date("2026-06-11T19:30:00Z")), "live");
  assert.equal(kickoffState(k, new Date("2026-06-11T23:00:00Z")), "finished");
  assert.equal(relativeToKickoff(k, new Date("2026-06-11T16:00:00Z")), "in 3h");
});

// ---- Task 5.2: lockSoon ----
test("lockSoon: normal-hours kickoff triggers at 2h before", () => {
  const k = "2026-06-11T19:00:00Z"; // 21:00 Madrid, normal hours
  assert.equal(isLockSoon(k, new Date("2026-06-11T16:59:00Z")), false); // >2h out
  assert.equal(isLockSoon(k, new Date("2026-06-11T17:30:00Z")), true);  // within 2h
  assert.equal(isLockSoon(k, new Date("2026-06-11T19:30:00Z")), false); // already started
});

test("lockSoon: after-midnight kickoff triggers at preceding Madrid midnight", () => {
  // 2026-06-12T01:00:00Z = 03:00 Madrid (after midnight). Preceding Madrid midnight
  // = 2026-06-12T00:00 Madrid = 2026-06-11T22:00:00Z.
  const k = "2026-06-12T01:00:00Z";
  assert.equal(isLockSoon(k, new Date("2026-06-11T21:30:00Z")), false); // before midnight
  assert.equal(isLockSoon(k, new Date("2026-06-11T22:30:00Z")), true);  // after midnight
});

// ---- Task 6.2: flags ----
test("flagFor known nation returns code and 2-codepoint emoji", () => {
  const mx = flagFor("Mexico");
  assert.equal(mx.code, "MX");
  assert.equal([...mx.emoji].length, 2);
});

test("flagFor unknown returns placeholder with null code", () => {
  const u = flagFor("Atlantis");
  assert.equal(u.code, null);
  assert.ok(u.emoji.length > 0);
});

test("flagFor England returns subdivision code", () => {
  assert.equal(flagFor("England").code, "GB-ENG");
});

// ---- Task 7.2: recommend ----
test("recommendForMatch excludes zero-EV picks and ranks", () => {
  const rec = recommendForMatch({ oneXtwo: [1.44, 4.7, 9.0], totalLine: 2.25, overUnder: [1.93, 1.97] });
  assert.ok(rec.topPicks.length > 0);
  assert.ok(rec.topPicks.every((p) => p.ev > 0));
  // ranks are sequential
  rec.topPicks.forEach((p, i) => assert.equal(p.rank, i + 1));
  // recommended is a home win for a heavy favorite
  assert.ok(rec.pick[0] >= rec.pick[1]);
});

test("bandBreakdown probabilities sum to ~1", () => {
  const grid = scoreGrid(1.76, 0.66);
  const b = bandBreakdown([2, 0], grid);
  const sum = b.exact.p + b.close.p + b.result.p + b.wrong.p;
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test("differsFromModal is set correctly", () => {
  const rec = recommendForMatch({ oneXtwo: [1.44, 4.7, 9.0], totalLine: 2.25, overUnder: [1.93, 1.97] });
  const isSame = rec.pick[0] === rec.modal[0] && rec.pick[1] === rec.modal[1];
  assert.equal(rec.differsFromModal, !isSame);
});
