# 1.3.6-rc1 — Browsing a larger logbook

Home’s Filter button now opens combinable Category, Year, Year/month, Origin, Destination and Status selectors. Filters combine with the existing search and date order, exclude deleted records, include uncategorised/unknown values and can be cleared together. Filters are session-local and do not change voyage data or cloud settings.

Refill History and Consecutive Nights on Board scroll within bounded panels with sticky column headings. Refill dates open and highlight the exact Log entry. First/last night dates open the owning passage’s Plan and highlight the matching Daily Summary, including nights outside its departure date.

Plan and Log have Previous/Next buttons and a dedicated swipe strip. Left/right arrow keys also browse when focus is outside editable or interactive controls and no dialog is open. Navigation follows Home’s filtered and sorted list, saves pending Plan edits, stops at list ends, and retains the current page. A record reached from analytics outside the filters is identified as such; clear Home filters to browse beyond it.

No schema, storage-key, cloud connection or fuel calculation changes. Staging only; Live stays on 1.3.5. Existing Testbed local data and the disabled Auto-sync setting remain in place.

Validation covers filter combinations/empty results/deleted records, date targets, Plan edit preservation, navigation boundaries, swipe direction and vertical-scroll rejection, keyboard/dialog guards and sticky headers in Chromium, alongside the existing usage, fuel, OOB, backup and sync regression suite.
