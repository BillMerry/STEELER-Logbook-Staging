# 1.3.5-rc5 — Refill history and overnight analytics

Records remain in their existing log entries and Daily Summaries. No migration or inferred historical OOB data.

- Refill history: date, full/partial, litres, cost, price per litre, recorded use since previous refill, signed difference, OOB nights and difference/night. Totals and averages include available values only. Unit prices and per-night rates are weighted over matching observations; zero costs/readings remain zero, missing data stay unavailable.
- Optional interval-use field in the refuel entry overrides the derived history figure. It does not change passage fuel readings or tank estimates. Derived values update when source records are corrected; backups/sync retain the underlying inputs.
- Normal fuel readings remain cumulative per passage leg. Deltas supply interval consumption. Missing boundary readings, decreasing counters and missing shutdown readings are flagged rather than guessed. The first refill has no inferred interval. Undated refills require review. Individual partial-fill differences include changes in tank level, so full-to-full comparisons spanning partial fills are shown separately.
- Tank card retains only Tank Estimate and Fuel Used. Opening estimate controls are collapsed and hidden after a valid full refill. Until a full refill exists, the opening date/level is the fallback baseline, including partial-fill histories. Fuel sorting respects entry dates, deleted passages are excluded, and filling a tank no longer clears the per-leg cumulative counter used to avoid double counting. Partial-fill estimates are recomputed from recorded use and litres added, so an old stored snapshot does not override corrected history.
- Nights on board is selectable in Passage Analytics. Year/month use the recorded night date; other metrics retain passage-date grouping. Shared nights count once per group; groups may overlap.
- Consecutive OOB runs are ranked automatically by length, with first/last-night dates and tied ranks. No refill information appears in that section. Existing night-start convention and completed-night cutoff remain.

Tests cover full/partial cycles, boundary ambiguity, manual interval use, missing vs zero values, weighted rates, deleted records, multi-day dates, tank counter continuity, run ranking and cross-month/year OOB grouping. Form tests cover zero cost and backup/restore. Browser/layout checks run in GitHub Actions; screenshots are inspected before staging publication.

Use rc5 or newer on devices editing the new interval-use field. Live promotion is separate.
