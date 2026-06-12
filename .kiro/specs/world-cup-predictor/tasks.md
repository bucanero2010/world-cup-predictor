# Implementation Plan: World Cup Predictor

## Overview

The modeling core and a first cut of the UI/routes are already built and verified. This
plan now reflects the **persistence pivot**: move from an in-memory cache + auto-fetch +
per-event refresh model to **Neon (Vercel-managed Postgres) + on-demand fetching + closed-match results
+ a scorecard**. Tasks already completed are marked `[x]`; the remaining tasks implement
the pivot.

**Implementation language:** JavaScript (ES modules).

**Verification gate (every task):** `node --test` passes and `next build` succeeds. Run
manually; do not start dev servers or watch mode for verification.

## Already implemented and verified (do NOT recreate)

- [x] `lib/scoring.js`, `lib/poisson.js`, `lib/optimizer.js` — core math (tested)
- [x] `lib/odds.js` — `fromOdds` extended for pluggable de-vig + `{method, cost}` output
- [x] `lib/shin.js` — `shinDevig` / `proportionalDevig` / `devigBest` (Shin solver fixed
      to the `Σ pᵢ(z)=1` normalization condition; tested)
- [x] `lib/bookmaker.js` — `selectBookmaker` (Pinnacle → average → first; team-name keyed
      h2h, variable totals point; tested)
- [x] `lib/time.js` — Europe/Madrid formatting, day key, kickoff state, relative (tested)
- [x] `lib/lockSoon.js` — 2h / after-midnight rule (tested)
- [x] `lib/flags.js` — emoji flags for all 48 nations (tested)
- [x] `lib/recommend.js` — `recommendForMatch` + `bandBreakdown` (tested)
- [x] `lib/oddsProvider.js` — `fetchAllOdds` + `normalizeEvent` validation boundary
- [x] `lib/card.js` — `buildCard`, `byKickoff`
- [x] `components/` — `MatchList`, `MatchRow`, `MatchDetail`
- [x] `app/calculator/page.js` — manual tool with Shin/proportional toggle
- [x] 37 passing unit tests across `test/`

## Removed by the pivot (delete or supersede)

- `lib/cache.js` (in-memory snapshot) → replaced by `lib/db.js`
- `lib/rateLimit.js` per-event guard → re-keyed to per-action
- `app/api/matches/[id]/refresh/route.js` and `components/RefreshButton.jsx`
  (per-event refresh) → removed; replaced by global action routes/buttons
- Auto-fetch-on-stale logic in `app/page.js` / `GET /api/matches` → replaced by DB read

## Tasks

- [ ] 1. Provision Neon (Vercel-managed Postgres) and the DB access layer
  - [ ] 1.1 Add the `@neondatabase/serverless` dependency and `DATABASE_URL` to `.env.example`
    - Document local setup (Neon (Vercel-managed Postgres) dev DB or a local Postgres `DATABASE_URL`)
    - _Requirements: 9.1, 9.2_
  - [ ] 1.2 Create the schema (migration/init): `matches` and `meta` tables per design
    - Provide an idempotent `CREATE TABLE IF NOT EXISTS` init runnable via a script
    - _Requirements: 6.1, 7.1_
  - [ ] 1.3 Implement `lib/db.js`
    - `getAllMatches()` ordered by `commence_time`; `upsertMatchOdds(card)` (closed-aware:
      never overwrite frozen pick/score/result, Req 7.3); `freezeResult(eventId, h, a,
      earnedPoints)`; `getMeta`/`setMeta`; `isEmpty()`
    - Only module issuing SQL
    - _Requirements: 6.1, 6.5, 7.1, 7.2, 7.3_
  - [ ]* 1.4 Integration test `lib/db.js` against a disposable Postgres
    - Skip gracefully when `DATABASE_URL` is unset; assert upsert, closed-aware skip,
      freezeResult, meta round-trip
    - _Requirements: 6.5, 7.3_

- [ ] 2. Scores ingestion
  - [ ] 2.1 Implement `lib/scoresProvider.js`
    - `fetchScores(daysFrom=3)` → `/sports/soccer_fifa_world_cup/scores/?daysFrom=N`
      (key from env, server only); `normalizeScore(raw)` → `{eventId, completed, home,
      away}` or `null` (validate `completed`, parse team-name-keyed `scores`)
    - _Requirements: 7.1, 11.1, 11.2_
  - [ ]* 2.2 Unit tests for `normalizeScore`
    - completed+valid → parsed ints; not completed → null; malformed → null
    - _Requirements: 7.1, 11.2, 11.3_

- [ ] 3. Scorecard aggregation
  - [ ] 3.1 Implement `lib/scorecard.js` — `buildScorecard(closedMatches)`
    - Classify each closed match's stored pick vs final score via `points()`; tally
      `{exact, close, result, wrong}`, `totalPoints`, `played`
    - _Requirements: 7.4, 7.5_
  - [ ]* 3.2 Unit tests for `buildScorecard`
    - Mixed closed fixtures tally correctly; empty input → zeros
    - _Requirements: 7.4, 7.5, 7.6_

