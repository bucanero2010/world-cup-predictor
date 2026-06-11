# World Cup Predictor — Requirements

## Purpose

A web app that lists every 2026 World Cup match, pulls live betting odds, and
recommends the scoreline to pick in a Superbru pool to maximize expected points.
The user (based in Madrid) refreshes before locking picks so they can react to
odds movement as more money comes in closer to kickoff.

## Scoring model (fixed — Superbru rules)

| Result | Points | Condition |
|---|---|---|
| Exact | 3 | exact scoreline |
| Close | 1.5 | correct outcome AND (1 goal out, OR 2 out with correct goal difference) |
| Result | 1 | correct outcome, not close |
| Wrong | 0 | wrong outcome |

Penalty shootouts score as the post-regulation/extra-time result (a shootout = draw).

---

## Functional Requirements

### 1. Match listing

**1.1** The app SHALL list all 2026 World Cup matches available from the odds source.

**1.2** Each match row SHALL display:
- Both team names
- Both team flags (visual)
- Kickoff date and time
- Group / stage label (e.g. "Group A", "Round of 16") when available
- Recommended pick (EV-best scoreline)

**1.3** Matches SHALL be sorted by kickoff time ascending (soonest first) by default.

**1.4** Matches without posted odds yet SHALL still appear, marked "odds pending,"
with no recommended pick.

### 2. Time and localization

**2.1** All match times SHALL display in Central European Time (Europe/Madrid),
automatically handling CET/CEST daylight saving.

**2.2** Each match SHALL show the day of week and date alongside the time
(e.g. "Thu 11 Jun, 21:00 CEST").

**2.3** Matches SHOULD be visually grouped or separated by calendar day (Madrid time).

**2.4** A relative indicator SHOULD show time-to-kickoff (e.g. "in 3h", "live", "finished").

### 3. Flags and visuals

**3.1** Each team SHALL render its national flag next to the team name.

**3.2** Flags SHALL come from a static lookup (country code → flag), not a per-request
external fetch, so the UI stays fast and works offline-ish.

**3.3** A match SHALL be highlighted as "lock soon" 2 hours before kickoff when that
window falls within normal waking hours (Madrid time). For matches kicking off after
midnight (Madrid), the heads-up SHALL surface at midnight rather than at the 2-hour mark.

### 4. Odds ingestion (live)

**4.1** The app SHALL fetch odds from a configured odds provider (default: The Odds API,
`soccer_fifa_world_cup`, markets `h2h` + `totals`, decimal format).

**4.2** The odds API key SHALL be stored server-side only (environment variable) and
SHALL NOT be exposed to the browser.

**4.3** Odds fetching SHALL run in a server-side route handler, not client-side.

**4.4** Odds fetching SHALL use a two-tier strategy:
- a low-frequency **full-list** fetch (`/sports/soccer_fifa_world_cup/odds`, ~1–2×/day)
  to keep the schedule and all recommendations populated;
- an on-demand **per-event** fetch (`/sports/soccer_fifa_world_cup/events/{id}/odds`)
  for single-match manual refresh.
Full-list responses SHALL be cached server-side; per-event refreshes update only that
match's cached entry.

**4.5** The user SHALL be able to trigger a per-match manual refresh that fetches fresh
odds for that single event (rate-limited to protect the API quota). Auto-refresh, where
applied, SHALL be scoped to matches kicking off within ~24 hours (see §6).

**4.6** Each match SHALL display the timestamp of the odds it was computed from
("odds as of HH:MM CEST") so the user knows how fresh the recommendation is.

**4.7** The model SHALL use the sharpest available bookmaker's odds (Pinnacle by
default) as the primary input. When the sharp book is absent for a match, it SHALL
fall back to averaging across available books, then to the first available book.

### 5. EV computation and breakdown

