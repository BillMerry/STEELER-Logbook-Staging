# STEELER Logbook 1.4.3-rc1

Testbed candidate based on Live 1.4.2. Live promotion requires Bill's acceptance.

Large logbooks now use lossless, verified compression for browser-local data and recovery mirrors. Legacy plain JSON is read transparently; downloaded backups and cloud packages remain ordinary JSON. This addresses Safari's storage limit with the complete 503-record logbook. The supplied pre-import backup required 2,541,419 characters for passages; compressed storage required 233,590 characters (about 91% less).

Enrichment imports no longer flush hidden Plan fields into a passage. Changes are validated on a copy before saving; a failed canonical save restores the in-memory records. Successful saves are not reported as failures merely because undo/sync-status bookkeeping fails. Existing operational entries, plan, finish and leg summaries are protected by full-dataset regression tests.

Paper-note-only batches can now be imported without a supplied narrative. AI drafting receives stored original paper transcriptions, Daily Summaries, observations, positions/readings, recorded conditions, planning weather/tides and saved narrative preferences. Importing does not trigger an AI request: Draft narrative remains a separate reviewable action. AI cannot read the original scans itself; transcription coverage still matters.

## Acceptance check

1. Back up any existing Testbed data and leave Testbed auto-sync OFF, so testing cannot replace the Live cloud package.
2. Confirm the Testbed footer says 1.4.3-rc1, then restore the intact Before-enrichment backup dated 6 October 12:00.
3. Preview/apply Batch 08. It already contains five narratives and three new observations.
4. Check 28 September 2024: full Keyhaven route, ten entries after import, 1h35m underway, 2.1 engine hours, 9.3 fuel and 8.7 ground miles.
5. Try Draft narrative and review the result; importing alone does not regenerate it.

Close older Testbed tabs before testing. Older app versions cannot read the new local compressed representation; rollback requires restoring a plain JSON backup in the older version. Do not downgrade against compressed local stores. No cloud format or Worker deployment changes are required.
