# Design Document

## Overview

World Cup Predictor is a Next.js (App Router) application deployed on Vercel. It lists
every 2026 World Cup match, recommends the Superbru scoreline that maximizes expected
points per match, and tracks how those recommendations performed once matches finish.

Data is persisted in **Neon (Vercel-managed Postgres)**. Page loads read exclusively from the database
(zero provider calls). The Odds API is contacted only on two explicit user actions:
**Refresh odds** (full-list odds fetch) and **Update results** (scores fetch). Finalized
matches are frozen as "Closed" with their final score, the recommendation the app made,
and the points it earned; a scorecard aggregates those points.

The architecture has four layers:

1. **Modeling core (`lib/`)** — framework-agnostic, pure functions, unit-tested
   (`scoring`, `poisson`, `optimizer`, `odds`, `shin`, `recommend`, `bookmaker`, `time`,
   `lockSoon`, `flags`).
2. **Persistence (`lib/db.js` + Postgres)** — matches, odds, recommendations, and
   results. The single source of truth the UI reads from.
3. **Server layer (route handlers)** — the only place the Odds API key is used. Fetches,
   validates, transforms provider data, and writes to the database. Two action routes
   plus a read route.
4. **Client layer (React components)** — renders the match list, detail breakdowns,
   closed-match cards, the scorecard, timezone-localized times, flags, lock-soon
   highlighting, filtering/search, and the standalone calculator. Never sees the API key.

Design priorities, in order: correctness of the model, frugal credit use (on-demand
only), durable results, and a fast, legible UI.

### Requirements coverage map

| Req | Addressed by |
|---|---|
| 1 Match listing | `MatchList`, `MatchRow`, DB read, odds-pending + closed states |
| 2 Time/localization | `lib/time.js` (Europe/Madrid), day grouping, relative indicator |
| 3 Flags & lock-soon | `lib/flags.js`, `lib/lockSoon.js`, `MatchRow` highlight |
| 4 Odds ingestion (on-demand) | `lib/oddsProvider.js`, `POST /api/refresh-odds`, `lib/bookmaker.js`, `lib/db.js` |
| 5 EV computation | `lib/shin.js`, `lib/odds.js`, `lib/poisson.js`, `lib/optimizer.js`, `lib/recommend.js`, `MatchDetail` |
| 6 On-demand refresh & persistence | action routes, `lib/db.js`, `lib/rateLimit.js`, empty-DB prompt |
| 7 Closed matches & scorecard | `lib/scoresProvider.js`, `POST /api/update-results`, `lib/scorecard.js`, `ClosedCard`, `Scorecard` |
| 8 Filter/search/calc | `MatchList` controls, `/calculator` page |
| 9 Hosting/stack | App Router routes + Neon (Vercel-managed Postgres), `lib/` separation, tests |
| 10 Quota/cost | On-demand-only fetching, DB-served reads, rate limiting |
| 11 Resilience | DB always renders; action failures leave DB unchanged; per-match degrade |
| 12 Security | Server-only key, response validation schema |

(Requirement numbers follow the updated requirements.md ordering.)

## Architecture

```
                            ┌──────────────────────────────────────┐
                            │            Browser (client)           │
                            │  MatchList · MatchRow · ClosedCard     │
                            │  Scorecard · Calculator · filters      │
                            │  [Refresh odds] [Update results]       │
                            └───────────────┬──────────────────────┘
                                            │ fetch (no secrets)
                 ┌──────────────────────────┼───────────────────────────┐
                 │                  Next.js route handlers (server)       │
                 │                                                        │
                 │  GET  /api/matches          → read from Postgres       │
                 │  POST /api/refresh-odds     → full-list odds fetch      │
                 │  POST /api/update-results   → scores fetch + freeze     │
                 │                                                        │
                 │   ┌────────────┐ ┌─────────────┐ ┌────────────────┐   │
                 │   │oddsProvider│ │scoresProvider│ │   rateLimit    │   │
                 │   │ (fetch+val)│ │ (fetch+val)  │ │ (action guard) │   │
                 │   └─────┬──────┘ └──────┬───────┘ └────────────────┘   │
                 │         │               │                              │
                 │         ▼               ▼                              │
                 │   ┌──────────────────────────────────────────────┐    │
                 │   │ recommend.js / scorecard.js  (lib core)        │    │
                 │   └──────────────────────┬───────────────────────┘    │
                 │                          ▼                             │
                 │                    ┌───────────┐                       │
                 │                    │ lib/db.js │  → Neon Postgres       │
                 │                    └───────────┘                       │
                 └───────────────────────────┬────────────────────────────┘
                                             │ HTTPS + apiKey (env)
                                             ▼
                                   The Odds API (odds + scores endpoints)
```

