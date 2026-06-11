# Implementation Plan: World Cup Predictor

## Overview

This plan builds the recommendation pipeline and UI on top of the existing, unit-tested
modeling core. The order is deliberate: extend and add the framework-agnostic `lib/`
core first (each module unit-tested via `node --test`), then the server provider/cache/
rate-limit layer, then the route handlers, then the client components, and finally the
calculator migration. Each task ends by wiring its output into the layer above it so no
code is left orphaned.

**Already implemented — do NOT recreate:**
- `lib/scoring.js` — `points()`, `outcome()` (unit-tested in `test/scoring.test.js`)
- `lib/poisson.js` — `scoreGrid()`, `poissonPmf()`, `MAX_GOALS`
- `lib/optimizer.js` — `rankPicks()`, `bestPick()`, `expectedPoints()`, `outcomeProbs()`
- Next.js App Router scaffold — `app/layout.js`, `app/page.js` (current calculator UI),
  `app/globals.css`, `package.json`, `next.config.js`, `jsconfig.json`

These modules are consumed by new code; their public contracts stay unchanged.

**Implementation language:** JavaScript (ES modules), matching the existing codebase.

**Verification gate (every task):** `node --test` passes and `next build` succeeds.
Run these manually; do not start dev servers or watch mode.

## Tasks

- [ ] 1. Extend `lib/odds.js` to support pluggable de-vig and richer output
  - [ ] 1.1 Refactor `fromOdds` to accept a `devig` function and report method + fit cost
    - Keep the existing coarse→fine λ grid search unchanged (0.1 → 0.02 steps)
    - Change `fromOdds` to accept `{ oneXtwo, totalLine?, overUnder?, rho?, devig? }`; `devig` defaults to the proportional `devig` already in this file (the Shin default is wired in later via `recommend.js`)
    - Apply the supplied `devig` function to `oneXtwo` (and to `overUnder` when present) instead of hard-coding proportional normalization
    - Return the achieved `cost` and the `method` label reported by the devig function (default `"proportional"`) alongside `lambdaHome`, `lambdaAway`, `target`
    - Preserve the existing `devig` and `fromExpectedGoals` exports so `app/page.js` keeps working
    - _Requirements: 5.3, 8.2_
  - [ ]* 1.2 Write unit tests for extended `fromOdds`
    - Assert λ solve is unchanged for a known fixture when the default devig is used
    - Assert a custom injected devig function is actually applied (e.g. identity stub changes the target)
    - Assert returned object includes `method` and finite `cost`
    - _Requirements: 5.3_

- [ ] 2. Add `lib/shin.js` — Shin's method de-vig with proportional fallback
  - [ ] 2.1 Implement `shinDevig`, `proportionalDevig`, and `devigBest`
    - `proportionalDevig(decimalOdds)` → `{ probs, method:"proportional" }` (normalize 1/odds)
    - `shinDevig(decimalOdds)` → solve `z ∈ [0,1)` by bisection on the monotone fixed point `Σ √(z² + 4(1−z)·πᵢ²/S) = 2 − z` (S = Σ 1/oddsᵢ), then `pᵢ = (√(z² + 4(1−z)·πᵢ²/S) − z)/(2(1−z))`; cap iterations; return `{ probs, z, method:"shin" }`
    - `devigBest(decimalOdds)` → try Shin; fall back to proportional on non-convergence, `<2` outcomes, non-finite input, or `z` out of `[0,1)`; return `{ probs, method }`
    - Shape the return so it can be passed directly as the `devig` argument to `fromOdds` from task 1.1
    - _Requirements: 5.1, 5.2_
  - [ ]* 2.2 Write property/edge-case tests for `lib/shin.js`
    - Property: `shinDevig` probs are finite, in (0,1), and sum to 1 across heavy-favorite, near-even, and three-way fixtures
    - Property: Shin probs lie between proportional probs and the raw implied probs (favorite-longshot direction)
    - Edge: degenerate input (single outcome, non-finite, NaN odds) makes `devigBest` return `method:"proportional"`
    - _Requirements: 5.1, 5.2_

- [ ] 3. Add `lib/bookmaker.js` — bookmaker selection policy
  - [ ] 3.1 Implement `selectBookmaker`
    - Precedence: Pinnacle (`sharpKey`) present → `source:"sharp"`; else average decimal odds across all books exposing both `h2h` and `totals` → `source:"average"`; else first available book → `source:"first"`
    - Return `{ oneXtwo, totalLine, overUnder, bookmaker, source }` or `null` when no usable book exists
    - _Requirements: 4.10, 4.11, 4.12_
  - [ ]* 3.2 Write unit tests for `selectBookmaker`
    - Pinnacle present → sharp; Pinnacle absent → average; single book → first; none usable → null
    - Verify averaging only includes books with both markets
    - _Requirements: 4.10, 4.11, 4.12_

