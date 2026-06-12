# Requirements Document

## Introduction

World Cup Predictor is a Next.js application deployed on Vercel that lists every 2026
World Cup match, ingests live betting odds on demand, and recommends the scoreline to
pick in a Superbru pool to maximize expected points. Server-side work runs in Next.js
route handlers; all modeling logic lives in framework-agnostic `lib/` modules
(`scoring`, `poisson`, `odds`, `optimizer`). Match, odds, recommendation, and result
data are persisted in a Vercel-hosted Postgres database so the app reads from the
database on every page load and only calls the odds provider on explicit user action.

The primary user is based in Madrid (Europe/Madrid timezone) and refreshes
recommendations before locking picks so they can react to odds movement as more money
enters the market closer to kickoff. The Superbru scoring model is fixed: Exact = 3,
Close = 1.5, Result = 1, Wrong = 0. Penalty shootouts score as the post-regulation /
extra-time result (a shootout is scored as a draw).

Finalized matches are retained as "Closed" with their final score, the recommendation
the app had made, and the Superbru points that recommendation would have earned. A
tournament scorecard aggregates those points across all closed matches.

This document formalizes the resolved requirements. Settled decisions (odds provider
configuration, bookmaker policy, de-vig method, the "lock soon" highlight window,
on-demand fetching, Postgres persistence, single full-list fetch, and closed-match
result tracking) are committed requirements and are not reopened.

## Glossary

- **App**: The World Cup Predictor application as a whole (Next.js frontend + route handlers).
- **Match_List**: The component responsible for listing and ordering matches.
- **Match_Row**: A single match entry within the Match_List.
- **Database**: The Vercel-hosted Postgres store persisting matches, odds, recommendations, and results.
- **Odds_Service**: The server-side route handler logic that fetches and validates odds and persists them to the Database.
- **Results_Service**: The server-side route handler logic that fetches final scores and freezes closed-match results in the Database.
- **Odds_Provider**: The external odds source. Default: The Odds API, endpoint `soccer_fifa_world_cup`, `regions=eu`, `markets=h2h,totals`, decimal format (2 credits per call).
- **Scores_Endpoint**: The Odds API `scores` endpoint returning `completed` and final `scores` per event (2 credits per call), joined to matches by event id.
- **Devig_Module**: The `lib/odds` logic that removes bookmaker margin to produce fair probabilities.
- **Lambda_Solver**: The `lib/odds` logic that solves expected goals (λ per side) from de-vigged probabilities and the total-goals line.
- **Score_Model**: The `lib/poisson` Dixon-Coles adjusted Poisson scoreline grid builder.
- **Optimizer**: The `lib/optimizer` logic that ranks candidate picks by expected Superbru points.
- **Scoring_Module**: The `lib/scoring` exact Superbru `points()` implementation.
- **Recommended_Pick**: The highest expected-value (EV) scoreline for a match.
- **Sharp_Book**: The sharpest available bookmaker; Pinnacle by default.
- **Shin_Method**: Shin's de-vig method, which models the margin as driven by favorite-longshot bias. Default de-vig method.
- **Proportional_Method**: The simple proportional de-vig method (normalize implied probabilities), retained as a fallback.
- **EV**: Expected Superbru points for a candidate pick over the full scoreline distribution.
- **Full_List_Fetch**: A single fetch of all matches via `/sports/soccer_fifa_world_cup/odds` (2 credits, returns every match).
- **Refresh_Odds_Action**: The explicit, user-triggered action that performs a Full_List_Fetch and upserts results into the Database.
- **Update_Results_Action**: The explicit, user-triggered action that queries the Scores_Endpoint and freezes closed-match results in the Database.
- **Match_State**: One of `upcoming`, `live`, or `closed` (derived from kickoff time and the Scores_Endpoint `completed` flag).
- **Closed_Match**: A match the Scores_Endpoint reports as completed; its final score, recommendation, and earned points are frozen in the Database.
- **Earned_Points**: The Superbru points the Recommended_Pick would have scored against a Closed_Match's final score, via the Scoring_Module.
- **Scorecard**: The aggregate of Earned_Points (and pick-quality counts) across all Closed_Match entries.
- **Lock_Soon**: A highlight state indicating a match is approaching its pick lock.
- **Odds_As_Of**: The timestamp of the odds used to compute a match's recommendation.
- **Madrid_Time**: Local time in the Europe/Madrid timezone, with automatic CET/CEST handling.
- **Calculator_Page**: The standalone single-match what-if calculator with manual odds/λ entry.

