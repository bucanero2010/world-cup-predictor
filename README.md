# World Cup Predictor

Picks the scoreline that maximizes your expected [Superbru](https://www.superbru.com/) points.

Superbru scoring: **3** exact / **1.5** close / **1** correct result / **0** wrong.
Because the "close" band pays partial credit for nearby scores, the EV-best pick is
usually a low, *central* scoreline (1-0, 2-1, 1-1) rather than the single most likely
score.

## How it works

1. **Probability model** (`lib/poisson.js`) — Dixon-Coles adjusted bivariate Poisson
   over every scoreline.
2. **Inputs** (`lib/odds.js`) — either supply expected goals (λ) per side directly, or
   back λ out of market 1X2 odds (+ optional over/under line).
3. **Optimizer** (`lib/optimizer.js`) — ranks all candidate picks by expected points.
4. **Scoring** (`lib/scoring.js`) — exact Superbru rules, unit-tested.

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # scoring + model tests
npm run build    # production build
```

## Deploy to Vercel

Push to a Git repo and import it in Vercel, or:

```bash
npx vercel
```

No env vars or backend required — everything runs client-side.

## Roadmap

- Pool-aware strategy: when leading, minimize variance / copy the field; when chasing,
  favor differentiated higher-variance picks. The current version maximizes per-match
  EV, which is the correct baseline before layering competitive game theory.
