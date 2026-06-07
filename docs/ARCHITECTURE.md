# STEELER Logbook Architecture

This document records the v1.2.0 sync-foundation architecture, including the v0.20.x sea-use tweaks, Detailed Passage Plan template management, and the first offline-first data sync groundwork.

STEELER Logbook is a vanilla HTML/CSS/JavaScript offline-first PWA intended for iPad use at sea. Reliability, predictable offline behaviour and preservation of existing passage data are more important than reducing file size or changing code shape for its own sake.

## Root Coordinator

`app.js` remains the root coordinator. It owns application startup, tab switching, active passage selection, form orchestration, modal orchestration and the cross-module workflow glue.

Modules should provide focused helpers for calculations, parsing, rendering or data access. They should not take over app startup or create hidden alternative state machines.

## Current Modules

- `js/core-utils.js`: small shared general helpers.
- `js/time-utils.js`: time and duration helpers.
- `js/geo-utils.js`: coordinate, distance and bearing helpers.
- `js/ports-core.js`: core port data helpers and default port data.
- `js/static-config.js`: named static configuration that is not workflow-bound.
- `js/dpp-calculations.js`: Detailed Passage Plan calculations and waypoint conversion helpers.
- `js/dpp-ui.js`: Detailed Passage Plan rendering, form readback and GPX import UI.
- `js/weather-abbreviations.js`: weather shorthand database helpers.
- `js/tides.js`: tide paste parsing and pure tide event helpers.
- `js/sun-moon.js`: sunrise, sunset, moon phase and moon rise/set calculations.
- `js/weather-parsers.js`: weather text parsing and formatting helpers.
- `js/marine-route.js`: marine route area and Meteo France bounding-box helpers.
- `js/weather-fetch.js`: low-risk weather request constants/helpers.
- `js/export-print.js`: CSV/export/print/PDF HTML helpers.
- `js/ec-sms.js`: Emergency Contact SMS message builders and SMS launch/contact choice helper.
- `js/safety-emergency.js`: Safety/Emergency data defaults, storage access, contact normalization and legacy EC migration.
- `js/live-data.js`: no-op future boundary for liveData/NMEA integration.

## Sync Worker Prototype

`sync-worker/` contains an isolated Cloudflare Worker + D1 prototype for the v1.2.0 sync stream. The browser app can now call it manually from Settings for staging-only checks, manual sync preview, manual sync-record upload, receive-only sync-record apply, one-way backup uploads, read-only backup listing, backup JSON download, and guarded cloud-backup restore.

The prototype uses:

- A small token-protected JSON API.
- D1 as the structured sync record store.
- Record payloads stored as JSON plus indexed metadata.
- Server revisions for future pull-by-change workflows.

It remains deliberately conservative until broader multi-device safety testing is ready. The current browser connection can build a local sync-record preview, ask the Worker for remote sync-record summaries, manually upload safe local sync records, receive and apply safe previewed cloud sync records, send a complete cloud backup record, list recent cloud backup summaries, download a selected backup JSON file, and manually restore a selected cloud backup after confirmations and a local safety-backup download. It does not yet run automatic background sync.

## Storage And Data Safety Rules