## Requirements

### Requirement 1: Match Listing

**User Story:** As a Superbru player, I want to see every 2026 World Cup match with its recommended pick, so that I can decide what scoreline to enter for each game.

#### Acceptance Criteria

1. THE Match_List SHALL list all 2026 World Cup matches available from the Odds_Provider.
2. THE Match_Row SHALL display both team names, both team flags, the kickoff date and time, and the Recommended_Pick.
3. WHERE a group or stage label is available for a match, THE Match_Row SHALL display the group or stage label.
4. THE Match_List SHALL sort matches by kickoff time in ascending order by default.
5. IF a match has no posted odds, THEN THE Match_Row SHALL display all standard elements (team names, flags, kickoff date and time) with an "Odds Pending" placeholder shown where the Recommended_Pick would appear.
6. WHILE a match has no newly posted odds, THE Match_Row SHALL retain any previously displayed Recommended_Pick until new odds arrive.
7. THE Match_List SHALL read all displayed data from the Database, performing no Odds_Provider calls on page load.
8. WHERE the Database is empty, THE App SHALL display a prompt to run the Refresh_Odds_Action rather than fetching automatically.
9. WHERE a match is a Closed_Match, THE Match_Row SHALL render in a visually distinct "Closed" style showing the final score, the Recommended_Pick, and the Earned_Points.

### Requirement 2: Time and Localization

**User Story:** As a user in Madrid, I want all match times shown in my local timezone with clear dates, so that I know exactly when each match starts and when I need to lock my picks.

#### Acceptance Criteria

1. THE App SHALL display all match times in Madrid_Time, automatically applying CET or CEST according to daylight saving.
2. THE Match_Row SHALL display the day of week and the date alongside the kickoff time.
3. THE Match_List SHALL group matches by calendar day in Madrid_Time.
4. THE Match_Row SHALL display a relative time-to-kickoff indicator that distinguishes upcoming, live, and finished states.

### Requirement 3: Flags and Lock-Soon Highlight

**User Story:** As a user, I want national flags and a clear "lock soon" signal, so that I can scan matches quickly and not miss the window to finalize a pick.

#### Acceptance Criteria

1. THE Match_Row SHALL render each team's national flag next to the team name.
2. THE App SHALL resolve flags from a static country-code lookup rather than a per-request external fetch.
3. WHILE a match kicks off during normal waking hours in Madrid_Time, WHEN the current time reaches 2 hours before kickoff, THE App SHALL apply the Lock_Soon highlight to that Match_Row.
4. WHERE a match kicks off after midnight in Madrid_Time, WHEN the current time reaches midnight in Madrid_Time, THE App SHALL apply the Lock_Soon highlight to that Match_Row.

### Requirement 4: Odds Ingestion

**User Story:** As the operator of the app, I want odds fetched securely on the server only when I ask, so that recommendations are controlled, my API key is never exposed, and I do not exhaust my quota.

#### Acceptance Criteria

