# 1.4.0-rc1 — Passage memories (staging only)

Captain’s Narrative and tags are editable fields on Plan, displayed in the Log summary, searchable from Home and included in backups, CSV and print. Mark reviewed distinguishes Bill’s reviewed text from drafts.

Recognised enrichment paragraphs from previous batches move into those fields on load. Original notes remain available under Sources and original notes. Differing existing narratives and deleted records are preserved. The resolved 27 March 2025 distance-review sentence is removed without changing readings. A 500-record enriched-backup check migrated 83 records, preserved operational fields and confirmed repeat migration makes no further changes. The previously reported 17 records without new narratives are deleted records, not missing passages needing review.

Settings → Data & Backup → Narratives and enrichment batches previews future enriched backups by passage ID. Conflicting narratives require explicit selection. Applying downloads a safety backup and imports only narrative, tags and sources; it never imports operational entries, readings, dates or new passages. Ordinary full backup restore remains separate.

No Slip/Dock plus engine activity is ERU. Under Way duration requires Slip. Validated engine readings (both stored with exactly one decimal place) show hours run; original meter readings are retained. Unvalidated readings continue to show the range.

Undo/Redo buttons support touch devices; Cmd-Z/Ctrl-Z and Shift-Z work outside text fields. Text fields retain native undo. Saved passage/log edits are undoable within the current session, up to eight snapshots and a 24 MB text budget. Settings and full restore are outside this scope; reload/cloud receive clears history. Undone creation uses deletion markers so sync does not resurrect it.

The testbed has a purple header. No live release or sync backend changes are included.

## AI connection

A separate `narrative-worker` connects to the OpenAI Responses API. It has no logbook database binding. The API key stays server-side; the app holds only the service URL and a separate access token, excluded from backups. Configure each device in Settings. Drafting is online-only; manual narrative editing and stored narratives work offline.

Draft with AI uses all non-deleted daily summaries and passage observations, including the stay, plus separately labelled planning weather/tides. It requests informal first-person factual prose and tags. Starting the next passage offers drafting for the previous selected passage. Every draft is editable in a preview and requires Use this draft; it cannot replace an intervening edit.

Deploy the worker with Wrangler, set secrets `OPENAI_API_KEY` and `NARRATIVE_TOKEN` using secure prompts, and configure `OPENAI_MODEL` with a model supporting Structured Outputs. Do not put credentials into source, backups or chat. Set the worker URL and matching access token in the app. Generation sends the selected passage context to OpenAI, with API response storage disabled; normal API usage charges apply. No AI requests are made automatically without confirming the offer.

## Validation

Asset/version checks, existing DOM, Chrome and WebKit regression suites, enrichment migration/import preservation checks, ERU/engine-hour checks, editor/undo/search/backup/reload tests, desktop/tablet/phone visual checks and mocked AI service success/failure/authentication/size-limit tests. Real paid API generation requires server credentials and remains a separate acceptance check. Localhost browser tests check saved offline data, not a service-worker-controlled offline navigation.
