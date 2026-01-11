// --- Constants & state ---------------------------------------------

const STORAGE_KEY = "steeler_logbook_passages_v5";
const THEME_KEY   = "steeler_logbook_theme_v1";
const PORTS_KEY   = "steeler_logbook_ports_v1";

const APP_VERSION = "0.5.3c";

// ---------------------------------------------------------------------------
// Emergency reset hook
// ---------------------------------------------------------------------------
// Use: http://localhost:8001/?reset=1
// This runs *before* any UI init so it works even if buttons/modals are broken.
(function earlyResetHook(){
  try{
    const qs = new URLSearchParams(window.location.search);
    if (!qs.has("reset")) return;

    // Clear local app data
    try{ localStorage.removeItem(STORAGE_KEY); }catch(e){}
    try{ localStorage.removeItem(THEME_KEY); }catch(e){}
    try{ localStorage.removeItem(PORTS_KEY); }catch(e){}

    // Nuke SW + cache storage
    const doReload = () => {
      // Remove the query param so we don't loop
      const cleanUrl = window.location.origin + window.location.pathname;
      window.location.replace(cleanUrl);
    };

    if ("serviceWorker" in navigator){
      navigator.serviceWorker.getRegistrations()
        .then(regs => Promise.all(regs.map(r => r.unregister())).catch(()=>[]))
        .then(() => ("caches" in window) ? caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))) : null)
        .then(doReload)
        .catch(doReload);
    } else {
      if ("caches" in window){
        caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(doReload).catch(doReload);
      } else {
        doReload();
      }
    }
  }catch(e){
    // Last resort: keep app running
  }
})();

function setAppVersionBadge(){
  const el = document.getElementById("appVersion");
  if (el) el.textContent = APP_VERSION;
}
window.addEventListener("DOMContentLoaded", setAppVersionBadge);


let passages = [];
let currentPassageId = null;
let knownPorts = [];
let recentPorts = [];
const PORTS_RECENT_LIMIT = 20;




function portName(p){
  return (typeof p === "string") ? p : (p && typeof p === "object" ? (p.name || "") : "");
}
function portHasCoords(p){
  return p && typeof p === "object" && !isNaN(p.lat) && !isNaN(p.lon);
}
function findPortItemByName(name){
  const n = (name || "").trim();
  if (!n) return null;
  return knownPorts.find(p => portName(p) === n) || null;
}
function upsertPortItem(name, lat=null, lon=null){
  // Backwards-compatible wrapper (coords only)
  upsertPortItemExtended(name, lat, lon, null);
}

function upsertPortItemExtended(name, lat=null, lon=null, tideId=null){
  const n = (name || "").trim();
  if (!n) return;

  const existingIdx = knownPorts.findIndex(p => portName(p) === n);

  const merge = (existingObj) => {
    const out = { name: n };
    if (existingObj && typeof existingObj === "object"){
      if (existingObj.lat != null) out.lat = Number(existingObj.lat);
      if (existingObj.lon != null) out.lon = Number(existingObj.lon);
      if (existingObj.tideId) out.tideId = String(existingObj.tideId);
    }
    if (lat != null && lon != null){
      out.lat = Number(lat);
      out.lon = Number(lon);
    }
    if (tideId !== null){
      // tideId == "" means clear; otherwise set
      if (String(tideId).trim() === "") {
        delete out.tideId;
      } else {
        out.tideId = String(tideId).trim();
      }
    }
    // if only name present, store as string (keeps storage tidy)
    const keys = Object.keys(out);
    if (keys.length === 1) return n;
    return out;
  };

  if (existingIdx >= 0){
    const existing = knownPorts[existingIdx];
    if (typeof existing === "object"){
      knownPorts[existingIdx] = merge(existing);
    } else {
      knownPorts[existingIdx] = merge({ name: n });
    }
  } else {
    knownPorts.push(merge({ name: n }));
  }

  knownPorts.sort((a,b) => portName(a).localeCompare(portName(b)));
}


// --- Port autocomplete + management --------------------------------

function getPortSuggestions(query) {
  const q = (query || "").trim().toLowerCase();
  let list;

  if (!q) {
    // show MRU first, then fall back to alphabetical if MRU empty
    list = (recentPorts && recentPorts.length ? recentPorts.slice() : knownPorts.slice());
  } else {
    list = knownPorts.filter(p => portName(p).toLowerCase().includes(q));
    // prefer starts-with matches
    list.sort((a, b) => {
      const an = portName(a).toLowerCase();
      const bn = portName(b).toLowerCase();
      const aStart = an.startsWith(q) ? 0 : 1;
      const bStart = bn.startsWith(q) ? 0 : 1;
      if (aStart !== bStart) return aStart - bStart;
      return an.localeCompare(bn);
    });
  }

  // ensure unique
  const seen = new Set();
  const out = [];
  for (const p of list) {
    const name = portName(p);
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
    if (out.length >= 6) break;
  }
  return out;
}

function renderPortSuggestBox(inputEl, boxEl) {
  if (!inputEl || !boxEl) return;

  const suggestions = getPortSuggestions(inputEl.value);
  boxEl.innerHTML = "";

  if (!suggestions.length) {
    boxEl.classList.add("hidden");
    return;
  }

  suggestions.forEach(name => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "port-suggest-item";
    btn.textContent = name;
    btn.addEventListener("mousedown", (e) => {
      // mousedown so we beat blur
      e.preventDefault();
      inputEl.value = name;
      rememberPort(name);
      boxEl.classList.add("hidden");
      // trigger any bound input handler
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    });
    boxEl.appendChild(btn);
  });

  boxEl.classList.remove("hidden");
}

function setupSinglePortAutocomplete(inputId, boxId) {
  const inputEl = document.getElementById(inputId);
  const boxEl = document.getElementById(boxId);
  if (!inputEl || !boxEl) return;

  const show = () => renderPortSuggestBox(inputEl, boxEl);
  inputEl.addEventListener("input", show);
  inputEl.addEventListener("focus", show);
  inputEl.addEventListener("blur", () => {
    // allow click selection
    setTimeout(() => boxEl.classList.add("hidden"), 150);
  });

  // Escape hides
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape") boxEl.classList.add("hidden");
  });
}

function setupPortAutocomplete() {
  setupSinglePortAutocomplete("planFrom", "planFromSuggest");
  setupSinglePortAutocomplete("planTo", "planToSuggest");
}

function setupPortCoordConfirmation(){
  // When a user finishes typing a new port name, try to look up coords and ask whether to save.
  const hook = (el) => {
    if (!el) return;
    el.addEventListener("blur", async () => {
      const name = (el.value || "").trim();
      if (!isLikelyRealPortName(name)) return;
      // If we already have coords, just update MRU.
      const existing = findPortItemByName(name);
      if (existing && portHasCoords(existing)) { rememberPort(name); return; }
      // Otherwise run the new-port flow (lookup + user confirmation).
      await maybeSaveNewPort(name);
    });
  };
  hook(document.getElementById("planFrom"));
  hook(document.getElementById("planTo"));
}

function deletePort(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return;
  knownPorts = knownPorts.filter(p => portName(p) !== trimmed);
  recentPorts = recentPorts.filter(p => p !== trimmed);
  savePorts();
  refreshPortUI();
}

function renamePort(oldName, newName){
  const oldN = (oldName || "").trim();
  const newN = (newName || "").trim();
  if (!oldN || !newN || oldN === newN) return { ok:false, message:"No change." };
  if (knownPorts.some(p => portName(p) === newN)) return { ok:false, message:"That name already exists." };

  // Update knownPorts
  knownPorts = knownPorts.map(p => {
    if (portName(p) !== oldN) return p;
    if (typeof p === "object" && p) return { ...p, name: newN };
    return newN;
  });

  // Update MRU
  recentPorts = recentPorts.map(n => n === oldN ? newN : n);

  // Update any saved passages that reference the port name
  try {
    for (const pass of passages || []){
      if (pass?.plan){
        if (pass.plan.from === oldN) pass.plan.from = newN;
        if (pass.plan.to === oldN) pass.plan.to = newN;
        if (Array.isArray(pass.plan.tideStations)){
          pass.plan.tideStations.forEach(ts => {
            if (ts && typeof ts === "object" && ts.name === oldN) ts.name = newN;
          });
        }
      }
    }
  } catch (e) {
    console.warn("renamePort: passage update failed", e);
  }

  savePorts();
  savePassages();
  refreshPortUI();
  return { ok:true };
}


