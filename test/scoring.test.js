import { test } from "node:test";
import assert from "node:assert/strict";
import { points } from "../lib/scoring.js";
import { scoreGrid } from "../lib/poisson.js";
import { rankPicks, expectedPoints } from "../lib/optimizer.js";

test("exact score = 3", () => {
  assert.equal(points([2, 1], [2, 1]), 3);
  assert.equal(points([0, 0], [0, 0]), 3);
});

test("wrong outcome = 0", () => {
  assert.equal(points([2, 1], [0, 1]), 0); // picked home win, away won
  assert.equal(points([1, 1], [2, 0]), 0); // picked draw, home won
  assert.equal(points([0, 2], [1, 1]), 0); // picked away win, draw
});

test("close: 1 goal out, correct outcome = 1.5", () => {
  assert.equal(points([2, 1], [3, 1]), 1.5); // home win both, 1 out
  assert.equal(points([2, 1], [2, 0]), 1.5); // home win both, 1 out
  assert.equal(points([1, 1], [2, 2]), 1.5); // draw both, 1 each but check err
});

test("close: 2 goals out WITH correct goal difference = 1.5", () => {
  assert.equal(points([2, 1], [3, 2]), 1.5); // both +1 GD, shifted up
  assert.equal(points([1, 0], [2, 1]), 1.5); // both +1 GD
  assert.equal(points([2, 2], [3, 3]), 1.5); // draw, GD 0, 2 out
});

test("result only: 2 goals out WITHOUT correct goal difference = 1", () => {
  assert.equal(points([3, 0], [3, 2]), 1); // home win both, GD 3 vs 1, err 2
  assert.equal(points([2, 0], [4, 0]), 1); // home win both, err 2, GD differs
});

test("result only: 3+ goals out, correct outcome = 1", () => {
  assert.equal(points([5, 0], [1, 0]), 1); // home win both, err 4
});

test("draw with 1-1 vs 0-0 is close not exact", () => {
  assert.equal(points([1, 1], [0, 0]), 1.5); // both draw, err 2, GD 0 -> close
});

test("scoreGrid normalizes to ~1", () => {
  const grid = scoreGrid(1.6, 1.1);
  const total = [...grid.values()].reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

test("optimizer pulls toward low central scores", () => {
  // A typical mid-strength home favorite. The EV-best pick should be a
  // low-scoring home win like 1-0 or 2-1, not an isolated high score.
  const grid = scoreGrid(1.5, 1.0);
  const ranked = rankPicks(grid);
  const [bh, ba] = ranked[0].pick;
  assert.ok(bh + ba <= 3, `expected low total, got ${bh}-${ba}`);
  assert.ok(bh >= ba, "home favorite should pick a home win or draw");
});

test("expectedPoints is bounded by 0..3", () => {
  const grid = scoreGrid(1.4, 1.4);
  const ev = expectedPoints([1, 1], grid);
  assert.ok(ev >= 0 && ev <= 3);
});
