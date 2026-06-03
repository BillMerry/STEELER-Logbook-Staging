// Pure sun and moon calculation helpers. No DOM or storage access.

window.STEELER = window.STEELER || {};

function calcSunTimeUtcMinutes(isRise, y, mo, d, lat, lon){
  // Based on NOAA solar calculations (approx). Returns minutes after 00:00 UTC.
  const N = dayOfYear(y, mo, d);
  const lngHour = lon / 15;

  const t = N + ((isRise ? 6 : 18) - lngHour) / 24;

  const M = (0.9856 * t) - 3.289;

  let L = M + (1.916 * Math.sin(degToRad(M))) + (0.020 * Math.sin(degToRad(2*M))) + 282.634;
  L = (L % 360 + 360) % 360;

  let RA = radToDeg(Math.atan(0.91764 * Math.tan(degToRad(L))));
  RA = (RA % 360 + 360) % 360;

  // Quadrant adjustment
  const Lquadrant  = Math.floor(L / 90) * 90;
  const RAquadrant = Math.floor(RA / 90) * 90;
  RA = RA + (Lquadrant - RAquadrant);
  RA = RA / 15;

  const sinDec = 0.39782 * Math.sin(degToRad(L));
  const cosDec = Math.cos(Math.asin(sinDec));

  // Official zenith for sunrise/sunset
  const zenith = 90.833;

  const cosH = (Math.cos(degToRad(zenith)) - (sinDec * Math.sin(degToRad(lat)))) / (cosDec * Math.cos(degToRad(lat)));
  if (cosH > 1 || cosH < -1) return null; // polar day/night edge cases

  let H = isRise ? (360 - radToDeg(Math.acos(cosH))) : radToDeg(Math.acos(cosH));
  H = H / 15;

  const T = H + RA - (0.06571 * t) - 6.622;
  let UT = T - lngHour;
  UT = (UT % 24 + 24) % 24;

  return Math.round(UT * 60);
}

function formatTimeEuropeLondon(dateUtc){
  return formatTimeInZone(dateUtc, "Europe/London");
}

function calcSunTimes(isoDate, lat, lon, timeZone = "Europe/London"){
  const p = parseISODate(isoDate);
  if (!p) return null;
  const riseMin = calcSunTimeUtcMinutes(true, p.y, p.mo, p.d, lat, lon);
  const setMin  = calcSunTimeUtcMinutes(false, p.y, p.mo, p.d, lat, lon);
  if (riseMin == null || setMin == null) return null;

  const riseUtc = new Date(Date.UTC(p.y, p.mo-1, p.d, 0, 0, 0) + riseMin*60000);
  const setUtc  = new Date(Date.UTC(p.y, p.mo-1, p.d, 0, 0, 0) + setMin*60000);

  return {
    sunrise: formatTimeInZone(riseUtc, timeZone),
    sunset:  formatTimeInZone(setUtc, timeZone)
  };
}

// --- Moon phase helper (Group C: CL-076-10) ------------------------
// Lightweight approximation (good enough for a planning header). No rise/set calc.
function getMoonPhaseLabel(dateStr){
  try{
    // dateStr expected YYYY-MM-DD
    const d = new Date(dateStr + "T12:00:00Z"); // midday to avoid DST edge
    if (isNaN(d.getTime())) return "";

    // Based on a known new moon epoch (2000-01-06 18:14 UTC) and synodic month
    const epoch = Date.UTC(2000, 0, 6, 18, 14, 0);
    const synodic = 29.53058867; // days
    const daysSince = (d.getTime() - epoch) / 86400000;
    const lunations = daysSince / synodic;
    const phase = (lunations - Math.floor(lunations)); // 0..1
    const idx = Math.floor((phase * 8) + 0.5) % 8;

    const phases = [
      { e: "🌑", t: "New" },
      { e: "🌒", t: "Wax cres" },
      { e: "🌓", t: "1st qtr" },
      { e: "🌔", t: "Wax gib" },
      { e: "🌕", t: "Full" },
      { e: "🌖", t: "Wan gib" },
      { e: "🌗", t: "Last qtr" },
      { e: "🌘", t: "Wan cres" },
    ];
    const p = phases[idx] || phases[0];
    return `${p.e} ${p.t}`;
  }catch(e){
    return "";
  }
}


// --- Moonrise / moonset calculation (SunCalc-based approximation, offline) ---
// Returns { rise: Date|null, set: Date|null, alwaysUp: bool, alwaysDown: bool }
(function(){ /* scope wrapper for shared helpers */ })();

const _RAD = Math.PI / 180;
function _toJulian(date){ return date.valueOf() / 86400000 - 0.5 + 2440588; }
function _fromJulian(j){ return new Date((j + 0.5 - 2440588) * 86400000); }
function _toDays(date){ return _toJulian(date) - 2451545; }

function _rightAscension(l, b){ return Math.atan2(Math.sin(l) * Math.cos(degToRad(23.4397)) - Math.tan(b) * Math.sin(degToRad(23.4397)), Math.cos(l)); }
function _declination(l, b){ return Math.asin(Math.sin(b) * Math.cos(degToRad(23.4397)) + Math.cos(b) * Math.sin(degToRad(23.4397)) * Math.sin(l)); }
function _azimuth(H, phi, dec){ return Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)); }
function _altitude(H, phi, dec){ return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)); }
function _siderealTime(d, lw){ return _RAD * (280.16 + 360.9856235 * d) - lw; }

