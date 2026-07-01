# STEELER Logbook Data Model

This document records the local data shapes used by the v1.2.4 sync-foundation build. It began as the v0.11.5 baseline documentation and has been updated as the architecture foundation work added safety mirrors, modules, v0.20.x sea-use tweaks, reusable Detailed Passage Plan templates, and the first offline-first sync preparation fields.

The app is an offline-first browser PWA. User data is stored in `localStorage` as JSON strings, except for the theme value. Storage keys and data shapes must not be changed without an explicit migration plan and backup/restore testing.

## localStorage Keys

| Key | Purpose | Shape |
| --- | --- | --- |
| `steeler_logbook_passages_v5` | Passage plans, detailed passage plans, log entries, and finish state | JSON array of passage objects |
| `steeler_logbook_theme_v1` | UI theme | Plain string, usually `day` or `night` |
| `steeler_logbook_ports_v1` | Saved ports, coordinates, comms/pilotage notes, and recent ports | JSON object `{ "all": Port[], "recent": string[] }`; legacy array is still accepted on load |
| `steeler_safety_emergency_info_v1` | Vessel, safety, owner, emergency contacts, and notification defaults | JSON safety info object |
| `steeler_ec_settings_v1` | Legacy emergency contact settings | JSON legacy object; migrated into safety info when present |
| `STEELER_ABBR_DB_V1` | Weather abbreviation database and user edits | JSON abbreviation database; flat and legacy grouped shapes are accepted |
| `steeler_dpp_templates_v1` | Globally reusable Detailed Passage Plan templates | JSON `DppTemplateStore` object |
| `steeler_dpp_waypoints_v1` | Globally reusable Detailed Passage Plan waypoints | JSON `DppWaypointStore` object |
| `steeler_fuel_management_v1` | Fuel tank/reset settings | JSON fuel management object |
| `steeler_log_split_ratio_v1` | Log/plan split layout preference | Plain string number |
| `steeler_device_id_v1` | Local device/client identity for future sync | Plain string generated locally; not restored from data backups |
| `steeler_device_name_v1` | Human-friendly local device name for sync display | Plain string edited locally; not restored from data backups |
| `steeler_sync_status_v1` | Local sync status summary | JSON object; records local changes, Worker checks, and one-way cloud backup status |
| `steeler_sync_config_v1` | Staging sync connection settings | JSON object containing Worker URL, local token and per-device auto-sync preference; not included in full data backups |

## Safety Mirror Keys

The v0.14.0 data safety pass adds separate last-known-good mirror keys. These do not replace or change the primary data keys above.

| Key | Mirrors |
| --- | --- |
| `steeler_lkg_passages_v5` | `steeler_logbook_passages_v5` |
| `steeler_lkg_passages_v5_meta` | Mirror metadata for passages |
| `steeler_lkg_ports_v1` | `steeler_logbook_ports_v1` |
| `steeler_lkg_ports_v1_meta` | Mirror metadata for ports |
| `steeler_lkg_safety_emergency_info_v1` | `steeler_safety_emergency_info_v1` |
| `steeler_lkg_safety_emergency_info_v1_meta` | Mirror metadata for safety info |
| `steeler_lkg_ec_settings_v1` | `steeler_ec_settings_v1` |
| `steeler_lkg_ec_settings_v1_meta` | Mirror metadata for legacy EC settings |
| `steeler_lkg_abbr_db_v1` | `STEELER_ABBR_DB_V1` |
| `steeler_lkg_abbr_db_v1_meta` | Mirror metadata for weather abbreviations |
| `steeler_lkg_dpp_templates_v1` | `steeler_dpp_templates_v1` |
| `steeler_lkg_dpp_templates_v1_meta` | Mirror metadata for DPP templates |

Mirror metadata has this shape:

```js
{
  sourceKey: "steeler_logbook_passages_v5",
  label: "passages",
  mirroredAt: "2026-05-03T12:00:00.000Z",
  appVersion: "0.14.0-staging"
}
```

If a primary key cannot be parsed, the app shows visible recovery handling and offers to export the raw stored value before recovery. The primary key is not renamed, and any last-known-good restore writes back to the same canonical key. The raw corrupt export has this shape:

