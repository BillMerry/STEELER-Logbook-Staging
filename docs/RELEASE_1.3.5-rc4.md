# 1.3.5-rc4 — Overnight on board

Adds an OOB checkbox to each Daily Summary and recorded-night statistics in Settings → Passage Analytics & Fuel: total, longest consecutive run, latest recorded run (with end date), nights since the latest refill/full refill, and completed refill/full-to-full intervals. The selected date is the night beginning on that date; only completed nights before today count.

Dates count once across passages. Missing ticks are not inferred; historical totals therefore reflect recorded coverage only. Partial fills do not reset full-to-full night counts. The feature does not estimate heater/generator use or change tank calculations. Daily summaries remain attached to passages; independent boat-use records are future work.

OOB is included in the Log page plan summary, print/PDF via that summary, passage CSV, and full backups/sync. Plan copies clear ticks. Existing records need no migration. Use this candidate or newer on all editing devices: older clients may discard the new field.

Validation: new automated coverage for duplicate dates, deleted passages/refuels, DST, gaps, future dates, invalid dates, partial/full refill intervals, form read/write, copied-plan clearing and verified cloud backup round trip. Existing usage enhancement regression suite retained. Local headless Chrome launch unavailable; browser suite runs in GitHub Actions before staging merge.

Live promotion remains separate.
