# 1.4.3-rc2 — storage failure safeguards

Investigation of missing iPad passages on 7 October found a reproducible failure: a failed canonical passage write during restore was ignored, so restored history and later new passages could remain visible only in memory. Reload then returned to the previously persisted dataset. DPP templates and waypoint library use different stores and can survive independently. This is a plausible mechanism, not confirmation of the device's actual incident.

Changes:
- Stop full/legacy restore immediately when passage storage fails; retain previous in-memory records and report failure. Other failed stores prevent a full-success message.
- Keep a visible warning while writes are failing and warn before leaving the page where supported. This does not guarantee protection against iOS suspending/terminating a tab: back up unsaved work immediately.
- Block writes and backup/cloud package creation when passage parsing fails and recovery is declined or unsuccessful. Preserve the raw stored record until explicit recovery/restore.
- Namespace Testbed data, sync configuration and AI preferences independently under `steeler_testbed:` on the staging URL. Do not automatically copy shared Live data or credentials. Testbed needs an explicit backup restore and separate connection setup.
- Scope new service-worker cache cleanup and reset to the app's own cache family and worker registration. Old releases may still have broader cleanup logic until updated.

The prior RC1 format change was unsafe when Live and Testbed were opened under the same browser origin and storage container. RC2 isolation prevents new cross-version writes; it does not automatically repair an already affected Live store. Keep RC1 closed pending this release. Recovery should preserve all currently open copies before any reload/restore/deployment.

Validation: deterministic failed-write, corrupt-read, explicit-recovery and same-origin namespace tests; complete DOM/unit regression suites passed locally. Safari/offline browser checks run before deployment, including a real-data reproduction using the preserved iPad snapshot. No device or cloud data has been changed.

Additional protection: canonical writes are read back and compared before success is reported. No-op saves and normal startup preserve a distinct last-known-good passage revision. The persistent unsaved warning includes a direct memory-backup download; final-leg Shutdown offers a nonblocking complete-backup button. This is an independent file safety net, not a forced download or proof of disk durability against an OS failure.

The iPad export was preserved before recovery. Its 56 passage records (38 active) match in memory, primary store and mirror; none contains the 6 October passage. The recovery file retains the 503-record full backup (485 active), includes both surviving Newtown Creek DPPs and waypoints, and restores blank recorded weather on 29 May from the iPad. It preserves existing operational records and does not fabricate the missing voyage or duplicate the older alternate-ID 29 September record. Batch 08 is left for a separate import.

The WebKit reproduction of unmodified Live 1.4.2 restored the supplied full backup into memory (503 records) and reported success, but disk-backed browser storage retained only the prior 56 records. A new passage increased memory to 504 records; reloading returned to 56. The repaired build restored all 503 records, survived reload with 485 active passages, 28 DPP templates and 89 waypoints, and used about 233,000 characters for the primary passage store. This reproduces the reported failure pattern; it does not provide a retrospective device error log proving the exact incident sequence.
