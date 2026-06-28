// Pure/near-pure Detailed Passage Plan calculations. No DOM or storage access.

window.STEELER = window.STEELER || {};

function createBlankDetailedPassagePlan(){
  return { waypoints: [], hazards: "", portsOfRefuge: "", crewWelfare: "" };
}

function normaliseDetailedPassagePlan(detailed){
  const d = (detailed && typeof detailed === "object") ? detailed : createBlankDetailedPassagePlan();
  if (!Array.isArray(d.waypoints)) d.waypoints = [];
  if (typeof d.hazards !== "string") d.hazards = "";
  if (typeof d.portsOfRefuge !== "string") d.portsOfRefuge = "";
  if (typeof d.crewWelfare !== "string") d.crewWelfare = "";
  return d;
}

function cloneDetailedPassagePlan(detailed, { resetTimes=false, regenerateIds=false } = {}){
  const d = normaliseDetailedPassagePlan(detailed);
  return {
    waypoints: d.waypoints.map((wp, idx) => {
      const lat = Number(wp.lat);
      const lon = Number(wp.lon);
      return {
        id: regenerateIds ? ("wp_" + Date.now() + "_" + idx + "_" + Math.random().toString(36).slice(2)) : (wp.id || ("wp_" + Date.now() + "_" + idx)),
        time: resetTimes ? "" : (wp.time || ""),
        name: wp.name || "",
        coordsText: wp.coordsText || formatDetailedWaypointCoords(lat, lon),
        lat: Number.isFinite(lat) ? lat : null,
        lon: Number.isFinite(lon) ? lon : null,
        distToNext: "",
        manualDistToNext: wp.manualDistToNext || "",
        cogToNext: "",
        plannedSpeed: wp.plannedSpeed || "",
        tideKt: wp.tideKt || "",
        sogToNext: "",
        timeToNext: "",
        fuelToNext: "",
        includeInEcSms: wp.includeInEcSms !== false,
        actualTime: resetTimes ? "" : (wp.actualTime || "")
      };
    }),
    hazards: d.hazards || "",
    portsOfRefuge: d.portsOfRefuge || "",
    crewWelfare: d.crewWelfare || ""
  };
}

function detailedPassagePlanHasContent(detailed){
  const d = normaliseDetailedPassagePlan(detailed);
  return d.waypoints.length > 0 ||
    !!String(d.hazards || "").trim() ||
    !!String(d.portsOfRefuge || "").trim() ||
    !!String(d.crewWelfare || "").trim();
}

function reverseDetailedPassagePlanFromPrevious(prevDetailed){
  const prev = cloneDetailedPassagePlan(prevDetailed, { resetTimes:true, regenerateIds:true });
  const originalSpeeds = (prev.waypoints || []).map(wp => wp.plannedSpeed || "");
  const originalTides = (prev.waypoints || []).map(wp => wp.tideKt || "");
  prev.waypoints.reverse();
  prev.waypoints.forEach((wp, idx) => {
    const sourceSpeedIdx = originalSpeeds.length - idx - 2;
    wp.plannedSpeed = sourceSpeedIdx >= 0 ? (originalSpeeds[sourceSpeedIdx] || "") : "";
    wp.tideKt = sourceSpeedIdx >= 0 ? (originalTides[sourceSpeedIdx] || "") : "";
    wp.manualDistToNext = "";
  });
  return prev;
}

function normalisePassagePlanTimeInput(val){
  const raw = String(val || "").trim();
  if (!raw) return "";

  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";

  let hh = 0;
  let mm = 0;

  if (raw.includes(":")) {
    const parts = raw.split(":");
    hh = parseInt(parts[0] || "0", 10);
    mm = parseInt(parts[1] || "0", 10);
  } else if (digits.length === 1) {
    hh = parseInt(digits, 10);
    mm = 0;
  } else if (digits.length === 2) {
    hh = parseInt(digits, 10);
    mm = 0;
  } else if (digits.length === 3) {
    hh = parseInt(digits.slice(0,1), 10);
    mm = parseInt(digits.slice(1), 10);
  } else {
    hh = parseInt(digits.slice(0,2), 10);
    mm = parseInt(digits.slice(2,4), 10);
  }

  if (!Number.isFinite(hh)) hh = 0;
  if (!Number.isFinite(mm)) mm = 0;
  hh = Math.max(0, Math.min(23, hh));
  mm = Math.max(0, Math.min(59, mm));

  return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
}

