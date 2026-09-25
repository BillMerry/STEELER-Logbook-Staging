# STEELER development roadmap

The usage candidate keeps the existing offline-first application, durable manual records and complete-package sync. The following are design workstreams, not implemented architecture changes.

## 1. Historical passage spreadsheet

First obtain the current STEELER Log workbook: the referenced conversation contains a discussion but not the workbook itself. Inspect sheets, raw columns, formulas, units, time conventions, cumulative readings, totals and duplicate passages before mapping any rows.

Proposed first deliverable: an import preview and mapping report. Preserve original workbook/sheet/row provenance and a file fingerprint; distinguish historical summaries from detailed logs. Do not invent waypoint arrivals, tracks, individual log entries or sensor readings from summary totals. Keep ground distance and water-log distance distinct, as well as passage duration and engine hours.

Import must be repeatable without duplicating records, show overlap with existing app passages, flag invalid/ambiguous rows, and allow a complete rollback of the batch. Reconcile annual distance/fuel/hours against workbook totals. Historical summary and detailed-log versions of the same passage must not both contribute to analytics.

After mapping and validation, propose the smallest backward-compatible summary representation and migration. The likely direction is the app as the passage record, with a one-way spreadsheet export for analysis and archives. Prove an export column contract first; defer two-way workbook synchronization and overwriting the working spreadsheet.

Acceptance: sample-year totals agree, repeat import adds no duplicates, missing values remain missing, source rows remain traceable, export round-trips without changing units or dates.

## 2. Navionics GPX and waypoint workflow

Start with real exported GPX samples, the current waypoint library and examples of naming/duplicate problems. Keep imported route order and per-route waypoint occurrences separate from the reusable waypoint identity.

Prototype a review screen: original name, proposed saved-waypoint match, coordinates, separation distance, proposed friendly name and actions to use existing/create new/keep separate. Name similarity alone must not merge waypoints. Distance tolerance should be configurable and explainable; repeated visits to the same coordinate in a route must remain separate route occurrences. Preserve original GPX names and provenance.

Chart preview is a separate feasibility gate. Establish map/chart provider terms, coverage, offline availability, licensing/cost and attribution before selecting a dependency. Test actual coordinate placement and route order. Do not assume access to Navionics charts or online services from the app, and do not imply a planning preview is a navigation instrument.

Acceptance: representative imported routes retain order and coordinates; suggested matches are reversible; no silent renaming of other saved plans; app remains useful offline without charts.

## 3. Live NMEA capture

The previous discussion reports an onboard Yacht Devices gateway/recorder. Confirm exact models, firmware, configured transport and available messages from current device documentation and a sample capture. Verify browser/iPad connectivity constraints before choosing direct connection, local bridge or another transport.

Keep the existing `js/live-data.js` boundary: transient readings may prefill or suggest values; saved manual entries remain authoritative. Begin with a recorded-stream simulator and a read-only panel showing timestamp, source, units, freshness and validity. No automatic historical edits.

Define capture cadence, disconnect/reconnect handling, local buffering, stale/missing values, unit conversion, multiple-engine identity, battery impact and retention. Then prototype an explicit user-reviewed “capture now” action. Continuous recording and track enrichment follow only after failure-mode tests and storage measurements.

Acceptance: disconnected/stale data cannot masquerade as current; manual operation continues offline; simulator tests cover malformed/out-of-order readings; original records survive reconnects unchanged.

## Delivery order and gates

1. Validate usage candidate on staging and aboard-device browser.
2. Improve recovery visibility and protect sync writes with server revision checks in a separately reviewed increment.
3. Spreadsheet inventory/mapping and GPX matching prototype can then proceed without changing live data.
4. NMEA simulator and transport feasibility precede any onboard integration.

Each increment gets its own Testbed candidate, fixtures, regression checks and staging acceptance before live promotion. No schema migration or chart/NMEA dependency is introduced by 1.3.5-rc1.
