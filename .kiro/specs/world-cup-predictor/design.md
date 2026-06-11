# Design Document

## Overview

World Cup Predictor is a Next.js (App Router) application deployed on Vercel. It lists
every 2026 World Cup match, ingests live betting odds from The Odds API, and recommends
the Superbru scoreline that maximizes expected points per match.

The architecture has three layers:

1. **Modeling core (`lib/`)** — framework-agnostic, pure functions, unit-tested. Already
   exists (`scoring`, `poisson`, `optimizer`) and is extended here (`odds` de-vig +
   solver, plus new `shin`, `recommend`).
2. **Server layer (route handlers)** — the only place the Odds API key is used. Fetches,
   validates, caches, and transforms provider data into recommendation payloads.
3. **Client layer (React components)** — renders the match list, detail breakdowns,
   timezone-localized times, flags, lock-soon highlighting, filtering/search, and the
   standalone calculator. Never sees the API key or raw provider data.

Design priorities, in order: correctness of the model, staying within the free-tier
quota, resilience when the provider misbehaves, and a fast, legible UI.

### Requirements coverage map

| Req | Addressed by |
|---|---|
| 1 Match listing | `MatchList`, `MatchRow`, recommendation pipeline, odds-pending state |
| 2 Time/localization | `lib/time.js` (Europe/Madrid), day grouping, relative indicator |
| 3 Flags & lock-soon | `lib/flags.js`, `lib/lockSoon.js`, `MatchRow` highlight |
| 4 Odds ingestion | `lib/oddsProvider.js`, route handlers, `lib/bookmaker.js`, cache |
| 5 EV computation | `lib/shin.js`, `lib/odds.js`, `lib/poisson.js`, `lib/optimizer.js`, `lib/recommend.js`, `MatchDetail` |
| 6 Data freshness | route handlers, `lib/cache.js`, `lib/rateLimit.js`, close-match scoping |
| 7 Filter/search/calc | `MatchList` controls, `/calculator` page |
| 8 Hosting/stack | App Router route handlers, `lib/` separation, tests |
| 9 Quota/cost | Caching + credit accounting + rate limiting |
| 10 Resilience | Cache fallback, per-match degrade, staleness flags |
| 11 Security | Server-only key, response validation schema |

## Architecture

```
                            ┌──────────────────────────────────────┐
                            │            Browser (client)           │
                            │  MatchList · MatchRow · MatchDetail    │
                            │  Calculator · filters/search           │
                            └───────────────┬──────────────────────┘
                                            │ fetch (no secrets)
                 ┌──────────────────────────┼───────────────────────────┐
                 │                  Next.js route handlers (server)       │
                 │                                                        │
                 │  GET  /api/matches            → cached recommendations │
                 │  POST /api/matches/[id]/refresh → per-event refresh    │
                 │                                                        │
                 │   ┌────────────┐  ┌───────────┐  ┌──────────────────┐  │
                 │   │oddsProvider│  │   cache   │  │    rateLimit     │  │
                 │   │ (fetch+val)│  │ (in-mem + │  │ (per-event guard)│  │
                 │   └─────┬──────┘  │  revalid) │  └──────────────────┘  │
                 │         │         └───────────┘                        │
                 │         ▼                                              │
                 │   ┌──────────────────────────────────────────────┐    │
                 │   │ recommend.js  (orchestrates the lib core)      │    │
                 │   │  bookmaker → shin → odds(solve λ) → poisson    │    │
                 │   │   → optimizer → breakdown                      │    │
                 │   └──────────────────────────────────────────────┘    │
                 └───────────────────────────┬────────────────────────────┘
                                             │ HTTPS + apiKey (env)
                                             ▼
                                   The Odds API (soccer_fifa_world_cup)
```

### Why this shape

- **Route handlers, not a separate service** (Req 8.1): Vercel runs them as serverless
  functions; no infra to manage, and the key stays server-side (Req 4.2–4.4, 11.1).
- **Recommendation computed server-side**: the client receives only finished
  recommendation payloads, keeping bundles small and the model logic centralized.