```js
{
  format: "steeler-corrupt-localstorage-export",
  version: 1,
  exportedAt: "2026-05-03T12:00:00.000Z",
  appVersion: "0.14.0-staging",
  key: "steeler_logbook_passages_v5",
  label: "passages",
  error: "Unexpected token ...",
  raw: "{ damaged JSON"
}
```

## Passage

Stored inside `steeler_logbook_passages_v5`.

```js
{
  id: "p_...",
  flags: {
    engineStart: false,
    slip: false,
    dock: false
  },
  plan: PassagePlan,
  entries: LogEntry[],
  finish: PassageFinish,
  createdAt: "2026-05-03T08:00:00.000Z",
  updatedAt: "2026-05-03T08:00:00.000Z",
  schemaVersion: 1,
  lastModifiedDeviceId: "device_...",
  deleted: false,
  deletedAt: "",
  syncDirty: true,
  syncStatus: "pending",
  dirtyAt: "2026-05-03T08:00:00.000Z",

  // Optional fields added by later workflows
  pob: "4",
  legEnds: PassageLegEnd[],
  ecSms: {
    lookoutContact: {
      contactId: "ec_...",   // saved contact id when available
      name: "Jane",
      tel: "+44...",
      oneOff: false
    }
  }
}
```

Deleted passages are soft-deleted for sync safety. The app hides passages where `deleted === true` from normal Home and Log views, but keeps them in `steeler_logbook_passages_v5` and full data backups so the deletion can sync to other devices.

`ecSms.lookoutContact` is optional. It records the Emergency Contact used for the passage's Lookout Request so the Passage Complete SMS can default to the same recipient instead of reverting to the global default contact.

## PassagePlan

```js
{
  date: "2026-05-03",
  timeZone: "Europe/London",
  from: "Lymington",
  to: "Cherbourg",
  fromPortId: "port_...",      // optional
  toPortId: "port_...",        // optional
  transitPorts: [
    { name: "Cowes", portId: "port_..." }
  ],

  vessel: "STEELER",
  skipper: "",
  crew: "",
  sunriseSet: "",
  moonPhase: "",
  moonRiseSet: "",
  tidalCoeff: "",
  tideStations: TideStation[],
  currents: "",
  weather: "",
  comms: "",
  engineHoursStart: "",
  fuelStartPercent: "",
  engineStartEnv: EngineStartEnvironment,
  dailySummaries: DailySummary[],

  // Legacy first-leg detailed plan plus current multi-leg model.
  detailed: DetailedPassagePlan,
  detailedLegs: DetailedPassagePlan[],
  detailedLegIndex: 0
}
```

`transitPorts` may be absent or may contain legacy strings in older data. The current code normalises them to `{ name, portId }` objects and caps them at three transit ports.

`timeZone` stores the passage's operational time zone as an IANA zone id. New passages default from the device time zone where it maps to a supported choice. Supported UI choices are currently shown as `BST` (`Europe/London`), `GMT / UTC` (`UTC`), and `CET` (`Europe/Paris`). Older passages may not have this field and are treated as `Europe/London`.

## TideStation

```js
{
  id: "ts_...",
  name: "Cherbourg",
  role: "origin" | "transit1" | "transit2" | "transit3" | "dest" | "",
  hw1: "06:12",
  hw2: "18:24",
  lw1: "12:34",
  lw2: "",
  hw1h: "5.4",
  hw2h: "5.1",
  lw1h: "1.2",
  lw2h: "",
  events: [
    { type: "HW", time: "06:12", height: 5.4 }
  ],
  raw: "",
  source: "imray",
  auto: true
}
```

Tide stations are planned data. Manual fields are the editable source of truth; `events`, `raw`, and `source` support paste/import workflows and backwards compatibility.

## DailySummary

```js
{
  id: "ds_...",
  date: "2026-05-03",
  fee: "",
  notes: ""
}
```

## DetailedPassagePlan

```js
{
  waypoints: DetailedWaypoint[],
  hazards: "",
  portsOfRefuge: "",
  crewWelfare: ""
}
```

## DetailedWaypoint