function hhmmToMinutes(hhmm){
  const m = String(hhmm || "").match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1],10) * 60 + parseInt(m[2],10);
}

function minutesToHHMM(mins){
  if (mins == null || !Number.isFinite(mins)) return "";
  let m = Math.round(mins);
  while (m < 0) m += 1440;
  m = m % 1440;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
}

function hoursToDurationHHMM(hours){
  if (hours == null || !Number.isFinite(hours)) return "";
  const mins = Math.round(hours * 60);
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
}

function durationHHMMToMinutes(hhmm){
  const m = String(hhmm || "").match(/^(\d{2,}):(\d{2})$/);
  if (!m) return 0;
  return parseInt(m[1],10) * 60 + parseInt(m[2],10);
}

function calcDetailedPassagePlanRunningTotals(wps){
  const arr = Array.isArray(wps) ? wps : [];

  let totalNm = 0;
  let totalMinutes = 0;
  let totalFuel = 0;

  return arr.map((wp, idx) => {
    // Row 1 is the start point, so totals are zero before any leg is completed.
    if (idx > 0) {
      const prev = arr[idx - 1];

      const nm = parseFloat(prev?.distToNext);
      if (Number.isFinite(nm)) totalNm += nm;

      totalMinutes += durationHHMMToMinutes(prev?.timeToNext);

      const fuel = parseFloat(prev?.fuelToNext);
      if (Number.isFinite(fuel)) totalFuel += fuel;
    }

    return {
      totalNm: totalNm ? Number(totalNm.toFixed(1)) : 0,
      totalTime: totalMinutes ? minutesToHHMM(totalMinutes) : "00:00",
      totalFuel: totalFuel ? Number(totalFuel.toFixed(1)) : 0
    };
  });
}

function calcDetailedPassagePlanTotals(wps){
  const arr = Array.isArray(wps) ? wps : [];
  let totalNm = 0;
  let totalMinutes = 0;
  let totalFuel = 0;

  arr.forEach(wp => {
    const nm = parseFloat(wp?.distToNext);
    if (Number.isFinite(nm)) totalNm += nm;

    totalMinutes += durationHHMMToMinutes(wp?.timeToNext);

    const fuel = parseFloat(wp?.fuelToNext);
    if (Number.isFinite(fuel)) totalFuel += fuel;
  });

  return {
    totalNm: Number(totalNm.toFixed(1)),
    totalDuration: minutesToHHMM(totalMinutes),
    totalFuel: Number(totalFuel.toFixed(1))
  };
}

function parseDetailedWaypointCoords(val){
  const s = String(val || "").trim();
  if (!s) return null;

  // Decimal pair first
  const single = parseSingleLatLonField(s);
  if (single) return single;

  // Flexible DDM pair split on comma first
  let parts = s.split(",").map(x => x.trim()).filter(Boolean);

  // If no comma, try to split a pair like:
  // 50º45.123'N 001º18.456'W
  if (parts.length !== 2) {
    const m = s.match(/^(.+?[NS])[\s]+(.+?[EW])$/i);
    if (m) parts = [m[1].trim(), m[2].trim()];
  }

  if (parts.length !== 2) return null;

  const lat = parseCoordPart(parts[0], true);
  const lon = parseCoordPart(parts[1], false);
  if (isNaN(lat) || isNaN(lon)) return null;

  return { lat, lon };
}

function formatDetailedWaypointCoords(lat, lon){
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  return formatDMM(lat, lon);
}

function nmBetween(lat1, lon1, lat2, lon2){
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  return distanceKm(lat1, lon1, lat2, lon2) * 0.539956803;
}

function bearingDegBetween(lat1, lon1, lat2, lon2){
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return "";

  const rad = Math.PI / 180;
  const phi1 = lat1 * rad;
  const phi2 = lat2 * rad;
  const dLon = (lon2 - lon1) * rad;

  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) -
            Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);

  return String(Math.round((Math.atan2(y, x) / rad + 360) % 360)).padStart(3, "0");
}