- [ ] 4. Add `lib/time.js` — Europe/Madrid localization
  - [ ] 4.1 Implement `toMadrid`, `formatKickoff`, `madridDayKey`, `kickoffState`, `relativeToKickoff`
    - Use `Intl.DateTimeFormat` with `timeZone: "Europe/Madrid"`; rely on the runtime tz database for CET/CEST (no manual switching)
    - `formatKickoff` → e.g. `"Thu 11 Jun, 21:00 CEST"`; `madridDayKey` → `"2026-06-11"` for day grouping
    - `kickoffState(isoUtc, now)` → `"upcoming"|"live"|"finished"`; `relativeToKickoff(isoUtc, now)` → `"in 3h"|"live"|"finished"`; accept injected `now` for testability
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [ ]* 4.2 Write unit tests for `lib/time.js`
    - Fixed-instant tests spanning the CET→CEST boundary
    - Day-key grouping correctness; `kickoffState` transitions across the kickoff instant with injected `now`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 5. Add `lib/lockSoon.js` — lock-soon highlight rule
  - [ ] 5.1 Implement `isLockSoon(kickoffIsoUtc, now)`
    - Normal waking-hours kickoff: true once `now ≥ kickoff − 2h`
    - After-midnight kickoff (00:00–~06:00 Madrid): true once `now ≥ preceding Madrid midnight`
    - Compute waking-hours and after-midnight bands in Madrid local time; pure function of `(kickoff, now)`
    - _Requirements: 3.3, 3.4_
  - [ ]* 5.2 Write edge-case tests for `isLockSoon`
    - Normal-hours 2h trigger boundary (just before / just after)
    - After-midnight kickoff triggering at the preceding midnight
    - Not-yet and already-live edges with injected `now`
    - _Requirements: 3.3, 3.4_

- [ ] 6. Add `lib/flags.js` — emoji flags from a static map
  - [ ] 6.1 Implement `flagFor(teamName)`
    - Static `teamName → ISO country code` table for the World Cup nations; derive the Unicode regional-indicator emoji from the code
    - Return `{ emoji, code }`; return a neutral placeholder for sub-national teams (England/Scotland/Wales) and unknown names
    - No network calls, no assets (emoji flags decision for v1)
    - _Requirements: 3.1, 3.2_
  - [ ]* 6.2 Write unit tests for `flagFor`
    - Known nation → correct code and 2-codepoint emoji; unknown/sub-national → placeholder with a `code`
    - _Requirements: 3.1, 3.2_

- [ ] 7. Add `lib/recommend.js` — recommendation orchestration over the core
  - [ ] 7.1 Implement `recommendForMatch(odds, opts)` and `bandBreakdown(pick, grid)`
    - `recommendForMatch` runs: `devigBest` (from `lib/shin.js`) → `fromOdds` (solve λ, from task 1.1) → `scoreGrid` → `rankPicks`, then excludes zero-EV picks (Req 5.8) and tie-breaks equal-EV picks by higher exact-score probability (Req 5.7)
    - Assemble `topN` (default 6, in the 5–8 range), outcome probs (`outcomeProbs`), solved λ, the `modal` (single most likely) scoreline, and `differsFromModal` (Req 5.13); include `devigMethod`
    - `bandBreakdown(pick, grid)` → `{ exact:{p,ev}, close:{p,ev}, result:{p,ev}, wrong:{p} }` summing P over the grid by Superbru band using `points()`
    - Output matches the `Recommendation` data model in the design
    - _Requirements: 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13_
  - [ ]* 7.2 Write golden-case + property tests for `lib/recommend.js`
    - Golden: a known λ scenario (e.g. ~1.76/0.66) yields the expected recommended pick
    - Property: zero-EV picks never appear in `topPicks`; equal-EV ties resolve to higher exact prob
    - Property: band probabilities sum to 1 (exact+close+result+wrong); `differsFromModal` is true exactly when `modal ≠ pick`
    - _Requirements: 5.6, 5.7, 5.8, 5.10, 5.13_

- [ ] 8. Checkpoint - modeling core complete
  - Ensure all tests pass (`node --test`) and `next build` succeeds; ask the user if questions arise.