Page load path: `GET /api/matches` (or the server component) reads Postgres and renders.
No provider call. The provider is touched only by the two POST action routes.
```

### Why this shape

- **Read from Postgres, fetch on demand**: page loads are pure DB reads, so they cost
  zero credits, are instant, and survive serverless cold starts (the old in-memory cache
  could not). Provider calls happen only on the two explicit action routes.
- **Postgres, not in-memory cache**: results must persist for the whole tournament and a
  cold serverless instance must not lose them. Neon (Vercel-managed Postgres) is durable, managed, and
  on the same platform (no separate host).
- **Recommendation computed server-side at write time**: when odds are refreshed, the
  recommendation is computed and stored, so reads are trivial and the model logic stays
  centralized server-side.
- **Closed matches are frozen**: once the scores endpoint marks a match completed, its
  recommendation and final score are immutable, so later odds refreshes never rewrite
  history.

## Data Persistence (Neon Serverless Postgres)

`lib/db.js` is the only module that talks to Postgres; everything else goes through it.

Schema (single shared dataset, no per-user state):

```sql
CREATE TABLE matches (
  event_id        TEXT PRIMARY KEY,
  home_team       TEXT NOT NULL,
  away_team       TEXT NOT NULL,
  commence_time   TIMESTAMPTZ NOT NULL,
  group_label     TEXT,
  status          TEXT NOT NULL,         -- 'upcoming' | 'live' | 'closed'
  -- odds + recommendation (null until first refresh; "odds pending")
  odds_as_of      TIMESTAMPTZ,
  bookmaker       TEXT,
  recommendation  JSONB,                 -- full Recommendation payload
  -- result (null until match closes)
  final_home      INT,
  final_away      INT,
  completed       BOOLEAN NOT NULL DEFAULT FALSE,
  earned_points   REAL,                  -- points the stored pick scored
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE meta (
  key             TEXT PRIMARY KEY,      -- 'odds_last_refreshed', 'results_last_updated'
  value           TIMESTAMPTZ
);
```

`lib/db.js` interface:

```js
export async function getAllMatches();              // ordered by commence_time
export async function upsertMatchOdds(card);        // skips frozen closed matches for pick/score
export async function freezeResult(eventId, finalHome, finalAway, earnedPoints);
export async function getMeta(key);                 // last-refreshed timestamps
export async function setMeta(key, isoTs);
export async function isEmpty();                     // → empty-DB prompt (Req 1.8)
```

`upsertMatchOdds` is closed-aware: for a row with `completed = true` it updates volatile
fields only and never overwrites `recommendation`, `final_*`, or `earned_points`
(Req 7.3). Local dev uses the same interface against a local/branch Postgres or a
`DATABASE_URL` pointing at a Neon (Vercel-managed Postgres) dev database.

## Components and Interfaces

### Modeling core (`lib/`)

Existing modules are unchanged in contract:
- `scoring.js` — `points(pick, actual)`, `outcome(h,a)`
- `poisson.js` — `scoreGrid(λH, λA, rho?, maxGoals?)`, `poissonPmf`, `MAX_GOALS`
- `optimizer.js` — `rankPicks(grid)`, `bestPick(grid)`, `expectedPoints`, `outcomeProbs`

New / extended modules:

#### `lib/shin.js` (new) — Req 5.1, 5.2

```js
/**
 * Shin's method de-vig. Solves for the proportion of insider trading z that
 * explains the book's overround, then returns margin-free probabilities.
 * @param {number[]} decimalOdds  e.g. [homeOdds, drawOdds, awayOdds]
 * @returns {{ probs:number[], z:number, method:"shin" }}
 */
export function shinDevig(decimalOdds);

/** Proportional fallback (moved/shared with lib/odds devig). */
export function proportionalDevig(decimalOdds);

/**
 * Public entry: try Shin, fall back to proportional on non-convergence
 * or degenerate input (<2 outcomes, non-finite, z out of [0,1)).
 * @returns {{ probs:number[], method:"shin"|"proportional" }}
 */
export function devigBest(decimalOdds);
```

Shin solves, for booked implied probabilities πᵢ = 1/oddsᵢ normalized by their sum
`S = Σ 1/oddsᵢ`, the value `z ∈ [0,1)` satisfying the standard fixed-point relation
`Σ √(z² + 4(1−z)·πᵢ²/S) = 2 − z`, then `pᵢ = (√(z² + 4(1−z)·πᵢ²/S) − z) / (2(1−z))`.
Solved by bisection on z (monotone), capped iterations. If it fails to converge or
returns invalid probabilities, `devigBest` falls back to proportional (Req 5.2).

#### `lib/odds.js` (extended) — Req 5.3

`fromOdds` is updated to accept a pre-de-vigged probability target so the de-vig method
is chosen by the caller (`devigBest`) rather than hard-coded to proportional:

```js
// new preferred signature; old behavior retained for the calculator's raw path
fromOdds({ oneXtwo, totalLine?, overUnder?, rho?, devig? })
//   devig defaults to devigBest; calculator may pass proportional explicitly
```

The λ grid-search solver itself is unchanged (coarse 0.1 → fine 0.02). Output adds the
`method` used and the achieved fit cost for display/debugging.

#### `lib/recommend.js` (new) — orchestration, Req 5.4–5.13

```js
/**
 * Full pipeline for one match's odds → recommendation payload.
 * @param {NormalizedOdds} odds  { oneXtwo, totalLine, overUnder, bookmaker, oddsAsOf }
 * @param {object} [opts] { topN=6 }
 * @returns {Recommendation}
 */
export function recommendForMatch(odds, opts);

/** Four-band breakdown for a given pick over a grid. Req 5.10 */
export function bandBreakdown(pick, grid);
//   → { exact:{p,ev}, close:{p,ev}, result:{p,ev}, wrong:{p} }
```

`recommendForMatch` runs: `devigBest` → `fromOdds` (solve λ) → `scoreGrid` →
`rankPicks` (filtering zero-EV, Req 5.8) → tie-break by exact-score prob (Req 5.7) →
assemble top-N, band breakdown, outcome probs, λ, and a `modal` scoreline plus a
`differsFromModal` flag (Req 5.13).

#### `lib/bookmaker.js` (new) — Req 4.10–4.12

```js
/** Choose odds source from a provider event's bookmakers array. */
export function selectBookmaker(bookmakers, { sharpKey = "pinnacle" });
//   → { oneXtwo, totalLine, overUnder, bookmaker, source:"sharp"|"average"|"first" }
```

Precedence: Pinnacle present → use it; else average decimal odds across all books that
expose both `h2h` and `totals`; else first available book. Returns `null` when no usable
book exists (caller marks match "odds pending").

#### `lib/time.js` (new) — Req 2

```js
export function toMadrid(isoUtc);             // → Intl-formatted parts
export function formatKickoff(isoUtc);        // "Thu 11 Jun, 21:00 CEST"
export function madridDayKey(isoUtc);         // "2026-06-11" for day grouping
export function kickoffState(isoUtc, now);    // "upcoming"|"live"|"finished"
export function relativeToKickoff(isoUtc,now);// "in 3h" | "live" | "finished"
```

Uses `Intl.DateTimeFormat` with `timeZone: "Europe/Madrid"`; DST handled automatically
by the runtime tz database — no manual CET/CEST switching.

#### `lib/lockSoon.js` (new) — Req 3.3, 3.4

```js
/**
 * @returns {boolean} whether the lock-soon highlight is active now.
 * Normal-hours kickoff: true once now ≥ kickoff − 2h.
 * After-midnight kickoff (00:00–~06:00 Madrid): true once now ≥ preceding midnight.
 */
export function isLockSoon(kickoffIsoUtc, now);
```

"Normal waking hours" and the after-midnight band are computed in Madrid local time.
Pure function of `(kickoff, now)` so it is unit-testable with injected `now`.

#### `lib/flags.js` (new) — Req 3.1, 3.2

```js
export function flagFor(teamName);  // → { emoji, code } from a static map
```

Static `teamName → ISO country code` table for the 48 World Cup nations; renders a
**Unicode emoji flag** (regional-indicator pair derived from the country code). No
network calls, no assets, satisfies Req 3.2.

**Decision (v1): emoji flags.** Chosen for zero setup. Known trade-off: Windows
Chrome/Edge render emoji flags as country *letters* (no emoji flag font ships on
Windows), so some viewers see "MX"/"ZA" text instead of a flag. Accepted for v1; the
`flagFor` interface returns both `emoji` and `code`, so switching to `flag-icons` SVG
later is a render-layer change only — no model or data-shape impact. Sub-national teams
(England/Scotland/Wales) will fall back to a neutral placeholder under the emoji
approach since they have no emoji flag.

#### `lib/oddsProvider.js` (new) — Req 4.1, 4.5, 4.6, 11.2, 11.3

```js
export async function fetchAllOdds();          // single full-list fetch (all matches)
export function normalizeEvent(rawEvent);      // validate + shape; returns null if unusable
```

Builds the URL with `regions=eu`, `markets=h2h,totals`, `oddsFormat=decimal`, key from
`process.env.ODDS_API_KEY`. There is intentionally **no** per-event fetch: the full-list
call costs the same 2 credits and returns every match. `normalizeEvent` is the validation
boundary (Req 11.2): it checks types/shapes, keeps valid fields and drops invalid ones
(Req 11.3), and returns `null` for an event with no usable market (→ odds pending).

#### `lib/scoresProvider.js` (new) — Req 7, 11.2

```js
export async function fetchScores(daysFrom = 3);  // scores endpoint
export function normalizeScore(rawScore);          // → { eventId, completed, home, away } | null
```

Calls `/sports/soccer_fifa_world_cup/scores/?daysFrom=N` (2 credits). Joins to matches by
`eventId`. `normalizeScore` validates the `completed` flag and parses the `scores` array
(team-name-keyed, like h2h) into integer goals; returns `null` if not completed or
malformed.

#### `lib/db.js` (new) — Req 6, 7, 9 (persistence)

Postgres access layer (interface shown in the Data Persistence section). The only module
that issues SQL. `upsertMatchOdds` is closed-aware (never rewrites frozen results);
`freezeResult` sets the final score + `earned_points` once.

#### `lib/scorecard.js` (new) — Req 7.4, 7.5

```js
/** Aggregate earned points and pick-quality counts over closed matches. */
export function buildScorecard(closedMatches);
//   → { totalPoints, counts:{exact,close,result,wrong}, played }
```

Pure function: classifies each closed match's stored pick vs final score via the
Scoring_Module and tallies the bands (Req 7.5). Unit-testable in isolation.

#### `lib/rateLimit.js` (new) — Req 6.7, 10

```js
export function allowAction(actionKey, now);  // "refresh-odds" | "update-results"
```

In-memory timestamp guard keyed by action name (min interval between invocations of each
action). Best-effort across instances; combined with on-demand-only fetching, usage stays
far under 500 credits/month.

### Server layer (route handlers)

#### `GET /api/matches` — Req 1, 6.2, 10, 11

```
1. read all matches from Postgres via db.getAllMatches()
2. build Scorecard from the closed matches
3. response: { matches:[MatchCard], scorecard, meta:{oddsLastRefreshed, resultsLastUpdated}, empty }
```

Pure DB read, no provider call (Req 6.2). If the DB is empty, `empty:true` drives the
"run Refresh odds" prompt (Req 1.8).

#### `POST /api/refresh-odds` — Req 4.5–4.9, 6.3

```
1. allowAction("refresh-odds") → if blocked, 429 + retryAfter
2. fetchAllOdds() → normalizeEvent[] → recommendForMatch[] → buildCard[]
3. db.upsertMatchOdds(card) for each (closed matches keep frozen pick/score)
4. db.setMeta("odds_last_refreshed", now)
5. on provider error → 502 { error }; DB left unchanged (Req 4.9, 11.1)
6. response: { updated:N, meta }
```

#### `POST /api/update-results` — Req 7.1–7.3

```
1. allowAction("update-results") → if blocked, 429 + retryAfter
2. fetchScores() → normalizeScore[]
3. for each completed score: compute earnedPoints = points(storedPick, finalScore);
   db.freezeResult(eventId, home, away, earnedPoints); set status="closed"
4. db.setMeta("results_last_updated", now)
5. on provider error → 502 { error }; DB left unchanged
6. response: { closed:N, meta }
```

### Client layer (React components, App Router)

- `app/page.js` — server component: reads `GET /api/matches` (DB), renders `Scorecard`,
  the action buttons, and `MatchList`. Shows the empty-DB prompt when `empty` (Req 1.8).
- `components/ActionBar.jsx` — "Refresh odds" and "Update results" buttons (separate),
  each calling its POST route, showing last-updated times and 429/502 messages.
- `components/Scorecard.jsx` — tournament totals: earned points + exact/close/result/
  wrong counts; "no matches scored yet" when empty (Req 7.4–7.6).
- `components/MatchList.jsx` — day-grouped list (Req 2.3), filter/search controls
  (Req 8.1, 8.2), sorted by kickoff asc (Req 1.4).
- `components/MatchRow.jsx` — teams + flags (Req 1.2, 3.1), kickoff (Req 2.1, 2.2),
  group/stage (Req 1.3), recommended pick or "Odds Pending" (Req 1.5), odds-as-of
  (Req 4.13), lock-soon highlight (Req 3.3, 3.4), relative indicator (Req 2.4). Expands to
  `MatchDetail`. Renders as `ClosedCard` when `status === "closed"`.
- `components/ClosedCard.jsx` — distinct "Closed" styling: final score, the stored
  Recommended_Pick, and Earned_Points with a band label (Req 1.9, 7.2).
- `components/MatchDetail.jsx` — top-N picks table, four-band breakdown, outcome
  probabilities, λ, and the modal-vs-recommended note (Req 5.9–5.13).
- `app/calculator/page.js` — retains the manual odds/λ tool (Req 8.3), with the
  Shin vs proportional toggle.

## Data Models

```ts
// Provider → normalized (server only)
type NormalizedOdds = {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  commenceTimeUtc: string;       // ISO
  group?: string;                // when available (Req 1.3)
  oneXtwo: [number, number, number]; // decimal [home, draw, away]
  totalLine?: number;            // e.g. 2.5
  overUnder?: [number, number];  // decimal [over, under]
  bookmaker: string;             // key used
  source: "sharp" | "average" | "first";
  oddsAsOf: string;              // ISO; provider last_update
};

// Computed recommendation (server → client)
type Recommendation = {
  pick: [number, number];
  ev: number;
  prob: number;                  // P(exact recommended score)
  topPicks: { pick:[number,number]; ev:number; prob:number; rank:number }[];
  bands: { exact:{p:number;ev:number}; close:{p:number;ev:number};
           result:{p:number;ev:number}; wrong:{p:number} };
  outcome: { home:number; draw:number; away:number };
  lambda: { home:number; away:number };
  modal: [number, number];       // single most likely scoreline
  differsFromModal: boolean;     // Req 5.13
  devigMethod: "shin" | "proportional";
};

// What a row renders (also the persisted match shape, minus SQL columns)
type MatchCard = {
  eventId: string;
  homeTeam: string; awayTeam: string;
  homeFlag: string; awayFlag: string;
  commenceTimeUtc: string;
  group?: string;
  status: "upcoming" | "live" | "closed" | "pending"; // pending = no usable odds
  oddsAsOf?: string;             // absent when pending
  bookmaker?: string;
  recommendation?: Recommendation; // absent when pending
  // present only when status === "closed"
  result?: { home: number; away: number; earnedPoints: number;
             band: "exact" | "close" | "result" | "wrong" };
};

type Scorecard = {
  played: number;                // closed matches
  totalPoints: number;
  counts: { exact: number; close: number; result: number; wrong: number };
};

type MatchesResponse = {
  matches: MatchCard[];
  scorecard: Scorecard;
  meta: { oddsLastRefreshed?: string; resultsLastUpdated?: string };
  empty: boolean;                // true when DB has no matches yet (Req 1.8)
};
```

## Error Handling

| Scenario | Handling | Req |
|---|---|---|
| Provider unreachable / 5xx during refresh-odds | 502 to client; DB left unchanged; existing data still served | 10.1, 11 |
| Provider unreachable / 5xx during update-results | 502 to client; DB left unchanged | 10.1 |
| Page load with provider down | Unaffected — reads DB only, no provider call | 10.2 |
| Single event malformed/partial | `normalizeEvent` drops invalid fields; no usable market → `status:"pending"`, rest unaffected | 10.3, 11.3 |
| No usable bookmaker | `selectBookmaker` → null → `status:"pending"` | 1.5, 4.12 |
| Shin non-convergence | `devigBest` falls back to proportional, sets `devigMethod` | 5.2 |
| Refresh would overwrite a closed match | `upsertMatchOdds` skips frozen pick/score/result | 7.3 |
| Action invoked too soon | 429 + `retryAfter`; client shows cooldown | 6.7 |
| Empty database | `GET /api/matches` returns `empty:true` → UI prompts "Refresh odds" | 1.8 |
| Missing `ODDS_API_KEY` env | Action route returns 500; never leaks key | 4.2, 11.1 |
| Missing `DATABASE_URL` env | App fails fast on startup with a clear server log | 9.1 |

All provider responses pass through `normalizeEvent` / `normalizeScore` before any
modeling code touches them (Req 11.2). Modeling functions assume validated numeric input.

## Testing Strategy

Unit tests (Node `node --test`, existing harness) for the `lib/` core (Req 8.4):

- **scoring** (existing) — keep current band coverage.
- **shin** — known de-vig fixtures: heavy favorite, near-even, three-way; assert Shin
  probabilities sum to 1, lie between proportional and "drift" expectations, and that
  degenerate input falls back to proportional.
- **bookmaker** — Pinnacle present → sharp; absent → average; only one book → first;
  none → null.
- **recommend** — golden cases (e.g. the Mexico λ≈1.76/0.66 scenario) asserting the
  recommended pick, that zero-EV picks are excluded, tie-break by exact prob, band
  breakdown sums, and `differsFromModal` true when modal ≠ recommended.
- **time** — fixed-instant tests across the CET→CEST boundary; day-key grouping;
  kickoff state transitions.
- **lockSoon** — normal-hours 2h trigger; after-midnight kickoff triggering at the
  preceding midnight; not-yet / already-live edges (injected `now`).
- **oddsProvider.normalizeEvent** — valid event; partial event (drop invalid fields);
  unusable event → null; URL/param construction with a stubbed key.
- **scoresProvider.normalizeScore** — completed event with score → parsed integers;
  not-completed → null; malformed scores array → null.
- **scorecard.buildScorecard** — tallies exact/close/result/wrong counts and total
  points across closed-match fixtures; empty input → zeros.

The `lib/db.js` layer is integration-tested against a disposable Postgres (or skipped
when `DATABASE_URL` is absent), since it is thin SQL over the unit-tested core. Route
handlers and components get light integration/render tests with `fetch`/db mocked; the
heavy logic lives in the unit-tested core by design.

A `node --test` run plus `next build` is the verification gate before each task is
considered done.

## Design Decisions and Trade-offs

- **Neon (Vercel-managed Postgres) for persistence.** Results must survive the whole tournament and
  serverless cold starts, so an in-memory cache is insufficient. Postgres is durable,
  managed, on-platform (no separate host), and gives a clean path to a season scoreboard.
  All SQL is isolated in `lib/db.js`. Trade-off: one managed dependency and a `DATABASE_URL`
  env var, accepted because the closed-match/scorecard feature needs real persistence.
- **On-demand fetching only.** The provider is called solely on the two action buttons,
  never on page load. This makes credit usage deterministic and tiny (a handful of
  2-credit calls when the user chooses), eliminates the cold-start "first visitor pays"
  problem, and makes loads instant. Trade-off: data is only as fresh as the last manual
  refresh — acceptable and in fact desired here (the user refreshes right before locking).
- **Single full-list odds fetch, no per-event endpoint.** The Odds API prices per call as
  regions × markets (2 credits) regardless of match count, so one full-list call is
  strictly better than looping per-event calls. The per-event endpoint was removed.
- **Closed matches are frozen.** Once results are recorded, the stored recommendation and
  final score are immutable so later refreshes can't rewrite what the app "picked." This
  is what makes the scorecard trustworthy.
- **Emoji flags (v1).** Zero setup and no assets; accepted trade-off is inconsistent
  rendering on Windows. `flagFor` returns a country code too, so a later switch to
  `flag-icons` SVG is render-only.
- **Compute recommendations server-side at write time** rather than shipping the model to
  the client or recomputing per read. The λ grid-search runs once per refresh and the
  result is stored; reads are trivial DB fetches.
- **Shin default, proportional fallback** (per resolved decision) — Shin better handles
  heavy favorites common in World Cup group play; proportional guarantees a result when
  Shin's solver degenerates.
- **λ via grid search** rather than closed-form inversion. Robust and fast enough
  (~hundreds of grid evals per match, once per refresh). Simplicity wins here.
- **Static flag map** over a flag CDN/API (Req 3.2) — zero latency, no extra requests,
  works offline; cost is maintaining a 48-team lookup.
- **In-memory rate limit** is best-effort across serverless instances. Combined with
  on-demand-only fetching it is more than sufficient for free-tier protection; a Postgres-
  or KV-backed guard is the upgrade path if it ever mattered (it does not for a personal
  tool).
```
