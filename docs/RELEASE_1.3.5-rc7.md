# 1.3.5-rc7 — Recorded fuel use at refills

Full refill history now shows the app’s Fuel Used counter immediately before that refill resets it. History and the tank card share the same calculation, including when the latest fuel reading is in an earlier log entry. Partial refills add fuel without resetting Fuel Used; their litres and costs are included in the next full refill comparison.

Locations appear directly beneath refill dates at the same font size. Partial rows show their own £/L. The explanatory row notes and optional manual fuel-total field are removed. Previously stored manual values remain preserved in backups but do not override the counter.

Figures are recalculated from saved log entries; corrections to those entries update history. A zero counter reflects recorded data, not a guarantee that no fuel was actually consumed. Nights still require a previous full refill to establish their interval.

Validation covers counter agreement before/after full and partial fills, missing refill readings, cumulative leg continuity, prices, totals, saved locations, legacy data preservation and backup restore, plus the existing analytics and sync regression suite. Staging only; live remains unchanged.