```js
{
  id: "wp_...",
  time: "08:30",
  name: "Needles Fairway",
  coordsText: "50º39.000'N, 001º35.000'W",
  lat: 50.65,
  lon: -1.583333,
  distToNext: 12.4,
  manualDistToNext: "",
  cogToNext: "187",
  plannedSpeed: "8.0",
  tideKt: "-1.2",
  sogToNext: 6.8,
  timeToNext: "01:33",
  fuelToNext: 21.7,
  includeInEcSms: true
}
```

`distToNext`, `cogToNext`, `sogToNext`, `timeToNext`, and `fuelToNext` are recalculated from coordinates, STW (`plannedSpeed`), and optional tide/current effect (`tideKt`). They are stored in passage data today, but should be treated as derived values. `manualDistToNext` can override the calculated distance for the leg starting at that waypoint, for example where a river route is longer than the straight-line waypoint distance. Timing uses SOG (`plannedSpeed + tideKt`), while fuel burn uses the STW fuel curve over the resulting elapsed time.

`includeInEcSms` controls whether an intermediate DPP waypoint is included in the EC SMS intended-routing list. Missing values from older saved passages/templates are treated as `true`.

## DppTemplateStore

Stored separately from passages in `steeler_dpp_templates_v1`. These templates are global reusable copies of a single leg's Detailed Passage Plan. Applying a template replaces the currently selected leg's DPP only after confirmation and does not change the passage route, storage keys, or passage data shape.

```js
{
  version: 1,
  updatedAt: "2026-05-04T12:00:00.000Z",
  templates: DppTemplate[]
}
```

## DppTemplate

```js
{
  id: "dpp_tpl_...",
  name: "Lymington to Bembridge",
  createdAt: "2026-05-04T12:00:00.000Z",
  updatedAt: "2026-05-04T12:10:00.000Z",
  detailed: DetailedPassagePlan
}
```

DPP templates include waypoint STW speeds and tide/current values plus the leg-specific `hazards`, `portsOfRefuge`, and `crewWelfare` fields. When a template is used, waypoint IDs are regenerated for the target leg so the saved template remains independent of the passage.

## DppWaypointStore

Stored separately from passages in `steeler_dpp_waypoints_v1`.

```js
{
  version: 1,
  updatedAt: "2026-05-04T12:00:00.000Z",
  waypoints: DppSavedWaypoint[]
}
```

## DppSavedWaypoint

```js
{
  id: "dpp_wp_...",
  name: "Needles Fairway",
  coordsText: "50º39.000'N, 001º35.000'W",
  lat: 50.65,
  lon: -1.583333,
  notes: "",
  createdAt: "2026-05-04T12:00:00.000Z",
  updatedAt: "2026-05-04T12:10:00.000Z"
}
```

## LogEntry

```js
{
  id: "e_...",
  time: "2026-05-03T08:30",
  leg: 0,
  lat: "50º45.123'N",
  lon: "001º18.456'W",
  course: "180",
  speed: "8.2",
  stw: "7.8",
  rpm: "1800",
  engTP: "82/3.1",
  waterLog: "123.4",
  groundLog: "125.1",
  fuelUsed: "",
  notes: "",
  entryType: "manual" | "engine-start" | "shutdown",
  createdAt: "2026-05-03T08:30:00.000Z",
  updatedAt: "2026-05-03T08:30:00.000Z",
  schemaVersion: 1,
  lastModifiedDeviceId: "device_...",
  deleted: false,
  deletedAt: "",
  syncDirty: true,
  syncStatus: "pending",
  dirtyAt: "2026-05-03T08:30:00.000Z",

  // Engine-start/shutdown workflows may also store typed copies.
  fuelStartPercentR: "",
  fuelStartPercentC: "",
  engineHoursStart: "",
  pob: "",
  engineStartEnv: EngineStartEnvironment,
  engineHoursEnd: "",
  fuelEndPercentR: "",
  fuelEndPercentC: "",
  shutdownNotes: ""
}
```

Manual log entries are the source of truth. Future live/NMEA values may prefill dialogs, but should not replace saved manual entries.

