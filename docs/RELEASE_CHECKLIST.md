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

- Run JavaScript syntax checks for `app.js` and `service-worker.js`.
- Confirm `git status` is clean except for intentional release changes.
- Review the diff for accidental storage-key, service-worker, data-shape, or core-flow changes.
- Confirm `docs/DATA_MODEL.md` still matches any intentional storage/data additions.

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

## Backup / Restore Checks

- Export a full logbook backup.
- Export a ports backup.
- Restore the full logbook backup and confirm passages and Safety / Emergency Info return.
- Import the ports backup and confirm ports merge by name.
- Confirm current ports are not overwritten by full logbook restore.

## Core Manual Regression Checks

Run these before a v1.0.0-facing release:

- Create a new passage.
- Add origin, destination, and transit ports.
- Save plan and confirm tide stations, comms/pilotage, and plan summary.
- Add Detailed Passage Plan waypoints and recalculate.
- Import a GPX file if available.
- Add Engine Start, Slip, manual underway entry, Dock, and Shutdown entries.
- Confirm EC start/end SMS text generation still opens the SMS flow.
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