**5.1** For each match the app SHALL de-vig the 1X2 odds into fair outcome
probabilities using the most accurate practical method (Shin's method by default),
with the simple proportional method retained as a fallback.

**5.2** The app SHALL solve for expected goals (λ per side) consistent with the
de-vigged probabilities and, when available, the over/under total line.

**5.3** The app SHALL build a full scoreline probability grid (Dixon-Coles adjusted
Poisson) and rank candidate picks by expected Superbru points.

**5.4** Each match SHALL surface, on demand (expandable detail):
- Top N picks (default 5–8), each with: scoreline, expected points (EV),
  probability of that exact score, and rank
- The four-band breakdown for the recommended pick: P(exact), P(close),
  P(result), P(wrong) and the EV contribution of each band
- Outcome probabilities: home win / draw / away win %
- Solved λ for each side

**5.5** The recommended pick SHALL be the highest-EV scoreline; ties broken by higher
exact-score probability.

**5.6** The detail view SHOULD make the "central pick beats modal pick" effect legible
(e.g. show that the EV-best pick differs from the single most likely score when it does).

### 6. Data freshness / live behavior

**6.1** The app SHALL maintain a baseline fixture+odds snapshot via an infrequent
full-list fetch (e.g. once or twice daily) so the schedule and longer-range
recommendations stay populated.

**6.2** Automatic odds refresh SHALL be scoped to "close" matches only — those
kicking off within ~24 hours. Matches further out SHALL NOT be auto-refreshed.

**6.3** The user SHALL be able to manually refresh a single match's odds on demand,
using the provider's per-event odds endpoint so the cost is limited to that one match
(not a full-list refetch).

**6.4** Per-match manual refresh SHALL be rate-limited to protect the free-tier quota.

**6.5** Each match SHALL display the timestamp of the odds it was computed from
("odds as of HH:MM CEST"). (See also §4.6.)

**6.6** The UI SHALL indicate when each match's data was last updated and whether a
refresh is available.

### 7. Filtering and navigation (nice-to-have)

**7.1** The user SHOULD be able to filter to upcoming-only / a specific day / a
specific group.

**7.2** The user SHOULD be able to search by team name.

**7.3** The standalone single-match calculator (manual odds/λ entry) SHALL remain
available as a secondary page for what-if analysis.

---

## Non-Functional Requirements

### 8. Hosting and stack
**8.1** The app SHALL deploy on Vercel with no separate backend (Next.js route
handlers only).
**8.2** All modeling logic SHALL remain in the framework-agnostic `lib/` modules
(`scoring`, `poisson`, `odds`, `optimizer`) and be unit-tested.

### 9. Cost / quota
**9.1** The app SHALL operate within the odds provider's free tier under normal use
(caching + manual-refresh rate limiting).

### 10. Resilience
**10.1** If the odds provider is unreachable or returns an error, the app SHALL show
the last successfully cached data with a clear staleness warning, rather than failing.
**10.2** Malformed or partial odds for a single match SHALL NOT break the whole list;
that match degrades to "odds pending."

### 11. Security
**11.1** No secrets in client bundles. API keys server-side only.
**11.2** Treat all odds-provider responses as untrusted input and validate before use.

---

## Explicit Non-Goals (v1)

- Pool-aware / game-theoretic strategy (variance adjustment based on standing vs
  friends). Captured as a future enhancement; v1 maximizes per-match EV.
- Automatically submitting picks to Superbru (no Superbru integration / login).
- Historical accuracy tracking or backtesting.
- Accounts, multi-user, or saved pick state.

## Resolved Decisions

1. **Odds provider** — The Odds API (free tier, 500 credits/month). Endpoint
   `soccer_fifa_world_cup`, `regions=eu`, `markets=h2h,totals`, decimal format
   (2 credits per call regardless of match count).
2. **Bookmaker policy** — use the sharpest book (Pinnacle). Fall back to averaging
   across available books only when Pinnacle is absent, then to the first available
   book. (See §4.7.)
3. **De-vig method** — use the most accurate practical method. Default to Shin's
   method (models the margin as driven by insider/favorite-longshot bias), with the
   simple proportional method retained as a fallback. (Updates §5.1.)
5. **"Approaching kickoff" highlight window** — flag a match as "lock soon" 2 hours
   before kickoff when that 2h window falls within normal waking hours (Madrid time).
   If kickoff is after midnight, surface the heads-up at midnight (Madrid) instead of
   waiting for the 2h mark. (Updates §3.3.)

## Still Open

(none)

## Resolved — Refresh Cadence (was Q4)

Two-tier strategy:
- **Full-list fetch** ~1–2×/day keeps the schedule and all recommendations populated
  (2 credits/call).
- **Auto-refresh is scoped to "close" matches** (kickoff within ~24h) only.
- **Per-match manual refresh** uses the per-event endpoint, costing 2 credits for that
  single match — so refreshing the one game you're about to pick is cheap, and the user
  controls when it happens.

This keeps monthly usage far under the 500-credit free tier and concentrates fresh odds
exactly where they matter (imminent matches the user is about to lock).