Deleted log entries are soft-deleted for v1.2.4 sync safety. The app hides entries where `deleted === true` from normal log views, counts, summaries, CSV export and PDF/print export, but keeps them in `steeler_logbook_passages_v5` and full data backups. This lets a later sync stage distinguish "deleted intentionally" from "missing because this device is old".

`syncDirty`, `syncStatus`, and `dirtyAt` are local sync-preparation fields. They mark records that have changed locally and need future sync processing. They do not currently contact a server.

## EngineStartEnvironment

```js
{
  airPressureMb: "",
  humidityPct: "",
  airTempC: "",
  seaTempC: "",
  windDir: "",
  windBft: "",
  notes: ""
}
```

## PassageFinish

```js
{
  engineHoursEnd: "",
  fuelEndPercent: "",
  notes: "",
  shutdownLogged: false
}
```

## PassageLegEnd

```js
{
  engineHoursEnd: "",
  fuelEndPercent: "",
  fuelEndPercentC: "",
  waterLog: "",
  groundLog: "",
  fuelUsed: "",
  notes: "",
  at: "2026-05-03T12:00:00.000Z"
}
```

## Port

Stored inside `steeler_logbook_ports_v1.data.all`.

```js
{
  id: "port_...",
  name: "Cherbourg",
  lat: 49.642,
  lon: -1.622,
  commsPilotage: "",
  privateNotes: "",
  createdAt: "2026-05-03T12:00:00.000Z",
  updatedAt: "2026-05-03T12:00:00.000Z",
  schemaVersion: 1,
  lastModifiedDeviceId: "device_..."
}
```

Older data may contain strings or objects without ids. The current app normalises known ports on load and removes legacy `tideId` fields. `commsPilotage` can be copied into Plan Comms / Pilotage; `privateNotes` stays in Port settings only.

## SafetyEmergencyInfo

Stored in `steeler_safety_emergency_info_v1`.

```js
{
  vessel: {
    boatName: "STEELER",
    boatType: "Motor Yacht",
    boatModel: "",
    callsign: "",
    mmsi: "",
    ukSsr: "",
    marineTrafficShipId: "",
    homePort: "",
    length: "",
    beam: "",
    draft: ""
  },
  appearanceSafety: {
    topsides: "",
    hull: "",
    superstructure: "",
    liferaft: "",
    dinghy: "",
    lifejackets: "",
    epirb: "",
    safetyEquip: "",
    rnEquip: ""
  },
  owner: {
    names: "",
    tel: "",
    email: "",
    address: ""
  },
  emergencyContacts: EmergencyContact[],
  defaults: {
    overdueHours: 2,
    engineToSlipMins: 7,
    detailsPageUrl: "",
    includeDetailsUrlInSms: true,
    includeMarineTrafficInSms: true
  }
}
```

## EmergencyContact

```js
{
  id: "ec_...",
  name: "Emergency Contact",
  tel: "",
  email: "",
  notes: "",
  isDefault: true
}
```

Exactly one contact should be default after normalisation.

## Legacy EcSettings

Stored in `steeler_ec_settings_v1` and migrated into safety info when found.

```js
{
  emergencyContact: {
    name: "",
    tel: "",
    email: "",
    overdueHours: 2
  },
  vesselProfile: {
    boatName: "STEELER",
    boatType: "Motor Yacht",
    callsign: "",
    mmsi: "",
    detailsUrl: ""
  },
  passageDefaults: {
    engineToSlipMins: 7
  }
}
```

## WeatherAbbreviationDb

Stored in `STEELER_ABBR_DB_V1`. The current code accepts a legacy grouped shape and migrates it to a flat shape.

```js
{
  version: 2,
  seededFromDefaults: true,
  updatedAt: "2026-05-03T12:00:00.000Z",
  rules: [
    {
      id: "mo_001",
      from: "\\bSOUTH\\s+OR\\s+SOUTHEAST\\b",
      to: "S/SE",
      mode: "regex",
      enabled: true,
      flags: "g",
      provider: "metoffice",
      category: "wind",
      builtIn: true
    }
  ]
}
```

Rules are applied in stored order. User edits must be preserved when shipped defaults are merged.

## FuelManagementSettings

Stored in `steeler_fuel_management_v1`.

