# STEELER Testbed 1.3.5-rc1

## Recovered baseline

- Staging: `BillMerry/STEELER-Logbook-Staging`, main `021caed`, version `1.3.3-rc19`.
- Live: `BillMerry/steeler-logbook`, main `7c30e7f`, version `1.3.4`.
- The application code differs only in version and cloud-status wording. Other differences are release branding, icons, Testbed styles, documentation and Worker project configuration.
- Continue the existing `major.minor.patch-rcN` candidate scheme with `1.3.5-rc1`; the prospective live version is `1.3.5` after acceptance.
- The saved local project paths were unavailable. This checkout was recovered from staging GitHub history.

## Candidate changes

1. Auto-sync silently receives cloud changes when the local hash matches its last successful baseline, silently uploads local-only changes, and prompts when both copies changed. Matching copies establish a verified baseline. Missing or inconsistent baselines defer to manual Sync with an inline status message. First-cloud creation remains manual. Concurrent sync calls and auto-sync while a dialog is open are suppressed.
2. The conflict dialog lists differing passages and shared data areas. This is a comparison of copies, not a proven entry-level three-way conflict analysis: only whole-package hashes are retained as baselines. The dialog explicitly says the chosen whole copy replaces the other copy.
3. Saved DPP creation/import/edit/reuse and passage copying clear actual arrival times, while preserving planned times and original passage history. Existing templates are cleaned when reused; simply reading/restoring old templates does not silently migrate their data. Plan-page DPP rows no longer display ATA. Log Route Summary and log-entry waypoint controls retain ATA.
4. Average speed appears on Home passage metrics and completed Log totals. It is total recorded ground distance divided by total under-way time for eligible legs, in knots. Analytics uses the same weighted calculation, excluding legs missing either reading or having nonpositive duration. Active passage values remain provisional as time advances.
5. Analytics groups by category, year, year/month, origin, destination, passage status or all passages. The user selects displayed metrics. Missing totals display a dash; real zero readings remain zero. Fuel per NM uses only legs with both fuel and distance readings. Categories are case-insensitive and can overlap. Uncategorised passages are included.
6. A category picker offers existing categories; typing new comma-separated categories remains supported.
7. Full-copy restore preserves an unset fuel-reset date and an empty split-view setting, avoiding changes to the restored package hash.

Analytics view preferences are device-local and excluded from sync/backup. Durable voyage storage shapes and Worker protocol are unchanged.

## Validation and release gates

Local DOM integration tests exercise app startup, template ATA isolation and saved-template storage, weighted averages, missing data, metric selection, preferences, backup round-trip verification, category picker and simulated auto-sync outcomes. Syntax and cached-asset checks run separately. The Testbed also opens in the Codex app browser for UI inspection.

Automated Chromium launch was blocked on the development Mac. The equivalent Chromium suite passed in GitHub Actions run 36126060442, along with DOM, syntax and asset checks. Subsequent candidate updates must also pass CI. DOM tests do not prove service-worker, iPad/Safari, network or deployed-Worker behavior.

Before accepting the candidate:

- Run the browser suite in CI and inspect the staging deployment.
- Run the existing offline launch/update and manual passage workflows on iPad/Safari.
- Use disposable Testbed data and a test sync connection to exercise two-device upload, receive, conflicting offline edits and deletions.
- Review the deletion/recovery findings in `DELETION_REVIEW.md`, including the existing whole-copy overwrite race.
- Do not promote to live until these checks and user acceptance are complete.

Staging main pushes trigger GitHub Pages. A candidate branch/PR can be reviewed before staging deployment. Live uses a separate repository and must be promoted deliberately; do not copy staging Worker configuration or Testbed branding blindly.