const STEELER_FUEL_CURVE = [
  { speed: 3.0,  lph: 1.5 },
  { speed: 3.5,  lph: 2.0 },
  { speed: 4.0,  lph: 2.2 },
  { speed: 4.5,  lph: 3.0 },
  { speed: 5.0,  lph: 3.8 },
  { speed: 5.5,  lph: 4.8 },
  { speed: 6.0,  lph: 6.5 },
  { speed: 6.5,  lph: 8.0 },
  { speed: 7.0,  lph: 8.5 },
  { speed: 7.5,  lph: 10.0 },
  { speed: 8.0,  lph: 14.0 },
  { speed: 8.5,  lph: 18.0 },
  { speed: 9.0,  lph: 21.0 },
  { speed: 9.5,  lph: 27.0 },
  { speed: 10.0, lph: 33.0 },
  { speed: 10.5, lph: 37.0 },
  { speed: 11.0, lph: 40.0 },
  { speed: 11.5, lph: 42.0 },
  { speed: 12.0, lph: 47.0 },
  { speed: 12.5, lph: 49.0 },
  { speed: 13.0, lph: 51.0 },
  { speed: 13.5, lph: 53.0 },
  { speed: 14.0, lph: 52.0 },
  { speed: 14.5, lph: 55.0 },
  { speed: 15.0, lph: 57.0 },
  { speed: 15.5, lph: 60.0 },
  { speed: 16.0, lph: 62.0 },
  { speed: 16.5, lph: 62.0 },
  { speed: 17.0, lph: 62.0 },
  { speed: 17.5, lph: 64.0 },
  { speed: 18.0, lph: 65.0 },
  { speed: 18.5, lph: 68.0 },
  { speed: 19.0, lph: 70.0 },
  { speed: 19.5, lph: 70.0 }
];

function estimateSteelerFuelLph(speed){
  const s = parseFloat(speed);
  if (!Number.isFinite(s) || s <= 0) return null;

  const curve = STEELER_FUEL_CURVE;
  if (!curve.length) return null;

  if (s <= curve[0].speed) return curve[0].lph;
  if (s >= curve[curve.length - 1].speed) return curve[curve.length - 1].lph;

  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i];
    const b = curve[i + 1];
    if (s >= a.speed && s <= b.speed) {
      const span = b.speed - a.speed;
      const t = span === 0 ? 0 : (s - a.speed) / span;
      return a.lph + (b.lph - a.lph) * t;
    }
  }
  return null;
}

function recalcDetailedPassagePlan(p, legIdx = null){
  const detailed = getDetailedPlanFromTarget(p, legIdx);
  const wps = detailed.waypoints;

  for (let i = 0; i < wps.length; i++) {
    const wp = wps[i];
    const next = wps[i + 1] || null;

    wp.distToNext = "";
    wp.cogToNext = "";
    wp.sogToNext = "";
    wp.timeToNext = "";
    wp.fuelToNext = "";

    if (next && Number.isFinite(wp.lat) && Number.isFinite(wp.lon) && Number.isFinite(next.lat) && Number.isFinite(next.lon)) {
      const calculatedNm = nmBetween(wp.lat, wp.lon, next.lat, next.lon);
      if (calculatedNm != null && Number.isFinite(calculatedNm)) {
        const manualNm = parseFloat(wp.manualDistToNext);
        const nm = Number.isFinite(manualNm) && manualNm > 0 ? manualNm : calculatedNm;
        wp.distToNext = Number(nm.toFixed(1));
								wp.cogToNext = bearingDegBetween(wp.lat, wp.lon, next.lat, next.lon);

        const stw = parseFloat(wp.plannedSpeed);
        const tide = parseFloat(wp.tideKt);
        const tideEffect = Number.isFinite(tide) ? tide : 0;
        const sog = Number.isFinite(stw) ? stw + tideEffect : NaN;
        if (Number.isFinite(sog) && sog > 0) {
          wp.sogToNext = Number(sog.toFixed(1));
          const hours = nm / sog;
          wp.timeToNext = hoursToDurationHHMM(hours);

          const lph = estimateSteelerFuelLph(stw);
          if (Number.isFinite(lph)) {
            wp.fuelToNext = Number((hours * lph).toFixed(1));
          }
        }
      }
    }
  }

  for (let i = 1; i < wps.length; i++) {
    const prev = wps[i - 1];
    const prevTimeMins = hhmmToMinutes(prev.time);
    const prevStw = parseFloat(prev.plannedSpeed);
    const prevTide = parseFloat(prev.tideKt);
    const prevSpeed = Number.isFinite(prevStw) ? prevStw + (Number.isFinite(prevTide) ? prevTide : 0) : NaN;
    const prevDist = parseFloat(prev.distToNext);

    if (prevTimeMins != null && Number.isFinite(prevSpeed) && prevSpeed > 0 && Number.isFinite(prevDist) && prevDist >= 0) {
      const legMinutes = Math.round((prevDist / prevSpeed) * 60);
      wps[i].time = minutesToHHMM(prevTimeMins + legMinutes);
    } else if (i > 0 && (!wps[i].time || !String(wps[i].time).trim())) {
      wps[i].time = "";
    }
  }
}