```js
{
  tankCapacity: 800,
  resetAt: "2026-05-03T12:00",
  resetLevel: 800
}
```

Fuel management processes logged fuel entries in chronological order. A full-tank refuel starts the tank estimate from `tankCapacity` and resets the displayed fuel-used total. A partial refuel adds the entered litres to the current estimate, capped at `tankCapacity`; if the entry has a stored tank remaining value, that exact estimate is used. The displayed fuel used counts the latest `fuelUsed` value per passage leg after the most recent full-tank or manual baseline. If no logged refuel entries exist, the saved manual `resetAt` / `resetLevel` fields act as the fallback baseline.

## Backup Payloads

Primary full data backup:

```js
{
  format: "steeler-data-backup",
  version: 1,
  schemaVersion: 1,
  exportedAt: "2026-05-03T12:00:00.000Z",
  appVersion: "1.2.4",
  exportedByDeviceId: "device_...",
  exportedByDeviceName: "Bill's MacBook Pro",
  data: {
    passages: Passage[],
    theme: "day",
    knownPorts: {
      all: Port[],
      recent: string[]
    },
    safetyInfo: SafetyEmergencyInfo,
    legacyEcSettings: EcSettings,
    dppTemplates: DppTemplateStore,
    dppWaypoints: DppWaypointStore,
    weatherAbbreviations: WeatherAbbreviationDb,
    fuelManagement: FuelManagementSettings,
    settings: {
      logSplitRatio: "42"
    },
    localSyncStatus: {
      version: 1,
      deviceId: "device_...",
      syncEnabled: false,
      status: "local-pending",
      lastLocalChangeAt: "2026-05-03T12:00:00.000Z",
      lastSyncAt: "",
      lastSyncError: "",
      pendingLocalChanges: 4
    }
  }
}
```

The primary data backup is the preferred v1.2.4 archive/restore format. It includes all local STEELER data needed for a full-device restore. `localSyncStatus` is included for diagnostics, but restore does not replace the destination device's `steeler_device_id_v1` or use the backup's sync status as a cloud authority.

When the manual Settings action sends a cloud backup, the app wraps this same payload in a sync Worker record:

```js
{
  recordType: "cloud-backup",
  payload: {
    format: "steeler-cloud-backup-record",
    version: 1,
    createdAt: "2026-05-03T12:00:00.000Z",
    appVersion: "1.2.4",
    deviceId: "device_...",
    backup: SteelerDataBackup
  }
}
```

This is an archive copy only. It does not pull records back from Cloudflare and does not merge or overwrite local data.

The read-only cloud backup list is returned by `/v1/backups` and contains summary fields only:

```js
{
  recordId: "cloud_backup_...",
  createdAt: "2026-05-03T12:00:00.000Z",
  appVersion: "1.2.4",
  deviceId: "device_...",
  passageCount: 4,
  serverUpdatedAt: "2026-05-03 12:00:01",
  serverRevision: 12
}
```

This list does not include the full backup JSON and is not used for restore.

The selected cloud backup download is returned by `/v1/backups/{recordId}`:

```js
{
  ok: true,
  recordId: "cloud_backup_...",
  backup: SteelerDataBackup,
  summary: {
    createdAt: "2026-05-03T12:00:00.000Z",
    appVersion: "1.2.4",
    deviceId: "device_...",
    serverUpdatedAt: "2026-05-03 12:00:01",
    serverRevision: 12
  }
}
```

The app writes `backup` to a downloaded JSON file when Download Backup is used. Restore Backup uses the same response, downloads a local safety backup first, requires two confirmations, and then applies `backup` through the normal `steeler-data-backup` restore path. The destination device keeps its own `steeler_device_id_v1`.

## Sync Records

Manual Sync Preview builds local sync records, but does not upload or apply them yet. These records are intended to cover all local STEELER data:

```js
{
  recordId: "passage:p_...",
  recordType: "passage",
  schemaVersion: 1,
  clientUpdatedAt: "2026-05-03T12:00:00.000Z",
  lastChangedDeviceId: "device_...",
  lastChangedDeviceName: "Bill's MacBook Pro",
  deleted: false,
  payload: {
    format: "steeler-sync-record",
    version: 1,
    appVersion: "1.2.4",
    recordType: "passage",
    updatedAt: "2026-05-03T12:00:00.000Z",
    data: Passage
  }
}
```