1. THE Odds_Service SHALL fetch odds from the Odds_Provider using endpoint `soccer_fifa_world_cup`, markets `h2h` and `totals`, region `eu`, in decimal format.
2. THE Odds_Service SHALL read the Odds_Provider API key from a server-side environment variable only.
3. THE App SHALL NOT include the Odds_Provider API key in any client bundle.
4. THE Odds_Service SHALL perform all odds fetching within a server-side route handler.
5. THE Odds_Service SHALL retrieve all matches via a single Full_List_Fetch and SHALL NOT use any per-event odds endpoint.
6. THE Odds_Service SHALL fetch odds ONLY in response to the Refresh_Odds_Action, never automatically on page load or data expiry.
7. WHEN a Refresh_Odds_Action completes, THE Odds_Service SHALL upsert each match's fixture, odds, and recomputed recommendation into the Database.
8. THE Refresh_Odds_Action SHALL be rate-limited to protect the Odds_Provider free-tier quota.
9. IF a Refresh_Odds_Action fails due to a provider error or network issue, THEN THE App SHALL display an error and leave the existing Database contents unchanged.
10. WHEN computing a match's recommendation, THE Odds_Service SHALL use the Sharp_Book odds as the primary input.
11. IF the Sharp_Book is absent for a match, THEN THE Odds_Service SHALL average the odds across the available bookmakers.
12. IF the Sharp_Book is absent and averaging across bookmakers is not possible, THEN THE Odds_Service SHALL use the first available bookmaker's odds.
13. THE Match_Row SHALL display the Odds_As_Of timestamp in Madrid_Time for the odds used to compute its recommendation.

### Requirement 5: Expected-Value Computation and Breakdown

**User Story:** As a Superbru player, I want the app to compute the highest expected-points scoreline and show me the reasoning, so that I can trust and understand the recommendation.

#### Acceptance Criteria

1. THE Devig_Module SHALL de-vig the 1X2 odds into fair outcome probabilities using the Shin_Method by default.
2. IF the Shin_Method cannot be applied to a match's odds, THEN THE Devig_Module SHALL de-vig using the Proportional_Method.
3. THE Lambda_Solver SHALL solve for expected goals (λ per side) consistent with the de-vigged probabilities and, where a total-goals line is available, the over/under line.
4. THE Score_Model SHALL build a full scoreline probability grid using the Dixon-Coles adjusted Poisson model.
5. THE Optimizer SHALL rank candidate picks by EV computed against the scoreline probability grid.
6. THE Recommended_Pick SHALL be the highest-EV scoreline.
7. WHEN two or more candidate picks have equal EV, THE Optimizer SHALL select the pick with the higher exact-score probability as the Recommended_Pick.
8. THE Optimizer SHALL exclude candidate picks with zero EV from the ranking.
9. WHEN a user expands a match's detail view, THE App SHALL display the top N candidate picks, where N defaults to a value between 5 and 8, each showing scoreline, EV, exact-score probability, and rank.
10. WHEN a user expands a match's detail view, THE App SHALL display the four-band breakdown for the Recommended_Pick, showing P(exact), P(close), P(result), and P(wrong) and the EV contribution of each band.
11. WHEN a user expands a match's detail view, THE App SHALL display the outcome probabilities for home win, draw, and away win.
12. WHEN a user expands a match's detail view, THE App SHALL display the solved λ for each side.
13. WHERE the Recommended_Pick differs from the single most likely scoreline, THE App SHALL make that difference legible in the detail view.

### Requirement 6: On-Demand Refresh and Persistence

**User Story:** As a user, I want data to load instantly from storage and update only when I choose, so that the app is fast, predictable, and frugal with API credits.

#### Acceptance Criteria

1. THE App SHALL persist matches, odds, recommendations, and results in the Database.
2. THE App SHALL read all match data from the Database on page load and SHALL NOT call the Odds_Provider automatically.
3. THE App SHALL provide a Refresh_Odds_Action control that, when invoked, performs a Full_List_Fetch and upserts the results into the Database.
4. THE App SHALL provide an Update_Results_Action control, separate from Refresh_Odds_Action, that, when invoked, queries the Scores_Endpoint and updates match results in the Database.
5. WHEN a refresh or results action updates a non-closed match, THE App SHALL overwrite that match's stored odds, recommendation, or result.
6. THE App SHALL display when the Database was last updated by each action.
7. THE App SHALL rate-limit the Refresh_Odds_Action and Update_Results_Action to protect the Odds_Provider free-tier quota.

### Requirement 7: Closed Matches and Scorecard

**User Story:** As a Superbru player, I want finished matches kept with their final score and how my recommended pick scored, so that I can track how well the app's picks performed over the tournament.

#### Acceptance Criteria