- Existing localStorage keys and data shapes must not change without an explicit migration plan.
- Manual passage, leg, log-entry, DPP, tide, weather, port, Safety/Emergency and settings data remain the durable source of truth.
- Safety mirrors/last-known-good keys are separate safety keys and must not replace the canonical data keys.
- Parse failures should be visible and recoverable, with a route to export raw corrupted data before reset or recovery.
- Backup/restore format changes must be backward compatible.
- The primary v1.2.0 backup format is `steeler-data-backup`, which archives all local STEELER data on the device. Older logbook, ports, and DPP backup formats remain readable where supported.
- A local `steeler_device_id_v1` value identifies this browser/device for future sync. It is created locally and must not be replaced by restoring a data backup.
- Log-entry deletion is recoverable: deleted entries stay in local passage data with `deleted: true`, but are hidden from normal operational views and exports.
- `steeler_sync_status_v1` stores local sync preparation status, including pending local change counts, last local change time, Worker check results, and the last one-way cloud backup result.
- `steeler_sync_config_v1` stores the staging Worker URL and token locally so Settings can test `/v1/status`, preview sync, send sync records, receive sync records, send a one-way cloud backup, list recent cloud backup summaries, download a selected backup JSON file, and manually restore a selected cloud backup. The token is not included in full data backups.
- Manual Sync Preview builds local `steeler-sync-record` payloads for passages, ports, Safety/Emergency, legacy emergency-contact settings, DPP templates, DPP waypoints, weather abbreviations, fuel settings, and app settings. It compares them with `/v1/records/summary` and does not upload or apply records.
- Preview Sync separates records into safe to send, safe to receive, and needs review. A record needs review when local and cloud versions both exist, differ, and appear to have been last changed by different devices.
- Needs-review records can be resolved one at a time by keeping this device's version or using the cloud version. Keeping this device sends only that one local record to Cloudflare. Using cloud downloads a local safety backup first, then applies only that one cloud record.
- Send Sync Records sends only the records that Preview Sync marks as safe to send via `/v1/records/push`. After every selected record is accepted, local sync-dirty flags are cleared. Records needing review are left untouched. It does not receive, merge, restore, or overwrite local data.
- Receive Sync Records fetches only the cloud records that Preview Sync marks as safe to receive. It downloads a local safety backup first, warns if this device also has local records waiting to upload, and applies only the selected received records. Records needing review are left untouched. It does not send local records.
- The manual cloud backup uses `/v1/records/push` with record type `cloud-backup`. The read-only backup list uses `/v1/backups`; selected backup download/restore uses `/v1/backups/{recordId}`. Restore first downloads a local safety backup and requires two confirmations. These workflows do not pull or merge sync records into the app.

## Service Worker Release Rules

For every release that changes cached files:

- Update `APP_VERSION` in `app.js`.
- Update `CACHE_NAME` in `service-worker.js`.
- Add any new cached assets to the `ASSETS` list.
- Confirm app shell assets, every `js/*.js` module loaded by `index.html`, `styles.css`, `manifest.json`, icons, favicon and `STEELER-safety-emergency-details.html` are covered when they are part of the shipped app.
- Confirm the staging URL shows the new version after refresh/update.
- Test offline launch after the update has installed.

The service worker should remain conservative. Do not change cache strategy unless there is a clear reliability issue.

## liveData / NMEA Principle

Future NMEA/liveData integration should feed transient live values into forms and dialogs as defaults or suggestions only.

Saved manual log entries remain the source of truth. A liveData adapter must not silently rewrite historical log entries, passage plans or Safety/Emergency data. If live data is unavailable, stale or invalid, the app must continue to work manually and offline.

## Areas Deliberately Left In app.js

Settings UI, Ports UI, log-entry workflow and PWA/update/reset handling remain in `app.js` for v1.0.0.

These areas are still tightly coupled to application state, DOM event binding, modal behaviour, startup ordering and user workflows. Moving them before release hardening would add coordination risk without enough practical benefit. Future extraction should happen only when a specific defect, feature or repeated-maintenance pain makes the boundary clearer.

## v0.20.x Sea-Use Tweaks Included In RC1

- New app icon assets are part of the cached PWA shell.
- Apple Maps is used for port coordinate links where location correction/copy-back is useful.
- Apple Maps-style decimal coordinate input is accepted at coordinate entry points.
- Settings panels open/close consistently and reset to closed when Settings is reopened.
- Safety/Emergency Info sits within the Settings card flow.
- Manage Ports layout and coordinate links are tuned for iPad use.
- Detailed Passage Plan templates are stored globally in a separate localStorage key and can be applied to the selected leg after confirmation.
- Detailed Passage Plan templates can be edited/renamed/deleted in Settings, are included in full backups, and have separate export/import.
- DPP hazards, ports of refuge and crew welfare fields are leg-specific within the existing multi-leg DPP model.
- Multi-leg EC start/end SMS wording reflects transit stops and per-leg passage completion.