- [ ] 9. Add `lib/oddsProvider.js` — provider fetch + validation boundary
  - [ ] 9.1 Implement `normalizeEvent(rawEvent)`
    - Validate types/shapes; keep valid fields, drop invalid ones; return `null` when no usable market remains (→ odds pending)
    - Produce the `NormalizedOdds` shape (eventId, teams, commenceTimeUtc, group?, oneXtwo, totalLine?, overUnder?, bookmaker, source, oddsAsOf) using `selectBookmaker` from `lib/bookmaker.js`
    - Treat all provider data as untrusted input
    - _Requirements: 11.2, 11.3, 10.3_
  - [ ]* 9.2 Write unit tests for `normalizeEvent`
    - Valid event → full shape; partial event → invalid fields dropped; unusable event → `null`
    - _Requirements: 11.2, 11.3, 10.3_
  - [ ] 9.3 Implement `fetchAllOdds` and `fetchEventOdds`
    - Build URLs for `soccer_fifa_world_cup` with `regions=eu`, `markets=h2h,totals`, `oddsFormat=decimal`; read key from `process.env.ODDS_API_KEY` (server only)
    - `fetchAllOdds()` → full-list endpoint; `fetchEventOdds(eventId)` → `/events/{id}/odds`; both pass results through `normalizeEvent` and surface fetch/HTTP errors to callers
    - _Requirements: 4.1, 4.2, 4.5, 4.6, 11.1_
  - [ ]* 9.4 Write unit tests for URL/param construction
    - With a stubbed key and stubbed `fetch`, assert endpoint, region, markets, and format params; assert key never appears in returned data
    - _Requirements: 4.1, 4.2, 11.1_

- [ ] 10. Add `lib/cache.js` — durable snapshot cache (Next.js Data Cache)
  - [ ] 10.1 Implement `getCachedMatches`, `setCachedMatches`, `patchCachedMatch`, `isStale`
    - Back durable reads/writes with Next's Data Cache (`unstable_cache`/`revalidate`) plus a module-level memo fast path; isolate all persistence behind this module (no DB)
    - Snapshot carries `fetchedAt`; `patchCachedMatch(id, entry)` updates only one match's entry (Req 4.8); `isStale(snapshot, maxAgeMs)` compares against `fetchedAt`
    - _Requirements: 4.7, 4.8, 6.1, 10.1, 10.2_
  - [ ]* 10.2 Write unit tests for cache snapshot logic
    - `patchCachedMatch` replaces only the targeted entry; `isStale` boundary around `maxAgeMs`
    - _Requirements: 4.8, 10.1_

- [ ] 11. Add `lib/rateLimit.js` — per-event manual-refresh guard
  - [ ] 11.1 Implement `allowRefresh(eventId, now)`
    - In-memory timestamp guard keyed by event id with a minimum interval (e.g. 5 min); returns boolean; accept injected `now`
    - _Requirements: 6.6, 9.1_
  - [ ]* 11.2 Write unit tests for `allowRefresh`
    - First call allowed; immediate repeat blocked; allowed again after the interval elapses (injected `now`)
    - _Requirements: 6.6, 9.1_

- [ ] 12. Checkpoint - server support layer complete
  - Ensure all tests pass and `next build` succeeds; ask the user if questions arise.

- [ ] 13. Implement `GET /api/matches` route handler
  - [ ] 13.1 Create `app/api/matches/route.js`
    - Read durable cache via `lib/cache.js`; if fresh enough, return it; else `fetchAllOdds` → `normalizeEvent[]` → `recommendForMatch[]` → build snapshot → `setCachedMatches`
    - Scope auto-refresh to Close_Match entries only; serve distant matches from the daily snapshot (Req 6.2, 6.3)
    - On provider error, return last cached snapshot with `stale:true` and a warning; no cache yet + provider down → `matches:[]`, `stale:true`, warning
    - Sort matches by kickoff ascending; mark `status:"pending"` for events with no usable odds; response shape = `MatchesResponse`
    - Return 500 (without leaking the key) when `ODDS_API_KEY` is missing
    - _Requirements: 1.1, 1.4, 1.5, 6.1, 6.2, 6.3, 10.1, 10.2, 10.3, 11.1_
  - [ ]* 13.2 Write light integration test for `GET /api/matches`
    - With `fetch` mocked: success path returns sorted cards; provider-error path returns last snapshot flagged `stale:true`
    - _Requirements: 1.4, 10.1_

- [ ] 14. Implement `POST /api/matches/[id]/refresh` route handler
  - [ ] 14.1 Create `app/api/matches/[id]/refresh/route.js`
    - `allowRefresh(id)` → if blocked, 429 + `retryAfter`
    - `fetchEventOdds(id)` → `normalizeEvent` → `recommendForMatch` → `patchCachedMatch(id, entry)`; on cache-write failure use fresh data now and background-repair (Req 4.9)
    - On provider/network failure → 502 with `{ error }` so the client keeps prior odds and timestamp (Req 6.5)
    - Response: `{ match: RecommendationCard }`
    - _Requirements: 4.5, 4.8, 4.9, 6.4, 6.5, 6.6_
  - [ ]* 14.2 Write light integration test for the refresh route
    - Mocked `fetch`: success patches and returns the card; rate-limited → 429; provider error → 502
    - _Requirements: 6.5, 6.6_

