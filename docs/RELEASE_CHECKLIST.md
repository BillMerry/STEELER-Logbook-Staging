# Release Checklist

Use this checklist for each STEELER Logbook release. The goal is to avoid stale PWA assets and to confirm that the offline-at-sea path is safe before tagging GitHub.

## Version Alignment

Before release, confirm these all describe the same intended release:

- `APP_VERSION` in `app.js`
- `CACHE_NAME` in `service-worker.js`
- Git commit message or release PR title
- GitHub tag name, for example `v0.12.0`
- Any release notes or backup filename expectations

`APP_VERSION` is displayed in the footer. `CACHE_NAME` controls the PWA cache bucket. When app assets change for a released build, bump both together.

## Pre-Release Code Checks

- Run JavaScript syntax checks for `app.js`, `service-worker.js`, and every `js/*.js` module.
- Run JavaScript syntax checks for `sync-worker/src/index.js` when the sync Worker changes.
- Confirm `git status` is clean except for intentional release changes.
- Review the diff for accidental storage-key, service-worker, data-shape, or core-flow changes.
- Confirm `docs/DATA_MODEL.md` still matches any intentional storage/data additions.
- Confirm `docs/ARCHITECTURE.md` still matches the module list loaded by `index.html`.
- If `sync-worker/` changes, review `sync-worker/migrations/` and confirm the browser app is not connected to remote sync unless that is intentional.

## PWA / Offline Checks

Test from a clean browser profile or an iPad where possible:

1. Load the app online.
2. Confirm the footer shows the expected app version.
3. Create or open a passage.
4. Turn off network access.
5. Reload the installed PWA or browser tab.
6. Confirm Home, Plan, Log, Settings, dialogs, and existing data still open.
7. Add a manual log entry while offline.
8. Confirm the entry remains after closing and reopening the app offline.
9. Confirm Backup export still downloads a JSON file.
10. Restore network and reload.
11. Confirm data created offline is still present.

## Service Worker Update Checks

- Install or load the previous release.
- Open the new release.
- Confirm the app updates to the new footer version.
- If Safari/iPad appears stale, use the app reset path with `?reset=1`.
- Confirm reset clears only service-worker/cache storage and does not delete logbook localStorage data.
- Confirm the app shell, all loaded JavaScript modules, `styles.css`, `manifest.json`, icons, favicon, and the shipped `STEELER-safety-emergency-details.html` page are present in the service-worker asset list.

## Backup / Restore Checks

- Export a full STEELER data backup.
- Confirm full data backup includes passages, ports, Safety / Emergency Info, DPP templates, saved waypoints, weather abbreviations, fuel settings and app settings.
- Restore the full data backup and confirm all included data returns.
- Export a ports backup.
- Export a DPP Templates backup.
- Restore an older full logbook backup and confirm passages and Safety / Emergency Info return while current ports are left unchanged.
- Import the ports backup and confirm ports merge by name.
- Import the DPP Templates backup and confirm templates merge by name.
- Edit a Detailed Passage Plan template in Settings and confirm applying it to a passage uses the edited waypoints, speeds and notes.
- Confirm the destination device keeps its own `steeler_device_id_v1` after restoring a data backup.
- Delete a log entry and confirm it disappears from normal Log view, CSV export and PDF/print export while remaining present in the full data backup with `deleted: true`.
- Delete a passage on one device, run Sync Now on both devices, and confirm the chosen complete copy keeps the passage deleted rather than resurrecting it unexpectedly.
- Set a friendly device name on each device, such as `Bill's MacBook Pro` and `STEELER iPad`, then confirm Settings > Data & Backup shows a plain cloud sync status and keeps device/connection details inside Connection settings.
- Enter the sync Worker URL/token if needed, tap Check Cloud, and confirm it reports the current full-data cloud copy without uploading, downloading, restoring, merging, or changing local data.
- Tap Sync Now on a device that already matches cloud and confirm it simply reports that the device is synced, without asking to replace cloud data.
- Tap Sync Now on a device with local changes and no newer cloud copy and confirm it offers to save this device's latest changes to cloud.
- Edit one shared setting, such as Ports, DPP templates, weather abbreviations or fuel settings, tap Sync Now, and confirm the full-data cloud copy now includes that change.
- Add a URL to a log note or DPP note and confirm it displays as a clickable link.
- Override a DPP leg distance and confirm the total distance/time/fuel use the manual NM value.
- Add positive and negative tide/current values to DPP rows and confirm SOG/time changes while fuel burn remains based on STW over the derived elapsed time.
- Toggle individual DPP waypoint SMS checkboxes and confirm the EC start SMS intended-routing list includes only selected intermediate waypoints.
- Add a new port from Origin/Destination and from Settings > New Port. Confirm both paths capture and display Port name, Lat/Lon, Comms/Pilotage and Private Notes in Port Settings.
- On another device that has not seen the latest cloud revision, tap Sync Now and confirm the app says which named device changed the cloud copy and offers Keep This Device, Use Cloud Copy, and Cancel.
- Choose Keep This Device and confirm this device's complete data replaces the current cloud copy while the previous cloud copy appears in Recovery backups.
- Repeat the conflict path and choose Use Cloud Copy. Confirm a local safety backup downloads first, the full cloud copy is restored, and this device keeps its own `steeler_device_id_v1`.
- Confirm Recovery backups can be expanded and contain recent cloud backup controls only, without per-record send/receive tools.
- Tap Refresh Cloud Backups and confirm it lists recent cloud backup summaries without downloading, restoring, or changing local passage data.
- Tap Download Backup for a listed cloud backup and confirm a JSON file downloads without restoring or changing local passage data.
- Tap Restore Backup for a listed cloud backup, confirm both warnings, confirm a safety backup downloads first, and confirm the selected backup restores while the device keeps its own `steeler_device_id_v1`.

## Data Safety / Recovery Checks

- Confirm corrupt JSON handling offers to export the raw stored value before recovery.
- Confirm last-known-good mirror keys remain separate from the canonical localStorage keys.
- Confirm restoring a last-known-good mirror does not rename storage keys or change data shape.
- Confirm `?reset=1` clears only service-worker/cache storage and does not delete localStorage.

## Core Manual Regression Checks

Run these before a v1.0.0-facing release:

- Create a new passage.
- Add origin, destination, and transit ports.
- Save plan and confirm tide stations, comms/pilotage, and plan summary.
- Add Port Private Notes and confirm they remain visible in Port settings but do not copy into Plan Comms / Pilotage.
- Add Detailed Passage Plan waypoints and recalculate.
- Import a GPX file if available.
- Add Engine Start, Slip, manual underway entry, Dock, and Shutdown entries.
- Confirm EC start/end SMS text generation still opens the SMS flow.
- For a multi-leg passage, confirm EC start SMS mentions the transit stop and active leg, and non-final EC end SMS says another start message will follow.
- Save a Detailed Passage Plan as a reusable template, apply it to another leg after confirmation, and delete the template.
- Confirm DPP Hazards, Ports of Refuge and Crew Welfare remain separate per leg.
- Confirm Manage Ports coordinate links open Apple Maps and Apple Maps-style decimal coordinates can be pasted into coordinate fields.
- Fetch weather online, then confirm typed weather remains usable offline.
- Paste tide data into a tide station.
- Export CSV and PDF/print.
- Toggle day/night mode.

## Tagging

After the release commit is merged or accepted:

```sh
git tag vX.Y.Z
git push origin vX.Y.Z
```

Do not create a GitHub tag whose version disagrees with `APP_VERSION` or `CACHE_NAME`.
