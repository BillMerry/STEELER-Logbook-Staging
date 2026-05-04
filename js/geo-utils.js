// Pure geographic and coordinate helpers. No DOM or storage access.

window.STEELER = window.STEELER || {};

function degToRad(x){ return x * Math.PI / 180; }

function radToDeg(x){ return x * 180 / Math.PI; }

function formatDMM(lat, lon){
  function one(val, isLat){
    const hemi = isLat ? (val >= 0 ? "N" : "S") : (val >= 0 ? "E" : "W");
    const a = Math.abs(val);
    const deg = Math.floor(a);
    const min = (a - deg) * 60;
    const minutesStr = min.toFixed(3).padStart(6, "0");
    return `${deg}º${minutesStr}'${hemi}`;
  }
  if (isNaN(lat) || isNaN(lon)) return "";
  return `${one(lat, true)}, ${one(lon, false)}`;
}

function parseCoordPart(s, isLat){
  if (!s) return NaN;
  const t = String(s).trim().toUpperCase();

  // Plain decimal
  if (/^-?\d+(?:\.\d+)?$/.test(t)) return parseFloat(t);

  // Decimal degrees with hemisphere, e.g. Apple Maps:
  // 50.57507° N
  // 2.44846° W
  const decimalHemisphere = t.match(/^(\d{1,3}(?:\.\d+)?)\s*(?:º|°)?\s*([NSEW])$/);
  if (decimalHemisphere) {
    let val = parseFloat(decimalHemisphere[1]);
    const hemi = decimalHemisphere[2];
    if (hemi === "S" || hemi === "W") val *= -1;

    if (isLat && (val < -90 || val > 90)) return NaN;
    if (!isLat && (val < -180 || val > 180)) return NaN;

    return val;
  }

  // Flexible DDM:
  // 50º45.123'N
  // 50°45.123'N
  // 50 45.123 N
  // 001º18.456'W
  const m = t.match(/^(\d{1,3})\s*(?:º|°|\s)\s*(\d{1,2}(?:\.\d+)?)\s*(?:'|’|′|\s)?\s*([NSEW])$/);
  if (!m) return NaN;

  const deg = parseInt(m[1], 10);
  const mins = parseFloat(m[2]);
  const hemi = m[3];

  if (!Number.isFinite(deg) || !Number.isFinite(mins)) return NaN;
  let val = deg + (mins / 60);
  if (hemi === "S" || hemi === "W") val *= -1;

  if (isLat && (val < -90 || val > 90)) return NaN;
  if (!isLat && (val < -180 || val > 180)) return NaN;

  return val;
}

function parseLatLon(latStr, lonStr){
  const lat = parseCoordPart(latStr,true);
  const lon = parseCoordPart(lonStr,false);
  if (!isNaN(lat) && !isNaN(lon)) return {lat, lon};
  return null;
}

function parseSingleLatLonField(val){
  const s = String(val || "").trim();
  if (!s) return null;
  const m = s.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m) {
    const lat = parseFloat(m[1]);
    const lon = parseFloat(m[2]);
    if (!isFinite(lat) || !isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon };
  }

  const parts = s.split(",").map(x => x.trim()).filter(Boolean);
  if (parts.length !== 2) return null;

  const lat = parseCoordPart(parts[0], true);
  const lon = parseCoordPart(parts[1], false);
  if (!isFinite(lat) || !isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function distanceKm(lat1, lon1, lat2, lon2){
  const R = 6371;
  const rad = Math.PI/180;
  const dLat = (lat2-lat1)*rad;
  const dLon = (lon2-lon1)*rad;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

function saneForSteeler(lat, lon){
  const refLat = 50.76;   // Lymington-ish
  const refLon = -1.54;
  const km = distanceKm(refLat, refLon, lat, lon);
  return km <= 1500; // generous: covers UK + near continent
}

window.STEELER.geoUtils = {
  degToRad: typeof degToRad !== "undefined" ? degToRad : undefined,
  radToDeg: typeof radToDeg !== "undefined" ? radToDeg : undefined,
  formatDMM: typeof formatDMM !== "undefined" ? formatDMM : undefined,
  parseCoordPart: typeof parseCoordPart !== "undefined" ? parseCoordPart : undefined,
  parseLatLon: typeof parseLatLon !== "undefined" ? parseLatLon : undefined,
  parseSingleLatLonField: typeof parseSingleLatLonField !== "undefined" ? parseSingleLatLonField : undefined,
  distanceKm: typeof distanceKm !== "undefined" ? distanceKm : undefined,
  saneForSteeler: typeof saneForSteeler !== "undefined" ? saneForSteeler : undefined
};
