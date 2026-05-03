// Pure shared formatting/string helpers. No DOM or storage access.

window.STEELER = window.STEELER || {};

function normalizeSpaces(s){
  return (s||"").replace(/\s+/g," ").trim();
}

function toUpperSafe(s){ return (s||"").toUpperCase(); }

function _escapeRegExp(s){ return String(s||"").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

window.STEELER.coreUtils = {
  normalizeSpaces: typeof normalizeSpaces !== "undefined" ? normalizeSpaces : undefined,
  toUpperSafe: typeof toUpperSafe !== "undefined" ? toUpperSafe : undefined,
  _escapeRegExp: typeof _escapeRegExp !== "undefined" ? _escapeRegExp : undefined
};
