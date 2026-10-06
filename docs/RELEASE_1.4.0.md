# STEELER Logbook 1.4.0

Adds dedicated Captain’s Narrative and tags, editable AI drafts, saved narrative preferences, and selective enrichment batches including individual log entries. Preserves existing operational data and flags conflicts for review.

Includes entry/passage undo and redo, revised Plan/Log layouts, continuous passage route with the current leg highlighted, compact leg/total metrics, ERU handling and validated hours-run display. Manual log entries now record wind direction, Beaufort force and Douglas sea state, available in exports and AI context.

Live keeps its existing branding, manifest, storage keys and sync Worker configuration. No backup is restored as part of deployment. AI connection settings remain device-local: configure the existing narrative service in Settings → Narratives & AI on Live if needed. Its staging name does not store or synchronise passage data.

Validation: full DOM and Safari-engine regressions; enrichment and worker suites; weather controls and undo/layout on the Live build; Chromium service-worker upgrade from 1.3.6 with retained data and offline write/reload/backup. The WebKit offline harness encountered an internal navigation error, so that specific offline check remains unverified in Safari.