- [ ] 4. Re-key rate limiting to per-action
  - [ ] 4.1 Replace `lib/rateLimit.js` `allowRefresh(eventId)` with `allowAction(actionKey, now)`
    - Min interval per action name (`refresh-odds`, `update-results`)
    - _Requirements: 6.7_
  - [ ]* 4.2 Unit tests for `allowAction`
    - First allowed; immediate repeat blocked; allowed after interval; independent per action
    - _Requirements: 6.7_

- [ ] 5. Checkpoint - persistence + ingestion core complete
  - `node --test` + `next build` green; pause for questions.

- [ ] 6. Action route: refresh odds
  - [ ] 6.1 Create `app/api/refresh-odds/route.js` (POST)
    - `allowAction("refresh-odds")` → 429 if blocked; `fetchAllOdds` → `buildCard[]` →
      `db.upsertMatchOdds` each → `db.setMeta("odds_last_refreshed")`; provider error →
      502, DB unchanged (Req 4.9)
    - _Requirements: 4.5, 4.6, 4.7, 4.8, 4.9, 6.3, 11.1_
  - [ ]* 6.2 Integration test (mocked fetch + db): success upserts; 429; 502 leaves DB
    - _Requirements: 4.9, 6.7_

- [ ] 7. Action route: update results
  - [ ] 7.1 Create `app/api/update-results/route.js` (POST)
    - `allowAction("update-results")` → 429 if blocked; `fetchScores` → for each completed:
      `earnedPoints = points(storedPick, final)`; `db.freezeResult` + status `closed`;
      `db.setMeta("results_last_updated")`; provider error → 502, DB unchanged
    - _Requirements: 7.1, 7.2, 7.3_
  - [ ]* 7.2 Integration test (mocked): completed match freezes with correct earnedPoints
    - _Requirements: 7.2, 7.3_

- [ ] 8. Read route + page wiring
  - [ ] 8.1 Rewrite `GET /api/matches` to read from `lib/db.js` only
    - `db.getAllMatches()` → derive `status`; `buildScorecard(closed)`; include `meta`
      and `empty`; no provider calls
    - _Requirements: 1.7, 6.2, 9.2, 10.2_
  - [ ] 8.2 Rewrite `app/page.js` server component
    - Read matches (DB) + scorecard; render `Scorecard`, `ActionBar`, `MatchList`; show
      empty-DB prompt when `empty` (Req 1.8)
    - _Requirements: 1.1, 1.8, 9.2_
  - [ ] 8.3 Remove per-event refresh route + `RefreshButton`
    - Delete `app/api/matches/[id]/refresh/route.js`, `components/RefreshButton.jsx`,
      `lib/cache.js`; update imports
    - _Requirements: 4.5_

- [ ] 9. Checkpoint - routes complete
  - `node --test` + `next build` green; pause for questions.

- [ ] 10. UI: actions, scorecard, closed cards
  - [ ] 10.1 Create `components/ActionBar.jsx`
    - "Refresh odds" + "Update results" buttons (separate); call POST routes; show
      last-updated times and 429/502 messages; refresh page data on success
    - _Requirements: 6.3, 6.4, 6.6, 6.7_
  - [ ] 10.2 Create `components/Scorecard.jsx`
    - Total earned points + exact/close/result/wrong counts; "no matches scored yet" empty
      state
    - _Requirements: 7.4, 7.5, 7.6_
  - [ ] 10.3 Create `components/ClosedCard.jsx` and wire into `MatchRow`
    - Distinct "Closed" styling: final score, stored Recommended_Pick, Earned_Points +
      band label; `MatchRow` renders it when `status==="closed"`
    - _Requirements: 1.9, 7.2_
  - [ ] 10.4 Update `MatchRow` — drop per-event refresh control; keep odds-as-of
    - _Requirements: 1.2, 4.13_
  - [ ]* 10.5 Render test: ordering/grouping, pending placeholder, closed card shows score+points
    - _Requirements: 1.4, 1.5, 1.9, 2.3_

- [ ] 11. Final checkpoint - full verification
  - `node --test` + `next build` green; confirm an end-to-end refresh→results→scorecard
    flow against the live API with a real `DATABASE_URL`.

## Notes

- Tasks marked `*` are optional test sub-tasks; core implementation tasks are not optional.
- The Odds API key and `DATABASE_URL` are read only server-side; never in a client bundle.
- Closed matches are immutable: `upsertMatchOdds` must never rewrite a frozen pick/score.
- Verification gate per task: `node --test` + `next build`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "3.1", "4.1"] },
    { "id": 1, "tasks": ["1.3", "2.2", "3.2", "4.2"] },
    { "id": 2, "tasks": ["1.4", "6.1", "7.1", "8.1"] },
    { "id": 3, "tasks": ["6.2", "7.2", "8.2", "8.3"] },
    { "id": 4, "tasks": ["10.1", "10.2", "10.3", "10.4"] },
    { "id": 5, "tasks": ["10.5"] }
  ]
}
```