- **In-memory cache + Next revalidation**: avoids per-view provider calls and is the
  primary lever for staying in the free tier (Req 9.1). Note the serverless caveat
  below.

### Serverless caching caveat

Vercel serverless instances are ephemeral; module-level in-memory cache is per-instance
and can cold-start empty. The design uses Next's `unstable_cache` / fetch `revalidate`
as the durable cache layer (backed by Vercel's Data Cache), with a small module-level
memo as a fast path within a warm instance. This keeps full-list fetches to ~1–2/day
regardless of instance churn. No external KV is required for v1; the design leaves a
seam (`cache.js` interface) to swap in Vercel KV later if needed.

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
export async function fetchAllOdds();          // full-list fetch
export async function fetchEventOdds(eventId); // per-event fetch
export function normalizeEvent(rawEvent);      // validate + shape; returns null if unusable
```

Builds URLs with `regions=eu`, `markets=h2h,totals`, `oddsFormat=decimal`, key from
`process.env.ODDS_API_KEY`. `normalizeEvent` is the validation boundary (Req 11.2): it
checks types/shapes, keeps valid fields and drops invalid ones (Req 11.3), and returns
`null` for an event with no usable market (→ odds pending, Req 10.3).

#### `lib/cache.js` (new) — Req 4.7, 4.8, 6.1, 10.1, 10.2

```js
export async function getCachedMatches();              // durable cache read
export async function setCachedMatches(snapshot);      // write full snapshot
export async function patchCachedMatch(id, entry);     // per-event update (Req 4.8)
export function isStale(snapshot, maxAgeMs);
```

Snapshot shape includes `fetchedAt` so the UI can show staleness (Req 6.7, 10.1). On a
provider failure the route returns the last good snapshot flagged `stale: true`
(Req 10.1, 10.2).

#### `lib/rateLimit.js` (new) — Req 6.6, 9.1

```js
export function allowRefresh(eventId, now);  // → boolean; per-event min interval
```

In-memory token/timestamp guard keyed by event id (e.g. min 5 min between manual
refreshes of the same match). Best-effort across instances; combined with caching it
keeps usage well under 500 credits/month.

### Server layer (route handlers)

#### `GET /api/matches` — Req 1, 6.1–6.3, 10

```
1. read durable cache; if fresh enough → return it
2. else Full_List_Fetch → normalizeEvent[] → recommendForMatch[] → snapshot
3. on provider error → return last cached snapshot with { stale:true, warning }
4. response: { matches:[RecommendationCard], fetchedAt, stale }
```

Auto-refresh scoping (Req 6.2/6.3) is applied here: only Close_Match entries are
eligible to trigger a fresh fetch; distant matches are served from the daily snapshot.

#### `POST /api/matches/[id]/refresh` — Req 4.5, 4.8, 6.4–6.6

```
1. rateLimit.allowRefresh(id) → if blocked, 429 + retryAfter
2. Per_Event_Fetch(id) → normalize → recommendForMatch
3. patchCachedMatch(id, entry)  (Req 4.8; background-repair on failure, Req 4.9)
4. on failure → 502 with { error }, client keeps prior odds (Req 6.5)
5. response: { match:RecommendationCard }
```

### Client layer (React components, App Router)

- `app/page.js` — server component: initial `GET /api/matches`, renders `MatchList`.
- `components/MatchList.jsx` — day-grouped list (Req 2.3), filter/search controls
  (Req 7.1, 7.2), sorted by kickoff asc (Req 1.4).
- `components/MatchRow.jsx` — teams + flags (Req 1.2, 3.1), kickoff (Req 2.1, 2.2),
  group/stage (Req 1.3), recommended pick or "Odds Pending" (Req 1.5), odds-as-of +
  refresh control (Req 4.13, 6.7), lock-soon highlight (Req 3.3, 3.4), relative
  indicator (Req 2.4). Expands to `MatchDetail`.
- `components/MatchDetail.jsx` — top-N picks table, four-band breakdown, outcome
  probabilities, λ, and the modal-vs-recommended note (Req 5.9–5.13).
- `components/RefreshButton.jsx` — calls the per-event refresh route; handles 429/502
  by showing a message and keeping prior data (Req 6.5).
- `app/calculator/page.js` — retains the existing manual odds/λ tool (Req 7.3),
  now able to toggle Shin vs proportional.

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

// What a row renders
type RecommendationCard = {
  eventId: string;
  homeTeam: string; awayTeam: string;
  homeFlag: string; awayFlag: string;
  commenceTimeUtc: string;
  group?: string;
  oddsAsOf?: string;             // absent when pending
  status: "ok" | "pending";      // pending = no usable odds (Req 1.5, 10.3)
  recommendation?: Recommendation; // absent when pending
};

type MatchesResponse = {
  matches: RecommendationCard[];
  fetchedAt: string;
  stale: boolean;                // Req 10.1
  warning?: string;
};
```

## Error Handling

| Scenario | Handling | Req |
|---|---|---|
| Provider unreachable / 5xx on full list | Return last cached snapshot, `stale:true`, warning banner | 10.1, 10.2 |
| No cache yet AND provider down | Return `matches:[]`, `stale:true`, explanatory warning | 10.1 |
| Single event malformed/partial | `normalizeEvent` drops invalid fields; if no usable market → `status:"pending"`, rest of list unaffected | 10.3, 11.3 |
| No usable bookmaker | `selectBookmaker` → null → `status:"pending"` | 1.5, 4.12 |
| Shin non-convergence | `devigBest` falls back to proportional, sets `devigMethod` | 5.2 |
| Per-event refresh provider error | 502 to client; client keeps prior odds + timestamp, shows message | 6.5 |
| Cache write fails after good fetch | Use fresh data now, background-repair cache | 4.9 |
| Manual refresh too frequent | 429 + `retryAfter`; client shows cooldown | 6.6 |
| Missing `ODDS_API_KEY` env | Route returns 500 with clear server log; never leaks key | 4.2, 11.1 |

All provider responses pass through `normalizeEvent` before any modeling code touches
them (Req 11.2). Modeling functions assume already-validated numeric input.

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

Route handlers and components are validated manually plus light integration tests where
practical (fetch mocked); the heavy logic lives in the unit-tested core by design.

A `node --test` run plus `next build` is the verification gate before each task is
considered done.

## Design Decisions and Trade-offs

- **No database (v1).** Nothing the app stores is irreplaceable: there are no accounts,
  no saved picks, and no history (all v1 non-goals). The only persisted data is the odds
  cache, which is derived and re-fetchable, so it lives in the Next.js Data Cache rather
  than a database. Persistence is isolated behind `cache.js`, so Vercel KV/Postgres can
  be added later if the pool-aware strategy or history tracking is introduced. The whole
  app runs on GitHub + Vercel with no external service.
- **Emoji flags (v1).** Zero setup and no assets; accepted trade-off is inconsistent
  rendering on Windows. `flagFor` returns a country code too, so a later switch to
  `flag-icons` SVG is render-only.
- **Compute recommendations server-side, cache the result** rather than shipping the
  model to the client. Keeps the bundle small, centralizes validation, and means the
  expensive λ grid-search runs once per snapshot, not per viewer. Trade-off: a cold
  serverless instance recomputes from cache miss; acceptable at this scale.
- **Durable cache via Next Data Cache, not external KV** for v1. Simpler, free, good
  enough given 1–2 full fetches/day. `cache.js` interface isolates this so KV can be
  dropped in later without touching routes.
- **Shin default, proportional fallback** (per resolved decision) — Shin better handles
  heavy favorites common in World Cup group play; proportional guarantees a result when
  Shin's solver degenerates.
- **λ via grid search** rather than closed-form inversion. Robust and fast enough
  (~hundreds of grid evals per match, once per snapshot). Trade-off: not the absolute
  fastest, but simplicity wins here.
- **Static flag map** over a flag CDN/API (Req 3.2) — zero latency, no extra requests,
  works offline; cost is maintaining a 48-team lookup.
- **In-memory rate limit** is best-effort across serverless instances. Combined with
  caching it is sufficient for free-tier protection; a shared store would be the upgrade
  path if abuse ever mattered (it does not for a personal tool).
```