1. WHEN the Update_Results_Action reports a match as completed, THE Results_Service SHALL set that match's Match_State to `closed` and store its final score in the Database.
2. WHEN a match becomes a Closed_Match, THE Results_Service SHALL compute Earned_Points by scoring the stored Recommended_Pick against the final score using the Scoring_Module, and persist it.
3. ONCE a match is a Closed_Match, THE App SHALL NOT overwrite its stored Recommended_Pick or final score on subsequent Refresh_Odds_Action invocations.
4. THE App SHALL display a Scorecard aggregating Earned_Points across all Closed_Match entries.
5. THE Scorecard SHALL display the count of exact, close, result, and wrong outcomes across all Closed_Match entries.
6. WHERE no Closed_Match entries exist, THE Scorecard SHALL indicate that no matches have been scored yet.

### Requirement 7: Filtering, Search, and Standalone Calculator

**User Story:** As a user, I want to filter and search matches and run what-if calculations, so that I can focus on relevant games and explore scenarios manually.

#### Acceptance Criteria

1. THE App SHALL allow the user to filter the Match_List to upcoming-only matches, a specific calendar day, or a specific group.
2. THE App SHALL allow the user to search matches by team name.
3. THE Calculator_Page SHALL allow the user to enter odds or λ manually and view the resulting ranked picks and breakdown for what-if analysis.

### Requirement 8: Hosting, Stack, and Modeling Separation

**User Story:** As the maintainer, I want a clean deployment model and well-isolated, tested modeling logic, so that the app is simple to run on Vercel and the core math is reliable.

#### Acceptance Criteria

1. THE App SHALL deploy on Vercel using Next.js route handlers and a Vercel-hosted Postgres database, with no separate self-managed backend service.
2. THE App SHALL keep all modeling logic in the framework-agnostic `lib/` modules (`scoring`, `poisson`, `odds`, `optimizer`).
3. WHERE non-modeling functionality such as persistence, authentication, or analytics is required, THE App SHALL be permitted to use external/managed services (including the Database) while keeping modeling logic in the `lib/` modules.
4. THE App SHALL provide unit tests for the `lib/` modeling modules.

### Requirement 9: Quota and Cost

**User Story:** As the operator, I want the app to stay within the odds provider's free tier under normal use, so that I incur no cost.

#### Acceptance Criteria

1. THE App SHALL operate within the Odds_Provider free-tier credit allowance under normal use by fetching only on the explicit Refresh_Odds_Action and Update_Results_Action and rate-limiting both.
2. THE App SHALL serve page loads from the Database with zero Odds_Provider calls.

### Requirement 10: Resilience

**User Story:** As a user, I want the app to keep working when the odds provider has problems, so that one outage or one bad match does not leave me with a broken page.

#### Acceptance Criteria

1. IF the Odds_Provider is unreachable or returns an error during a refresh or results action, THEN THE App SHALL display an error and continue serving the existing Database contents unchanged.
2. THE App SHALL render the persisted Match_List from the Database regardless of Odds_Provider availability.
3. IF a single match's odds are malformed or partial while the Odds_Provider is otherwise reachable, THEN THE App SHALL degrade that match to the "odds pending" state and continue rendering the rest of the Match_List.

### Requirement 11: Security and Input Validation

**User Story:** As the operator, I want secrets kept off the client and untrusted responses validated, so that the app is safe to deploy publicly.

#### Acceptance Criteria

1. THE App SHALL keep all secrets, including the Odds_Provider API key, server-side only and out of client bundles.
2. THE Odds_Service SHALL treat all Odds_Provider responses as untrusted input and validate them before use.
3. WHEN an Odds_Provider response contains both valid and invalid fields, THE Odds_Service SHALL use the valid fields and discard only the invalid fields.

## Non-Goals (v1)

The following are explicitly out of scope for the first version:

- Pool-aware or game-theoretic variance strategy (adjusting picks based on standing
  versus other players). Captured as a future enhancement; v1 maximizes per-match EV.
- Automatically submitting picks to Superbru (no Superbru integration or login).
- Automatic/scheduled odds or results refresh (e.g. cron). All fetching is on-demand
  in v1.
- Accounts or multi-user support. The Database stores a single shared dataset, not
  per-user pick state.
