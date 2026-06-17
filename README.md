# World Cup Predictor

Recommends the scoreline to pick for each 2026 World Cup match to **maximize your
expected [Superbru](https://www.superbru.com/) points** — then tracks how the picks
actually performed.

Times shown in Madrid (Europe/Madrid). Built with Next.js, deployed on Vercel, backed by
Neon Postgres. Installable as a PWA.

---

## The idea

Superbru scores each prediction:

| Result | Points | Condition |
|---|---|---|
| Exact | **3** | exact scoreline |
| Close | **1.5** | right outcome AND (1 goal out, or 2 out with correct goal difference) |
| Result | **1** | right outcome, not close |
| Wrong | **0** | wrong outcome |

Because "close" pays partial credit, the highest *expected-points* pick is usually a low,
**central** scoreline (e.g. 2-0) rather than the single most *likely* score (often 1-0 or
1-1). A central pick sits next to many plausible scores, so it banks the 1.5 "close" bonus
far more often. Finding that pick is the whole point of the app.

Penalty shootouts are scored as the post-regulation/extra-time result (a shootout = draw).

---

## How a pick is calculated

The pipeline turns betting odds into the best pick, per match:

```
market odds → de-vig → expected goals (λ) → scoreline grid → expected points → best pick
```

1. **Fetch two markets** (`lib/oddsProvider.js`) from The Odds API, from the sharpest
   book (Pinnacle): `h2h` (home/draw/away) and `totals` (over/under goals). One call,
   2 credits, all matches.
2. **De-vig** (`lib/shin.js`) — strip the bookmaker margin with **Shin's method**
   (favourite-longshot aware), falling back to proportional normalization if it
   degenerates. Yields fair home/draw/away probabilities.
3. **Solve for expected goals** (`lib/odds.js`) — a coarse-to-fine grid search finds the
   `λ_home`/`λ_away` whose scoreline distribution best reproduces the fair 1X2
   probabilities and the over/under line.
4. **Build the scoreline grid** (`lib/poisson.js`) — independent Poisson per side with a
   **Dixon-Coles** correction on the four low-score cells (0-0, 1-0, 0-1, 1-1), normalized
   to sum to 1.
5. **Rank candidate picks by expected points** (`lib/optimizer.js`, `lib/scoring.js`) —
   `EV(pick) = Σ P(score) · points(pick, score)` over the whole grid; exclude zero-EV
   picks; tie-break by exact-score probability.

See the in-app **Methodology** page for the formulas and a worked example.

### Per-match extras

- **Why-this-pick** — a plain-English one-liner explaining the recommendation.
- **Edge indicator** — `clear` / `slight` / `toss-up`, from the EV gap to the runner-up,
  so you know when the pick is decisive vs. a coin-flip.
- **Score heatmap** — a 6×6 probability grid (home goals × away goals) with the pick
  outlined.
- **Sharpen with alt lines** (`/api/matches/[id]/refine`) — on-demand, pulls the per-event
  `alternate_totals` ladder and re-solves λ against the full goals curve for a tighter
  estimate (~2 credits per match).

---

## Product / pages

- **Predictor** (`/`) — upcoming matches grouped by Madrid day, with recommended pick,
  flags, kickoff time, group/stage label, and a "lock soon" highlight (2h before kickoff,
  or at midnight for after-midnight games).
- **Past Results** (`/results`) — finished matches as "Closed" cards with the final score,
  the recommended pick, and the points it earned; plus a tournament **scorecard** (total
  points + exact/close/result/wrong counts).
- **Calculator** (`/calculator`) — manual what-if tool: enter expected goals or market
  odds for any matchup, toggle Shin vs proportional de-vig.
- **Methodology** (`/methodology`) — visual explainer with formulas and a worked example.

---

## Data flow & cost

- **On-demand only.** Page loads read from Postgres (zero API credits). The provider is
  hit only on explicit actions: **Refresh odds** (full list, 2 credits), **Update
  results** (scores, 2 credits), and per-match **Sharpen** (2 credits).
- **Persistence** (`lib/db.js`, Neon Postgres) — `matches` (fixture + odds-derived
  recommendation as JSONB + frozen result), `meta` (last-updated timestamps), `credits`
  (live remaining balance per key). Closed matches are immutable.
- **API key failover** (`lib/providerFetch.js`) — primary key, automatic fallback to a
  backup on 401/429. Live remaining-credit balance is captured from response headers and
  shown in the action bar.
- Comfortably within The Odds API free tier (500 credits/month).

---

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # 51 unit tests (node --test) over the lib/ core
npm run build    # production build
```

Create `.env.local` (see `.env.example`):

```
ODDS_API_KEY=...            # https://the-odds-api.com/  (free tier)
ODDS_API_KEY_BACKUP=...     # optional second key, used on quota failover
DATABASE_URL=...            # Neon Postgres (injected automatically on Vercel)
```

The schema auto-creates on first request (`initSchema()` runs `CREATE TABLE IF NOT
EXISTS`). After deploying or first run, click **Refresh odds** once to populate matches.

---

## Deploy (GitHub + Vercel)

1. Push to GitHub; import the repo in Vercel.
2. Attach a **Neon** Postgres store (Vercel Marketplace) — injects `DATABASE_URL`.
3. Set `ODDS_API_KEY` (and optional `ODDS_API_KEY_BACKUP`) in project env vars.
4. Deploy. Open the site, click **Refresh odds** to load fixtures.

No separate backend — Next.js route handlers + Neon only.

---

## Architecture

```
Browser (Predictor · Results · Calculator · Methodology, PWA)
   │  reads cards from the DB; actions POST to routes
   ▼
Next.js route handlers (server, the only place the API key lives)
   GET  /api/matches              → read DB (matches + scorecard + credits)
   POST /api/refresh-odds         → full-list fetch → recommend → upsert
   POST /api/update-results       → scores fetch → freeze + score picks
   POST /api/matches/[id]/refine  → alt-totals re-solve for one match
   │
   ├─ lib/ (framework-agnostic, unit-tested):
   │    scoring · poisson · optimizer · odds · shin · bookmaker ·
   │    recommend · scoresProvider · scorecard · time · lockSoon ·
   │    flags · fixtures · oddsProvider · providerFetch · db · card
   ▼
Neon Postgres  ·  The Odds API (h2h + totals; alternate_totals on refine)
```

---

## Notes & limitations

- **Picks are per-match EV-optimal in isolation** — they don't (yet) account for pool
  game theory (e.g. higher-variance picks when chasing). Captured as a future idea.
- **A match can only be scored if its odds were captured before kickoff** — games that
  finished before the first odds refresh can't be graded.
- **No Superbru integration** — Superbru has no public API; you read the recommendation
  here and enter it there manually.
- **Group/stage labels** are derived from a static team→group map (verified against the
  fixture graph) plus knockout date windows, since the odds feed carries no stage field.

## Roadmap

- Pool-aware strategy: minimize variance when leading, differentiate when chasing
  (needs manually-entered standings — no Superbru API).
- Optional AI "second opinion" reviewing a pick against latest team news.
- Multi-book consensus de-vig; closing-line capture near kickoff.