The sync config is local-only and is not included in full data backups:

```js
{
  version: 1,
  workerUrl: "https://steeler-logbook-sync.bill-merry-52f.workers.dev",
  token: "",
  autoSyncEnabled: false
}
```

When `autoSyncEnabled` is true, the app checks on open, focus and foreground return. Auto-sync may upload safe local changes only when the current cloud copy has not moved since this device last synced. It does not automatically create the first cloud copy or replace local data from cloud. `steeler_sync_status_v1` records `lastAutoSyncAttemptAt`, `lastAutoSyncAt`, and `lastAutoSyncReason` so the Data & Backup panel can show recent auto-sync activity.

The previous per-record sync shape is retained only as historical compatibility data. v1.3.3-rc2 uses one current full-data cloud record instead:

```js
{
  recordId: "global:full-data-sync",
  recordType: "full-data-sync",
  schemaVersion: 1,
  clientUpdatedAt: "2026-06-13T12:00:00.000Z",
  lastChangedDeviceId: "device_...",
  deleted: false,
  payload: {
    format: "steeler-full-data-sync-record",
    version: 1,
    appVersion: "1.3.3-rc2",
    deviceId: "device_...",
    deviceName: "Bill's MacBook Pro",
    backup: DataBackupPayload
  }
}
```

Sync Now fetches only the current `full-data-sync` record, then compares this device's current data with the current cloud backup first. If they already match, the app confirms that the device is synced and does not upload another cloud copy. If the device has changes and the cloud record has not changed since this device last synced, the device backup can be saved as the current cloud copy. If the cloud record changed since this device last synced and the data differs, the user chooses either this device's full backup or the cloud full backup. When this device replaces an existing cloud copy, the previous cloud backup is preserved as a `cloud-backup` recovery record.

Using the cloud copy downloads a local safety backup first, then restores the cloud `steeler-data-backup`. v1.3.3-rc2 also compares the incoming passage plans with the current local copy before restore. If the cloud copy is missing richer local Daily Summary content or has no DPP content where the local passage has DPP content, those local sections are preserved and marked pending only when the local passage is at least as new as the cloud passage. Newer cloud-side deletions of Daily Summary or DPP detail are allowed to replace older local detail. The device id key remains local-only and is not restored from the backup.

Legacy full logbook backup:

```js
{
  format: "steeler-logbook-backup",
  version: 3,
  exportedAt: "2026-05-03T12:00:00.000Z",
  data: {
    passages: Passage[],
    theme: "day",
    safetyInfo: SafetyEmergencyInfo,
    dppTemplates: DppTemplateStore
  }
}
```

`dppTemplates` and `dppWaypoints` are optional for backwards compatibility. Backups created before v1.0.1 do not include DPP templates and still restore normally. Restoring a legacy full logbook backup preserves current ports.

Legacy ports backup:

```js
{
  format: "steeler-ports-backup",
  version: 1,
  exportedAt: "2026-05-03T12:00:00.000Z",
  data: {
    knownPorts: {
      all: Port[],
      recent: string[]
    }
  }
}
```

DPP Templates backup:

```js
{
  format: "steeler-dpp-templates-backup",
  version: 2,
  exportedAt: "2026-05-03T12:00:00.000Z",
  data: {
    dppTemplates: DppTemplateStore,
    dppWaypoints: DppWaypointStore
  }
}
```

DPP Template import merges by template name: matching names are updated, and new names are added.

## Migration Rules

- Do not rename localStorage keys without a migration.
- Do not change passage, log, port, safety, or abbreviation data shape without migration and restore testing.
- When adding fields, make readers tolerant of missing values.
- Keep manual saved log entries as the source of truth.
- Before destructive imports or migrations, preserve a way to export or recover the previous raw data.
- `js/safety-emergency.js` owns Safety/Emergency defaults, contact normalisation and legacy EC migration, but it preserves the keys and shapes documented above.
- `js/live-data.js` is currently a no-op boundary for future NMEA/liveData. It must not write saved log entries or replace manually entered passage data.
