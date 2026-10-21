# Research register: hypotheses, not production claims

No paper below establishes that the candidate thresholds in the fixtures are optimal,
or that a statistically large move implies a durable reversal. Classic findings must
be rechecked on current instruments, sessions, data quality and trading horizons.

| Research question | Primary source | Implication to investigate | Current implementation |
| --- | --- | --- | --- |
| How should microstructure noise affect sampling? | [Aït-Sahalia, Mykland & Zhang (2005)](https://www.princeton.edu/~yacine/sampling.pdf) | Distinguish ingestion frequency from inference horizon; test explicit noise treatment. This is volatility-estimation research, not proof of a trading interval. | Horizon metadata and data-quality checks; no optimal-frequency claim. |
| How does the intraday baseline vary? | [Andersen & Bollerslev (1997)](https://www.kellogg.northwestern.edu/academics-research/research/detail/1997/intraday-periodicity-and-volatility-persistence-in-financial-markets/) | Compare movement with similar session periods and market regimes. | Exact-cohort baseline contract and sparse-data refusal. |
| How do supply, demand and depth relate to short-term price movement? | [Cont, Kukanov & Stoikov (2014)](https://arxiv.org/abs/1011.6402) | Investigate quotes/depth and order-flow imbalance; do not treat volume alone as directional proof. | Spread metadata and separate execution risk; order-book model not implemented. |
| How do news surprises affect price discovery? | [Andersen, Bollerslev, Diebold & Vega](https://www.federalreserve.gov/pubs/ifdp/2006/871/ifdp871.htm) | Separate expectations, publication and actual receipt times; test event-specific response windows and state dependence. | Causal timestamped news contract and unresolved-event state. No sentiment trading model. |
| How do liquidity and news behave around jumps? | [Boudt & Petitjean (2014)](https://research.vu.nl/en/publications/intraday-liquidity-dynamics-and-news-releases-around-price-jumps-/) | Evaluate jump magnitude separately from liquidity stress and persistence. | Independent execution-risk status; formal jump detection still a research task. |
| How do we avoid choosing a rule that fits noise? | [Bailey et al., The Probability of Backtest Overfitting](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf) | Record all parameter trials; protect chronological and cross-instrument tests; account for model selection. | Versioned offline runs with immutable audit data. Statistical model-selection analysis remains to be built. |

## Candidate experiments

1. Shared fixed intervals versus volatility/session-adapted thresholds; liquidity-group
   pooling only after demonstrating that it improves unseen-instrument performance.
2. Structural breaches alone versus normalized pullback plus structural persistence.
3. Different entry and recovery evidence thresholds; report both churn and detection delay.
4. Ordinary-session models versus dedicated scheduled-event and surprise-event models.
5. Trade-only, quote-aware and depth-aware models, conditional on actual feed coverage.
6. Frozen invalidation rules versus adaptive descriptive context; adaptive baselines may
   never silently move the recorded entry invalidation boundary.

Every experiment must state its labels, horizon, data availability cutoff, missing-data
behavior, comparison baseline, validation split, parameter search budget, and failure
criteria. A false-alarm reduction is not success if it materially delays genuine
failure recognition. Shadow/live collection and user-facing alerts require later
explicit authorization and are absent from this branch.
