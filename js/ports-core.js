// Pure port name/coordinate support helpers. No DOM or storage access.

window.STEELER = window.STEELER || {};

function portName(p){
  return (typeof p === "string") ? p : (p && typeof p === "object" ? (p.name || "") : "");
}

function portHasCoords(p){
  return p && typeof p === "object" && !isNaN(p.lat) && !isNaN(p.lon);
}

function normalisePortQuery(name){
  return (name || "")
    .toString()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[,]/g, "")
    .replace(/\b(harbour|harbor|marina|port)\b/ig, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalisePortDisplay(name){
  return (name || "").toString().trim().replace(/\s+/g, " ");
}

window.STEELER.portsCore = {
  portName: typeof portName !== "undefined" ? portName : undefined,
  portHasCoords: typeof portHasCoords !== "undefined" ? portHasCoords : undefined,
  normalisePortQuery: typeof normalisePortQuery !== "undefined" ? normalisePortQuery : undefined,
  normalisePortDisplay: typeof normalisePortDisplay !== "undefined" ? normalisePortDisplay : undefined
};
