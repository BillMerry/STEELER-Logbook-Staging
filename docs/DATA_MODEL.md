# STEELER Logbook Data Model

This document records the v0.11.5 local data shapes as implemented at the start of the v0.12.0 architecture foundation work.

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

Mirror metadata has this shape:

```js
{
  sourceKey: "steeler_logbook_passages_v5",
  label: "passages",
  mirroredAt: "2026-05-03T12:00:00.000Z",
  appVersion: "0.14.0-staging"
}
```

If a primary key cannot be parsed, the app offers to export the raw stored value before recovery. That export has this shape:

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

  // Optional fields added by later workflows
  pob: "4",
  legEnds: PassageLegEnd[]
}
```

## PassagePlan

```js
{
  date: "2026-05-03",
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
  cogToNext: "187",
  plannedSpeed: "8.0",
  timeToNext: "01:33",
  fuelToNext: 21.7
}
```

`distToNext`, `cogToNext`, `timeToNext`, and `fuelToNext` are recalculated from coordinates and planned speed. They are stored in passage data today, but should be treated as derived values.

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
  commsPilotage: ""
}
```

Older data may contain strings or objects without ids. The current app normalises known ports on load and removes legacy `tideId` fields.

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

## Backup Payloads

Full logbook backup:

```js
{
  format: "steeler-logbook-backup",
  version: 2,
  exportedAt: "2026-05-03T12:00:00.000Z",
  data: {
    passages: Passage[],
    theme: "day",
    safetyInfo: SafetyEmergencyInfo
  }
}
```

Ports backup:

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

## Migration Rules

- Do not rename localStorage keys without a migration.
- Do not change passage, log, port, safety, or abbreviation data shape without migration and restore testing.
- When adding fields, make readers tolerant of missing values.
- Keep manual saved log entries as the source of truth.
- Before destructive imports or migrations, preserve a way to export or recover the previous raw data.
