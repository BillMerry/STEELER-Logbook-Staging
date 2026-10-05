# Enrichment batch v1

Use `format: "steeler-enrichment-batch"`, `version: 1`, a descriptive `batchId`, and a `passages` array. Each passage must reference an existing app `id`. Deleted/missing passages are unavailable; this importer never creates passages.

```json
{
  "format": "steeler-enrichment-batch",
  "version": 1,
  "batchId": "paper-pilot-08",
  "passages": [{
    "id": "EXISTING_PASSAGE_ID",
    "date": "2025-06-01",
    "from": "Origin",
    "to": "Destination",
    "narrative": "We left in calm conditions.\n\nWe enjoyed our stay.",
    "tags": ["calm sea"],
    "entries": [{
      "sourceId": "book-7/page-12/row-3",
      "time": "2025-06-01T10:30",
      "leg": 0,
      "entryType": "manual",
      "notes": "Abeam the harbour entrance.",
      "lat": "50.1",
      "lon": "-1.3",
      "waterLog": "9.8",
      "groundLog": "10.2"
    }],
    "possibleCorrections": ["Optional strong discrepancy for separate review; never applied by this importer."],
    "enrichmentSources": [{"sources": ["Original page reference"], "originalNotes": "Original transcription, including provenance."}]
  }]
}
```

Only `id` is mandatory on each passage. Narrative/tags/entries may be omitted. Entries require a stable, nonblank `sourceId`, valid full timestamp, and zero-based integer `leg`. Never change sourceId when regenerating or revising a batch; it identifies the physical observation across batches. Coordinates must be decimal degrees. Uncertain readings belong in notes, not numeric fields.

Optional entry fields: `entryType` (manual, engine-start, slip, dock, shutdown), `notes`, `lat`, `lon`, `course`, `cog`, `speed`, `rpm`, `engTP`, `waterLog`, `groundLog`, `fuelUsed`, `engineHours`, `engineHoursStart`, `engineHoursEnd`, `fuelStartPercentR`, `fuelStartPercentC`, `fuelEndPercentR`, `fuelEndPercentC`, `pob`. Engine readings retain decimal strings. Weather/sea-state/events without dedicated fields go in notes. Unknown fields are not imported. New observations never overwrite plan/finish/leg-end summary data.

Repeated source IDs are treated as already present, preserving later manual edits and deletions. A different source ID at an existing time/leg is held for review, as is a duplicate movement event or a later reading that would change the existing final reading. Resolve these separately using current app data; do not change identifiers to bypass duplicate checks. Full backup JSON is supported for narrative/tag enrichment only and does not bulk-import its operational entries.

Preview date/route are labels; matching uses `id`. Apply only after reviewing the current record. `possibleCorrections` contains text notes for manual review, never patches. The batch file must be under 25 MB. Imported entries retain internal `enrichment` metadata with `sourceId`, `batchId` and original notes. Displayed text omits recognised source-book references.

Optional entry observations: `windDir` (N/NE/E/SE/S/SW/W/NW), `windBft` (0–12), `seaState` (Douglas 0–9). Leave uncertain readings in notes.