function gpxPointsToDetailedWaypoints(points){
  return (points || []).map((pt, idx) => ({
    id: "wp_" + Date.now() + "_" + idx + "_" + Math.random().toString(36).slice(2),
    time: "",
    name: (pt.name || `WP${idx + 1}`).trim(),
    coordsText: formatDetailedWaypointCoords(pt.lat, pt.lon),
    lat: pt.lat,
    lon: pt.lon,
    distToNext: "",
    cogToNext: "",
    plannedSpeed: "",
    tideKt: "",
    sogToNext: "",
    timeToNext: "",
    fuelToNext: "",
    includeInEcSms: true
  }));
}

window.STEELER.dppCalculations = {
  createBlankDetailedPassagePlan: typeof createBlankDetailedPassagePlan !== "undefined" ? createBlankDetailedPassagePlan : undefined,
  normaliseDetailedPassagePlan: typeof normaliseDetailedPassagePlan !== "undefined" ? normaliseDetailedPassagePlan : undefined,
  cloneDetailedPassagePlan: typeof cloneDetailedPassagePlan !== "undefined" ? cloneDetailedPassagePlan : undefined,
  detailedPassagePlanHasContent: typeof detailedPassagePlanHasContent !== "undefined" ? detailedPassagePlanHasContent : undefined,
  reverseDetailedPassagePlanFromPrevious: typeof reverseDetailedPassagePlanFromPrevious !== "undefined" ? reverseDetailedPassagePlanFromPrevious : undefined,
  normalisePassagePlanTimeInput: typeof normalisePassagePlanTimeInput !== "undefined" ? normalisePassagePlanTimeInput : undefined,
  hhmmToMinutes: typeof hhmmToMinutes !== "undefined" ? hhmmToMinutes : undefined,
  minutesToHHMM: typeof minutesToHHMM !== "undefined" ? minutesToHHMM : undefined,
  hoursToDurationHHMM: typeof hoursToDurationHHMM !== "undefined" ? hoursToDurationHHMM : undefined,
  durationHHMMToMinutes: typeof durationHHMMToMinutes !== "undefined" ? durationHHMMToMinutes : undefined,
  calcDetailedPassagePlanRunningTotals: typeof calcDetailedPassagePlanRunningTotals !== "undefined" ? calcDetailedPassagePlanRunningTotals : undefined,
  calcDetailedPassagePlanTotals: typeof calcDetailedPassagePlanTotals !== "undefined" ? calcDetailedPassagePlanTotals : undefined,
  parseDetailedWaypointCoords: typeof parseDetailedWaypointCoords !== "undefined" ? parseDetailedWaypointCoords : undefined,
  formatDetailedWaypointCoords: typeof formatDetailedWaypointCoords !== "undefined" ? formatDetailedWaypointCoords : undefined,
  nmBetween: typeof nmBetween !== "undefined" ? nmBetween : undefined,
  bearingDegBetween: typeof bearingDegBetween !== "undefined" ? bearingDegBetween : undefined,
  STEELER_FUEL_CURVE: typeof STEELER_FUEL_CURVE !== "undefined" ? STEELER_FUEL_CURVE : undefined,
  estimateSteelerFuelLph: typeof estimateSteelerFuelLph !== "undefined" ? estimateSteelerFuelLph : undefined,
  recalcDetailedPassagePlan: typeof recalcDetailedPassagePlan !== "undefined" ? recalcDetailedPassagePlan : undefined,
  gpxPointsToDetailedWaypoints: typeof gpxPointsToDetailedWaypoints !== "undefined" ? gpxPointsToDetailedWaypoints : undefined
};
