# Recommendation engine

Everything runs on-device. No LLM APIs, no hosted recommender, no ML service.

## Taste model (`recommendation/taste.ts`)
Built from your library signals: ratings (centered at 3 stars), favorites, rewatches, completions, watchlist intent, "watch soon", drops, "not interested", dismissals, pairwise choices, and explicit more/less-like-this feedback. Signals expand into weighted feature maps: genres, keywords, creators (directors/writers/creators), cast, networks, studios, decades, languages. Weights are normalized and clamped to [-1, 1]. The model also tracks your preferred movie runtime, completed/dropped series lengths, series completion rate, and your rating mean/spread.

## Scoring (`recommendation/engine.ts`)
Transparent additive model:
`0.30 taste similarity + 0.15 quality + 0.12 keyword affinity + 0.10 creator affinity + 0.08 completion fit + 0.08 commitment fit + 0.07 availability + 0.05 novelty + 0.05 exploration - negative penalties`

- Quality prior is a Bayesian average (m=300 votes, C=6.5) so obscure titles aren't over-trusted.
- Exploration is deterministic per-day (stable but fresh).
- Discovery dials (Familiar/Adventurous, Popular/Hidden gem, etc.) shift weights live.

## Diversity
Maximal Marginal Relevance reranking (default lambda 0.72, loosened by the Adventurous dial) using genre/keyword/creator Jaccard similarity - so a crime-drama fan still gets a varied shelf instead of five interchangeable crime dramas.

## Explainability
Every recommendation carries a deterministic "Why this?" built from the same features that scored it: which loved titles it resembles, shared genres/themes/creators, commitment fit, and availability. Match % derives from the final score.

## Predictions
- **Predicted rating**: blends the Bayesian quality prior with your rating mean shifted by taste similarity; confidence reflects model size, feature overlap, and vote counts.
- **Finish likelihood** (series): documented heuristic - your completion rate, series length vs your completed median, ended/ongoing status, taste similarity. It is a heuristic and never marketed as ML.
- **Commitment value**: predicted enjoyment / hours^0.55 - a brilliant 6-hour miniseries can outrank a 90-hour show. The Commitment Frontier chart shows the Pareto edge of your watchlist.

## Tonight Mode / One Perfect Pick
Constraint filters (time, mood-to-genre mapping, format, commitment class, energy) over the recommendation pool, returning 3-7 options. One Perfect Pick chooses a single confident title with recency-aware avoidance of recently skipped/dismissed picks.

## Cold start
Onboarding seeds the model in about a minute: loved picks (with ratings), optional dislikes, five pairwise choices, streaming services, and five taste sliders.

## Test profiles
`tests/engine.test.ts` and `tests/taste.test.ts` verify that distinct synthetic profiles (prestige crime vs comfort comedy) receive materially different similarity rankings, and that MMR breaks single-genre sweeps.
