# Requirements Document

## Introduction

World Cup Predictor is a Next.js application deployed on Vercel that lists every 2026
World Cup match, ingests live betting odds, and recommends the scoreline to pick in a
Superbru pool to maximize expected points. The application has no separate backend:
all server-side work runs in Next.js route handlers, and all modeling logic lives in
framework-agnostic `lib/` modules (`scoring`, `poisson`, `odds`, `optimizer`).

The primary user is based in Madrid (Europe/Madrid timezone) and refreshes
recommendations before locking picks so they can react to odds movement as more money
enters the market closer to kickoff. The Superbru scoring model is fixed: Exact = 3,
Close = 1.5, Result = 1, Wrong = 0. Penalty shootouts score as the post-regulation /
extra-time result (a shootout is scored as a draw).

This document formalizes the resolved requirements draft. All previously settled
decisions (odds provider configuration, bookmaker policy, de-vig method, refresh
cadence, and the "lock soon" highlight window) are reflected here as committed
requirements and are not reopened.

## Glossary

- **App**: The World Cup Predictor application as a whole (Next.js frontend + route handlers).
- **Match_List**: The component responsible for listing and ordering matches.
- **Match_Row**: A single match entry within the Match_List.
- **Odds_Service**: The server-side route handler logic that fetches, caches, and validates odds.
- **Odds_Provider**: The external odds source. Default: The Odds API, endpoint `soccer_fifa_world_cup`, `regions=eu`, `markets=h2h,totals`, decimal format (2 credits per call).
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
- **Full_List_Fetch**: A low-frequency fetch of all matches via `/sports/soccer_fifa_world_cup/odds`.
- **Per_Event_Fetch**: An on-demand fetch of a single match via `/sports/soccer_fifa_world_cup/events/{id}/odds`.
- **Close_Match**: A match kicking off within approximately 24 hours of the current time.
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

**User Story:** As the operator of the app, I want odds fetched securely on the server using a controlled strategy, so that recommendations stay populated without exposing my API key or exhausting my quota.

#### Acceptance Criteria

1. THE Odds_Service SHALL fetch odds from the Odds_Provider using endpoint `soccer_fifa_world_cup`, markets `h2h` and `totals`, region `eu`, in decimal format.
2. THE Odds_Service SHALL read the Odds_Provider API key from a server-side environment variable only.
3. THE App SHALL NOT include the Odds_Provider API key in any client bundle.
4. THE Odds_Service SHALL perform all odds fetching within a server-side route handler.
5. THE Odds_Service SHALL support a Full_List_Fetch via `/sports/soccer_fifa_world_cup/odds` to populate the schedule and all recommendations.
6. THE Odds_Service SHALL support a Per_Event_Fetch via `/sports/soccer_fifa_world_cup/events/{id}/odds` for single-match refresh.
7. THE Odds_Service SHALL cache Full_List_Fetch responses server-side.
8. WHEN a Per_Event_Fetch completes, THE Odds_Service SHALL update only that match's cached entry.
9. IF a Per_Event_Fetch completes successfully but the cache update fails, THEN THE Odds_Service SHALL use the freshly fetched odds immediately and attempt to repair the cache entry in the background.
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

### Requirement 6: Data Freshness and Live Refresh Behavior

**User Story:** As a user, I want fresh odds concentrated on imminent matches and clear staleness signals, so that my picks reflect the latest market while staying within the free-tier quota.

#### Acceptance Criteria

1. THE Odds_Service SHALL maintain a baseline fixture and odds snapshot via a Full_List_Fetch performed approximately one to two times per day.
2. THE Odds_Service SHALL scope automatic odds refresh to Close_Match matches only.
3. THE Odds_Service SHALL NOT auto-refresh matches that are not Close_Match matches.
4. WHEN a user requests a manual refresh of a single match, THE Odds_Service SHALL fetch that match's odds using a Per_Event_Fetch.
5. IF a manual Per_Event_Fetch fails due to a provider error or network issue, THEN THE App SHALL display an error message and retain the match's previous odds with their original Odds_As_Of timestamp.
6. THE Odds_Service SHALL rate-limit per-match manual refresh requests to protect the Odds_Provider free-tier quota.
7. THE Match_Row SHALL display when its odds data was last updated and whether a refresh is available.

### Requirement 7: Filtering, Search, and Standalone Calculator

**User Story:** As a user, I want to filter and search matches and run what-if calculations, so that I can focus on relevant games and explore scenarios manually.

#### Acceptance Criteria

1. THE App SHALL allow the user to filter the Match_List to upcoming-only matches, a specific calendar day, or a specific group.
2. THE App SHALL allow the user to search matches by team name.
3. THE Calculator_Page SHALL allow the user to enter odds or λ manually and view the resulting ranked picks and breakdown for what-if analysis.

### Requirement 8: Hosting, Stack, and Modeling Separation

**User Story:** As the maintainer, I want a clean deployment model and well-isolated, tested modeling logic, so that the app is simple to run on Vercel and the core math is reliable.

#### Acceptance Criteria

1. THE App SHALL deploy on Vercel using Next.js route handlers with no separate backend service.
2. THE App SHALL keep all modeling logic in the framework-agnostic `lib/` modules (`scoring`, `poisson`, `odds`, `optimizer`).
3. WHERE non-modeling functionality such as authentication or analytics is required, THE App SHALL be permitted to use external services while keeping modeling logic in the `lib/` modules.
4. THE App SHALL provide unit tests for the `lib/` modeling modules.

### Requirement 9: Quota and Cost

**User Story:** As the operator, I want the app to stay within the odds provider's free tier under normal use, so that I incur no cost.

#### Acceptance Criteria

1. THE App SHALL operate within the Odds_Provider free-tier credit allowance under normal use through server-side caching and manual-refresh rate limiting.

### Requirement 10: Resilience

**User Story:** As a user, I want the app to keep working when the odds provider has problems, so that one outage or one bad match does not leave me with a broken page.

#### Acceptance Criteria

1. IF the Odds_Provider is unreachable or returns an error, THEN THE App SHALL display the last successfully cached data with a staleness warning, including the case where the provider is both unreachable and returns an error.
2. WHILE the Odds_Provider is unreachable, THE App SHALL fall back to the last successfully cached data rather than degrading individual matches to "odds pending".
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
- Historical accuracy tracking or backtesting.
- Accounts, multi-user support, or saved pick state.