- [ ] 15. Checkpoint - server routes complete
  - Ensure all tests pass and `next build` succeeds; ask the user if questions arise.

- [ ] 16. Build the match-list UI
  - [ ] 16.1 Create `components/MatchRow.jsx`
    - Render team names + emoji flags (`flagFor`), kickoff via `formatKickoff`, group/stage when present, recommended pick or "Odds Pending" placeholder, `oddsAsOf` in Madrid time, relative indicator (`relativeToKickoff`), and lock-soon highlight (`isLockSoon`)
    - Retain any previously displayed pick while odds are pending (Req 1.6); expandable to `MatchDetail`
    - _Requirements: 1.2, 1.3, 1.5, 1.6, 2.1, 2.2, 2.4, 3.1, 3.3, 3.4, 4.13, 6.7_
  - [ ] 16.2 Create `components/MatchDetail.jsx`
    - Render top-N picks table (scoreline, EV, exact-score prob, rank), the four-band breakdown from `bandBreakdown`, outcome probabilities, solved λ, and the modal-vs-recommended note when `differsFromModal`
    - _Requirements: 5.9, 5.10, 5.11, 5.12, 5.13_
  - [ ] 16.3 Create `components/RefreshButton.jsx`
    - Call `POST /api/matches/[id]/refresh`; handle 429 (cooldown message) and 502 (error message) while keeping prior data
    - _Requirements: 6.4, 6.5, 6.6_
  - [ ] 16.4 Create `components/MatchList.jsx`
    - Day-grouped (`madridDayKey`) list sorted by kickoff asc; filter controls (upcoming-only / specific day / group) and team-name search; render `MatchRow` children and the `stale` warning banner
    - _Requirements: 1.4, 2.3, 7.1, 7.2, 10.1_
  - [ ] 16.5 Replace `app/page.js` with the match-list home (server component)
    - Server component fetches `GET /api/matches` and renders `MatchList` with the initial snapshot; move the existing calculator UI out (it relocates in task 17)
    - _Requirements: 1.1, 8.1_
  - [ ]* 16.6 Write light render test for list ordering/grouping
    - Given a fixed `MatchesResponse`, assert ascending kickoff order and correct day grouping; pending rows show the placeholder
    - _Requirements: 1.4, 1.5, 2.3_

- [ ] 17. Migrate the standalone calculator
  - [ ] 17.1 Create `app/calculator/page.js` from the existing calculator UI
    - Move the current `app/page.js` manual odds/λ tool to `/calculator`, retaining xG and market-odds modes
    - Add a Shin vs proportional de-vig toggle that passes the chosen `devig` (from `lib/shin.js`) into `fromOdds`; keep using `rankPicks`/`outcomeProbs` for the breakdown
    - _Requirements: 7.3, 5.1, 5.2_
  - [ ]* 17.2 Write a small test for the calculator's devig wiring
    - Assert toggling to Shin vs proportional changes the solved λ / probabilities for a fixture
    - _Requirements: 5.1, 5.2_

- [ ] 18. Final checkpoint - full verification
  - Ensure `node --test` passes and `next build` succeeds; ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP; core implementation tasks are never optional.
- `scoring.js`, `poisson.js`, and `optimizer.js` are already implemented and tested — new modules consume them and must not recreate them.
- Each task references the specific requirement clauses it satisfies for traceability.
- Property/edge-case tests target the pure functions (`shin`, `recommend`, `bookmaker`, `time`, `lockSoon`, `normalizeEvent`); routes and components get lighter validation by design.
- Verification gate per task: `node --test` passing and `next build` succeeding. Do not run dev servers or watch mode during verification.
- The Odds API key is read only from `process.env.ODDS_API_KEY` inside server route handlers / `lib/oddsProvider.js`; it must never reach a client bundle.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1", "4.1", "5.1", "6.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "3.2", "4.2", "5.2", "6.2", "11.1"] },
    { "id": 2, "tasks": ["2.2", "7.1", "9.1", "10.1", "11.2"] },
    { "id": 3, "tasks": ["7.2", "9.2", "9.3", "10.2"] },
    { "id": 4, "tasks": ["9.4", "13.1", "16.1", "16.2", "16.3"] },
    { "id": 5, "tasks": ["13.2", "14.1", "16.4", "17.1"] },
    { "id": 6, "tasks": ["14.2", "16.5", "17.2"] },
    { "id": 7, "tasks": ["16.6"] }
  ]
}
```