function _moonCoords(d){
  // geocentric ecliptic coords of the moon
  const L = _RAD * (218.316 + 13.176396 * d);
  const M = _RAD * (134.963 + 13.064993 * d);
  const F = _RAD * (93.272  + 13.229350 * d);

  const l  = L + _RAD * 6.289 * Math.sin(M);
  const b  = _RAD * 5.128 * Math.sin(F);
  const dt = 385001 - 20905 * Math.cos(M);

  return { ra: _rightAscension(l, b), dec: _declination(l, b), dist: dt };
}

function _getMoonPosition(date, lat, lon){
  const lw  = _RAD * -lon;
  const phi = _RAD * lat;
  const d   = _toDays(date);

  const c = _moonCoords(d);
  const H = _siderealTime(d, lw) - c.ra;

  // altitude correction for refraction not strictly needed for rise/set solver; keep basic
  const h = _altitude(H, phi, c.dec);

  return { azimuth: _azimuth(H, phi, c.dec), altitude: h, distance: c.dist };
}

function calcMoonTimes(isoDate, lat, lon){
  // Ported from SunCalc.getMoonTimes (MIT). Uses 2-hour steps & quadratic interpolation.
  const p = parseISODate(isoDate);
  if (!p) return null;

  // Start at 00:00 UTC for the date, then walk the day.
  const t0 = new Date(Date.UTC(p.y, p.mo-1, p.d, 0, 0, 0));
  const hc = 0.133 * _RAD; // moon's apparent radius (approx) + refraction in SunCalc approach

  let h0 = _getMoonPosition(t0, lat, lon).altitude - hc;
  let rise = null, set = null;

  // helper: quadratic interpolation for root
  function _quadRoots(y1, y2, y3){
    const a = (y1 + y3) / 2 - y2;
    const b = (y3 - y1) / 2;
    const c = y2;
    const xe = (a !== 0) ? -b / (2 * a) : 0;
    const ye = (a * xe + b) * xe + c;
    const d = b*b - 4*a*c;
    let x1 = null, x2 = null, n = 0;
    if (d >= 0 && a !== 0){
      const dx = Math.sqrt(d) / (2 * Math.abs(a));
      x1 = xe - dx; x2 = xe + dx;
      if (Math.abs(x1) <= 1) n++;
      if (Math.abs(x2) <= 1) n++;
      if (x1 != null && x2 != null && x1 < -1) x1 = x2; // choose root in range if only one
    }else if (d >= 0 && a === 0 && b !== 0){
      x1 = -c / b;
      if (Math.abs(x1) <= 1) n = 1;
    }
    return { xe, ye, x1, x2, n };
  }

  for (let i = 1; i <= 24; i += 2){
    const t1 = new Date(t0.getTime() + (i - 1) * 3600000);
    const t2 = new Date(t0.getTime() + i * 3600000);
    const t3 = new Date(t0.getTime() + (i + 1) * 3600000);

    const h1 = _getMoonPosition(t1, lat, lon).altitude - hc;
    const h2 = _getMoonPosition(t2, lat, lon).altitude - hc;
    const h3 = _getMoonPosition(t3, lat, lon).altitude - hc;

    const q = _quadRoots(h1, h2, h3);

    if (q.n === 1){
      if (h0 < 0) rise = new Date(t2.getTime() + q.x1 * 3600000);
      else        set  = new Date(t2.getTime() + q.x1 * 3600000);
    }else if (q.n === 2){
      const xRise = (q.ye < 0) ? q.x2 : q.x1;
      const xSet  = (q.ye < 0) ? q.x1 : q.x2;
      rise = new Date(t2.getTime() + xRise * 3600000);
      set  = new Date(t2.getTime() + xSet  * 3600000);
    }

    if (rise && set) break;
    h0 = h2;
  }

  if (!rise && !set){
    // Determine if always above/below horizon
    const alwaysUp = h0 > 0;
    return { rise: null, set: null, alwaysUp, alwaysDown: !alwaysUp };
  }

  return { rise, set, alwaysUp: false, alwaysDown: false };
}

window.STEELER.sunMoon = {
  calcSunTimeUtcMinutes: typeof calcSunTimeUtcMinutes !== "undefined" ? calcSunTimeUtcMinutes : undefined,
  formatTimeEuropeLondon: typeof formatTimeEuropeLondon !== "undefined" ? formatTimeEuropeLondon : undefined,
  calcSunTimes: typeof calcSunTimes !== "undefined" ? calcSunTimes : undefined,
  getMoonPhaseLabel: typeof getMoonPhaseLabel !== "undefined" ? getMoonPhaseLabel : undefined,
  _toJulian: typeof _toJulian !== "undefined" ? _toJulian : undefined,
  _fromJulian: typeof _fromJulian !== "undefined" ? _fromJulian : undefined,
  _toDays: typeof _toDays !== "undefined" ? _toDays : undefined,
  _rightAscension: typeof _rightAscension !== "undefined" ? _rightAscension : undefined,
  _declination: typeof _declination !== "undefined" ? _declination : undefined,
  _azimuth: typeof _azimuth !== "undefined" ? _azimuth : undefined,
  _altitude: typeof _altitude !== "undefined" ? _altitude : undefined,
  _siderealTime: typeof _siderealTime !== "undefined" ? _siderealTime : undefined,
  _moonCoords: typeof _moonCoords !== "undefined" ? _moonCoords : undefined,
  _getMoonPosition: typeof _getMoonPosition !== "undefined" ? _getMoonPosition : undefined,
  calcMoonTimes: typeof calcMoonTimes !== "undefined" ? calcMoonTimes : undefined
};
