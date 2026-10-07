# 1.4.3-rc2 — storage failure safeguards (not yet released)

Investigation of missing iPad passages on 7 October found a reproducible failure: a failed canonical passage write during restore was ignored, so restored history and later new passages could remain visible only in memory. Reload then returned to the previously persisted dataset. DPP templates and waypoint library use different stores and can survive independently. This is a plausible mechanism, not confirmation of the device's actual incident.

Changes:
- Stop full/legacy restore immediately when passage storage fails; retain previous in-memory records and report failure. Other failed stores prevent a full-success message.
- Keep a visible warning while writes are failing and warn before leaving the page where supported. This does not guarantee protection against iOS suspending/terminating a tab: back up unsaved work immediately.
- Block writes and backup/cloud package creation when passage parsing fails and recovery is declined or unsuccessful. Preserve the raw stored record until explicit recovery/restore.
- Namespace Testbed data, sync configuration and AI preferences independently under `steeler_testbed:` on the staging URL. Do not automatically copy shared Live data or credentials. Testbed needs an explicit backup restore and separate connection setup.
- Scope new service-worker cache cleanup and reset to the app's own cache family and worker registration. Old releases may still have broader cleanup logic until updated.

The prior RC1 format change was unsafe when Live and Testbed were opened under the same browser origin and storage container. RC2 isolation prevents new cross-version writes; it does not automatically repair an already affected Live store. Keep RC1 closed pending this release. Recovery should preserve all currently open copies before any reload/restore/deployment.

Validation: deterministic failed-write, corrupt-read, explicit-recovery and same-origin namespace tests; complete DOM/unit regression suites passed locally. Safari/offline browser checks are required before deployment. The local browser runtime was unavailable during this turn; CI runs those checks. No device or cloud data has been changed.
