# 1.3.6-rc2 — Faster analytics and compact navigation

Fuel history repeatedly converted entry timestamps inside sort comparisons and again while rendering the Tank and Refill History views. Sorting now uses one precomputed timestamp per entry. A weak cache reuses conversions while the entry time, passage date and time zone are unchanged, and shared time-zone formatters avoid repeated formatter construction. Edits, new/restored entry objects and zone changes are handled without stale calculations. There is no persisted cache or data migration.

On the user's 489-record imported backup, the same isolated local profile reduced Settings rendering from 1,038 ms to 30 ms; the first tank calculation dropped from 451 ms to 23 ms. These are local DOM timings, not physical iPad/Safari measurements. No private fixture data is committed.

The full-width navigation bars are removed. Compact chevrons appear beside the Plan title and in the existing Log controls. Swipe the Plan heading or an unused part of the Log toolbar or use the existing guarded arrow keys. Filtered order, edit preservation, modal/input guards and boundary handling are retained.

Checks include all existing fuel/OOB/sync/navigation regressions, a 3,000-entry conversion-count regression, invalidation after time/date/zone edits, and desktop/phone browser header captures. Staging only; Live remains 1.3.5.
