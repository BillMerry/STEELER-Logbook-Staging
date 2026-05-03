// Pure marine route/area selection helpers. No DOM, storage, or network access.

window.STEELER = window.STEELER || {};

const METEOFRANCE_ZONE_BBOX = {
  "Baie de Somme / Cap de la Hague": { minLat: 48.6, maxLat: 51.3, minLon: -1.8, maxLon: 3.0 },
  "Cap de la Hague / Penmarc'h":     { minLat: 47.6, maxLat: 50.9, minLon: -6.0, maxLon: 0.2 },
  "Penmarc'h / Anse de l'Aiguillon": { minLat: 45.5, maxLat: 48.2, minLon: -3.8, maxLon: -0.6 }
};

function looksLikeFrenchCoastTrip(latA, lonA, latB, lonB){
  // Very rough bbox: Seine / Channel coast down to around La Rochelle.
  const inBox = (lat, lon) =>
    typeof lat === "number" && typeof lon === "number" &&
    lat >= 45.5 && lat <= 50.8 && lon >= -6.0 && lon <= 3.0;
  return inBox(latA, lonA) || inBox(latB, lonB);
}

function pickInshoreAreaForLatLon(lat, lon){
  // Biased for UK / Channel cruising. Returns an exact heading from the Met Office page.
  // lat, lon are decimal degrees (lon west is negative).
  if (typeof lat !== "number" || typeof lon !== "number") return null;

  // Channel Islands (rough bbox)
  if (lat < 49.75 && lon > -3.2 && lon < -1.4) return "Channel Islands";

  // South & SE England
  if (lat >= 49.75 && lat <= 52.0 && lon >= -6.5 && lon <= 2.5){
    // East/SE (Thames/Kent/Sussex): North Foreland to Selsey Bill
    if (lon >= 0.0 && lat >= 50.2) return "North Foreland to Selsey Bill";
    // Central South (Sussex/Hants/Dorset): Selsey Bill to Lyme Regis
    if (lon >= -3.0) return "Selsey Bill to Lyme Regis";
    // SW (Devon/Cornwall south + Scilly)
    return "Lyme Regis to Lands End including the Isles of Scilly";
  }

  // Fallbacks for other UK regions (kept simple; can be refined later)
  if (lat > 52.0 && lon > -6.5 && lon < 2.5) return "Gibraltar Point to North Foreland";
  if (lat > 55.0 && lon > -6.5 && lon < 2.5) return "Cape Wrath to Rattray Head including Orkney";

  return null;
}

window.STEELER.marineRoute = {
  METEOFRANCE_ZONE_BBOX: typeof METEOFRANCE_ZONE_BBOX !== "undefined" ? METEOFRANCE_ZONE_BBOX : undefined,
  looksLikeFrenchCoastTrip: typeof looksLikeFrenchCoastTrip !== "undefined" ? looksLikeFrenchCoastTrip : undefined,
  pickInshoreAreaForLatLon: typeof pickInshoreAreaForLatLon !== "undefined" ? pickInshoreAreaForLatLon : undefined
};