function renderPortsManagerList() {
  const list = document.getElementById("portsManagerList");
  if (!list) return;
  list.innerHTML = "";

  const items = knownPorts.slice().sort((a, b) => portName(a).localeCompare(portName(b)));
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "ports-empty";
    empty.textContent = "No saved ports yet.";
    list.appendChild(empty);
    return;
  }

  items.forEach(item => {
    const name = portName(item);

    const row = document.createElement("div");
    row.className = "ports-row";

    const left = document.createElement("div");
    left.className = "ports-left";

    const nameWrap = document.createElement("div");
    nameWrap.className = "ports-name-wrap";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "ports-name-input";
    nameInput.value = name;

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "ports-mini";
    renameBtn.textContent = "Rename";
    renameBtn.addEventListener("click", () => {
      const target = (nameInput.value || "").trim();
      const res = renamePort(name, target);
      if (!res.ok){
        alert(res.message || "Could not rename port.");
        nameInput.value = name;
        return;
      }
      renderPortsManagerList();
    });

    nameWrap.appendChild(nameInput);
    nameWrap.appendChild(renameBtn);

    const coords = document.createElement("div");
    coords.className = "ports-coords";

    const latInput = document.createElement("input");
    latInput.type = "number";
    latInput.inputMode = "decimal";
    latInput.step = "0.0001";
    latInput.placeholder = "Lat";
    latInput.className = "ports-coord-input";
    latInput.value = (item && typeof item === "object" && item.lat != null) ? item.lat : "";

    const lonInput = document.createElement("input");
    lonInput.type = "number";
    lonInput.inputMode = "decimal";
    lonInput.step = "0.0001";
    lonInput.placeholder = "Lon";
    lonInput.className = "ports-coord-input";
    lonInput.value = (item && typeof item === "object" && item.lon != null) ? item.lon : "";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "ports-mini";
    saveBtn.textContent = "Save coords";

    saveBtn.addEventListener("click", () => {
      const la = parseFloat(latInput.value);
      const lo = parseFloat(lonInput.value);
      if (isNaN(la) || isNaN(lo)){
        alert("Please enter both latitude and longitude.");
        return;
      }
      if (!saneForSteeler(la, lo)){
        alert("Those coordinates look a bit daft for UK/Channel waters. Please double-check.");
        return;
      }
      upsertPortItemExtended(name, la, lo, null);
      savePorts();
      renderPortsManagerList();
    });

const lookupBtn = document.createElement("button");
    lookupBtn.type = "button";
    lookupBtn.className = "ports-mini";
    lookupBtn.textContent = "Lookup";
    lookupBtn.addEventListener("click", async () => {
      try {
        const q = encodeURIComponent(normalisePortQuery(name) + " harbour");
        const viewbox = "-6.8,53.5,3.5,45.5"; // UK + Channel + N France (down to La Rochelle)
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&countrycodes=gb,fr,gg,je&viewbox=${viewbox}&bounded=1&q=${q}`;
        const res = await fetch(url, { headers: { "Accept": "application/json", "Accept-Language":"en" } });
        if (!res.ok) throw new Error("Lookup failed");
        const data = await res.json();
        if (!data || !data.length) {
          alert("No match found. Try manual lat/lon.");
          return;
        }
        let lat = NaN, lon = NaN;
        for (const it of data){
          const la = parseFloat(it.lat);
          const lo = parseFloat(it.lon);
          if (!isNaN(la) && !isNaN(lo) && saneForSteeler(la, lo)) { lat = la; lon = lo; break; }
        }
        if (isNaN(lat) || isNaN(lon)) {
          alert("Lookup returned invalid coordinates.");
          return;
        }
        latInput.value = lat.toFixed(6);
        lonInput.value = lon.toFixed(6);
      } catch (e) {
        console.error(e);
        alert("Could not look up that port (offline or blocked). You can enter lat/lon manually.");
      }
    });

    coords.appendChild(latInput);
    coords.appendChild(lonInput);

    const dmm = document.createElement("div");
    dmm.className = "ports-dmm";
    const latV = (item && typeof item === "object" && item.lat != null) ? item.lat : NaN;
    const lonV = (item && typeof item === "object" && item.lon != null) ? item.lon : NaN;
    dmm.textContent = (isNaN(latV)||isNaN(lonV)) ? "" : formatDMM(latV, lonV);
    coords.appendChild(dmm);

    coords.appendChild(saveBtn);
    coords.appendChild(lookupBtn);

    left.appendChild(nameWrap);
    left.appendChild(coords);

    const right = document.createElement("div");
    right.className = "ports-right";

    const del = document.createElement("button");
    del.type = "button";
    del.className = "ports-delete";
    del.textContent = "Remove";
    del.addEventListener("click", () => deletePort(name));

    right.appendChild(del);

    row.appendChild(left);
    row.appendChild(right);
    list.appendChild(row);
  });
}


function setupPortsManagerModal() {
  const openBtn = document.getElementById("managePortsBtn");
  const modal = document.getElementById("portsModal");
  const closeBtn = document.getElementById("portsModalClose");
  const overlay = document.getElementById("portsModalOverlay");

  if (!openBtn || !modal) return;

  const open = () => {
    renderPortsManagerList();
    modal.classList.remove("hidden");
  };
  const close = () => modal.classList.add("hidden");

  openBtn.addEventListener("click", open);
  if (closeBtn) closeBtn.addEventListener("click", close);
  if (overlay) overlay.addEventListener("click", close);
}

function setupTidePasteModal(){
  const modal = document.getElementById("tidePasteModal");
  const overlay = document.getElementById("tidePasteModalOverlay");
  const closeBtn = document.getElementById("tidePasteModalClose");
  const cancelBtn = document.getElementById("tidePasteCancelBtn");
  const applyBtn = document.getElementById("tidePasteApplyBtn");
  const ta = document.getElementById("tidePasteText");

  if (!modal) return;

  const open = () => {
    const p = getCurrentPassage();
    const idx = window.__tidePasteTargetIndex;
    // Prefill with previously stored raw paste for this station (so you can edit / re-apply)
    if (ta) {
      let prefill = "";
      try {
        const stations = readTideStationsFromForm();
        if (stations && idx != null && stations[idx] && typeof stations[idx].raw === "string") {
          prefill = stations[idx].raw;
        } else if (p && p.plan && Array.isArray(p.plan.tideStations) && idx != null && p.plan.tideStations[idx] && typeof p.plan.tideStations[idx].raw === "string") {
          prefill = p.plan.tideStations[idx].raw;
        }
      } catch (e) {}
      ta.value = prefill || "";
      setTimeout(() => { try { ta.focus(); ta.select(); } catch(e){} }, 0);
    }
    modal.classList.remove("hidden");
    if (overlay) overlay.classList.remove("hidden");
  };
  const close = () => {
    modal.classList.add("hidden");
    if (overlay) overlay.classList.add("hidden");
  };

  // store on window so renderTideStations can call open without circulars
  window.__openTidePasteModal = open;
  window.__closeTidePasteModal = close;

  if (overlay) overlay.addEventListener("click", close);
  if (closeBtn) closeBtn.addEventListener("click", close);
  if (cancelBtn) cancelBtn.addEventListener("click", close);

  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      const p = getCurrentPassage();
      if (!p) return;
      const idx = window.__tidePasteTargetIndex;
      if (idx == null) return;

      const stations = readTideStationsFromForm();
      if (!stations[idx]) return;

      const text = (ta ? ta.value : "") || "";
      const dateStr = (planDate && planDate.value) ? planDate.value : "";
      const parsed = parseTidePaste(text, dateStr);

      if (!parsed.ok){
        alert(parsed.message || "Couldn't find HW/LW times in that text. Try pasting a different export.");
        return;
      }

      stations[idx].hw1 = parsed.hw[0] || "";
      stations[idx].hw2 = parsed.hw[1] || "";
      stations[idx].lw1 = parsed.lw[0] || "";
      stations[idx].lw2 = parsed.lw[1] || "";
      stations[idx].hw1h = (parsed.hwH && parsed.hwH[0]) ? parsed.hwH[0] : "";
      stations[idx].hw2h = (parsed.hwH && parsed.hwH[1]) ? parsed.hwH[1] : "";
      stations[idx].lw1h = (parsed.lwH && parsed.lwH[0]) ? parsed.lwH[0] : "";
      stations[idx].lw2h = (parsed.lwH && parsed.lwH[1]) ? parsed.lwH[1] : "";
      stations[idx].events = parsed.events || [];

      // If the paste contains a French Coef and the plan field is empty, populate it.
      try {
        const coeffField = document.getElementById("planTidalCoeff");
        if (coeffField && parsed.coeff && !(coeffField.value || "").trim()) {
          coeffField.value = parsed.coeff;
        }
      } catch (e) {}
      stations[idx].source = parsed.source || "paste";
      stations[idx].raw = parsed.raw || text;

      p.plan.tideStations = stations;
      savePassages();
      renderTideStations(p);
      close();
    });
  }
}

function parseTidePaste(text, isoDate){
  // Parses Imray Tide Planner "Day Table" copy/paste.
  // Example lines:
  // ▲  03:20 3.2m
  // ▼  06:50 0.9m
  // Coef 87, 82  (8.0m)
  const raw = (text || "").replace(/\r/g, "");
  if (!raw.trim()) return { ok:false, message:"Nothing pasted." };

  // Optional: try to isolate the block for the plan date (best effort)
  let block = raw;
  if (isoDate){
    const d = new Date(isoDate + "T00:00:00Z");
    if (!isNaN(d)){
      const day2 = String(d.getUTCDate()).padStart(2,"0");
      const monShort = d.toLocaleString("en-GB",{month:"short", timeZone:"UTC"});
      const monLong  = d.toLocaleString("en-GB",{month:"long", timeZone:"UTC"});
      const yr = String(d.getUTCFullYear());
      const re = new RegExp(`(?:^|\\n).*\\b${day2}\\s+(?:${monShort}|${monLong})\\s+${yr}\\b[\\s\\S]*?(?=\\n\\s*\\w+\\,\\s*\\d{2}\\s+(?:${monShort}|${monLong})\\s+\\d{4}\b|$)`, "i");
      const m = raw.match(re);
      if (m && m[0]) block = m[0];
    }
  }

  const events = [];
  const lineRe = /([▲▼])\s*([0-2]?\d:[0-5]\d)\s*([0-9]+(?:[\.,][0-9]+)?)\s*m/gi;
  let mm;
  while((mm = lineRe.exec(block)) !== null){
    const sym = mm[1];
    const time = mm[2];
    const height = parseFloat(String(mm[3]).replace(',', '.'));
    events.push({ type: sym === "▲" ? "HW" : "LW", time, height, symbol: sym });
  }

  if (!events.length){
    return { ok:false, message:"Couldn't find ▲/▼ tide lines with time + height. Make sure you copied the Day Table." };
  }

  // Coefficient (French)
  let coeff = "";
  const cm = block.match(/\bCoef\s+([0-9]{1,3}(?:\s*,\s*[0-9]{1,3})*)/i);
  if (cm && cm[1]) coeff = cm[1].replace(/\s+/g," ").trim();

  // Normalise + sort by time
  events.sort((a,b) => (a.time > b.time ? 1 : (a.time < b.time ? -1 : 0)));

  // Also provide first two HW + first two LW times/heights for convenience fields
  const hwEv = events.filter(e => e.type==="HW").slice(0,2);
  const lwEv = events.filter(e => e.type==="LW").slice(0,2);
  const hw = hwEv.map(e => e.time);
  const lw = lwEv.map(e => e.time);
  const hwH = hwEv.map(e => (typeof e.height === "number" ? String(e.height) : ""));
  const lwH = lwEv.map(e => (typeof e.height === "number" ? String(e.height) : ""));

  return { ok:true, events, hw, lw, hwH, lwH, coeff, source:"imray", raw };
}




// --- Storage helpers -----------------------------------------------

function loadPassages() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    passages = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed to load passages", e);
    passages = [];
  }
}

function savePassages() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(passages));
  } catch (e) {
    console.error("Failed to save passages", e);
  }
}

function loadPorts() {
  try {
    const raw = localStorage.getItem(PORTS_KEY);
    if (!raw) {
      knownPorts = [];
      recentPorts = [];
      return;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      knownPorts = parsed;
      recentPorts = [];
    } else if (parsed && typeof parsed === "object") {
      knownPorts = Array.isArray(parsed.all) ? parsed.all : [];
      recentPorts = Array.isArray(parsed.recent) ? parsed.recent : [];
    } else {
      knownPorts = [];
      recentPorts = [];
    }
  } catch {
    knownPorts = [];
    recentPorts = [];
  }

  // defensive cleanup (prevents single-letter junk entries)
  try{ cleanPortsInPlace(); }catch{}
}

function savePorts() {
  try {
    const payload = { all: knownPorts, recent: recentPorts };
    localStorage.setItem(PORTS_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn("Failed to save ports", e);
  }
}

function isLikelyRealPortName(name){
  const n = (name || "").toString().trim();
  if (!n) return false;
  // Avoid accidental fragments created while typing (e.g. "C", "Ca", "Car")
  if (n.length < 2) return false;
  if (/^[A-Za-z]$/.test(n)) return false;

  // Must contain at least 2 letters somewhere
  const letters = (n.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  if (letters < 2) return false;

  // Require a "proper" looking name:
  // - 4+ chars, OR
  // - contains a separator (space/hyphen/apostrophe), OR
  // - common short prefix like "St" (for St Malo, St Vaast, etc.)
  const hasSep = /[\s\-’'\.]/.test(n);
  const isSt = /^st\b/i.test(n);
  if (n.length < 4 && !hasSep && !isSt) return false;

  // Reject obvious road/address fragments that sometimes appear in geocoder results.
  const roadish = /\b(road|street|drive|lane|avenue|close|way|place|court|terrace)\b/i;
  const maritime = /\b(port|harbour|harbor|marina|quay|dock|pier)\b/i;
  if (roadish.test(n) && !maritime.test(n)) return false;

  return true;
}

function cleanPortsInPlace(){
  // Drop junk like single letters that can get saved by mistake.
  knownPorts = (knownPorts || []).filter(p => isLikelyRealPortName(portName(p)));
  recentPorts = (recentPorts || []).filter(p => isLikelyRealPortName(p));
}

function rememberPort(name) {
  const trimmed = (name || "").trim();
  if (!isLikelyRealPortName(trimmed)) return;

  // Only add to MRU if the port already exists in the saved list.
  // New ports must be created via the coordinate-confirmation flow.
  const existing = findPortItemByName(trimmed);
  if (!existing) return;

  // Update MRU list (most recent first)
  recentPorts = recentPorts.filter(p => p !== trimmed);
  recentPorts.unshift(trimmed);
  if (recentPorts.length > PORTS_RECENT_LIMIT) recentPorts.length = PORTS_RECENT_LIMIT;

  cleanPortsInPlace();
  savePorts();
  refreshPortUI();
}

// --- Small helpers -------------------------------------------------

// --- Coordinate formatting/parsing + sanity checks (CL-073) --------
function formatDMM(lat, lon){
  function one(val, isLat){
    const hemi = isLat ? (val>=0 ? "N" : "S") : (val>=0 ? "E" : "W");
    const a = Math.abs(val);
    const deg = Math.floor(a);
    const min = (a - deg) * 60;
    // 3 decimals on minutes
    return `${deg}°${min.toFixed(3)}'${hemi}`;
  }
  if (isNaN(lat) || isNaN(lon)) return "";
  return one(lat,true) + "  " + one(lon,false);
}

function parseCoordPart(s, isLat){
  if (!s) return NaN;
  const t = String(s).trim().toUpperCase();
  // decimal
  if (/^-?\d+(\.\d+)?$/.test(t)) return parseFloat(t);

  // DMM forms like 50°45.123'N or 50 45.123 N
  const m = t.match(/^(\d{1,3})\s*(?:°|\s)\s*(\d{1,2}(?:\.\d+)?)\s*(?:'|\s)?\s*([NSEW])$/);
  if (!m) return NaN;
  const deg = parseInt(m[1],10);
  const mins = parseFloat(m[2]);
  const hemi = m[3];
  let val = deg + (mins/60);
  if (hemi === "S" || hemi === "W") val *= -1;
  // basic range sanity
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

// Haversine distance in km
function distanceKm(lat1, lon1, lat2, lon2){
  const R = 6371;
  const rad = Math.PI/180;
  const dLat = (lat2-lat1)*rad;
  const dLon = (lon2-lon1)*rad;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

// UK-centric sanity check for STEELER usage: reject lookups > 1500km from Solent-ish default.
function saneForSteeler(lat, lon){
  const refLat = 50.76;   // Lymington-ish
  const refLon = -1.54;
  const km = distanceKm(refLat, refLon, lat, lon);
  return km <= 1500; // generous: covers UK + near continent
}

// --- Port coordinate helpers (offline-first) -----------------------------

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

function getEasyTidePortIdForName(name){
  const n = (name || "").trim();
  if (!n) return "";
  const item = knownPorts.find(p => portName(p) === n);
  if (item && typeof item === "object" && item.tideId) return String(item.tideId);
  return "";
}

function setEasyTidePortIdForName(name, tideId){
  const n = (name || "").trim();
  if (!n) return;
  upsertPortItemExtended(n, null, null, tideId);
  savePorts();
}

function getOrPromptEasyTidePortId(name){
  const existing = getEasyTidePortIdForName(name);
  if (existing) return existing;
  const n = (name || "").trim();
  if (!n) return "";
  const entered = prompt("EasyTide PortID for \"" + n + "\" (from the EasyTide URL, e.g. PortID=0062). Leave blank to cancel.");
  if (!entered) return "";
  setEasyTidePortIdForName(n, entered.trim());
  return entered.trim();
}

function getPortCoords(name){
  const q = normalisePortQuery(name);
  if (!q) return null;

  // 1) exact match against stored knownPorts (objects only)
  for (const p of (knownPorts || [])){
    if (p && typeof p === "object" && p.lat != null && p.lon != null){
      const pn = normalisePortQuery(p.name || "");
      if (pn && pn === q){
        return { name: p.name || name, lat: Number(p.lat), lon: Number(p.lon) };
      }
    }
  }

  // 2) offline baked-in UK/Channel micro-database (marine-sane only)
  const OFFLINE_PORTS = {
    "lymington": {lat:50.758, lon:-1.540},
    "cowes": {lat:50.763, lon:-1.297},
    "yarmouth": {lat:50.705, lon:-1.498},
    "portsmouth": {lat:50.802, lon:-1.109},
    "gosport": {lat:50.795, lon:-1.125},
    "port solent": {lat:50.845, lon:-1.138},
    "poole": {lat:50.714, lon:-1.985},
    "weymouth": {lat:50.613, lon:-2.455},
    "dartmouth": {lat:50.351, lon:-3.579},
    "salcombe": {lat:50.237, lon:-3.769},
    "plymouth": {lat:50.366, lon:-4.143},
    "falmouth": {lat:50.155, lon:-5.073},
    "fowey": {lat:50.336, lon:-4.638},
    "padstow": {lat:50.544, lon:-4.936},
    "st vaast": {lat:49.590, lon:-1.267},
    "cherbourg": {lat:49.642, lon:-1.622},
    "st helier": {lat:49.183, lon:-2.105},
    "st malo": {lat:48.649, lon:-2.025},
    // Northern / Western France (handy for Seine→La Rochelle season)
    "le havre": {lat:49.494, lon:0.107},
    "honfleur": {lat:49.419, lon:0.232},
    "dieppe": {lat:49.925, lon:1.078},
    "fecamp": {lat:49.757, lon:0.374},
    "granville": {lat:48.839, lon:-1.596},
    "roscoff": {lat:48.724, lon:-3.984},
    "brest": {lat:48.390, lon:-4.487},
    "concarneau": {lat:47.875, lon:-3.917},
    "lorient": {lat:47.748, lon:-3.366},
    "les sables d'olonne": {lat:46.496, lon:-1.794},
    "la rochelle": {lat:46.155, lon:-1.151},
    "la rochelle-pallice": {lat:46.159, lon:-1.223},
    "dunkerque": {lat:51.049, lon:2.377},
    "calais": {lat:50.958, lon:1.851},
    "deauville": {lat:49.363, lon:0.078},
    "brighton": {lat:50.820, lon:-0.142},
    "newhaven": {lat:50.793, lon:0.055},
    "eastbourne": {lat:50.770, lon:0.293},
    "chichester": {lat:50.814, lon:-0.876},
    "langstone": {lat:50.824, lon:-1.012}
  };

  if (OFFLINE_PORTS[q]) return { name, lat: OFFLINE_PORTS[q].lat, lon: OFFLINE_PORTS[q].lon };

  // 3) fuzzy: allow prefix match for e.g. "Chichester Harbour"
  const keys = Object.keys(OFFLINE_PORTS);
  const hit = keys.find(k => q === k || q.startsWith(k + " ") || k.startsWith(q + " "));
  if (hit) return { name, lat: OFFLINE_PORTS[hit].lat, lon: OFFLINE_PORTS[hit].lon };

  return null;
}

// --- Sunrise / sunset calculation (NOAA approximation, offline) ----------

function parseISODate(iso){
  // expects YYYY-MM-DD from <input type="date">
  const m = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(iso || "");
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (!y || !mo || !d) return null;
  return { y, mo, d };
}

function dayOfYear(y, mo, d){
  const dt = new Date(Date.UTC(y, mo-1, d));
  const start = new Date(Date.UTC(y, 0, 1));
  return Math.floor((dt - start) / 86400000) + 1;
}

function degToRad(x){ return x * Math.PI / 180; }
function radToDeg(x){ return x * 180 / Math.PI; }

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
  try{
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit", minute: "2-digit",
      hour12: false,
      timeZone: "Europe/London"
    }).format(dateUtc);
  }catch{
    // fallback: local
    return dateUtc.toLocaleTimeString("en-GB", {hour:"2-digit", minute:"2-digit", hour12:false});
  }
}

function calcSunTimes(isoDate, lat, lon){
  const p = parseISODate(isoDate);
  if (!p) return null;
  const riseMin = calcSunTimeUtcMinutes(true, p.y, p.mo, p.d, lat, lon);
  const setMin  = calcSunTimeUtcMinutes(false, p.y, p.mo, p.d, lat, lon);
  if (riseMin == null || setMin == null) return null;

  const riseUtc = new Date(Date.UTC(p.y, p.mo-1, p.d, 0, 0, 0) + riseMin*60000);
  const setUtc  = new Date(Date.UTC(p.y, p.mo-1, p.d, 0, 0, 0) + setMin*60000);

  return {
    sunrise: formatTimeEuropeLondon(riseUtc),
    sunset:  formatTimeEuropeLondon(setUtc)
  };
}




function getCurrentPassage() {
  return passages.find(p => p.id === currentPassageId) || null;
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function quote(value) {
  if (value == null) return '""';
  const s = String(value).replace(/"/g, '""');
  return `"${s}"`;
}

function timeOnlyFromIso(iso) {
  if (!iso || iso.length < 16) return iso || "";
  return iso.slice(11, 16);
}

function switchToTab(tabId) {
  closePortsManagerModal();

  tabButtons.forEach(b => b.classList.toggle("active", b.dataset.tab === tabId));
  tabs.forEach(t => t.classList.toggle("active", t.id === tabId));
}

// Position formatting helpers: decimal degrees -> dºmm.mmm'H
function formatLatFromDecimal(decimal) {
  if (isNaN(decimal)) return "";
  const hemi = decimal >= 0 ? "N" : "S";
  const dAbs = Math.abs(decimal);
  const deg = Math.floor(dAbs);
  const minutes = (dAbs - deg) * 60;
  const minutesStr = minutes.toFixed(3).padStart(6, "0");
  return `${deg}º${minutesStr}'${hemi}`;
}
function formatLonFromDecimal(decimal) {
  if (isNaN(decimal)) return "";
  const hemi = decimal >= 0 ? "E" : "W";
  const dAbs = Math.abs(decimal);
  const deg = Math.floor(dAbs);
  const minutes = (dAbs - deg) * 60;
  const minutesStr = minutes.toFixed(3).padStart(6, "0");
  return `${deg}º${minutesStr}'${hemi}`;
}
function parseAndFormatPositionInput(val, currentLat, currentLon) {
  if (!val) return { lat: "", lon: "" };

  if (/[º°NnSsEeWw]/.test(val)) {
    const parts = val.split(",").map(s => s.trim());
    return { lat: parts[0] || currentLat || "", lon: parts[1] || currentLon || "" };
  }

  const parts = val.split(",").map(s => s.trim());
  const latNum = parseFloat(parts[0]);
  const lonNum = parseFloat(parts[1]);
  if (isNaN(latNum) || isNaN(lonNum)) return { lat: val, lon: currentLon || "" };

  return { lat: formatLatFromDecimal(latNum), lon: formatLonFromDecimal(lonNum) };
}

function isLocalDestination(val) {
  const s = (val || "").trim().toLowerCase();
  return !s || s === "local";
}

// --- DOM references ------------------------------------------------

const headerPassageMain = document.getElementById("headerPassageMain");
const headerSunrise     = document.getElementById("headerSunrise");
const headerCrew        = document.getElementById("headerCrew");
const themeToggleBtn    = document.getElementById("themeToggleBtn");

const tabButtons = document.querySelectorAll(".tab-btn");
const tabs       = document.querySelectorAll(".tab");

const homeNewPassageBtn = document.getElementById("homeNewPassageBtn");
const homePassageList   = document.getElementById("homePassageList");

const exportBackupBtn = document.getElementById("exportBackupBtn");
const importBackupBtn = document.getElementById("importBackupBtn");
const importFileInput = document.getElementById("importFileInput");

const planForm = document.getElementById("planForm");
const planDate = document.getElementById("planDate");
const planFrom = document.getElementById("planFrom");
const planTo   = document.getElementById("planTo");
const planVessel = document.getElementById("planVessel");
const planSkipper = document.getElementById("planSkipper");
const planCrew = document.getElementById("planCrew");
const planSunriseSet = document.getElementById("planSunriseSet");
const planTidalCoeff = document.getElementById("planTidalCoeff");
const planCurrents = document.getElementById("planCurrents");
const planWeather = document.getElementById("planWeather");
const btnFetchWeather = document.getElementById("btnFetchWeather");
const btnFetchWeatherFR = document.getElementById("btnFetchWeatherFR");
const weatherFetchStatus = document.getElementById("weatherFetchStatus");
const planComms = document.getElementById("planComms");
const tideStationsContainer = document.getElementById("tideStationsContainer");
const addTideStationBtn = document.getElementById("addTideStationBtn");
const dailySummariesContainer = document.getElementById("dailySummariesContainer");
const addDailySummaryBtn = document.getElementById("addDailySummaryBtn");

const addEntryBtn = document.getElementById("addEntryBtn");
const logEntriesContainer = document.getElementById("logEntriesContainer");
const logEmptyMessage = document.getElementById("logEmptyMessage");
const planSummaryPanel = document.getElementById("planSummaryPanel");
const logLayout = document.getElementById("logLayout");
const splitViewBtn = document.getElementById("splitViewBtn");
const expandPlanBtn = document.getElementById("expandPlanBtn");
const expandLogBtn = document.getElementById("expandLogBtn");
const engineStartBtn = document.getElementById("engineStartBtn");
const slipLinesBtn = document.getElementById("slipLinesBtn");
const dockLinesBtn = document.getElementById("dockLinesBtn");
const shutdownBtn = document.getElementById("shutdownBtn");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const logSummaryPanel = document.getElementById("logSummaryPanel");

const modalOverlay = document.getElementById("modalOverlay");
const modalTitle   = document.getElementById("modalTitle");
const modalBody    = document.getElementById("modalBody");
const modalCancelBtn = document.getElementById("modalCancelBtn");
const modalOkBtn     = document.getElementById("modalOkBtn");

// --- Theme handling -----------------------------------------------

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  if (themeToggleBtn) themeToggleBtn.textContent = theme === "night" ? "Day" : "Night";
}

themeToggleBtn?.addEventListener("click", () => {
  const current = document.body.dataset.theme || "day";
  applyTheme(current === "night" ? "day" : "night");
});

// --- Tabs ----------------------------------------------------------

tabButtons.forEach(btn => {
  btn.addEventListener("click", () => switchToTab(btn.dataset.tab));
});

// --- Header info ---------------------------------------------------

function updatePassageHeader() {
  const p = getCurrentPassage();
  if (!p) {
    headerPassageMain.textContent = "";
    headerSunrise.textContent = "";
    headerCrew.textContent = "";
    return;
  }

  const date = p.plan.date || p.createdAt.slice(0, 10);
  const from = p.plan.from || "?";
  const to   = p.plan.to   || "?";

  headerPassageMain.textContent = `${date} – ${from} → ${to}`;
  headerSunrise.textContent = p.plan.sunriseSet ? `Sunrise–Set: ${p.plan.sunriseSet}` : "";

  const crewParts = [];
  if (p.plan.skipper) crewParts.push(`Skipper: ${p.plan.skipper}`);
  if (p.plan.crew)    crewParts.push(`Crew: ${p.plan.crew}`);
  headerCrew.textContent = crewParts.join("  |  ");
}



async function ensurePortCoords(name, opts = {}){
  const n = (name || "").trim();
  if(!n) return null;

  // already stored?
  const existing = getPortCoords(n);
  if (existing) return existing;

  // try online lookup (if available)
  try{
    if (!navigator.onLine) return null;

    // Bias toward UK / Channel / N France (down to La Rochelle)
    const q = encodeURIComponent(normalisePortQuery(n) + " harbour");
    const viewbox = "-6.8,53.5,3.5,45.5"; // left,top,right,bottom
    const base = "https://nominatim.openstreetmap.org/search";
    const url = `${base}?format=jsonv2&limit=3&countrycodes=gb,fr,gg,je&viewbox=${viewbox}&bounded=1&q=${q}`;
    const res = await fetch(url, {
      headers: {
        "Accept":"application/json",
        "Accept-Language":"en"
      }
    });
    if(!res.ok) return null;
    const data = await res.json();
    if(!data || !data.length) return null;

    // pick first sane result
    let lat = NaN, lon = NaN;
    for (const item of data){
        if (!isMarineSaneNominatimResult(item)) continue;
        const la = parseFloat(item.lat);
      const lo = parseFloat(item.lon);
      if (!isNaN(la) && !isNaN(lo) && saneForSteeler(la, lo)){
        lat = la; lon = lo;
        break;
      }
    }
    if(isNaN(lat) || isNaN(lon)) return null;

    const shouldSave = (opts.save !== false);
    const wantConfirm = !!opts.confirm;

    // If confirming, confirm whenever the port either doesn't exist yet OR exists only as a name (no coords).
    const existingItem = findPortItemByName(n);
    const existingHasCoords = portHasCoords(existingItem);
    const needsConfirm = wantConfirm && (!existingItem || !existingHasCoords);

    if (shouldSave){
      if (needsConfirm){
        const dmm = formatDMM(lat, lon);
        const ok = confirm(`Save coordinates for "${n}"?\n\nLat/Lon: ${lat.toFixed(6)}, ${lon.toFixed(6)}\n${dmm}`);
        if (ok){
          upsertPortItem(n, lat, lon);
          cleanPortsInPlace();
          savePorts();
        }
      } else {
        upsertPortItem(n, lat, lon);
        cleanPortsInPlace();
        savePorts();
      }
    }
    return {name:n, lat, lon};
  }catch(e){
    console.warn("Port lookup failed:", e);
    return null;
  }
}

// --- New-port flow: lookup + user confirmation before saving ---------

function normalisePortDisplay(name){
  return (name || "").toString().trim().replace(/\s+/g, " ");
}


function isMarineSaneNominatimResult(item){
  if (!item) return false;

  const cls = String(item.class || item.category || "").toLowerCase();
  const typ = String(item.type || "").toLowerCase();
  const addrt = String(item.addresstype || "").toLowerCase();
  const dn = String(item.display_name || "").toLowerCase();

  // Hard reject obvious roads/addresses unless explicitly maritime.
  const roadish = /(\broad\b|\bstreet\b|\bdrive\b|\blane\b|\bavenue\b|\bclose\b|\bway\b|\bplace\b|\bcourt\b|\bterrace\b)/i;
  const maritimeWord = /(harbour|harbor|marina|port|quay|dock|pier|jetty|mole|haven|anchorage|baie|anse|rade)/i;

  if ((cls === "highway" || addrt === "road" || addrt === "house" || addrt === "building") && !maritimeWord.test(dn)) {
    return false;
  }
  if (roadish.test(dn) && !maritimeWord.test(dn) && cls !== "place") {
    return false;
  }

  // Accept waterway/harbour/marina/port features.
  if (cls === "waterway") return true;
  if (maritimeWord.test(typ) || maritimeWord.test(dn)) return true;

  // Accept place results (town/village/hamlet) as a fallback for smaller ports,
  // but reject very generic address-y results.
  if (cls === "place" && /^(city|town|village|hamlet|suburb|island|locality)$/.test(typ || addrt)) return true;

  return false;
}

async function lookupPortCoordsOnline(name){
  const n = normalisePortDisplay(name);
  if (!n || !navigator.onLine) return null;

  const viewbox = "-6.8,53.5,3.5,45.5"; // UK + Channel + N France (down to La Rochelle)
  const base = "https://nominatim.openstreetmap.org/search";

  // Try a small set of increasingly relaxed marine-sane queries.
  const q0 = normalisePortQuery(n);
  const queries = [
    `${q0} harbour`,
    `${q0} port`,
    `port de ${q0}`,
    `${q0} marina`,
    `${q0}, france`,
    `${q0}, uk`,
    `${q0}, guernsey`,
    `${q0}, jersey`
  ].map(q => q.trim()).filter(Boolean);

  for (const q of queries){
    try{
      const url = `${base}?format=jsonv2&limit=5&countrycodes=gb,fr,gg,je&viewbox=${viewbox}&bounded=1&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        headers: { "Accept":"application/json", "Accept-Language":"en,fr" }
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!data || !data.length) continue;

      for (const item of data){
        const la = parseFloat(item.lat);
        const lo = parseFloat(item.lon);
        if (!isNaN(la) && !isNaN(lo) && saneForSteeler(la, lo)){
          return { lat: la, lon: lo, displayName: item.display_name || "" };
        }
      }
    }catch(e){
      // try next query
    }
  }

  return null;
}

function showPortConfirmModal({ name, lat, lon, displayName }){
  return new Promise((resolve) => {
    const n = normalisePortDisplay(name);
    const dmm = formatDMM(lat, lon);

    const safeDisplay = escapeHtml(displayName || "");
    const body = `
      <p><strong>${escapeHtml(n)}</strong> isn’t in your saved ports yet.</p>
      ${safeDisplay ? `<p class="muted" style="margin-top:6px">Match: ${safeDisplay}</p>` : ""}
      <div style="margin-top:10px; padding:10px; border:1px solid var(--line); border-radius:12px;">
        <div><strong>Lat/Lon</strong>: ${lat.toFixed(6)}, ${lon.toFixed(6)}</div>
        <div style="margin-top:4px">${escapeHtml(dmm)}</div>
      </div>
      <p style="margin-top:10px" class="muted">Save this as a port for future lookups?</p>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px">
        <button id="pcSave" class="btn">Save port</button>
        <button id="pcManual" class="btn">Enter manually</button>
        <button id="pcSkip" class="btn secondary">Not now</button>
      </div>
      <div id="pcManualWrap" class="hidden" style="margin-top:10px">
        <div style="display:flex; gap:8px; flex-wrap:wrap">
          <input id="pcLat" type="number" step="0.0001" inputmode="decimal" placeholder="Lat" style="flex:1; min-width:120px">
          <input id="pcLon" type="number" step="0.0001" inputmode="decimal" placeholder="Lon" style="flex:1; min-width:120px">
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px">
          <button id="pcManualSave" class="btn">Save coords</button>
          <button id="pcManualCancel" class="btn secondary">Cancel</button>
        </div>
        <p class="muted" style="margin-top:6px">Tip: decimal degrees (e.g. 49.710, -1.880).</p>
      </div>
    `;

    // Render into the existing modal chrome but hide default OK/Cancel.
    showModal({
      title: "Save port coordinates",
      bodyHtml: body,
      hideButtons: true,
      onOk: null
    });

    const finish = (result) => {
      // close + resolve
      modalOverlay.classList.add("hidden");
      modalBody.innerHTML = "";
      if (modalOkBtn) modalOkBtn.style.display = "";
      if (modalCancelBtn) modalCancelBtn.style.display = "";
      resolve(result);
    };

    const btnSave = document.getElementById("pcSave");
    const btnManual = document.getElementById("pcManual");
    const btnSkip = document.getElementById("pcSkip");
    const manualWrap = document.getElementById("pcManualWrap");
    const manualSave = document.getElementById("pcManualSave");
    const manualCancel = document.getElementById("pcManualCancel");

    btnSave?.addEventListener("click", () => finish({ action: "save", lat, lon }));
    btnSkip?.addEventListener("click", () => finish({ action: "skip" }));
    btnManual?.addEventListener("click", () => {
      manualWrap?.classList.remove("hidden");
    });
    manualCancel?.addEventListener("click", () => {
      manualWrap?.classList.add("hidden");
    });
    manualSave?.addEventListener("click", () => {
      const latIn = document.getElementById("pcLat")?.value;
      const lonIn = document.getElementById("pcLon")?.value;
      const parsed = parseLatLon(latIn, lonIn);
      if (!parsed){
        alert("Please enter valid decimal lat and lon.");
        return;
      }
      if (!saneForSteeler(parsed.lat, parsed.lon)){
        alert("Those coordinates look outside your normal UK/Channel/N France range.");
        return;
      }
      finish({ action: "save", lat: parsed.lat, lon: parsed.lon });
    });

    // Clicking outside should behave like skip.
    document.getElementById("modalOverlay")?.addEventListener("click", (e) => {
      if (e.target === modalOverlay) finish({ action: "skip" });
    }, { once: true });
  });
}

function showPortNoMatchModal(name){
  return new Promise((resolve) => {
    const n = normalisePortDisplay(name);
    const body = `
      <p>Couldn’t find a marine-sane match for <strong>${escapeHtml(n)}</strong>.</p>
      <p class="muted" style="margin-top:6px">You can enter coordinates manually, or skip for now (the passage can still be saved).</p>
      <div style="margin-top:10px; padding:10px; border:1px solid var(--line); border-radius:12px;">
        <div style="display:flex; gap:8px; flex-wrap:wrap">
          <input id="pnmLat" type="number" step="0.0001" inputmode="decimal" placeholder="Lat" style="flex:1; min-width:120px">
          <input id="pnmLon" type="number" step="0.0001" inputmode="decimal" placeholder="Lon" style="flex:1; min-width:120px">
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px">
          <button id="pnmSave" class="btn">Save coords</button>
          <button id="pnmSkip" class="btn secondary">Not now</button>
        </div>
        <p class="muted" style="margin-top:6px">Tip: decimal degrees (e.g. 49.710, -1.880).</p>
      </div>
    `;

    showModal({ title: "Add port manually", bodyHtml: body, hideButtons: true, onOk: null });

    const finish = (result) => {
      modalOverlay.classList.add("hidden");
      modalBody.innerHTML = "";
      if (modalOkBtn) modalOkBtn.style.display = "";
      if (modalCancelBtn) modalCancelBtn.style.display = "";
      resolve(result);
    };

    document.getElementById("pnmSkip")?.addEventListener("click", () => finish({ action: "skip" }));
    document.getElementById("pnmSave")?.addEventListener("click", () => {
      const latIn = document.getElementById("pnmLat")?.value;
      const lonIn = document.getElementById("pnmLon")?.value;
      const parsed = parseLatLon(latIn, lonIn);
      if (!parsed){
        alert("Please enter valid decimal lat and lon.");
        return;
      }
      if (!saneForSteeler(parsed.lat, parsed.lon)){
        alert("Those coordinates look outside your normal UK/Channel/N France range.");
        return;
      }
      finish({ action: "save", lat: parsed.lat, lon: parsed.lon });
    });

    document.getElementById("modalOverlay")?.addEventListener("click", (e) => {
      if (e.target === modalOverlay) finish({ action: "skip" });
    }, { once: true });
  });
}

async function maybeSaveNewPort(name){
  const n = normalisePortDisplay(name);
  if (!isLikelyRealPortName(n)) return null;

  const existing = findPortItemByName(n);
  if (existing && portHasCoords(existing)) {
    rememberPort(n);
    return { name: n, lat: Number(existing.lat), lon: Number(existing.lon) };
  }

  // Lookup (online) to propose coordinates.
  const hit = await lookupPortCoordsOnline(n);
  if (!hit) {
    const manual = await showPortNoMatchModal(n);
    if (manual && manual.action === "save"){
      upsertPortItem(n, manual.lat, manual.lon);
      cleanPortsInPlace();
      savePorts();
      rememberPort(n);
      refreshPortUI();
      return { name: n, lat: manual.lat, lon: manual.lon };
    }
    return null;
  }

  const decision = await showPortConfirmModal({ name: n, lat: hit.lat, lon: hit.lon, displayName: hit.displayName });
  if (decision && decision.action === "save"){
    upsertPortItem(n, decision.lat, decision.lon);
    cleanPortsInPlace();
    savePorts();
    rememberPort(n);
    refreshPortUI();
    return { name: n, lat: decision.lat, lon: decision.lon };
  }

  return null;
}



async function autoComputeSunriseSetForCurrent(){
  const p = getCurrentPassage();
  if (!p) return;

  const date = (p.plan.date || planDate?.value || "").trim();
  const from = (p.plan.from || planFrom?.value || "").trim();
  const to   = (p.plan.to   || planTo?.value || "").trim();

  // Don't try to look anything up while the user is still typing fragments.
  if (!date || !isLikelyRealPortName(from)) return;

  // For auto-fill we *do not* save ports/coords (prevents "Ca", "Car" etc being stored).
  const origin = await ensurePortCoords(from, { save: false });
  const dest = (isLikelyRealPortName(to)
    ? (isLocalDestination(to) ? origin : await ensurePortCoords(to, { save: false }))
    : null);

  if (!origin) return;

  const sunOrigin = calcSunTimes(date, origin.lat, origin.lon);
  if (!sunOrigin) return;

  let sunset = sunOrigin.sunset;
  if (dest && dest !== origin){
    const sunDest = calcSunTimes(date, dest.lat, dest.lon);
    if (sunDest && sunDest.sunset) sunset = sunDest.sunset;
  }

  const val = `${sunOrigin.sunrise} / ${sunset}`;
  p.plan.sunriseSet = val;

  if (planSunriseSet) planSunriseSet.value = val;

  savePassages();
  updatePassageHeader();
  updatePlanSummaryPanel();
}


// --- Ports datalist -----------------------------------------------

function refreshPortUI() {
  // Hook for any UI elements that depend on the port list.
  // (Autocomplete + Manage Ports modal)
  renderPortsManagerList();
}

// --- Modal ---------------------------------------------------------

function showModal({ title, bodyHtml, onOk, onCancel, okText = "OK", cancelText = "Cancel", hideButtons = false }) {
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modalOverlay.classList.remove("hidden");

  // Button text + visibility
  if (modalOkBtn) modalOkBtn.textContent = okText;
  if (modalCancelBtn) modalCancelBtn.textContent = cancelText;
  if (modalOkBtn) modalOkBtn.style.display = hideButtons ? "none" : "";
  if (modalCancelBtn) modalCancelBtn.style.display = hideButtons ? "none" : "";

  const cleanup = () => {
    modalOverlay.classList.add("hidden");
    modalBody.innerHTML = "";
    modalOkBtn.onclick = null;
    modalCancelBtn.onclick = null;
    if (modalOkBtn) modalOkBtn.style.display = "";
    if (modalCancelBtn) modalCancelBtn.style.display = "";
  };

  modalCancelBtn.onclick = () => {
    onCancel?.();
    cleanup();
  };
  modalOkBtn.onclick = () => {
    const res = onOk?.();
    if (res !== false) cleanup();
  };
}

// --- Backup / Restore ----------------------------------------------

function exportBackup() {
  const payload = {
    format: "steeler-logbook-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      passages,
      knownPorts: { all: knownPorts, recent: recentPorts },
      theme: localStorage.getItem(THEME_KEY) || "day"
    }
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const filename = `STEELER-Logbook-backup-${y}${mo}${da}${hh}${mm}.json`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importBackupFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(reader.result);
      if (!obj || obj.format !== "steeler-logbook-backup" || !obj.data) {
        alert("That file doesn’t look like a STEELER Logbook backup.");
        return;
      }
      if (!Array.isArray(obj.data.passages) || !obj.data.knownPorts) {
        alert("Backup file is missing expected data.");
        return;
      }
      const ok = confirm("Restore backup? This will REPLACE the current logbook data on this device.");
      if (!ok) return;

      passages = obj.data.passages;

      // Support both legacy (array) and current (object with {all,recent}) port backup formats (CL-071)
      const portsPayload = obj.data.knownPorts;
      if (Array.isArray(portsPayload)) {
        knownPorts = portsPayload;
        recentPorts = portsPayload.slice(0, 6);
      } else {
        knownPorts = Array.isArray(portsPayload.all) ? portsPayload.all : [];
        recentPorts = Array.isArray(portsPayload.recent) ? portsPayload.recent : [];
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(passages));
      localStorage.setItem(PORTS_KEY, JSON.stringify({ all: knownPorts, recent: recentPorts }));

      applyTheme(obj.data.theme || "day");

      refreshHomePassageList();
      currentPassageId = passages[0]?.id || null;
      loadPassageIntoUI();
      alert("Backup restored successfully.");
    } catch (e) {
      console.error(e);
      alert("Could not restore that file (invalid JSON).");
    }
  };
  reader.readAsText(file);
}


exportBackupBtn?.addEventListener("click", exportBackup);
importBackupBtn?.addEventListener("click", () => importFileInput?.click());
importFileInput?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  importBackupFile(file);
  e.target.value = "";
});

// --- HOME: passage list + delete + swipe ---------------------------

function deletePassageById(id) {
  const idx = passages.findIndex(p => p.id === id);
  if (idx < 0) return;
  const p = passages[idx];
  const label = `${p.plan.date || p.createdAt.slice(0,10)} – ${(p.plan.from||"?")} → ${(p.plan.to||"?")}`;
  const ok = confirm(`Delete this passage?\n\n${label}\n\nThis cannot be undone (unless you’ve got a backup).`);
  if (!ok) return;

  passages.splice(idx, 1);
  savePassages();

  if (currentPassageId === id) currentPassageId = passages[0]?.id || null;

  refreshHomePassageList();
  loadPassageIntoUI();
}

function attachSwipeToCard(card, passageId) {
  let startX = 0;
  card.addEventListener("touchstart", (e) => { startX = e.changedTouches[0].screenX; }, { passive: true });
  card.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].screenX - startX;
    if (dx < -90) deletePassageById(passageId);
  }, { passive: true });
}

function refreshHomePassageList() {
  homePassageList.innerHTML = "";

  if (passages.length === 0) {
    const p = document.createElement("p");
    p.textContent = "No passages yet. Tap “+ New Passage” to get started.";
    p.style.opacity = "0.8";
    p.style.fontSize = "0.85rem";
    homePassageList.appendChild(p);
    return;
  }

  passages.forEach(passage => {
    const card = document.createElement("div");
    card.className = "passage-card";

    const date = passage.plan.date || passage.createdAt.slice(0, 10);
    const from = passage.plan.from || "?";
    const to = passage.plan.to || "?";
    const status = passage.finish?.shutdownLogged ? "Completed" : "In progress";
    const entriesCount = passage.entries?.length || 0;

    const left = document.createElement("div");
    left.className = "passage-card-left";
    left.innerHTML = `
      <div class="passage-card-title">${escapeHtml(`${date} – ${from} → ${to}`)}</div>
      <div class="passage-card-meta"><span>${entriesCount} entries</span><span>${status}</span></div>
    `;

    const actions = document.createElement("div");
    actions.className = "passage-card-actions";

    const del = document.createElement("button");
    del.className = "passage-delete-btn";
    del.textContent = "Delete";
    del.addEventListener("click", (e) => { e.stopPropagation(); deletePassageById(passage.id); });

    actions.appendChild(del);
    card.appendChild(left);
    card.appendChild(actions);

    card.addEventListener("click", () => {
      currentPassageId = passage.id;
      loadPassageIntoUI();
      switchToTab("logTab");
    });

    attachSwipeToCard(card, passage.id);
    homePassageList.appendChild(card);
  });
}

// --- Layout mode controls (Log tab) -------------------------------

function setActiveViewButton(btn) {
  document.querySelectorAll(".view-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}

function setLogLayoutMode(mode, btn) {
  logLayout.classList.remove("split", "plan-only", "log-only");
  logLayout.classList.add(mode === "plan-only" ? "plan-only" : mode === "log-only" ? "log-only" : "split");
  if (btn) setActiveViewButton(btn);
}

splitViewBtn.addEventListener("click", () => setLogLayoutMode("split", splitViewBtn));
expandPlanBtn.addEventListener("click", () => setLogLayoutMode("plan-only", expandPlanBtn));
expandLogBtn.addEventListener("click", () => setLogLayoutMode("log-only", expandLogBtn));

// --- Plan tab logic -----------------------------------------------

function ensureFlags(p) {
  if (!p.flags) p.flags = { engineStart: false, slip: false, dock: false };
  if (typeof p.flags.engineStart !== "boolean") p.flags.engineStart = false;
  if (typeof p.flags.slip !== "boolean") p.flags.slip = false;
  if (typeof p.flags.dock !== "boolean") p.flags.dock = false;
}

function ensureEntries(p){
  if(!p) return;
  if(!Array.isArray(p.entries)) p.entries = [];
}

// Simple unique id generator (used for log entries, etc.)
function newId(prefix = 'e') {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}




// Some features (e.g. Shutdown / end-of-passage) store state in p.finish.
// Manual log entries shouldn't fail just because finish hasn't been initialised.
function ensureFinish(p) {
  if (!p.finish) p.finish = {};
  if (typeof p.finish.shutdownLogged !== "boolean") p.finish.shutdownLogged = false;
}

function ensureAutoTideStations(p) {
  if (!p) return;
  if (!p.plan.tideStations) p.plan.tideStations = [];

  const origin = (p.plan.from || "").trim();
  const dest = (p.plan.to || "").trim();

  const want = [];
  if (origin) want.push(origin);
  if (dest && dest !== origin) want.push(dest);

  if (want.length === 0) return;

  const stations = Array.isArray(p.plan.tideStations) ? p.plan.tideStations : [];
  const now = Date.now();

  const makeBlank = (name, role, i) => ({
    id: `ts_${now}_${role}_${i}`,
    name,
    role,
    hw1: "", hw2: "", lw1: "", lw2: "",
    hw1h: "", hw2h: "", lw1h: "", lw2h: "",
    events: [],
    raw: "",
    source: "",
    auto: true
  });

  // Keep the user's extra (manual) stations exactly as-is and in order.
  // IMPORTANT: do not promote old "auto" stations into extras; otherwise typing in Origin/Dest
  // would accumulate partial-name stations ("L", "Ly", "Lym"...).
  const extras = stations.filter(st => st && st.auto !== true);

  // Reuse existing auto stations by ROLE (origin/dest), not by name.
  let originSt = stations.find(st => st && st.auto === true && st.role === "origin");
  let destSt   = stations.find(st => st && st.auto === true && st.role === "dest");

  // Backward-compat: if role wasn't stored, treat the first two auto stations as origin/dest.
  if (!originSt || !destSt) {
    const legacyAutos = stations.filter(st => st && st.auto === true);
    if (!originSt && legacyAutos[0]) originSt = { ...legacyAutos[0], role: "origin" };
    if (!destSt && legacyAutos[1])   destSt   = { ...legacyAutos[1], role: "dest" };
  }

  if (!originSt) originSt = makeBlank(origin, "origin", 0);
  if (!destSt)   destSt   = makeBlank(dest, "dest", 1);

  // Update names to match current Plan fields.
  originSt = { ...originSt, name: origin, role: "origin", auto: true };
  destSt   = { ...destSt,   name: dest,   role: "dest",   auto: true };

  // Ensure expected fields exist
  [originSt, destSt].forEach(st => {
    st.id = st.id || `ts_${now}_${st.role}`;
    st.hw1 = st.hw1 || ""; st.hw2 = st.hw2 || "";
    st.lw1 = st.lw1 || ""; st.lw2 = st.lw2 || "";
    st.hw1h = st.hw1h || ""; st.hw2h = st.hw2h || "";
    st.lw1h = st.lw1h || ""; st.lw2h = st.lw2h || "";
    st.events = Array.isArray(st.events) ? st.events : [];
    st.raw = typeof st.raw === "string" ? st.raw : "";
    st.source = st.source || "";
  });

  // If origin/dest are same, keep only one auto station (origin)
  const same = dest && origin && dest.toLowerCase() === origin.toLowerCase();
  p.plan.tideStations = same ? [originSt, ...extras] : [originSt, destSt, ...extras];
}

function createPassage() {
  const id = "p_" + Date.now();
  const today = new Date().toISOString().slice(0, 10);

  const passage = {
    id,
    flags: { engineStart: false, slip: false, dock: false },
    plan: {
      date: today,
      from: "",
      to: "",
      vessel: "STEELER",
      skipper: "",
      crew: "",
      sunriseSet: "",
      tidalCoeff: "",
      tideStations: [],
      currents: "",
      weather: "",
      comms: "",
      engineHoursStart: "",
      fuelStartPercent: "",
      dailySummaries: [
        { id: "ds_" + Date.now(), date: today, fee: "", notes: "" }
      ]
    },
    entries: [],
    finish: {
      engineHoursEnd: "",
      fuelEndPercent: "",
      notes: "",
      shutdownLogged: false
    },
    createdAt: new Date().toISOString()
  };

  passages.unshift(passage);
  currentPassageId = id;
  savePassages();
  refreshHomePassageList();
  loadPassageIntoUI();
}

function loadPlanIntoForm(p) {
  planDate.value = p.plan.date || "";
  planFrom.value = p.plan.from || "";
  planTo.value   = p.plan.to   || "";
  planVessel.value = p.plan.vessel || "STEELER";
  planSkipper.value = p.plan.skipper || "";
  planCrew.value = p.plan.crew || "";
  planSunriseSet.value = p.plan.sunriseSet || "";
  planTidalCoeff.value = p.plan.tidalCoeff || "";
  planCurrents.value = p.plan.currents || "";
  planWeather.value = p.plan.weather || "";
  planComms.value = p.plan.comms || "";

  renderTideStations(p);
  renderDailySummaries(p);
}

function renderTideStations(p) {
  tideStationsContainer.innerHTML = "";
  const stations = p.plan.tideStations || [];
  stations.forEach((st, index) => {
    const row = document.createElement("div");
    row.className = "tide-station-row";
    row.dataset.index = index;
    row.dataset.auto = st.auto ? "true" : "false";
    row.dataset.id = st.id || "";

    // keep events around for backwards compatibility, but Plan inputs are the editable truth
    row.dataset.events = JSON.stringify(st.events || []);
    row.innerHTML = `
      <div class="row">
        <label>
          Tide station
          <input type="text" class="ts-name" value="${escapeHtml(st.name || "")}" list="portsList">
        </label>
        <button type="button" class="btn btn-secondary btn-small remove-tide-station">Remove</button>
      </div>
      <div class="row">
        <label>HW 1
          <div class="time-height">
            <input type="time" class="ts-hw1" value="${st.hw1 || ""}">
            <input type="number" step="0.1" inputmode="decimal" class="ts-hw1h" placeholder="m" value="${st.hw1h || ""}">
          </div>
        </label>
        <label>HW 2
          <div class="time-height">
            <input type="time" class="ts-hw2" value="${st.hw2 || ""}">
            <input type="number" step="0.1" inputmode="decimal" class="ts-hw2h" placeholder="m" value="${st.hw2h || ""}">
          </div>
        </label>
      </div>
      <div class="row">
        <label>LW 1
          <div class="time-height">
            <input type="time" class="ts-lw1" value="${st.lw1 || ""}">
            <input type="number" step="0.1" inputmode="decimal" class="ts-lw1h" placeholder="m" value="${st.lw1h || ""}">
          </div>
        </label>
        <label>LW 2
          <div class="time-height">
            <input type="time" class="ts-lw2" value="${st.lw2 || ""}">
            <input type="number" step="0.1" inputmode="decimal" class="ts-lw2h" placeholder="m" value="${st.lw2h || ""}">
          </div>
        </label>
      </div>
      <div class="row">
        <button type="button" class="btn btn-secondary btn-small move-up">↑</button>
        <button type="button" class="btn btn-secondary btn-small move-down">↓</button>
        <button type="button" class="btn btn-secondary btn-small ts-paste">Paste Imray</button>
      </div>
      <div class="hint ts-hint" style="margin-top:-0.25rem">Tip: in Imray Tide Planner, copy the Day Table then tap “Paste Imray”. We’ll extract tide times/heights (and Coef if present).</div>
    `;

    const nameInput = row.querySelector(".ts-name");
    nameInput.addEventListener("input", () => { row.dataset.auto = "false"; });

    row.querySelector(".remove-tide-station").addEventListener("click", () => {
      p.plan.tideStations = readTideStationsFromForm();
      p.plan.tideStations.splice(index, 1);
      renderTideStations(p);
    });

    row.querySelector(".move-up").addEventListener("click", () => moveTideStation(index, -1));
    row.querySelector(".move-down").addEventListener("click", () => moveTideStation(index, 1));

    const pasteBtn = row.querySelector(".ts-paste");
    if (pasteBtn){
      pasteBtn.addEventListener("click", () => {
        window.__tidePasteTargetIndex = index;
        if (window.__openTidePasteModal) window.__openTidePasteModal();
      });
    }
    tideStationsContainer.appendChild(row);
  });
}

function readTideStationsFromForm() {
  const stations = [];
  const rows = tideStationsContainer.querySelectorAll(".tide-station-row");
  rows.forEach(row => {
    const name = row.querySelector(".ts-name").value.trim();
    const hw1 = row.querySelector(".ts-hw1").value;
    const hw2 = row.querySelector(".ts-hw2").value;
    const lw1 = row.querySelector(".ts-lw1").value;
    const lw2 = row.querySelector(".ts-lw2").value;

    const hw1h = row.querySelector(".ts-hw1h").value;
    const hw2h = row.querySelector(".ts-hw2h").value;
    const lw1h = row.querySelector(".ts-lw1h").value;
    const lw2h = row.querySelector(".ts-lw2h").value;

    // Build a canonical list of events from the editable fields.
    const events = [];
    const pushEv = (type, time, heightStr) => {
      if (!time) return;
      const h = parseFloat(String(heightStr || "").replace(",", "."));
      events.push({ type, time, height: isNaN(h) ? null : h });
    };
    pushEv("HW", hw1, hw1h);
    pushEv("HW", hw2, hw2h);
    pushEv("LW", lw1, lw1h);
    pushEv("LW", lw2, lw2h);
    events.sort((a,b) => (a.time||"").localeCompare(b.time||""));

    stations.push({
      id: row.dataset.id || ("ts_" + Date.now() + "_" + Math.random().toString(36).slice(2)),
      name,
      hw1, hw2, lw1, lw2,
      hw1h, hw2h, lw1h, lw2h,
      events,
      auto: row.dataset.auto === "true"
    });
  });
  return stations;
}

function moveTideStation(index, delta) {
  const p = getCurrentPassage();
  if (!p) return;
  p.plan.tideStations = readTideStationsFromForm();
  const stations = p.plan.tideStations;
  const newIndex = index + delta;
  if (newIndex < 0 || newIndex >= stations.length) return;
  const [item] = stations.splice(index, 1);
  stations.splice(newIndex, 0, item);
  renderTideStations(p);
}

addTideStationBtn.addEventListener("click", () => {
  const p = getCurrentPassage();
  if (!p) return;
  p.plan.tideStations = readTideStationsFromForm();
  p.plan.tideStations.push({
    id: "ts_" + Date.now(),
    name: "",
    hw1: "", hw2: "", lw1: "", lw2: "",
    hw1h: "", hw2h: "", lw1h: "", lw2h: "",
    auto: false
  });
  renderTideStations(p);
});

function renderDailySummaries(p) {
  dailySummariesContainer.innerHTML = "";
  const days = p.plan.dailySummaries || [];
  days.forEach((d, index) => {
    const row = document.createElement("div");
    row.className = "daily-summary-row";
    row.dataset.index = index;

    row.innerHTML = `
      <div class="row ds-row">
        <label>
          Date
          <input type="date" class="ds-date" value="${d.date || ""}">
        </label>
        <label>
          Mooring fee
          <input type="text" class="ds-fee" value="${escapeHtml(d.fee || "")}" placeholder="e.g. £35.00">
        </label>
      </div>
      <label>
        Notes
        <textarea class="ds-notes" rows="2">${escapeHtml(d.notes || "")}</textarea>
      </label>
      <button type="button" class="btn btn-secondary btn-small remove-daily-summary" style="margin-top:0.3rem;">
        Remove day
      </button>
    `;

    row.querySelector(".remove-daily-summary").addEventListener("click", () => {
      p.plan.dailySummaries = readDailySummariesFromForm();
      p.plan.dailySummaries.splice(index, 1);
      renderDailySummaries(p);
    });

    dailySummariesContainer.appendChild(row);
  });
}

function readDailySummariesFromForm() {
  const days = [];
  const rows = dailySummariesContainer.querySelectorAll(".daily-summary-row");
  rows.forEach(row => {
    days.push({
      id: "ds_" + Date.now() + "_" + Math.random().toString(36).slice(2),
      date: row.querySelector(".ds-date").value,
      fee: row.querySelector(".ds-fee").value.trim(),
      notes: row.querySelector(".ds-notes").value.trim()
    });
  });
  return days;
}

addDailySummaryBtn.addEventListener("click", () => {
  const p = getCurrentPassage();
  if (!p) return;
  p.plan.dailySummaries = readDailySummariesFromForm();
  p.plan.dailySummaries.push({ id: "ds_" + Date.now(), date: "", fee: "", notes: "" });
  renderDailySummaries(p);
});

// Sync auto tide stations on input (not just change)
let tideSyncTimer = null;
function scheduleAutoTideSync() {
  clearTimeout(tideSyncTimer);
  tideSyncTimer = setTimeout(() => {
    const p = getCurrentPassage();
    if (!p) return;
    p.plan.from = planFrom.value.trim();
    p.plan.to   = planTo.value.trim();
    ensureAutoTideStations(p);
    renderTideStations(p);
    updatePlanSummaryPanel();
    updatePassageHeader();
  }, 120);
}

planFrom.addEventListener("input", scheduleAutoTideSync);
planTo.addEventListener("input", scheduleAutoTideSync);


let sunSyncTimer = null;
function scheduleAutoSunSync(){
  clearTimeout(sunSyncTimer);
  sunSyncTimer = setTimeout(() => {
    const p = getCurrentPassage();
    if (!p) return;
    p.plan.date = planDate.value;
    p.plan.from = planFrom.value.trim();
    p.plan.to   = planTo.value.trim();
    autoComputeSunriseSetForCurrent();
  }, 180);
}
planDate.addEventListener("input", scheduleAutoSunSync);
planFrom.addEventListener("input", scheduleAutoSunSync);
planTo.addEventListener("input", scheduleAutoSunSync);

// --- CL-074: Fetch Met Office Inshore Waters forecast (with manual edit) ---
const METOFFICE_INSHORE_URL = "https://weather.metoffice.gov.uk/specialist-forecasts/coast-and-sea/print/inshore-waters-forecast";
const METOFFICE_INSHORE_URL_PROXY = "https://r.jina.ai/" + METOFFICE_INSHORE_URL; // CORS-friendly fallback

// --- CL-074 (extension): French coast ...
// Météo-France coastal zone pages are largely JS-rendered. For now, we store
// a tidy set of authoritative links for the relevant zones and let the user
// paste/trim key bits into the free-text field if desired.
const METEOFRANCE_COAST_ZONES = [
  {
    label: "Baie de Somme / Cap de la Hague",
    url: "https://meteofrance.com/meteo-marine/baie-de-somme-cap-de-la-hague/BMSCOTE-01-02"
  },
  {
    label: "Cap de la Hague / Penmarc'h",
    url: "https://meteofrance.com/meteo-marine/cap-de-la-hague-penmarc-h/BMSCOTE-01-03"
  },
  {
    label: "Penmarc'h / Anse de l'Aiguillon",
    url: "https://meteofrance.com/meteo-marine/penmarc-h-anse-de-l-aiguillon/BMSCOTE-01-04"
  }
];


// Attach proxy URL + rough bounding boxes for zone selection (marine-sane, not global)
const METEOFRANCE_PROXY_PREFIX = "https://r.jina.ai/";
METEOFRANCE_COAST_ZONES.forEach(z => { z.proxy = METEOFRANCE_PROXY_PREFIX + z.url; });

// Rough bboxes (lat/lon) to auto-pick a zone from Origin/Destination.
// These are intentionally broad, but constrained to Northern France / Channel / Biscay coast.
const METEOFRANCE_ZONE_BBOX = {
  "Baie de Somme / Cap de la Hague": { minLat: 48.6, maxLat: 51.3, minLon: -1.8, maxLon: 3.0 },
  "Cap de la Hague / Penmarc'h":     { minLat: 47.6, maxLat: 50.9, minLon: -6.0, maxLon: 0.2 },
  "Penmarc'h / Anse de l'Aiguillon": { minLat: 45.5, maxLat: 48.2, minLon: -3.8, maxLon: -0.6 }
};

function getMeteoFranceZonesForCurrentPassage(){
  const p = getCurrentPassage();
  if (!p) return [];
  const from = (p.plan?.from || "").trim();
  const to   = (p.plan?.to || "").trim();
  const cFrom = from ? getPortCoords(from) : null;
  const cTo   = to ? getPortCoords(to)   : null;

  const pts = [];
  if (cFrom && typeof cFrom.lat === "number" && typeof cFrom.lon === "number") pts.push(cFrom);
  if (cTo   && typeof cTo.lat   === "number" && typeof cTo.lon   === "number") pts.push(cTo);

  const zones = [];
  for (const z of METEOFRANCE_COAST_ZONES){
    const bb = METEOFRANCE_ZONE_BBOX[z.label];
    if (!bb) continue;
    const hit = pts.some(pt => pt.lat >= bb.minLat && pt.lat <= bb.maxLat && pt.lon >= bb.minLon && pt.lon <= bb.maxLon);
    if (hit) zones.push(z);
  }

  // If we look like a French coast trip but didn't hit a bbox (edge cases),
  // default to the central zone as a sensible starting point.
  if (!zones.length && cFrom && cTo && looksLikeFrenchCoastTrip(cFrom.lat, cFrom.lon, cTo.lat, cTo.lon)){
    zones.push(METEOFRANCE_COAST_ZONES[1]); // Cap de la Hague / Penmarc'h
  }

  // de-dupe (in case both points hit same zone)
  const seen = new Set();
  return zones.filter(z => (seen.has(z.label) ? false : (seen.add(z.label), true)));
}

function looksLikeFrenchCoastTrip(latA, lonA, latB, lonB){
  // Very rough bbox: Seine / Channel coast down to around La Rochelle.
  const inBox = (lat, lon) =>
    typeof lat === "number" && typeof lon === "number" &&
    lat >= 45.5 && lat <= 50.8 && lon >= -6.0 && lon <= 3.0;
  return inBox(latA, lonA) || inBox(latB, lonB);
}

function setWeatherStatus(msg){
  if (!weatherFetchStatus) return;
  weatherFetchStatus.textContent = msg || "";
}
function upsertWeatherSection(existingText, sectionKey, titleLine, content){
  const start = `=== ${sectionKey} ===`;
  const end   = `=== End ${sectionKey} ===`;

  let base = (existingText || "").trim();

  // Remove existing block for this section (if present)
  const re = new RegExp(`\\n?${start.replace(/[.*+?^${}()|[\\]\\\\]/g,"\\\\$&")}\\n[\\s\\S]*?\\n${end.replace(/[.*+?^${}()|[\\]\\\\]/g,"\\\\$&")}\\n?`, "g");
  base = base.replace(re, "\n").replace(/\n{3,}/g, "\n\n").trim();

  const block = [
    start,
    titleLine,
    content.trim(),
    end
  ].filter(Boolean).join("\n");

  return (base ? (base + "\n\n" + block) : block).trim();
}

function applyWeatherSection(sectionKey, titleLine, content, meta){
  // Update textbox (combined), then persist in passage
  const current = (planWeather && planWeather.value) ? planWeather.value : ((getCurrentPassage()?.plan?.weather) || "");
  const merged = upsertWeatherSection(current, sectionKey, titleLine, content);

  if (planWeather) planWeather.value = merged;

  const p = getCurrentPassage();
  if (p){
    p.plan.weather = merged;
    p.plan.weather_sources = p.plan.weather_sources || {};
    if (meta) p.plan.weather_sources[sectionKey] = meta;
    p.plan.weather_fetched_at = new Date().toISOString();
    savePassages();
  }
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

function getInshoreAreasForCurrentPassage(){
  const p = getCurrentPassage();
  if (!p) return [];

  const fromName = (planFrom?.value || "").trim();
  const toName   = (planTo?.value || "").trim();

  const fromC = getPortCoords(fromName);
  const toC   = getPortCoords(toName);

  const areas = [];
  const a1 = fromC ? pickInshoreAreaForLatLon(fromC.lat, fromC.lon) : null;
  const a2 = toC   ? pickInshoreAreaForLatLon(toC.lat, toC.lon) : null;

  if (a1) areas.push(a1);
  if (a2 && a2 !== a1) areas.push(a2);

  return areas;
}

function parseMetOfficeInshore(htmlText){
  // Accepts either HTML or Jina's plain-text "rendered" output.
  const result = { issued: null, areas: {} };

  // Try DOM parse first
  try{
    const doc = new DOMParser().parseFromString(htmlText, "text/html");
    const issuedEl = doc.querySelector("h1, h2, p, div");
    const wholeText = doc.body ? doc.body.textContent : htmlText;
    const issuedMatch = wholeText.match(/Issued by the Met Office at\s+([^\n]+)\s+on\s+([^\n]+)/i);
    if (issuedMatch) result.issued = `Issued ${issuedMatch[1].trim()} on ${issuedMatch[2].trim()}`;

    const h3s = Array.from(doc.querySelectorAll("h3"));
    if (h3s.length){
      for (const h of h3s){
        const title = (h.textContent || "").trim().replace(/\s+/g, " ");
        if (!title) continue;

        let text = "";
        let n = h.nextElementSibling;
        while (n && n.tagName !== "H3"){
          const t = (n.textContent || "").trim();
          if (t) text += (text ? "\n" : "") + t.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
          n = n.nextElementSibling;
        }
        if (text) result.areas[title] = text;
      }
      return result;
    }
  }catch(e){
    // fall through to text parse
  }

  // Plain-text parse (works on the Jina proxy text we see in print view)
  const issuedMatch = htmlText.match(/Issued by the Met Office at\s+([^\n]+)\s+on\s+([^\n]+)/i);
  if (issuedMatch) result.issued = `Issued ${issuedMatch[1].trim()} on ${issuedMatch[2].trim()}`;

  const lines = htmlText.split("\n");
  let current = null;
  let buf = [];
  const flush = () => {
    if (current && buf.length){
      result.areas[current] = buf.join("\n").trim();
    }
    buf = [];
  };

  for (const rawLine of lines){
    const line = rawLine.trim();
    if (!line) continue;

    // In the print view the area headings are shown like "### North Foreland to Selsey Bill"
    const m = line.match(/^###\s+(.*)$/);
    if (m){
      flush();
      current = m[1].trim();
      continue;
    }
    if (line === "* * *") continue;
    if (current) buf.push(line);
  }
  flush();
  return result;
}


function parseMeteoFranceMarine(rawText){
  // Input is Jina's plain-text rendering (preferred) or HTML.
  // We aim for a short, "Inshore-like" summary: Wind, Sea state, Weather, Visibility for ~24h.
  const cleaned = (rawText || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

  // Keep a single normalised working copy for all strategies below.
  const norm = cleaned;

  // Try to get a "last updated" line if present
  let updated = null;
  const updMatch = cleaned.match(/(?:Mise à jour|Mis à jour|Dernière mise à jour|Actualis[ée] le)\s*[:\-]?\s*([^\n]{0,80})/i);
  if (updMatch) updated = updMatch[1].trim();

  // Helper: pull a value after a label, allowing it to spill onto the next line if needed
  function valueAfter(labelRe, text){
    const m = text.match(labelRe);
    if (!m) return null;
    let v = (m[1] || "").trim();
    if (!v){
      const idx = m.index + m[0].length;
      const tail = text.slice(idx).split("\n").map(s=>s.trim()).filter(Boolean);
      if (tail.length) v = tail[0];
    }
    // truncate overly-long blobs
    if (v && v.length > 220) v = v.slice(0, 220).trim() + "…";
    return v || null;
  }

  // Primary strategy: split by period headings and look for structured fields.
  const PERIODS = [
    "Ce matin","Cet après-midi","Cet apres-midi","Ce soir","Cette nuit",
    "Aujourd'hui","Aujourd’hui","Demain","Après-demain","Apres-demain",
    "This morning","This afternoon","This evening","Tonight","Tomorrow"
  ];

  const headingRe = new RegExp("^(?:" + PERIODS.map(p => p.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|") + ")\\b", "i");

  const lines = cleaned.split("\n");
  const blocks = [];
  let current = null;

  for (const line0 of lines){
    const line = line0.trim();
    if (!line) continue;
    if (headingRe.test(line)){
      if (current) blocks.push(current);
      current = { name: line.replace(/\s+:+\s*$/,"").trim(), lines: [] };
      continue;
    }
    if (!current) continue;
    // ignore obvious nav noise
    if (/^(Accueil|Menu|Partager|Imprimer|Retour|Prévisions|Previsions)\b/i.test(line)) continue;
    current.lines.push(line);
  }
  if (current) blocks.push(current);

  function extractField(linesArr, patterns){
    for (const re of patterns){
      for (const ln of linesArr){
        const m = ln.match(re);
        if (m && m[1]) return m[1].trim();
      }
    }
    return null;
  }

  let periods = blocks.map(b => {
    const ls = b.lines;

    const wind = extractField(ls, [
      /^Vent\s*[:\-]?\s*(.*)$/i,
      /^Wind\s*[:\-]?\s*(.*)$/i
    ]);

    const sea  = extractField(ls, [
      /^(?:État|Etat)\s+de\s+la\s+mer\s*[:\-]?\s*(.*)$/i,
      /^Mer\s*[:\-]?\s*(.*)$/i,
      /^Sea\s*state\s*[:\-]?\s*(.*)$/i
    ]);

    const wx   = extractField(ls, [
      /^Temps\s*[:\-]?\s*(.*)$/i,
      /^Weather\s*[:\-]?\s*(.*)$/i
    ]);

    const vis  = extractField(ls, [
      /^Visibilit[ée]\s*[:\-]?\s*(.*)$/i,
      /^Visibility\s*[:\-]?\s*(.*)$/i
    ]);

    const hasAny = !!(wind || sea || wx || vis);
    return { name: b.name, wind, sea, weather: wx, visibility: vis, raw: ls, hasAny };
  }).filter(p => p && p.name);

  // Fallback strategy: many Météo‑France marine pages are dynamic; Jina may yield text without clear headings.
  // In that case, try to extract "today" and "tomorrow" sections (or just one set) by scanning the whole text.
  let fallback = null;

  const usefulPeriods = periods.filter(p => p.hasAny);
  if (!usefulPeriods.length){

    // Try to split around Aujourd'hui / Demain
    const parts = [];
    const splitRe = /(^|\n)\s*(Aujourd['’]hui|Demain)\b[^\n]*\n/ig;
    let lastIdx = 0;
    let match;
    let heads = [];
    while ((match = splitRe.exec(norm)) !== null){
      const head = match[2];
      const idx = match.index + (match[1] ? match[1].length : 0);
      if (idx > lastIdx){
        const chunk = norm.slice(lastIdx, idx);
        if (chunk.trim()) parts.push({ name: heads[heads.length-1] || "Prévisions", text: chunk });
      }
      heads.push(head);
      lastIdx = idx;
    }
    const tail = norm.slice(lastIdx);
    if (tail.trim()) parts.push({ name: heads[heads.length-1] || "Prévisions", text: tail });

    // If splitting didn't work, just use entire text as one part
    const scanParts = parts.length ? parts.slice(0, 2) : [{ name: "Prévisions", text: norm }];

    fallback = scanParts.map(p => {
      const t = p.text;
      const wind = valueAfter(/(?:^|\n)\s*Vent\s*[:\-]?\s*([^\n]{0,220})/i, t);
      const sea  = valueAfter(/(?:^|\n)\s*(?:Mer|(?:État|Etat)\s+de\s+la\s+mer)\s*[:\-]?\s*([^\n]{0,220})/i, t);
      const wx   = valueAfter(/(?:^|\n)\s*Temps\s*[:\-]?\s*([^\n]{0,220})/i, t);
      const vis  = valueAfter(/(?:^|\n)\s*Visibilit[ée]\s*[:\-]?\s*([^\n]{0,220})/i, t);
      return { name: p.name, wind, sea, weather: wx, visibility: vis, hasAny: !!(wind||sea||wx||vis) };
    }).filter(p => p.hasAny);

    // As a last‑ditch, also look for "Mer agitée" style phrases even without labels
    if (!fallback.length){
      const wind2 = valueAfter(/(?:^|\n)\s*(?:Vent)\s+([^\n]{0,220})/i, norm);
      const sea2  = valueAfter(/(?:Mer)\s+([^\n]{0,220})/i, norm);
      fallback = [{ name: "Prévisions", wind: wind2, sea: sea2, weather: null, visibility: null, hasAny: !!(wind2||sea2) }].filter(p=>p.hasAny);
    }
  }

    // Extract a few useful keyword lines as a guaranteed fallback
  const keyLines = [];
  try{
    const want = /(Vent|Mer|État|Etat|Temps|Visibilit|Hou[ou]le)/i;
    const lns = norm.split("\n").map(l=>l.trim()).filter(Boolean);
    for (let i=0;i<lns.length;i++){
      const l = lns[i];
      if (want.test(l)){
        keyLines.push(l);
        if (lns[i+1] && !want.test(lns[i+1]) && keyLines.length < 10) keyLines.push(lns[i+1]);
      }
      if (keyLines.length >= 10) break;
    }
  }catch(e){ /* ignore */ }

  return { updated, periods: usefulPeriods.length ? usefulPeriods : periods, fallback, keyLines };
}

function formatMeteoFranceSummary(zoneLabel, parsed){
  const out = [];
  const hdr = parsed.updated ? `Météo-France Marine — ${zoneLabel} (${parsed.updated})` : `Météo-France Marine — ${zoneLabel}`;
  out.push(hdr);

  const pick = (parsed.periods || []).filter(p => p.wind || p.sea || p.weather || p.visibility).slice(0, 4);

  // If structured periods are empty, try fallback extraction
  const fb = (parsed.fallback || []).filter(p => p.wind || p.sea || p.weather || p.visibility).slice(0, 2);

  const rows = pick.length ? pick : fb;
  if (!rows.length){
    out.push("");
    out.push("Couldn’t extract structured Wind/Sea/Weather/Visibility from the page text. Showing key lines (best effort):");
    const kl = (parsed.keyLines || []).slice(0, 10);
    if (kl.length){
      out.push("");
      for (const l of kl) out.push("• " + l);
    }else{
      out.push("");
      out.push("(No key lines found — consider manual paste.)");
    }
    out.push("");
    out.push("Source: meteofrance.com (best-effort extract).");
    return out.join("\n");
  }

  for (const p of rows){
    const bits = [];
    if (p.wind) bits.push(`Wind: ${p.wind}`);
    if (p.sea)  bits.push(`Sea: ${p.sea}`);
    if (p.weather) bits.push(`Weather: ${p.weather}`);
    if (p.visibility) bits.push(`Vis: ${p.visibility}`);
    out.push(`${p.name}: ${bits.join(" • ")}`.trim());
  }

  out.push("");
  out.push("Source: meteofrance.com (auto-extract, shortened).");
  return out.join("\n");
}

async function fetchMeteoFranceWeatherForCurrent(){
  if (!btnFetchWeatherFR || !planWeather) return;

  const zones = getMeteoFranceZonesForCurrentPassage();
  if (!zones.length){
    setWeatherStatus("No French coast zone matched (need Origin/Destination coords).");
    return;
  }

  btnFetchWeatherFR.disabled = true;
  setWeatherStatus(`Fetching: ${zones.map(z=>z.label).join(" • ")} ...`);

  try{
    const summaries = [];
    for (const z of zones){
      const raw = await fetchTextWithFallback(z.url, z.proxy);
      const parsed = parseMeteoFranceMarine(raw);
      summaries.push(formatMeteoFranceSummary(z.label, parsed));
    }

    const joined = summaries.join("\n\n---\n\n");
    applyWeatherSection(
      "Meteo-France",
      "Météo-France Marine (best-effort extract)",
      joined,
      { zones: zones.map(z=>({label:z.label,url:z.url})), fetched_at: new Date().toISOString() }
    );
    setWeatherStatus("Météo-France fetched.");
  }catch(err){
    console.error(err);
    setWeatherStatus("Météo-France fetch failed. Try manual paste.");
    alert("Météo-France fetch failed.\n\nThis can happen if the page layout changes or the network blocks access.\nTry again, or paste key lines manually.\n\nDetails: " + (err?.message || err));
  }finally{
    btnFetchWeatherFR.disabled = false;
  }
}

async function fetchTextWithFallback(url, proxyUrl){
  // 1) direct fetch (may fail due to CORS on some setups)
  try{
    const r = await fetch(url, { cache: "no-store" });
    if (r && r.ok) return await r.text();
  }catch(e){
    // ignore
  }
  // 2) proxy fallback (CORS-friendly)
  const proxy = proxyUrl || ("https://r.jina.ai/" + url);
  const r2 = await fetch(proxy, { cache: "no-store" });
  if (!r2.ok) throw new Error("Proxy fetch failed");
  return await r2.text();
}

async function fetchInshoreWeatherForCurrent(){
  if (!btnFetchWeather || !planWeather) return;
  const areasWanted = getInshoreAreasForCurrentPassage();
  if (!areasWanted.length){
    setWeatherStatus("Add Origin & Destination (with coords) first.");
    return;
  }

  btnFetchWeather.disabled = true;
  setWeatherStatus(`Fetching: ${areasWanted.join(" • ")} ...`);

  try{
    let addedFranceLinks = false;
    const raw = await fetchTextWithFallback(METOFFICE_INSHORE_URL);
    const parsed = parseMetOfficeInshore(raw);

    const blocks = [];
    const issued = parsed.issued ? `Met Office Inshore Waters (${parsed.issued})` : "Met Office Inshore Waters";
    blocks.push(issued);

    for (const area of areasWanted){
      // Exact match first, else fuzzy (case/space)
      let text = parsed.areas[area];
      if (!text){
        const key = Object.keys(parsed.areas).find(k => k.toLowerCase() === area.toLowerCase());
        if (key) text = parsed.areas[key];
      }
      if (!text){
        // final fallback: contains
        const key = Object.keys(parsed.areas).find(k => k.toLowerCase().includes(area.toLowerCase()));
        if (key) text = parsed.areas[key];
      }
      if (!text){
        blocks.push(`\n${area}\n(Area not found in fetched page — you may need to update mapping.)`);
      }else{
        blocks.push(`\n${area}\n${text}`);
      }
    }

    const ukText = blocks.join("\n").replace(/\n{3,}/g, "\n\n").trim();

    applyWeatherSection(
      "Met Office",
      "",
      ukText,
      { areas: areasWanted, fetched_at: new Date().toISOString() }
    );

    setWeatherStatus("Fetched ✓ (you can edit the text).");
  }catch(e){
    console.warn("Weather fetch failed", e);
    setWeatherStatus("Fetch failed — you can still type it manually.");
  }finally{
    btnFetchWeather.disabled = false;
  }
}

if (btnFetchWeather){
  btnFetchWeather.addEventListener("click", (e) => {
    e.preventDefault();
    fetchInshoreWeatherForCurrent();
  });
}



if (btnFetchWeatherFR){
  btnFetchWeatherFR.addEventListener("click", (e) => {
    e.preventDefault();
    fetchMeteoFranceWeatherForCurrent();
  });
}
// Save plan -> remember ports, ensure tide stations, then jump to Log
planForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const p = getCurrentPassage();
  if (!p) return;

  p.plan.date = planDate.value;
  p.plan.from = planFrom.value.trim();
  p.plan.to   = planTo.value.trim();
  p.plan.vessel = planVessel.value.trim();
  p.plan.skipper = planSkipper.value.trim();
  p.plan.crew = planCrew.value.trim();
  p.plan.sunriseSet = planSunriseSet.value.trim();
  p.plan.tidalCoeff = planTidalCoeff.value.trim();
  p.plan.currents = planCurrents.value.trim();
  p.plan.weather = planWeather.value.trim();
  p.plan.comms = planComms.value.trim();

  p.plan.tideStations = readTideStationsFromForm();
  ensureAutoTideStations(p);

  p.plan.dailySummaries = readDailySummariesFromForm();

  // Before saving ports, run the "new port" flow (lookup + user confirmation).
  // This prevents partial names (e.g. "Ca", "Car") being persisted.
  try{
    await maybeSaveNewPort(p.plan.from);
    await maybeSaveNewPort(p.plan.to);
  }catch(e){
    console.warn("Port confirmation flow failed", e);
  }

  savePassages();

  // If ports already exist, update MRU.
  rememberPort(p.plan.from);
  rememberPort(p.plan.to);

  refreshHomePassageList();
  updatePassageHeader();
  updatePlanSummaryPanel();

  switchToTab("logTab");
});

// --- Plan summary panel (no START block) ---------------------------

function updatePlanSummaryPanel() {
  const p = getCurrentPassage();
  if (!p) {
    planSummaryPanel.innerHTML = "<p>No passage selected.</p>";
    return;
  }

  const tidalCoeff = p.plan.tidalCoeff || "";
  const currents = p.plan.currents || "";
  const weather  = p.plan.weather || "";
  const comms    = p.plan.comms || "";
  const tideStations = p.plan.tideStations || [];
  const dailySummaries = p.plan.dailySummaries || [];

  const tideStationsHtml = tideStations.length
    ? tideStations.map(ts => {
        const name = escapeHtml(ts.name || "Station");
        // Build events list (prefer stored events; otherwise build from fields)
        let ev = Array.isArray(ts.events) ? ts.events.slice() : [];
        if (!ev.length){
          const pushEv = (type, time, heightStr) => {
            if (!time) return;
            const h = parseFloat(String(heightStr || "").replace(",", "."));
            ev.push({ type, time, height: isNaN(h) ? null : h });
          };
          pushEv("HW", ts.hw1, ts.hw1h);
          pushEv("LW", ts.lw1, ts.lw1h);
          pushEv("HW", ts.hw2, ts.hw2h);
          pushEv("LW", ts.lw2, ts.lw2h);
        }
        ev.sort((a,b) => (a.time||"").localeCompare(b.time||""));

        if (!ev.length) return `<div class="tide-row">${name} – <em>–</em></div>`;

        const rowsHtml = ev.map(e => {
          const sym = (e.type === "HW") ? "▲" : "▼";
          const hRaw = (e && (e.height ?? e.ht ?? e.h ?? e.Ht ?? e.height_m ?? e.heightM));
          const hh = (typeof hRaw === "number") ? hRaw : parseFloat(String(hRaw ?? "").replace(",", "."));
          const h = (!isNaN(hh)) ? `${hh.toFixed(1)}m` : "";
          return `<tr><td class="tide-sym">${sym}</td><td>${escapeHtml(e.time || "")}</td><td>${escapeHtml(h)}</td></tr>`;
        }).join("");

        return `
          <div class="tide-station-block">
            <div class="tide-station-name">${name}</div>
            <table class="tide-table">
              <thead><tr><th></th><th>Time</th><th>Ht</th></tr></thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        `;
      }).join("")
    : "<p><em>–</em></p>";


  const dailySummaryHtml = dailySummaries.length
    ? dailySummaries.map(ds => {
        const dateLabel = ds.date || "No date";
        const feeLabel  = ds.fee  ? ` – ${escapeHtml(ds.fee)}` : "";
        const notesLabel = ds.notes ? ` – ${escapeHtml(ds.notes)}` : "";
        return `<div class="daily-summary-item plan-link" data-goto="dailySummariesContainer">${escapeHtml(dateLabel)}${feeLabel}${notesLabel}</div>`;
      }).join("")
    : "<p class=\"plan-link\" data-goto=\"dailySummariesContainer\"><em>–</em></p>";

  planSummaryPanel.innerHTML = `
    <div class="plan-summary-grid">
      <div class="col">
        <div class="block plan-link" data-goto="planTidalCoeff">
          <p class="section-title">TIDES</p>
          <p>${tidalCoeff ? `<strong>Coeff:</strong> ${escapeHtml(tidalCoeff)}` : "<strong>Coeff:</strong> –"}</p>
          <p><strong>Tide stations:</strong></p>
          <div class="tide-stations-grid">${tideStationsHtml}</div>
        </div>

        <div class="block plan-link" data-goto="planCurrents">
          <p class="section-title">TIDAL CURRENTS / FLOWS</p>
          <p>${currents ? escapeHtml(currents).replace(/\n/g, "<br>") : "<em>–</em>"}</p>
        </div>

        <div class="block plan-link" data-goto="planComms">
          <p class="section-title">COMMS / PILOTAGE</p>
          <p>${comms ? escapeHtml(comms).replace(/\n/g, "<br>") : "<em>–</em>"}</p>
        </div>
      </div>

      <div class="col">
        <div class="block plan-link" data-goto="planWeather">
          <p class="section-title">WEATHER</p>
          <p>${weather ? escapeHtml(weather).replace(/\n/g, "<br>") : "<em>–</em>"}</p>
        </div>

        <div class="block">
          <p class="section-title">DAILY SUMMARY</p>
          ${dailySummaryHtml}
        </div>
      </div>
    </div>
  `;
}

planSummaryPanel.addEventListener("click", (e) => {
  const target = e.target.closest(".plan-link");
  if (!target) return;
  const fieldId = target.dataset.goto;
  if (!fieldId) return;

  switchToTab("planTab");
  const el = document.getElementById(fieldId);
  if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
});

// --- Log entries ----------------------------------------------------

function passageIsShutdown(p) {
  return p?.finish?.shutdownLogged === true;
}




async function maybeCapturePositionForEntry(entry) {
  // Only offer for freeform/custom log entries. (Predefined buttons do not need position.)
  // We deliberately show the entry immediately, then (optionally) enrich it with position.
  return await new Promise((resolve) => {
    showModal({
      title: "Log position (lat/lon) for this entry?",
      bodyHtml: `
        <div style="line-height:1.35">
          <p style="margin:0 0 10px 0;">
            Do you want to record your current GPS position for this log entry?
          </p>
          <p style="margin:0; opacity:0.85; font-size:0.95em">
            Tip: choose <b>Yes</b> for notable events. If you’re indoors or GPS is unavailable, it may fail harmlessly.
          </p>
        </div>
      `,
      okText: "Yes",
      cancelText: "No",
      onOk: async () => {
        // If the browser doesn't support geo, just carry on.
        if (!navigator.geolocation) {
          resolve(false);
          return;
        }

        const opts = { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 };

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            try {
              const lat = pos.coords.latitude;
              const lon = pos.coords.longitude;
              const acc = pos.coords.accuracy;

        entry.lat = formatLatFromDecimal(lat);
        entry.lon = formatLonFromDecimal(lon);
              entry.posAccM = acc;
              entry.posAt = new Date().toISOString(); // when the fix was taken (UTC)
            } catch (e) {
              // ignore enrichment errors
            }
            resolve(true);
          },
          (_err) => {
            // Don't block the entry if GPS fails; just record nothing.
            resolve(false);
          },
          opts
        );
      },
      onCancel: () => resolve(false),
    });
  });
}
function addSpecialEntry(noteText, notesOverride = null) {
  const p = getCurrentPassage();
  if (!p) return alert("No passage selected.");
  ensureFlags(p);
  if (passageIsShutdown(p)) return alert("Shutdown already recorded – no further log entries allowed.");

  const now = new Date();
  const timeStr = now.toISOString().slice(0, 16);

  const entry = {
    id: "e_" + Date.now(),
    time: timeStr,
    lat: "",
    lon: "",
    // No prefill from previous entries (CL-076-8)
    course: "",
    speed: "",
    rpm: "",
    engTP: "",
    waterLog: "",
    groundLog: "",
    fuelUsed: "",
    notes: (notesOverride !== null ? notesOverride : (noteText || ""))
  };

  p.entries.unshift(entry);
  savePassages();
  renderLogEntries();
  refreshHomePassageList();
}

async function addLogEntry(){
  const p = getCurrentPassage();
  if (!p) return;

  ensureEntries(p);
  ensureFinish(p);
  ensureFlags(p);

  // Always allow ad-hoc log entries, even after Shutdown (CL-076-1)
  const entry = {
    id: newId('e'),
    time: new Date().toISOString().slice(0,16),
    cog: "",
    speed: "",
    rpm: "",
    engTP: "",
    waterLog: "",
    groundLog: "",
    fuelUsed: "",
    notes: "",
    lat: "",
    lon: ""
  };

  // Ask whether to capture position for this ad-hoc entry (CL-076-6)
  await maybeCapturePositionForEntry(entry, p);

  p.entries.unshift(entry);
  savePassages();
  renderLogEntries();
  refreshHomePassageList();
}


function addDockEntry() {
  const p = getCurrentPassage();
  if (!p) return alert("No passage selected.");
  ensureFlags(p);
  if (passageIsShutdown(p)) return alert("Shutdown already recorded – no further log entries allowed.");

  const now = new Date();
  const timeStr = now.toISOString().slice(0, 16);

  const entry = {
    id: "e_" + Date.now(),
    time: timeStr,
    lat: "",
    lon: "",
    course: "",
    speed: "0",
    rpm: "",
    engTP: "",
    // No prefill from previous entries
    waterLog: '',
    groundLog: '',
    fuelUsed: '',
    notes: "Alongside / docked"
  };

  p.entries.unshift(entry);
  savePassages();
  renderLogEntries();
  refreshHomePassageList();
}

function attachSwipeToRow(tr, entryId) {
  let startX = 0;
  tr.addEventListener("touchstart", (e) => { startX = e.changedTouches[0].screenX; }, { passive: true });
  tr.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].screenX - startX;
    if (dx < -90) deleteLogEntryById(entryId);
  }, { passive: true });
}

function deleteLogEntryById(entryId) {
  const p = getCurrentPassage();
  if (!p) return;
  const idx = p.entries.findIndex(e => e.id === entryId);
  if (idx < 0) return;

  const deleted = p.entries[idx];

  const ok = confirm("Delete this log entry?");
  if (!ok) return;

  p.entries.splice(idx, 1);

  // If the Shutdown entry was deleted, clear the shutdown flag so a new one can be added (CL-070)
  if (
    deleted &&
    typeof deleted.notes === "string" &&
    deleted.notes.toLowerCase().startsWith("shutdown")
  ) {
    if (!p.finish) p.finish = {};
    p.finish.shutdownLogged = false;
    // Clear finish fields that are only meaningful after shutdown
    p.finish.finishedAt = null;
    p.finish.engineHoursEnd = null;
    p.finish.fuelEndPercent = null;
  }

  // Recompute special-entry flags so deleted items can be re-added (CL-076-2)
  if (!p.flags) p.flags = {};
  const entries = p.entries || [];
  const hasEngineStart = entries.some(e => typeof e.notes === 'string' && e.notes.toLowerCase().startsWith('engine start'));
  const hasSlip = entries.some(e => typeof e.notes === 'string' && e.notes.toLowerCase().startsWith('slipped lines'));
  const hasDock = entries.some(e => typeof e.notes === 'string' && (e.notes.toLowerCase().startsWith('alongside') || e.notes.toLowerCase().startsWith('docked')));
  p.flags.engineStart = !!hasEngineStart;
  p.flags.slip = !!hasSlip;
  p.flags.dock = !!hasDock;

  // Keep shutdown flag consistent even if something odd happens
  if (p.finish) {
    const hasShutdown = (p.entries || []).some(e => typeof e.notes === "string" && e.notes.toLowerCase().startsWith("shutdown"));
    p.finish.shutdownLogged = !!hasShutdown;
  }
  savePassages();
  renderLogEntries();
  refreshHomePassageList();
}

function handlePositionEdit(entry) {
  function manualPosition() {
    const current = (entry.lat || "") + (entry.lon ? `, ${entry.lon}` : "");
    const val = prompt("Position (decimal \"lat, lon\" or formatted):", current);
    if (val === null) return;
    const result = parseAndFormatPositionInput(val.trim(), entry.lat, entry.lon);
    entry.lat = result.lat;
    entry.lon = result.lon;
    savePassages();
    renderLogEntries();
  }

  if (!navigator.geolocation) return manualPosition();

  const useGps = confirm("Use current GPS position? Press Cancel to enter manually.");
  if (!useGps) return manualPosition();

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      entry.lat = formatLatFromDecimal(pos.coords.latitude);
      entry.lon = formatLonFromDecimal(pos.coords.longitude);
      savePassages();
      renderLogEntries();
    },
    (err) => alert("Unable to get GPS position: " + err.message),
    { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
  );
}

// Engine start: numeric-friendly modal + only once
engineStartBtn.addEventListener("click", () => {
  const p = getCurrentPassage();
  if (!p) return alert("No passage selected.");
  ensureFlags(p);
  if (passageIsShutdown(p)) return alert("Shutdown already recorded – no further log entries allowed.");
  if (p.flags.engineStart) return alert("Engine Start already recorded for this passage.");

  // Persisted per-passage (not carried across passages)
  const prevEnv = (p.plan && p.plan.engineStartEnv) ? p.plan.engineStartEnv : {};

  showModal({
    title: "Engine Start",
    bodyHtml: `
      <label style="display:flex;flex-direction:column;gap:0.25rem;">
        Fuel % at start
        <input id="fuelStart" type="number" inputmode="numeric" step="1" value="${escapeHtml(p.plan.fuelStartPercent || "")}">
      </label>

      <label style="display:flex;flex-direction:column;gap:0.25rem;margin-bottom:0.5rem;">
        Engine hours at start
        <input id="ehStart" type="number" inputmode="decimal" step="0.1" value="${escapeHtml(p.plan.engineHoursStart || "")}">
      </label>
<div style="margin-top:0.75rem;border-top:1px solid #e6e6e6;padding-top:0.75rem;">
        <div style="font-weight:600;margin-bottom:0.5rem;">Environment (optional)</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
          <label style="display:flex;flex-direction:column;gap:0.25rem;">
            Air pressure (mb)
            <input id="airPress" type="number" inputmode="numeric" step="1" value="${escapeHtml(prevEnv.airPressureMb || "")}">
          </label>
          <label style="display:flex;flex-direction:column;gap:0.25rem;">
            Humidity (%)
            <input id="humidity" type="number" inputmode="numeric" step="1" value="${escapeHtml(prevEnv.humidityPct || "")}">
          </label>
          <label style="display:flex;flex-direction:column;gap:0.25rem;">
            Air temp (°C)
            <input id="airTemp" type="number" inputmode="decimal" step="0.1" value="${escapeHtml(prevEnv.airTempC || "")}">
          </label>
          <label style="display:flex;flex-direction:column;gap:0.25rem;">
            Sea temp (°C)
            <input id="seaTemp" type="number" inputmode="decimal" step="0.1" value="${escapeHtml(prevEnv.seaTempC || "")}">
          </label>
          <label style="display:flex;flex-direction:column;gap:0.25rem;grid-column:1 / span 1;">
            Wind dir
            <select id="windDir">
              <option value="" ${!prevEnv.windDir ? "selected" : ""}></option>
              <option value="N"  ${(prevEnv.windDir=="N")?"selected":""}>N</option>
              <option value="NE" ${(prevEnv.windDir=="NE")?"selected":""}>NE</option>
              <option value="E"  ${(prevEnv.windDir=="E")?"selected":""}>E</option>
              <option value="SE" ${(prevEnv.windDir=="SE")?"selected":""}>SE</option>
              <option value="S"  ${(prevEnv.windDir=="S")?"selected":""}>S</option>
              <option value="SW" ${(prevEnv.windDir=="SW")?"selected":""}>SW</option>
              <option value="W"  ${(prevEnv.windDir=="W")?"selected":""}>W</option>
              <option value="NW" ${(prevEnv.windDir=="NW")?"selected":""}>NW</option>
            </select>
          </label>

          <label style="display:flex;flex-direction:column;gap:0.25rem;grid-column:1 / span 1;">
            Wind (Bft)
            <input id="windBft" type="number" inputmode="numeric" step="1" min="0" max="12" value="${escapeHtml(prevEnv.windBft || "")}">
          </label>
        </div>
        <label style="display:flex;flex-direction:column;gap:0.25rem;margin-top:0.75rem;">
          Notes (optional)
          <textarea id="esNotes" class="modal-notes" rows="3" style="resize:vertical;" placeholder="Anything notable at engine start…">${escapeHtml(prevEnv.notes || "")}</textarea>
        </label>
      </div>
    `,
    onOk: () => {
      const eh = document.getElementById("ehStart").value.trim();
      const fu = document.getElementById("fuelStart").value.trim();

      const airPressureMb = document.getElementById("airPress").value.trim();
      const humidityPct   = document.getElementById("humidity").value.trim();
      const airTempC      = document.getElementById("airTemp").value.trim();
      const seaTempC      = document.getElementById("seaTemp").value.trim();
      const windDir       = document.getElementById("windDir").value.trim();
      const windBft       = document.getElementById("windBft").value.trim();
      const notesText     = document.getElementById("esNotes").value.trim();

      p.plan.engineHoursStart = eh;
      p.plan.fuelStartPercent = fu;

      // Persist the optional snapshot per-passage so it can be amended/reopened.
      p.plan.engineStartEnv = {
        airPressureMb,
        humidityPct,
        airTempC,
        seaTempC,
        windDir,
        windBft,
        notes: notesText,
      };

      const startBits = [];
      if (eh) startBits.push(`EH ${eh}`);
      if (fu) startBits.push(`Fuel ${fu}%`);

      const envParts = [];
      if (airPressureMb) envParts.push(`${airPressureMb}mb`);
      if (humidityPct)   envParts.push(`${humidityPct}%RH`);
      if (airTempC)      envParts.push(`Air ${airTempC}°C`);
      if (seaTempC)      envParts.push(`Sea ${seaTempC}°C`);
      if (windDir || windBft) envParts.push(`Wind ${windDir}${windBft}`.trim());
      if (envParts.length) startBits.push(`Env ${envParts.join(", ")}`);
      if (notesText) startBits.push(`Notes: ${notesText}`);

      const startNotes = startBits.length ? `Engine start — ${startBits.join(" | ")}` : "Engine start";
      addSpecialEntry("Engine start", startNotes);
      p.flags.engineStart = true;

      savePassages();
      updatePlanSummaryPanel();
      updateLogSummary();
    }
  });
});

// Slip: only once
slipLinesBtn.addEventListener("click", () => {
  const p = getCurrentPassage();
  if (!p) return;
  ensureFlags(p);
  if (passageIsShutdown(p)) return alert("Shutdown already recorded – no further log entries allowed.");
  if (p.flags.slip) return alert("Slip already recorded for this passage.");
  addSpecialEntry("Slipped lines / underway");
  p.flags.slip = true;
  savePassages();
});

// Dock: only once
dockLinesBtn.addEventListener("click", () => {
  const p = getCurrentPassage();
  if (!p) return;
  ensureFlags(p);
  if (passageIsShutdown(p)) return alert("Shutdown already recorded – no further log entries allowed.");
  if (p.flags.dock) return alert("Dock already recorded for this passage.");
  addDockEntry();
  p.flags.dock = true;
  savePassages();
});

// Shutdown: one only; keep summary below, keep notes clean
shutdownBtn.addEventListener("click", () => {
  const p = getCurrentPassage();
  if (!p) return alert("No passage selected.");
  if (p.finish.shutdownLogged) return alert("Shutdown has already been recorded for this passage.");

  showModal({
    title: "Shutdown",
    bodyHtml: `
      <label style="display:flex;flex-direction:column;gap:0.25rem;margin-bottom:0.5rem;">
        Fuel % at end
        <input id="fuelEnd" type="number" inputmode="numeric" step="1" value="${escapeHtml(p.finish.fuelEndPercent || "")}">
      </label>
<label style="display:flex;flex-direction:column;gap:0.25rem;margin-bottom:0.5rem;">
        Engine hours (end)
        <input id="ehEnd" type="number" inputmode="decimal" step="0.1" value="${escapeHtml(p.finish.engineHoursEnd || "")}">
      </label>
      <label style="display:flex;flex-direction:column;gap:0.25rem;">
        Notes / defects
        <input id="shNotes" type="text" value="${escapeHtml(p.finish.notes || "")}">
      </label>
    `,
    onOk: () => {
      p.finish.engineHoursEnd = document.getElementById("ehEnd").value.trim();
      p.finish.fuelEndPercent = document.getElementById("fuelEnd").value.trim();
      p.finish.notes = document.getElementById("shNotes").value.trim();
      p.finish.shutdownLogged = true;

      // Include key figures in the notes for quick scanability (CL-066)
      const ehEnd = p.finish.engineHoursEnd;
      const fuelEnd = p.finish.fuelEndPercent;
      const shutBits = [];
      if (ehEnd) shutBits.push(`EH ${ehEnd}`);
      if (fuelEnd) shutBits.push(`Fuel ${fuelEnd}%`);
      const shutPrefix = shutBits.length ? `Shutdown / alongside — ${shutBits.join(" | ")}` : "Shutdown / alongside";
      const note = p.finish.notes ? `${shutPrefix} — ${p.finish.notes}` : shutPrefix;

      p.entries.unshift({
        id: "e_" + Date.now(),
        time: new Date().toISOString().slice(0, 16),
        lat: "",
        lon: "",
        course: "",
        speed: "0",
        rpm: "",
        engTP: "",
        waterLog: "",
        groundLog: "",
        fuelUsed: "",
        notes: note
      });

      savePassages();
      renderLogEntries();
      refreshHomePassageList();
      updatePassageHeader();
      updateLogSummary();
    }
  });
});

function renderLogEntries() {
  const p = getCurrentPassage();
  logEntriesContainer.innerHTML = "";

  if (!p || (p.entries?.length || 0) === 0) {
    logEmptyMessage.style.display = "block";
    logSummaryPanel.textContent = "";
    return;
  }
  logEmptyMessage.style.display = "none";

  const entries = p.entries.slice().sort((a, b) => (a.time > b.time ? 1 : -1));

  entries.forEach(entry => {
    const tr = document.createElement("tr");
    attachSwipeToRow(tr, entry.id);

    const tdTime = document.createElement("td");
    tdTime.textContent = entry.time ? timeOnlyFromIso(entry.time) : "";
    tdTime.classList.add("editable-cell");
    tdTime.addEventListener("click", () => {
      const val = prompt("Time (YYYY-MM-DD HH:MM or HH:MM):", entry.time || "");
      if (val === null) return;
      entry.time = val.trim();
      savePassages();
      renderLogEntries();
    });
    tr.appendChild(tdTime);

    function addInputCell(value, opts) {
      const td = document.createElement("td");
      const inp = document.createElement("input");
      inp.className = opts.className;
      inp.type = opts.type || "text";
      if (opts.inputMode) inp.inputMode = opts.inputMode;
      if (opts.step) inp.step = opts.step;
      inp.value = value || "";
      inp.addEventListener("change", () => {
        entry[opts.field] = inp.value.trim();
        savePassages();
        updateLogSummary();
      });
      td.appendChild(inp);
      tr.appendChild(td);
    }

    addInputCell(entry.course, { field: "course", className: "log-input log-input-cog", type: "text", inputMode: "numeric" });
    addInputCell(entry.speed,  { field: "speed",  className: "log-input log-input-num", type: "number", inputMode: "decimal", step: "0.1" });
    addInputCell(entry.rpm,    { field: "rpm",    className: "log-input log-input-num", type: "number", inputMode: "numeric", step: "10" });
    addInputCell(entry.engTP,  { field: "engTP",  className: "log-input log-input-num", type: "text",   inputMode: "decimal" });

    addInputCell(entry.waterLog || "", { field: "waterLog", className: "log-input log-input-num", type: "number", inputMode: "decimal", step: "0.1" });
    addInputCell(entry.groundLog,      { field: "groundLog", className: "log-input log-input-num", type: "number", inputMode: "decimal", step: "0.1" });

    addInputCell(entry.fuelUsed, { field: "fuelUsed", className: "log-input log-input-num", type: "number", inputMode: "decimal", step: "0.1" });

    const tdNotes = document.createElement("td");

    const notesArea = document.createElement("textarea");
    notesArea.className = "log-notes";
    notesArea.rows = 2;
    notesArea.placeholder = "Notes / actions";
    notesArea.value = entry.notes || "";
    notesArea.addEventListener("input", () => {
      entry.notes = notesArea.value;
      savePassages();
    });
    tdNotes.appendChild(notesArea);

    const actions = document.createElement("div");
    actions.className = "entry-actions";
    const latStr = (entry.lat == null) ? "" : String(entry.lat);
    const lonStr = (entry.lon == null) ? "" : String(entry.lon);
    const hasPos = (latStr.trim() !== "") || (lonStr.trim() !== "");
    if (hasPos) {
      const posSpan = document.createElement("span");
      posSpan.className = "pos-field";
      posSpan.textContent = (latStr.trim() && lonStr.trim()) ? `${latStr.trim()}, ${lonStr.trim()}` : (latStr.trim() || lonStr.trim());
      posSpan.title = "Position (tap to edit)";
      posSpan.addEventListener("click", () => handlePositionEdit(entry));
      actions.appendChild(posSpan);
    }

    const delBtn = document.createElement("button");
    delBtn.className = "entry-del-btn";
    delBtn.textContent = "Del";
    delBtn.addEventListener("click", () => deleteLogEntryById(entry.id));
    actions.appendChild(delBtn);

    tdNotes.appendChild(actions);
    tr.appendChild(tdNotes);

    logEntriesContainer.appendChild(tr);
  });

  updateLogSummary();
}

function updateLogSummary() {
  const p = getCurrentPassage();
  if (!p || !p.finish.shutdownLogged) {
    logSummaryPanel.textContent = "";
    return;
  }

  let ehText = "–";
  const start = parseFloat(p.plan.engineHoursStart || "NaN");
  const endVal = parseFloat(p.finish.engineHoursEnd || "NaN");
  if (!isNaN(start) && !isNaN(endVal)) ehText = `${(endVal - start).toFixed(1)} h (from ${start} to ${endVal})`;

  let fuelUsed = "–";
  const sorted = p.entries.slice().sort((a, b) => (a.time > b.time ? 1 : -1));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const fu = parseFloat(sorted[i].fuelUsed || "NaN");
    if (!isNaN(fu)) { fuelUsed = `${fu}`; break; }
  }

  let gLog = "–";
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].groundLog) { gLog = sorted[i].groundLog; break; }
  }


  let durationText = "–";

  // Prefer Slip → Dock times when present (CL-076-7)
  const slipEntry = sorted.find(e => typeof e.notes === 'string' && e.notes.toLowerCase().startsWith('slipped lines'));
  let dockEntry = null;
  if (slipEntry && slipEntry.time) {
    dockEntry = sorted.find(e => e.time && e.time > slipEntry.time && typeof e.notes === 'string' && e.notes.toLowerCase().startsWith('alongside'));
  }

  const tStart = slipEntry && slipEntry.time ? new Date(slipEntry.time) : null;
  const tEnd = dockEntry && dockEntry.time ? new Date(dockEntry.time) : null;

  if (tStart && tEnd && !isNaN(tStart) && !isNaN(tEnd)) {
    const ms = tEnd - tStart;
    if (!isNaN(ms) && ms > 0) {
      const minutes = Math.round(ms / 60000);
      durationText = `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    }
  } else {
    // Fallback: earliest to latest entry
    const times = sorted.map(e => e.time).filter(Boolean).map(t => new Date(t));
    if (times.length >= 2) {
      const min = times.reduce((a, b) => (a < b ? a : b));
      const max = times.reduce((a, b) => (a > b ? a : b));
      const ms = max - min;
      if (!isNaN(ms) && ms > 0) {
        const minutes = Math.round(ms / 60000);
        durationText = `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
      }
    }
  }

  logSummaryPanel.innerHTML = `
    <strong>Summary:</strong>
    Engine hours this passage: ${ehText} |
    Fuel used: ${fuelUsed} |
    Fuel start: ${p.plan.fuelStartPercent || "–"}% |
    Fuel end: ${p.finish.fuelEndPercent || "–"}% |
    Final GLog: ${gLog} |
    Passage duration: ${durationText}
  `;
}

// CSV Export
function exportCurrentPassageToCsv() {
  const p = getCurrentPassage();
  if (!p) return alert("No passage selected.");

  const date = p.plan.date || p.createdAt.slice(0, 10);
  const from = p.plan.from || "UnknownFrom";
  const to = p.plan.to || "UnknownTo";
  const filename = `${date} ${from} - ${to}.csv`.replace(/[/\\?%*:|"<>]/g, "-");

  const lines = [];
  lines.push("Passage Plan");
  lines.push(`Date,${quote(date)}`);
  lines.push(`Origin,${quote(p.plan.from)}`);
  lines.push(`Intended Destination,${quote(p.plan.to)}`);
  lines.push(`Vessel,${quote(p.plan.vessel)}`);
  lines.push(`Skipper,${quote(p.plan.skipper)}`);
  lines.push(`Crew,${quote(p.plan.crew)}`);
  lines.push("");
  lines.push(`Sunrise/Set,${quote(p.plan.sunriseSet)}`);
  lines.push(`Tidal Coefficient,${quote(p.plan.tidalCoeff)}`);
  lines.push("");

  lines.push("Tide Stations");
  lines.push("Station,HW1,HW2,LW1,LW2");
  (p.plan.tideStations || []).forEach(ts => {
    lines.push([ts.name || "", ts.hw1 || "", ts.hw2 || "", ts.lw1 || "", ts.lw2 || ""].map(quote).join(","));
  });
  lines.push("");

  lines.push("Tidal Currents / Flows");
  lines.push(quote(p.plan.currents));
  lines.push("");

  lines.push("Weather");
  lines.push(quote(p.plan.weather));
  lines.push("");

  lines.push("Comms / Pilotage");
  lines.push(quote(p.plan.comms));
  lines.push("");

  lines.push("Daily Summary");
  lines.push("Date,Mooring fee,Notes");
  (p.plan.dailySummaries || []).forEach(ds => {
    lines.push([ds.date || "", ds.fee || "", ds.notes || ""].map(quote).join(","));
  });
  lines.push("");

  lines.push(`Engine hours start,${quote(p.plan.engineHoursStart)}`);
  lines.push(`Fuel start %,${quote(p.plan.fuelStartPercent)}`);
  lines.push("");

  lines.push("Log Entries");
  lines.push(["Time","Lat","Lon","COG/Heading","Speed (kn)","RPM","Eng T/P","WLog (NM)","GLog (NM)","Fuel used","Notes"].map(quote).join(","));

  p.entries.slice().sort((a, b) => (a.time > b.time ? 1 : -1)).forEach(e => {
    lines.push([
      e.time ? e.time.replace("T", " ") : "",
      e.lat, e.lon, e.course, e.speed, e.rpm, e.engTP, e.waterLog, e.groundLog, e.fuelUsed, e.notes
    ].map(quote).join(","));
  });

  lines.push("");
  lines.push("End of Passage");
  lines.push(`Engine hours end,${quote(p.finish.engineHoursEnd)}`);
  lines.push(`Fuel end %,${quote(p.finish.fuelEndPercent)}`);
  lines.push(`Summary notes,${quote(p.finish.notes)}`);

  const csvContent = lines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

exportCsvBtn.addEventListener("click", exportCurrentPassageToCsv);
addEntryBtn.addEventListener("click", () => addLogEntry());

// --- Load passage into UI -----------------------------------------

function loadPassageIntoUI() {
  const p = getCurrentPassage();
  if (!p) {
    planForm?.reset();
    logEntriesContainer.innerHTML = "";
    logEmptyMessage.style.display = "block";
    planSummaryPanel.innerHTML = "<p>No passage selected.</p>";
    logSummaryPanel.textContent = "";
    updatePassageHeader();
    return;
  }

  ensureFlags(p);
  ensureAutoTideStations(p);

  updatePassageHeader();
  loadPlanIntoForm(p);
  updatePlanSummaryPanel();
  renderLogEntries();
  updateLogSummary();
}

// --- Create new passage -------------------------------------------

homeNewPassageBtn.addEventListener("click", () => {
  if (passages.length > 0) {
    const ok = confirm("Start a new passage? (Existing ones will remain in history.)");
    if (!ok) return;
  }
  createPassage();
  switchToTab("planTab");
});

// --- Cache / service-worker reset ----------------------------------------
async function resetPwaCache({ silent=false } = {}) {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if (window.caches && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch (err) {
    console.warn("resetPwaCache failed:", err);
  }
  if (!silent) {
    alert("App cache cleared. The page will now reload (your log data is kept)." );
  }
  const cleanUrl = location.origin + location.pathname + location.hash;
  location.replace(cleanUrl);
}

// --- Initial load --------------------------------------------------

if (new URLSearchParams(location.search).has("reset")) {
  // Emergency recovery: add ?reset=1 to the URL and reload
  resetPwaCache({ silent:true });
} else {
  loadPassages();
  loadPorts();
  setupPortAutocomplete();
  setupPortCoordConfirmation();
  setupPortsManagerModal();
  setupTidePasteModal();
  refreshPortUI();
  applyTheme(localStorage.getItem(THEME_KEY) || "day");

  // Settings: Reset PWA Cache button (keeps log data)
  const resetBtn = document.getElementById("resetPwaCacheBtn");
  if (resetBtn) resetBtn.addEventListener("click", () => resetPwaCache());

  refreshHomePassageList();

  if (!currentPassageId && passages.length > 0) currentPassageId = passages[0].id;

  loadPassageIntoUI();
  setLogLayoutMode("split", splitViewBtn);
}

// Service worker registration (PWA/offline)
if ("serviceWorker" in navigator) {
  // If a new service worker takes control, reload to pick up the new cached assets.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Avoid reload loops
    if (window.__swReloading) return;
    window.__swReloading = true;
    window.location.reload();
  });

  window.addEventListener("load", async () => {
    try {
      const isLocalhost = (location.hostname === "localhost" || location.hostname === "127.0.0.1");
      const isStandalone = ((window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || (window.navigator && window.navigator.standalone === true));
      const ua = navigator.userAgent || "";
      const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua);
      // During development on localhost, don't register the service worker.
      // This prevents stale/broken cached JS from disabling the UI.
      if (!isLocalhost && "serviceWorker" in navigator && (!isSafari || isStandalone)) {
        const reg = await navigator.serviceWorker.register("service-worker.js");
        // Nudge update checks (helps when hopping between versions)
        if (reg.update) reg.update();
      }
    } catch (err) {
      console.warn("Service worker registration failed", err);
    }
  });
}

function closePortsManagerModal(){
  const modal = document.getElementById("portsModal");
  if (modal) modal.classList.add("hidden");
}