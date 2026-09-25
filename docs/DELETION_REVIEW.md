# Deleted records and recovery review

## What the current code actually does

Passages and log entries are soft-deleted with `deleted: true`, `deletedAt`, an updated timestamp and dirty sync metadata. Operational views and normal log exports filter them out. Full data backups retain them. Deleted passages are excluded from passage analytics.

Full-copy sync transfers the chosen complete package, including soft-deleted records. The older record-sync protocol also understands deletion metadata. Removing tombstones without a migration/reconciliation design would discard recovery evidence and could allow an older device or backup to reintroduce records.

There is no dedicated trash/recover-item interface. Restoring a full backup made AFTER deletion preserves the deleted state; it does not recover the item by itself. Restoring an older pre-deletion backup can recover the item but replaces other data with that older snapshot. Existing Recovery Backups controls provide whole-backup download/restore, with explicit confirmation and a local safety export on that recovery path.

The ordinary full-copy sync functions currently do NOT archive the previous cloud copy or download a local safety file before replacement, despite older architecture/checklist text claiming those safeguards. `uploadFullDataCloudCopy` pushes only the current full-data record; `applyFullDataCloudCopy` restores then verifies. This candidate corrects the documentation; it does not claim new backup guarantees.

The current Worker/full-package client has no compare-and-swap transaction spanning cloud fetch and upload. Two devices can race after both see the same baseline. The notification fix does not solve that pre-existing protocol limitation.

## Recommendation for this release

Retain tombstones and existing storage shape. Do not introduce automatic expiry, permanent purge or automatic record merging. These are separate data-safety changes, not presentation fixes.

## Next recovery increment

Design a Deleted Items view listing passage/date, item kind and deletion time, with export-before-restore. Restoring a passage should preserve child entries that were individually deleted. Restoring a log entry must reconcile derived Shutdown/engine/waypoint flags, finish snapshots and affected metrics, then create a new sync-visible edit. Show a preview before recovery and test repeated delete/restore across two offline devices.

Add durable recovery snapshots and server revision preconditions before considering tombstone cleanup. Purging needs a documented retention period, acknowledgement from all relevant devices, handling of long-offline devices and a backup policy. Measure tombstone volume first: there is no evidence yet that its size justifies losing history.
