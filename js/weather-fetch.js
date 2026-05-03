// Weather fetch constants and request helpers. Keep orchestration in app.js.

window.STEELER = window.STEELER || {};

const MARINE_ROUTE_URL = "https://steeler-mf-inshore.bill-merry-52f.workers.dev/marine/route";

function buildMarineRouteRequest(origin, destination, via){
  const body = {
    lang: "en",
    tr: "google",
    origin,
    destination
  };
  if (Array.isArray(via) && via.length) body.via = via;
  return body;
}

window.STEELER.weatherFetch = {
  MARINE_ROUTE_URL: typeof MARINE_ROUTE_URL !== "undefined" ? MARINE_ROUTE_URL : undefined,
  buildMarineRouteRequest: typeof buildMarineRouteRequest !== "undefined" ? buildMarineRouteRequest : undefined
};
