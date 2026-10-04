# 1.4.0-rc2 — Undo and layout corrections

Undo/Redo now records changes to individual passages, ignores sync/audit bookkeeping, and does not consume undo steps when cloud sync marks records clean. Guards compare meaningful content rather than raw JSON. This fixes an undo click apparently doing nothing after background activity. Deleted passages are selected when restored; entry and passage tombstones remain compatible with sync. Up to 40 actions are retained in memory, trimmed to a 24 MB snapshot budget except that the newest action is always retained. Reload and external restore still clear history. Ordinary text editing keeps native undo; Cmd-Z/Shift-Cmd-Z outside text fields invoke record undo/redo.

The logo is leftmost in the purple header; the redundant Testbed label is removed. Undo/Redo sit beside navigation and wrap below it on narrow phones.

Plan order: Date/Sun/Moon and Crew/Vessel alongside each other on tablet/desktop; Route; Planning Summary; Tides; Environmental Planning; Daily Summary; Captain’s Narrative. The Log summary also puts Captain’s Narrative below Daily Summary.

Current Passage lists every leg and bolds the current leg. Under Way and Entries show labelled totals and bold current-leg figures. Deleted entries are excluded and existing ERU timing behaviour is retained.

Validation: direct WebKit browser tests cover actual entry-edit dialogs, entry deletion, Plan editing, passage deletion, repeated undo/redo after sync housekeeping, restored passage selection, keyboard undo/redo, visual card order, multi-leg metrics and 1024/768/390px headers. Existing WebKit regression, enrichment editor, migration, sync and worker tests also pass.

AI calls remain user-triggered: Draft with AI, or accepting the previous-passage offer on starting a new passage. Each uses all recorded days for that selected passage, plus observations and separately labelled planning weather/tides. A draft is previewed and requires Use this draft to save. Service activation still requires Cloudflare sign-in and secure API-key configuration.
