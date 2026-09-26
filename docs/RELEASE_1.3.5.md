# STEELER Logbook 1.3.5

Promotes the accepted 1.3.5-rc7 Testbed to Live, retaining the production logo, app name and Worker configuration.

- Conflict-only auto-sync prompts for established sync baselines, with silent cloud-only updates.
- Saved DPPs clear old ATAs; actual arrival times remain in the Log route summary.
- Compact Home metrics, average passage speed, category suggestions and configurable analytics.
- Overnight on board in Daily Summaries, selectable nights metric and ranked consecutive-night runs.
- Full-refill history with recorded fuel use, differences, nights, costs and weighted rates. Partial refills carry into the next full refill without resetting Fuel Used.
- Direct refill locations, restored partial-fill unit prices and collapsible analytics cards.

No historical spreadsheet import or architectural roadmap changes are included. Existing local data and cloud packages retain their fields; no migration or cloud overwrite is performed by deployment. Refresh each device to 1.3.5 before editing or syncing the new fields.

Validation: syntax/assets, DOM and Chromium regression suites, backup round-trips and simulated sync cases. Release checks include offline reload/data persistence and service-worker update from 1.3.4. Physical iPad/Safari and real two-device tests are not automated.
