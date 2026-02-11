// --- Constants & state ---------------------------------------------

const STORAGE_KEY = "steeler_logbook_passages_v5";
const THEME_KEY   = "steeler_logbook_theme_v1";
const PORTS_KEY   = "steeler_logbook_ports_v1";

const APP_VERSION = "0.7.8";

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
window.addEventListener("DOMContentLoaded", function(){ try{ loadAbbrDb(); }catch(e){} });


let passages = [];
let currentPassageId = null;
let knownPorts = [];
let recentPorts = [];
const PORTS_RECENT_LIMIT = 20;




function portName(p){
  return (typeof p === "string") ? p : (p && typeof p === "object" ? (p.name || "") : "");
}

function ensurePortId(p){
  if (!p || typeof p !== "object") return p;
  if (!p.id){
    p.id = "p_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,8);
  }
  return p;
}

function findPortItemById(id){
  if (!id) return null;
  const s = String(id);
  for (const p of knownPorts){
    if (p && typeof p === "object" && String(p.id || "") === s) return p;
  }
  return null;
}
function portHasCoords(p){
  return p && typeof p === "object" && !isNaN(p.lat) && !isNaN(p.lon);
}
function findPortItemByName(name){
  const n = (name || "").trim();
  if (!n) return null;
  return knownPorts.find(p => portName(p) === n) || null;
}

// Backwards-compatible helper (some newer code expects this name)
function getPortByName(name){
  return findPortItemByName(name);
}

function upsertPortItem(name, lat=null, lon=null, commsPilotage=null){
  // Backwards-compatible wrapper (coords only)
  upsertPortItemExtended(name, lat, lon, commsPilotage);
}

function upsertPortItemExtended(name, lat=null, lon=null, commsPilotage=null){
  const n = (name || "").trim();
  if (!n) return;

  const existingIdx = knownPorts.findIndex(p => portName(p) === n);

  const merge = (existingObj) => {
    const out = { name: n };
    if (existingObj && typeof existingObj === "object"){
      if (existingObj.lat != null) out.lat = Number(existingObj.lat);
      if (existingObj.lon != null) out.lon = Number(existingObj.lon);
            if (existingObj.commsPilotage) out.commsPilotage = String(existingObj.commsPilotage);
      else if (existingObj.comments) out.commsPilotage = String(existingObj.comments);
    }
    if (lat != null && lon != null){
      out.lat = Number(lat);
      out.lon = Number(lon);
    }

    if (commsPilotage !== null && commsPilotage !== undefined){
      // commsPilotage == "" means clear; otherwise set
      if (String(commsPilotage).trim() === "") {
        delete out.commsPilotage;
      } else {
        out.commsPilotage = String(commsPilotage).trim();
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
      knownPorts[existingIdx] = ensurePortId(merge(existing));
    } else {
      knownPorts[existingIdx] = ensurePortId(merge({ name: n }));
    }
  } else {
    knownPorts.push(ensurePortId(merge({ name: n })));
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
      // stash coords directly from Manage Ports for later use (no name re-resolution)
      try {
        const pi = findPortItemByName(name);
        if (pi && pi.lat != null && pi.lon != null) { inputEl.dataset.lat = String(pi.lat); inputEl.dataset.lon = String(pi.lon); }
        if (pi && pi.id) { inputEl.dataset.portId = String(pi.id); }
      } catch(e) {}
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
  inputEl.addEventListener("input", (e) => { delete inputEl.dataset.lat; delete inputEl.dataset.lon; show(); });
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



// Dynamic port autocomplete for modal-created inputs (e.g. Dynamic Leg Extension)
function setupDynamicPortAutocomplete(inputEl, boxEl) {
  if (!inputEl || !boxEl) return;

  const show = () => renderPortSuggestBox(inputEl, boxEl);
  inputEl.addEventListener("input", () => {
    try { delete inputEl.dataset.lat; delete inputEl.dataset.lon; delete inputEl.dataset.portId; } catch(e) {}
    show();
  });
  inputEl.addEventListener("focus", show);
  inputEl.addEventListener("blur", () => {
    // allow click selection
    setTimeout(() => boxEl.classList.add("hidden"), 150);
  });
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape") boxEl.classList.add("hidden");
  });
}

function setupDynamicPortCoordConfirmation(inputEl){
  if (!inputEl) return;
  inputEl.addEventListener("blur", async () => {
    const name = (inputEl.value || "").trim();
    if (!isLikelyRealPortName(name)) return;
    const existing = findPortItemByName(name);
    if (existing && portHasCoords(existing)) { rememberPort(name); return; }
    await maybeSaveNewPort(name);
  });
}
function setupPortAutocomplete() {
  setupSinglePortAutocomplete("planFrom", "planFromSuggest");
  setupSinglePortAutocomplete("planTo", "planToSuggest");
  setupSinglePortAutocomplete("planTransit1", "planTransit1Suggest");
  setupSinglePortAutocomplete("planTransit2", "planTransit2Suggest");
  setupSinglePortAutocomplete("planTransit3", "planTransit3Suggest");
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
  hook(document.getElementById("planTransit1"));
  hook(document.getElementById("planTransit2"));
  hook(document.getElementById("planTransit3"));
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

    // Group D (CL-076-11): per-port comments
    const commentsWrap = document.createElement("div");
    commentsWrap.className = "ports-comments";

    const commentsLabel = document.createElement("div");
    commentsLabel.className = "ports-comments-label";
    commentsLabel.textContent = "Comms / Pilotage";

    const commentsInput = document.createElement("textarea");
    commentsInput.className = "ports-comment-input";
    commentsInput.rows = 2;
    commentsInput.placeholder = "VHF channels, phone numbers, pilotage notes...";
        commentsInput.value = (item && typeof item === "object")
      ? (typeof item.commsPilotage === "string" ? item.commsPilotage : (typeof item.comments === "string" ? item.comments : ""))
      : "";

    const commentsSaveBtn = document.createElement("button");
    commentsSaveBtn.type = "button";
    commentsSaveBtn.className = "ports-mini";
    commentsSaveBtn.textContent = "Save Comms / Pilotage";
    commentsSaveBtn.addEventListener("click", () => {
      upsertPortItemExtended(name, null, null, commentsInput.value);
      savePorts();
      renderPortsManagerList();
    });

    commentsWrap.appendChild(commentsLabel);
    commentsWrap.appendChild(commentsInput);
    commentsWrap.appendChild(commentsSaveBtn);
    left.appendChild(commentsWrap);

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

  // ensure every port has a stable id
  try{ for (const p of knownPorts){ ensurePortId(p); } }catch{}

  // Strip any legacy tideId fields from stored ports (no longer used)
  try{ for (const p of knownPorts){ if (p && typeof p === 'object' && 'tideId' in p) delete p.tideId; } }catch{}
}

function savePorts() {
  try {
    const payload = { all: knownPorts, recent: recentPorts };
    localStorage.setItem(PORTS_KEY, JSON.stringify(payload));
    // If Plan comms is empty, auto-fill from updated port data
    try { updatePlanCommsFromPorts(); } catch(e) {}
    try { updatePlanSummaryPanel(); } catch(e) {}
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

function getPortCoords(name){
  // Coords lookups need to be tolerant: users may have odd whitespace, punctuation,
  // abbreviations, or accents in saved port names.
  const normalisePortQueryLoose = (val) => {
    return (val || "")
      .toString()
      .replace(/\u00A0/g, " ") // NBSP → space
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "") // strip accents
      .trim()
      .replace(/[,]/g, "")
      .replace(/\b(harbour|harbor|marina|port)\b/ig, "")
      .replace(/[^a-z0-9\s]/ig, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  };

  const qStrict = normalisePortQuery(name);
  const q = normalisePortQueryLoose(name);
  if (!q) return null;

  // 1) exact match against stored knownPorts (objects only)
  for (const p of (knownPorts || [])){
    if (p && typeof p === "object" && p.lat != null && p.lon != null){
      const pnStrict = normalisePortQuery(p.name || "");
      const pn = normalisePortQueryLoose(p.name || "");
      if ((pnStrict && qStrict && pnStrict === qStrict) || (pn && pn === q)){
        return { name: p.name || name, lat: Number(p.lat), lon: Number(p.lon) };
      }
    }
  }

  // 1b) tolerant match: if the user types a longer/shorter variant (e.g. "St Cast Le Guildo" vs saved "St Cast"),
  // pick the best (longest) normalised name that is contained within the query (or vice-versa).
  // This is only used for coords lookups; we keep it conservative to avoid accidental wrong matches.
  let best = null;
  let bestLen = 0;
  for (const p of (knownPorts || [])){
    if (p && typeof p === "object" && p.lat != null && p.lon != null){
      const pn = normalisePortQueryLoose(p.name || "");
      if (!pn) continue;
      const match = (q.includes(pn) || pn.includes(q));
      if (match && pn.length > bestLen){
        best = p;
        bestLen = pn.length;
      }
    }
  }
  if (best){
    return { name: best.name || name, lat: Number(best.lat), lon: Number(best.lon) };
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


function getPortCommsPilotageText(portNameStr){
  const name = (portNameStr || "").trim();
  if (!name) return "";
  const item = findPortItemByName(name);
  if (!item || typeof item !== "object") return "";
  const v = (typeof item.commsPilotage === "string" ? item.commsPilotage : (typeof item.comments === "string" ? item.comments : ""));
  return (v || "").trim();
}

function buildPortCommsPilotageText(fromName, toName){
  const parts = [];
  function add(name){
    if (!name) return;
    const p = getPortByName(name);
    if (!p) return;
    const txt = (p.commsPilotage || p.comments || "").toString().trim(); // legacy support
    if (!txt) return;
    parts.push(`${name}:\n${txt}`);
  }
  add((fromName || "").trim());
  const t = (toName || "").trim();
  if (t && t !== (fromName || "").trim()) add(t);
  return parts.join("\n\n");
}

function buildRouteCommsPilotageText(names){
  const parts = [];
  const seen = new Set();
  const list = Array.isArray(names) ? names : [];
  for (const raw of list){
    const name = (raw || "").toString().trim();
    if (!name) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    const p = getPortByName(name);
    if (!p) continue;
    const txt = (p.commsPilotage || p.comments || "").toString().trim();
    if (!txt) continue;
    parts.push(`${name}:\n${txt}`);
  }
  return parts.join("\n\n");
}

function getRoutePortNamesFromForm(){
  const names = [];
  const from = (document.getElementById("planFrom")?.value || "").trim();
  const t1 = (document.getElementById("planTransit1")?.value || "").trim();
  const t2 = (document.getElementById("planTransit2")?.value || "").trim();
  const t3 = (document.getElementById("planTransit3")?.value || "").trim();
  const to  = (document.getElementById("planTo")?.value || "").trim();
  if (from) names.push(from);
  if (t1) names.push(t1);
  if (t2) names.push(t2);
  if (t3) names.push(t3);
  if (to)  names.push(to);
  return names;
}

/**
 * Auto-populate the Plan "Comms / Pilotage Notes" field from per-port Comms/Pilotage,
 * but only if the user hasn't already entered anything.
 */
function updatePlanCommsFromPorts(){
  const ta = document.getElementById("planComms");
  if (!ta) return;

  const existing = (ta.value || "").trim();
  // Overwrite only if blank OR previously auto-filled (so changing From/To can refresh).
  const canOverwrite = !existing || ta.dataset.autofilled === "1";
  if (!canOverwrite) return;

  const names = getRoutePortNamesFromForm();
  // Backward-compat: if only from/to, keep identical output.
  const txt = (names.length <= 2)
    ? buildPortCommsPilotageText(names[0] || "", names[1] || "")
    : buildRouteCommsPilotageText(names);
  if (!txt) return;

  ta.value = txt;
  ta.dataset.autofilled = "1";
  // Persist into the current passage draft if applicable
  try {
    if (typeof updateCurrentPlan === "function") updateCurrentPlan("comms", txt);
  } catch (e) {}
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

  // Persist any in-progress Plan edits (notably Tide Stations) when leaving the Plan tab.
  try {
    const planEl = document.getElementById("planTab");
    const planWasActive = !!(planEl && planEl.classList && planEl.classList.contains("active"));
    if (planWasActive && tabId !== "planTab") {
      const p = getCurrentPassage();
      if (p && p.plan) {
        if (typeof planSunriseSet !== "undefined" && planSunriseSet) p.plan.sunriseSet = planSunriseSet.value.trim();
        if (typeof planMoonPhase !== "undefined" && planMoonPhase) p.plan.moonPhase = planMoonPhase.value.trim();
        if (typeof planMoonRiseSet !== "undefined" && planMoonRiseSet) p.plan.moonRiseSet = planMoonRiseSet.value.trim();
        if (typeof planTidalCoeff !== "undefined" && planTidalCoeff) p.plan.tidalCoeff = planTidalCoeff.value.trim();
        if (typeof planCurrents !== "undefined" && planCurrents) p.plan.currents = planCurrents.value.trim();
        if (typeof planWeather !== "undefined" && planWeather) p.plan.weather = planWeather.value.trim();
        if (typeof planComms !== "undefined" && planComms) p.plan.comms = planComms.value.trim();
        if (typeof readTideStationsFromForm === "function") {
          p.plan.tideStations = readTideStationsFromForm();
          try { ensureAutoTideStations(p); } catch {}
        }
        if (typeof readDailySummariesFromForm === "function") p.plan.dailySummaries = readDailySummariesFromForm();
        try { savePassages(); } catch {}
      }
    }
  } catch {}


  tabButtons.forEach(b => b.classList.toggle("active", b.dataset.tab === tabId));
  tabs.forEach(t => t.classList.toggle("active", t.id === tabId));

  // Keep Home passage highlight in sync with the currently selected passage
  if (tabId === "homeTab") {
    try { refreshHomePassageList(); } catch {}
  }
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
const addTransitPortBtn = document.getElementById("addTransitPortBtn");
const extendLegBtn = document.getElementById("extendLegBtn");
const planTransit1 = document.getElementById("planTransit1");
const planTransit2 = document.getElementById("planTransit2");
const planTransit3 = document.getElementById("planTransit3");
const tp1Label = document.getElementById("tp1Label");
const tp2Label = document.getElementById("tp2Label");
const tp3Label = document.getElementById("tp3Label");
const planPortsGrid = document.getElementById("planPortsGrid");
const planVessel = document.getElementById("planVessel");
const planSkipper = document.getElementById("planSkipper");
const planCrew = document.getElementById("planCrew");
const planSunriseSet = document.getElementById("planSunriseSet");
const planMoonPhase = document.getElementById("planMoonPhase");
const planMoonRiseSet = document.getElementById("planMoonRiseSet");
const planTidalCoeff = document.getElementById("planTidalCoeff");
const planCurrents = document.getElementById("planCurrents");
const planWeather = document.getElementById("planWeather");
const btnFetchWeather = document.getElementById("btnFetchWeather");
const btnFetchWeatherFR = document.getElementById("btnFetchWeatherFR");
if (btnFetchWeather){ btnFetchWeather.textContent = "Fetch Inshore Waters Forecast"; }
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
const exportPdfBtn = document.getElementById("exportPdfBtn");
const printArea = document.getElementById("printArea");
const logSummaryPanel = document.getElementById("logSummaryPanel");

// If the user types into Comms/Pilotage notes, treat it as manual and stop auto-refresh.
planComms?.addEventListener("input", () => {
  planComms.dataset.autofilled = "0";
});

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
  const routeNames = getRouteNames(p);
  const routeText = routeNames.length ? routeNames.join(" → ") : "?";
  headerPassageMain.textContent = `${date} – ${routeText}`;
  // Group C: CL-076-10 — Sunrise/Moon moved into Log > Plan panel
  headerSunrise.textContent = "";

  const crewParts = [];
  if (p.plan.skipper) crewParts.push(`Skipper: ${p.plan.skipper}`);
  if (p.plan.crew)    crewParts.push(`Crew: ${p.plan.crew}`);
  headerCrew.textContent = crewParts.join("  |  ");
}

// Route helper (Origin → Transit(s) → Destination)
function getRouteNames(p){
  if (!p || !p.plan) return [];
  const out = [];
  const from = String(p.plan.from || "").trim();
  if (from) out.push(from);
  const tps = Array.isArray(p.plan.transitPorts) ? p.plan.transitPorts : [];
  tps.forEach(t => {
    const name = (t && typeof t === "object" ? (t.name||"") : String(t||""));
    const n = String(name).trim();
    if (n) out.push(n);
  });
  const to = String(p.plan.to || "").trim();
  if (to) out.push(to);
  return out;
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
      <div style="margin-top:10px">
        <label class="muted" for="pcCommsPilotage" style="display:block; margin-bottom:4px">Comms / Pilotage (optional)</label>
        <textarea id="pcCommsPilotage" rows="2" style="width:100%; border:1px solid var(--line); border-radius:12px; padding:8px; background:var(--panel); color:var(--fg);"></textarea>
      </div>
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

    btnSave?.addEventListener("click", () => {
      const c = (document.getElementById("pcCommsPilotage")?.value || "").trim();
      finish({ action: "save", lat, lon, commsPilotage: c });
    });
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
      const c = (document.getElementById("pcCommsPilotage")?.value || "").trim();
      finish({ action: "save", lat: parsed.lat, lon: parsed.lon, commsPilotage: c });
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
        <div style="margin-top:10px">
          <label class="muted" for="pnmComments" style="display:block; margin-bottom:4px">Comms / Pilotage (optional)</label>
          <textarea id="pnmComments" rows="2" style="width:100%; border:1px solid var(--line); border-radius:12px; padding:8px; background:var(--panel); color:var(--fg);"></textarea>
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
      const c = (document.getElementById("pnmComments")?.value || "").trim();
      finish({ action: "save", lat: parsed.lat, lon: parsed.lon, commsPilotage: c });
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
      upsertPortItem(n, manual.lat, manual.lon, (manual.commsPilotage ?? manual.comments) ?? null);
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
    upsertPortItem(n, decision.lat, decision.lon, (decision.commsPilotage ?? decision.comments) ?? null);
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

  // Group C: moonrise / moonset auto-fill (requested) — uses same origin/dest logic as sun
  try{
    const moonOrigin = calcMoonTimes(date, origin.lat, origin.lon);
    let moonRise = moonOrigin?.rise || null;
    let moonSet  = moonOrigin?.set  || null;

    if (dest && dest !== origin){
      const moonDest = calcMoonTimes(date, dest.lat, dest.lon);
      if (moonDest?.set) moonSet = moonDest.set;
    }

    const riseStr = moonRise ? formatTimeEuropeLondon(moonRise)
      : (moonOrigin?.alwaysUp ? "Always up" : (moonOrigin?.alwaysDown ? "Always down" : ""));
    const setStr  = moonSet ? formatTimeEuropeLondon(moonSet) : "";

    const moonVal = (riseStr || setStr) ? `${riseStr || "—"} / ${setStr || "—"}` : "";
    p.plan.moonRiseSet = moonVal;
    if (planMoonRiseSet) planMoonRiseSet.value = moonVal;
  }catch(e){
    // fail silently; do not block existing logic
  }

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
    card.className = "passage-card" + (passage.id === currentPassageId ? " selected" : "");

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


    // Only show the passage summary once a Shutdown entry has been recorded.
    const hasShutdown = !!passage.finish?.shutdownLogged;
    const s = hasShutdown ? computePassageLogSummary(passage) : null;
    const summaryBits = [];
    if (s?.durationText && s.durationText !== "–") summaryBits.push(`UW ${s.durationText}`);
    if (s?.ehText && s.ehText !== "–") summaryBits.push(`EH ${s.ehText}`);
    if (s?.fuelUsed && s.fuelUsed !== "–") summaryBits.push(`Fuel Used ${s.fuelUsed}`);
    if (s?.gLog && s.gLog !== "–") summaryBits.push(`NM(G) ${s.gLog}`);

    const summary = document.createElement("div");
    summary.className = "passage-card-summary" + (hasShutdown ? "" : " empty");
    summary.textContent = hasShutdown ? (summaryBits.join(" • ") || "—") : "";

    const main = document.createElement("div");
    main.className = "passage-card-main";
    main.appendChild(left);
    main.appendChild(summary);

    const actions = document.createElement("div");
    actions.className = "passage-card-actions";

    const del = document.createElement("button");
    del.className = "passage-delete-btn";
    del.textContent = "Delete";
    del.addEventListener("click", (e) => { e.stopPropagation(); deletePassageById(passage.id); });

    actions.appendChild(del);
    card.appendChild(main);
    card.appendChild(actions);

    card.addEventListener("click", () => {
      currentPassageId = passage.id;
      loadPassageIntoUI();
      // Keep Home selection highlight in sync (even if we immediately jump tabs)
      refreshHomePassageList();
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


// --- Multi-leg helpers (CL-077) ----------------------------------
function getLegCount(p) {
  if (!p || !p.plan) return 1;
  const tps = Array.isArray(p.plan.transitPorts) ? p.plan.transitPorts : [];
  const nonEmpty = tps
    .map(t => (t && typeof t === "object" ? (t.name || "") : String(t || "")))
    .map(s => s.trim())
    .filter(Boolean);
  const hasDest = !!String(p.plan.to || "").trim();
  const base = hasDest ? 1 : 0;
  return Math.max(1, base + nonEmpty.length);
}

function countShutdowns(p) {
  const entries = Array.isArray(p?.entries) ? p.entries : [];
  return entries.filter(e => typeof e?.notes === "string" && e.notes.toLowerCase().startsWith("shutdown")).length;
}

function getCurrentLegIndex(p) {
  const legs = getLegCount(p);
  const done = countShutdowns(p);
  return Math.min(done, Math.max(0, legs - 1));
}

function ensureEntryLegs(p) {
  if (!p || !Array.isArray(p.entries)) return;
  if (p.entries.every(e => typeof e.leg === "number")) return;
  const sorted = [...p.entries].sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
  let leg = 0;
  for (const e of sorted) {
    if (typeof e.leg !== "number") e.leg = leg;
    if (typeof e?.notes === "string" && e.notes.toLowerCase().startsWith("shutdown")) {
      leg += 1;
    }
  }
}

function hasSpecialForLeg(p, kind, legIdx) {
  ensureEntryLegs(p);
  const entries = Array.isArray(p?.entries) ? p.entries : [];
  const k = String(kind || "").toLowerCase();
  return entries.some(e => e.leg === legIdx && typeof e?.notes === "string" && e.notes.toLowerCase().startsWith(k));
}

function updateLegIndicator() {
  const el = document.getElementById('legIndicator');
  if (!el) return;
  const p = getCurrentPassage();
  if (!p) { el.textContent = ''; return; }
  const legs = getLegCount(p);
  if (legs <= 1) { el.textContent = ''; return; }
  const idx = getCurrentLegIndex(p) + 1;
  el.textContent = `Leg ${idx} of ${legs}`;
}

function ensureAutoTideStations(p) {
  if (!p) return;
  if (!p.plan.tideStations) p.plan.tideStations = [];

  const origin = (p.plan.from || "").trim();
  const dest = (p.plan.to || "").trim();
  const transitPorts = (Array.isArray(p.plan.transitPorts) ? p.plan.transitPorts : []);

  // Ordered route list (max 5 ports = 4 legs)
  const route = [];
  if (origin) route.push({ role:"origin", name: origin });
  // Include empty transit slots so their tide stations persist immediately after “+ Transit Port”.
  transitPorts.slice(0,3).forEach((t,i) => {
    const name = (t && typeof t === "object" ? (t.name||"") : String(t||"")).trim();
    route.push({ role:`transit${i+1}`, name });
  });
  if (dest) route.push({ role:"dest", name: dest });

  if (route.length === 0) return;

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

  // Keep user-added manual stations (non-auto) in place.
  const extras = stations.filter(st => st && st.auto !== true);

  // Index existing autos by role for reuse
  const byRole = new Map();
  stations.forEach(st => {
    if (st && st.auto === true && st.role) byRole.set(st.role, st);
  });

  const autos = route.map((r, idx) => {
    let st = byRole.get(r.role);
    if (!st) st = makeBlank(r.name, r.role, idx);
    st = { ...st, name: r.name, role: r.role, auto:true };
    st.id = st.id || `ts_${now}_${r.role}`;
    st.hw1 = st.hw1 || ""; st.hw2 = st.hw2 || "";
    st.lw1 = st.lw1 || ""; st.lw2 = st.lw2 || "";
    st.hw1h = st.hw1h || ""; st.hw2h = st.hw2h || "";
    st.lw1h = st.lw1h || ""; st.lw2h = st.lw2h || "";
    st.events = Array.isArray(st.events) ? st.events : [];
    st.raw = typeof st.raw === "string" ? st.raw : "";
    st.source = st.source || "";
    return st;
  });

  p.plan.tideStations = [...autos, ...extras];
}

// When dynamically extending a passage, we may promote the existing destination
// into a new transit slot. Tide station data previously captured for the dest
// should follow the port, so we migrate the auto station role (presentation only).
function migrateAutoTideRole(p, fromRole, toRole, name){
  try{
    if (!p?.plan?.tideStations) return;
    const stations = Array.isArray(p.plan.tideStations) ? p.plan.tideStations : [];
    const n = String(name||"").trim();
    if (!n) return;
    // Remove any existing auto station already occupying the target role
    for (let i=stations.length-1;i>=0;i--){
      const st = stations[i];
      if (st && st.auto === true && st.role === toRole) stations.splice(i,1);
    }
    const src = stations.find(st => st && st.auto === true && st.role === fromRole && String(st.name||"").trim() === n);
    if (src){
      src.role = toRole;
      src.name = n;
      src.auto = true;
    }
  }catch(e){}
}

// --- CL-077: Transit Ports (up to 3) ---------------------------------------
function normaliseTransitPorts(p){
  if (!p || !p.plan) return [];
  const tp = p.plan.transitPorts;
  if (!Array.isArray(tp)) { p.plan.transitPorts = []; return p.plan.transitPorts; }
  // Legacy: array of strings -> objects
  p.plan.transitPorts = tp.map(t => {
    if (t && typeof t === "object") return { name: (t.name||"").trim(), portId: t.portId ? String(t.portId) : "" };
    return { name: String(t||"").trim(), portId: "" };
  });
  // Cap to 3
  if (p.plan.transitPorts.length > 3) p.plan.transitPorts = p.plan.transitPorts.slice(0,3);
  return p.plan.transitPorts;
}

function setPortsGridCols(count){
  if (!planPortsGrid) return;
  const cols = Math.max(2, Math.min(5, 2 + (count||0)));
  planPortsGrid.style.setProperty("--cols", String(cols));
}

function renderTransitPortsUI(p){
  if (!p) return;
  const tps = normaliseTransitPorts(p);
  const count = tps.length;
  setPortsGridCols(count);
  if (tp1Label) tp1Label.classList.toggle("hidden", count < 1);
  if (tp2Label) tp2Label.classList.toggle("hidden", count < 2);
  if (tp3Label) tp3Label.classList.toggle("hidden", count < 3);

  const inputs = [planTransit1, planTransit2, planTransit3];
  for (let i=0;i<3;i++){
    const el = inputs[i];
    if (!el) continue;
    const val = tps[i] ? (tps[i].name||"") : "";
    el.value = val;
    // hydrate bindings
    try {
      delete el.dataset.lat; delete el.dataset.lon;
      if (tps[i] && tps[i].portId){
        el.dataset.portId = String(tps[i].portId);
        const pi = findPortItemById(tps[i].portId);
        if (pi && pi.lat != null && pi.lon != null){ el.dataset.lat = String(pi.lat); el.dataset.lon = String(pi.lon); }
      } else {
        delete el.dataset.portId;
      }
    } catch(e){}
  }
}

function readTransitPortsFromForm(p){
  if (!p || !p.plan) return;
  const tps = normaliseTransitPorts(p);
  const inputs = [planTransit1, planTransit2, planTransit3];
  for (let i=0;i<3;i++){
    if (!tps[i]) continue;
    const el = inputs[i];
    if (!el) continue;
    tps[i].name = (el.value||"").trim();
    tps[i].portId = el.dataset.portId ? String(el.dataset.portId) : (tps[i].portId||"");
  }
  p.plan.transitPorts = tps;
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
      transitPorts: [],
      vessel: "STEELER",
      skipper: "",
      crew: "",
      sunriseSet: "",
      moonPhase: "",
      moonRiseSet: "",
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
  try{ setWeatherStatus(""); }catch{}
  // hydrate selected port bindings (stable ids) for reliable downstream fetches
  if (planFrom){
    if (p.plan.fromPortId){ planFrom.dataset.portId = String(p.plan.fromPortId); }
    const pi = p.plan.fromPortId ? findPortItemById(p.plan.fromPortId) : null;
    if (pi && pi.lat != null && pi.lon != null){ planFrom.dataset.lat = String(pi.lat); planFrom.dataset.lon = String(pi.lon); }
  }
  if (planTo){
    if (p.plan.toPortId){ planTo.dataset.portId = String(p.plan.toPortId); }
    const pi = p.plan.toPortId ? findPortItemById(p.plan.toPortId) : null;
    if (pi && pi.lat != null && pi.lon != null){ planTo.dataset.lat = String(pi.lat); planTo.dataset.lon = String(pi.lon); }
  }

  // CL-077: Transit Ports UI + bindings
  try { renderTransitPortsUI(p); } catch(e) { console.warn("renderTransitPortsUI", e); }

planVessel.value = p.plan.vessel || "STEELER";
  planSkipper.value = p.plan.skipper || "";
  planCrew.value = p.plan.crew || "";
  planSunriseSet.value = p.plan.sunriseSet || "";
  if (planMoonPhase) {
    const d = p.plan.date || p.createdAt?.slice(0,10) || "";
    planMoonPhase.value = p.plan.moonPhase || (d ? getMoonPhaseLabel(d) : "");
  }
  if (planMoonRiseSet) planMoonRiseSet.value = p.plan.moonRiseSet || "";
  planTidalCoeff.value = p.plan.tidalCoeff || "";
  planCurrents.value = p.plan.currents || "";
  planWeather.value = p.plan.weather || "";
  planComms.value = p.plan.comms || "";
  if (planComms) planComms.dataset.autofilled = "0";
  updatePlanCommsFromPorts();
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
    // Preserve route-role for auto stations (origin/transit/dest) so ensureAutoTideStations
    // can safely reuse edited values rather than regenerating blanks.
    row.dataset.role = st.role || "";

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
      role: row.dataset.role || "",
      hw1, hw2, lw1, lw2,
      hw1h, hw2h, lw1h, lw2h,
      events,
      auto: row.dataset.auto === "true"
    });
  });
  return stations;
}


// Auto-save Tide Station edits so Log > Plan panel reflects manual typing without needing Plan "Save".
let __tideStationsAutosaveTimer = null;
function __scheduleTideStationsAutosave(){
  clearTimeout(__tideStationsAutosaveTimer);
  __tideStationsAutosaveTimer = setTimeout(() => {
    try {
      const p = getCurrentPassage();
      if (!p || !p.plan) return;
      p.plan.tideStations = readTideStationsFromForm();
      try { ensureAutoTideStations(p); } catch {}
      try { savePassages(); } catch {}
      // If Log tab is visible, refresh the left Plan summary panel immediately.
      try {
        const logEl = document.getElementById("logTab");
        if (logEl && logEl.classList && logEl.classList.contains("active")) updatePlanSummaryPanel();
      } catch {}
    } catch {}
  }, 250);
}

// Delegate input/change events from Tide Station fields.
if (tideStationsContainer){
  tideStationsContainer.addEventListener("input", (e) => {
    const t = e.target;
    if (!t || !t.classList) return;
    if (
      t.classList.contains("ts-name") ||
      t.classList.contains("ts-hw1") || t.classList.contains("ts-hw2") ||
      t.classList.contains("ts-lw1") || t.classList.contains("ts-lw2") ||
      t.classList.contains("ts-hw1h") || t.classList.contains("ts-hw2h") ||
      t.classList.contains("ts-lw1h") || t.classList.contains("ts-lw2h")
    ) {
      __scheduleTideStationsAutosave();
    }
  });
  tideStationsContainer.addEventListener("change", (e) => {
    const t = e.target;
    if (!t || !t.classList) return;
    if (
      t.classList.contains("ts-name") ||
      t.classList.contains("ts-hw1") || t.classList.contains("ts-hw2") ||
      t.classList.contains("ts-lw1") || t.classList.contains("ts-lw2") ||
      t.classList.contains("ts-hw1h") || t.classList.contains("ts-hw2h") ||
      t.classList.contains("ts-lw1h") || t.classList.contains("ts-lw2h")
    ) {
      __scheduleTideStationsAutosave();
    }
  });
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
    try { readTransitPortsFromForm(p); } catch(e) {}
    ensureAutoTideStations(p);
    renderTideStations(p);
    updatePlanSummaryPanel();
    updatePassageHeader();
  }, 120);
}

planFrom.addEventListener("input", () => { try{ delete planFrom.dataset.portId; delete planFrom.dataset.lat; delete planFrom.dataset.lon; }catch{} });
planTo.addEventListener("input", () => { try{ delete planTo.dataset.portId; delete planTo.dataset.lat; delete planTo.dataset.lon; }catch{} });
planFrom.addEventListener("input", scheduleAutoTideSync);
planTo.addEventListener("input", scheduleAutoTideSync);

// CL-077: Transit ports drive auto tide stations too
[planTransit1, planTransit2, planTransit3].forEach((el) => {
  if (!el) return;
  el.addEventListener("input", () => { try{ delete el.dataset.portId; delete el.dataset.lat; delete el.dataset.lon; }catch{} });
  el.addEventListener("input", scheduleAutoTideSync);
});

if (addTransitPortBtn){
  addTransitPortBtn.addEventListener("click", () => {
    const p = getCurrentPassage();
    if (!p) return;
    const tps = normaliseTransitPorts(p);
    if (tps.length >= 3) return;
    tps.push({ name:"", portId:"" });
    p.plan.transitPorts = tps;
    renderTransitPortsUI(p);
    // ensure auto tide stations exist for the new slot
    p.plan.from = planFrom.value.trim();
    p.plan.to = planTo.value.trim();
    readTransitPortsFromForm(p);
    ensureAutoTideStations(p);
    renderTideStations(p);
    updatePlanSummaryPanel();
    updatePassageHeader();
  });
}

// CL-077: Dynamic Leg Extension (add a new leg by promoting current destination to a transit port)
if (extendLegBtn){
  extendLegBtn.addEventListener("click", () => {
    const p = getCurrentPassage();
    if (!p) return;

    const currentDest = (planTo?.value || p.plan.to || "").trim();
    if (!currentDest) {
      alert("Set a destination first, then you can add a new leg.");
      return;
    }
    const tps = normaliseTransitPorts(p);
    if (tps.length >= 3) {
      alert("You already have the maximum of 3 transit ports (4 legs). Remove one transit port to add another leg.");
      return;
    }

    showModal({
      title: "Add a leg (extend this passage)",
      okText: "Extend",
      cancelText: "Cancel",
      bodyHtml: `
        <div style="line-height:1.35">
          <p style="margin:0 0 10px 0;">
            This will turn the current destination <b>${escapeHtml(currentDest)}</b> into the next transit port,
            then set a <b>new destination</b>.
          </p>
          <label style="display:block; font-weight:600; margin:0 0 6px 0;">New destination</label>
          <input id="extendNewDest" type="text" style="width:100%; padding:8px;" placeholder="e.g. Poole" />
          <div id="extendNewDestSuggest" class="port-suggest-box hidden"></div>
          <p style="margin:10px 0 0 0; opacity:0.8; font-size:0.92em;">
            Tip: you can refine the destination later using the normal Route fields.
          </p>
        </div>
      `,
      onOk: () => {
        const newDest = (document.getElementById("extendNewDest")?.value || "").trim();
        if (!newDest) return false;

        // Promote current destination into the next transit slot
        const oldToPortId = (planTo?.dataset?.portId || p.plan.toPortId || "").toString().trim();
        const nextIdx = tps.length + 1; // 1-based for role naming
        tps.push({ name: currentDest, portId: oldToPortId });
        p.plan.transitPorts = tps;

        // Preserve any tide station data captured for the old destination by migrating its role
        migrateAutoTideRole(p, "dest", `transit${nextIdx}`, currentDest);

        // Update destination
        p.plan.to = newDest;
        // Best-effort portId binding by name
        const pi = findPortItemByName(newDest);
        if (pi && pi.id) {
          p.plan.toPortId = String(pi.id);
        } else {
          delete p.plan.toPortId;
        }



        // If the passage had previously been completed (final leg shutdown), extending it
        // means it is NO LONGER complete. Clear the overall shutdown flag and end-of-passage fields.
        if (p.finish && p.finish.shutdownLogged) {
          p.finish.shutdownLogged = false;
          p.finish.finishedAt = null;
          p.finish.engineHoursEnd = null;
          p.finish.fuelEndPercent = null;
          p.finish.notes = null;
        }
        // Reflect immediately in the form UI
        renderTransitPortsUI(p);
        if (planTo) {
          planTo.value = newDest;
          try{
            delete planTo.dataset.portId; delete planTo.dataset.lat; delete planTo.dataset.lon;
            if (pi && pi.id) {
              planTo.dataset.portId = String(pi.id);
              if (pi.lat != null && pi.lon != null){ planTo.dataset.lat = String(pi.lat); planTo.dataset.lon = String(pi.lon); }
            }
          }catch(e){}
        }

        // Rebuild auto tide stations for the new route, keeping existing data where roles match
        p.plan.from = (planFrom?.value || p.plan.from || "").trim();
        readTransitPortsFromForm(p);
        ensureAutoTideStations(p);
        renderTideStations(p);

        // Comms/pilotage should follow the new route too
        try{ updatePlanCommsFromPorts(); }catch(e){}

        savePassages();
        updatePlanSummaryPanel();
        updatePassageHeader();
      }
    });

    // Enable the same port dropdown + new-port confirmation flow as the Route fields
    // (matches the behaviour of Origin/Destination/Transit inputs).
    setTimeout(() => {
      try {
        const inp = document.getElementById('extendNewDest');
        const box = document.getElementById('extendNewDestSuggest');
        setupDynamicPortAutocomplete(inp, box);
        setupDynamicPortCoordConfirmation(inp);
      } catch(e) {}
    }, 0);
  });
}


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

    // Group C: CL-076-10 — auto-fill moon phase (does not overwrite manual edits)
    if (planMoonPhase && !planMoonPhase.value.trim() && planDate.value) {
      planMoonPhase.value = getMoonPhaseLabel(planDate.value);
    }
  }, 180);
}
planDate.addEventListener("input", scheduleAutoSunSync);
planFrom.addEventListener("input", scheduleAutoSunSync);
planFrom.addEventListener("input", updatePlanCommsFromPorts);
planTo.addEventListener("input", updatePlanCommsFromPorts);
planTo.addEventListener("input", scheduleAutoSunSync);
planTransit1?.addEventListener("input", updatePlanCommsFromPorts);
planTransit2?.addEventListener("input", updatePlanCommsFromPorts);
planTransit3?.addEventListener("input", updatePlanCommsFromPorts);

// --- CL-080: Unified Marine Worker (route-based) ---
const MARINE_ROUTE_URL = "https://steeler-mf-inshore.bill-merry-52f.workers.dev/marine/route";


// Rough bboxes (lat/lon) to auto-pick a zone from Origin/Destination.
// These are intentionally broad, but constrained to Northern France / Channel / Biscay coast.
const METEOFRANCE_ZONE_BBOX = {
  "Baie de Somme / Cap de la Hague": { minLat: 48.6, maxLat: 51.3, minLon: -1.8, maxLon: 3.0 },
  "Cap de la Hague / Penmarc'h":     { minLat: 47.6, maxLat: 50.9, minLon: -6.0, maxLon: 0.2 },
  "Penmarc'h / Anse de l'Aiguillon": { minLat: 45.5, maxLat: 48.2, minLon: -3.8, maxLon: -0.6 }
};

function getMeteoFranceSamplePointsForCurrentPassage(){
  // Returns an ordered list of lat/lon points to query for Météo-France zones:
  // Origin, (route samples), Destination. We de-dupe later by returned zoneId/zoneName.
  const p = getCurrentPassage();
  if (!p) return [];

  const fromName = (planFrom?.value || p.plan?.from || "").trim();
  const toName   = (planTo?.value   || p.plan?.to   || "").trim();

  // Prefer coords captured from Manage Ports selection (dataset),
  // then coords stored on the passage (plan.fromLat/fromLon etc),
  // then fall back to looking up the port by name.
  const readPlanCoords = (tag) => {
    const lat = Number(p?.plan?.[tag+"Lat"]);
    const lon = Number(p?.plan?.[tag+"Lon"]);
    return (Number.isFinite(lat) && Number.isFinite(lon)) ? { lat, lon } : null;
  };
  const readInputCoords = (el) => {
    if (!el) return null;
    const lat = Number(el.dataset.lat);
    const lon = Number(el.dataset.lon);
    return (Number.isFinite(lat) && Number.isFinite(lon)) ? { lat, lon } : null;
  };

  const fromFinal =
    readInputCoords(planFrom) ||
    readPlanCoords("from") ||
    (fromName ? getPortCoords(fromName) : null);

  const toFinal =
    readInputCoords(planTo) ||
    readPlanCoords("to") ||
    (toName ? getPortCoords(toName) : null);

  const pts = [];
  const okFrom = fromFinal && Number.isFinite(fromFinal.lat) && Number.isFinite(fromFinal.lon);
  const okTo   = toFinal   && Number.isFinite(toFinal.lat)   && Number.isFinite(toFinal.lon);

  if (okFrom) pts.push({ lat: fromFinal.lat, lon: fromFinal.lon, tag: "Origin" });

  // If we have both ends, sample along the straight line to catch zone transitions en-route.
  if (okFrom && okTo){
    const steps = 5; // includes endpoints; light-touch to avoid too many calls
    for (let i=1; i<steps-1; i++){
      const t = i/(steps-1);
      const lat = fromFinal.lat + (toFinal.lat - fromFinal.lat)*t;
      const lon = fromFinal.lon + (toFinal.lon - fromFinal.lon)*t;
      pts.push({ lat, lon, tag: `En-route ${Math.round(t*100)}%` });
    }
  }

  if (okTo && (!okFrom || (fromFinal.lat !== toFinal.lat || fromFinal.lon !== toFinal.lon))){
    pts.push({ lat: toFinal.lat, lon: toFinal.lon, tag: "Destination" });
  }

  return pts;
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
  // Upsert (replace) a named section in the Weather textarea.
  // If content is null/empty, this acts as a delete (removes existing blocks and does NOT re-add a header).
  const key = String(sectionKey || "").trim();
  if (!key) return (existingText || "").trim();

  const markersForKey = (k) => {
    if (!k) return [];
    if (k.toUpperCase() === "METEOFRANCE" || k.toUpperCase() === "MÉTÉO-FRANCE" || k.toUpperCase() === "METEO-FRANCE") {
      return ["METEOFRANCE","METEO-FRANCE","MÉTÉO-FRANCE","METEO FRANCE","METEO‑FRANCE","MÉTÉO‑FRANCE","meteofrance","Météo‑France","Meteo France"];
    }
    if (k.toUpperCase() === "MET OFFICE") {
      return ["Met Office","MET OFFICE","metoffice"];
    }
    return [k];
  };

  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  let base = (existingText || "").trim();

  // Remove any existing blocks for this section (including historical variants).
  for (const k of markersForKey(key)) {
    const start = `=== ${k} ===`;
    const end   = `=== End ${k} ===`;
    const re = new RegExp(`\\n?${esc(start)}\\n[\\s\\S]*?\\n${esc(end)}\\n?`, "gi");
    base = base.replace(re, "\n");
  }
  base = base.replace(/\n{3,}/g, "\n\n").trim();

  const body = (content == null) ? "" : String(content).trim();
  const ttl  = (titleLine == null) ? "" : String(titleLine).trim();

  // Delete-only: if there is no body AND no title, or body is empty, do not re-add a block.
  if (!body && !ttl) return base;
  if (!body) return base; // don't emit empty provider headers

  const start = `=== ${key} ===`;
  const end   = `=== End ${key} ===`;

  const block = [start, ttl, body, end].filter(Boolean).join("\n");
  return (base ? (base + "\n\n" + block) : block).trim();
}



// --- CL-078 Weather shorthand + formatting (Met Office / Channel Islands) ---
function normalizeSpaces(s){
  return (s||"").replace(/\s+/g," ").trim();
}

function toUpperSafe(s){ return (s||"").toUpperCase(); }

// --- CL-081: Abbreviations DB (v0.7.0) ----------------------------------
// We keep the existing hard-coded shorthand (abbreviateMetOfficeText) as the
// baseline, then apply user-defined rules from localStorage on top.
// This lets Bill add context-specific rules (e.g. "R" => "RAIN" in WEATHER,
// but "R" => "ROUGH" in SEA) without risking regression in the base logic.

const ABBR_DB_KEY = "STEELER_ABBR_DB_V1";

function _escapeRegExp(s){ return String(s||"").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function getDefaultAbbrDb(){
  // CL-081: Single-source-of-truth defaults (previous built-in Met Office shorthands)
  return {"version":1,"seededFromDefaults":true,"updatedAt":null,"groups":{"global":[],"byCategory":{"wind":[],"sea":[],"weather":[],"vis":[],"swl":[]},"providers":{"metoffice":{"global":[{"id":"mo_001","from":"\\bSOUTH\\s+OR\\s+SOUTHEAST\\b","to":"S/SE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_002","from":"\\bSOUTH\\s+TO\\s+SOUTHEAST\\b","to":"S/SE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_003","from":"\\bSOUTH\\s+OR\\s+SOUTHWEST\\b","to":"S/SW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_004","from":"\\bSOUTH\\s+TO\\s+SOUTHWEST\\b","to":"S/SW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_005","from":"\\bWEST\\s+OR\\s+SOUTHWEST\\b","to":"W/SW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_006","from":"\\bWEST\\s+TO\\s+SOUTHWEST\\b","to":"W/SW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_007","from":"\\bSOUTH\\s+OR\\s+WEST\\b","to":"S/W","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_008","from":"\\bSOUTHEAST\\s+OR\\s+VARIABLE\\b","to":"SE/VAR","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_009","from":"\\bNORTH\\s+OR\\s+NORTHEAST\\b","to":"N/NE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_010","from":"\\bNORTH\\s+TO\\s+NORTHEAST\\b","to":"N/NE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_011","from":"\\bEAST\\s+OR\\s+SOUTHEAST\\b","to":"E/SE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_012","from":"\\bEAST\\s+TO\\s+SOUTHEAST\\b","to":"E/SE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_013","from":"\\bSOUTHERLY\\b","to":"S","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_014","from":"\\bNORTHERLY\\b","to":"N","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_015","from":"\\bEASTERLY\\b","to":"E","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_016","from":"\\bWESTERLY\\b","to":"W","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_017","from":"\\bSOUTHEASTERLY\\b","to":"SE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_018","from":"\\bSOUTHWESTERLY\\b","to":"SW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_019","from":"\\bNORTHEASTERLY\\b","to":"NE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_020","from":"\\bNORTHWESTERLY\\b","to":"NW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_021","from":"\\bOCCASIONALLY\\b","to":"OCC","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_022","from":"\\bOCCASIONAL\\b","to":"OCC","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_023","from":"\\bINCREASING\\b","to":"INC","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_024","from":"\\bINCREASE\\b","to":"INC","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_025","from":"\\bDECREASING\\b","to":"DEC","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_026","from":"\\bDECREASE\\b","to":"DEC","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_027","from":"\\bVEERING\\b","to":"V","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_028","from":"\\bBACKING\\b","to":"BK","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_029","from":"\\bBECOMING\\b","to":"→","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_030","from":"\\bTHEN\\b","to":"→","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_031","from":"\\bLATER\\b","to":"LTR","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_032","from":"\\bAT\\s+FIRST\\b","to":"1ST","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_033","from":"\\bFOR\\s+A\\s+TIME\\b","to":"T","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_034","from":"\\bAT\\s+TIMES\\b","to":"TS","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_035","from":"\\bMAINLY\\b","to":"MLY","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_036","from":"\\bVARIABLE\\b","to":"VRB","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_037","from":"\\bLOCALLY\\b","to":"LOC","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_038","from":"\\bSWELL\\b","to":"SWL","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_039","from":"\\bA\\s+TIME\\b","to":"T","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_040","from":"\\bUNTIL\\b","to":"UNTIL","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_041","from":"\\bTILL\\b","to":"TIL","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_042","from":"\\bOVER\\s+NIGHT\\b","to":"O/N","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_043","from":"\\bOVERNIGHT\\b","to":"O/N","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_044","from":"\\bTHIS\\s+EVENING\\b","to":"EVE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_045","from":"\\bEVENING\\b","to":"EVE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_046","from":"\\bAFTER\\s+MIDNIGHT\\b","to":"AFT MID","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_047","from":"\\bAFTER\\s+DUSK\\b","to":"AFT DUSK","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_048","from":"\\bTOWARDS\\s+DAWN\\b","to":"TWD DAWN","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_049","from":"\\bBY\\s+MIDDAY\\b","to":"MID","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_050","from":"\\bMIDDAY\\b","to":"MID","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_051","from":"\\bMORNING\\b","to":"AM","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_052","from":"\\bAFTERNOON\\b","to":"PM","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_053","from":"\\bCLEARING\\b","to":"CLR","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_054","from":"\\bSPREADING\\b","to":"SPR","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_055","from":"\\bEASTWARDS\\b","to":"E","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_056","from":"\\bWESTWARDS\\b","to":"W","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_057","from":"\\bNORTHWARDS\\b","to":"N","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_058","from":"\\bSOUTHWARDS\\b","to":"S","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_059","from":"\\bMID\\s+CHANNEL\\b","to":"MID-CH","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_060","from":"\\bGALE\\s+8\\b","to":"8","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_061","from":"\\bSEVERE\\s+GALE\\s+9\\b","to":"SEV 9","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_062","from":"\\bSTORM\\s+10\\b","to":"STM 10","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_063","from":"\\bVIOLENT\\s+STORM\\s+11\\b","to":"VSTM 11","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_064","from":"\\bHURRICANE\\s+12\\b","to":"HURR 12","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_065","from":"\\bGOOD\\b","to":"G","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_066","from":"\\bPOOR\\b","to":"P","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_067","from":"\\bSOUTH\\s+(?:TO|OR)\\s+SOUTH\\s*EAST\\b","to":"S/SE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_068","from":"\\bSOUTH\\s+(?:TO|OR)\\s+SOUTH\\s*WEST\\b","to":"S/SW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_069","from":"\\bWEST\\s+TO\\s+SOUTH\\s*WEST\\b","to":"W/SW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_070","from":"\\bEAST\\s+OR\\s+SOUTH\\s*EAST\\b","to":"E/SE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_071","from":"\\bEAST\\s+OR\\s+NORTH\\s*EAST\\b","to":"E/NE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_072","from":"\\bNORTH\\s+(?:TO|OR)\\s+NORTH\\s*EAST\\b","to":"N/NE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_073","from":"\\bNORTH\\s+(?:TO|OR)\\s+NORTH\\s*WEST\\b","to":"N/NW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_074","from":"\\bWEST\\s+OR\\s+NORTH\\s*WEST\\b","to":"W/NW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_075","from":"\\bSOUTH\\s+OF\\b","to":"S OF","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_076","from":"\\bNORTH\\s+OF\\b","to":"N OF","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_077","from":"\\bEAST\\s+OF\\b","to":"E OF","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_078","from":"\\bWEST\\s+OF\\b","to":"W OF","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_079","from":"\\bSOUTH\\s*EAST\\s+OF\\b","to":"SE OF","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_080","from":"\\bSOUTH\\s*WEST\\s+OF\\b","to":"SW OF","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_081","from":"\\bNORTH\\s*EAST\\s+OF\\b","to":"NE OF","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_082","from":"\\bNORTH\\s*WEST\\s+OF\\b","to":"NW OF","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_083","from":"\\bSOUTH\\s*EASTERLY\\b","to":"SE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_084","from":"\\bSOUTH\\s*WESTERLY\\b","to":"SW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_085","from":"\\bNORTH\\s*EASTERLY\\b","to":"NE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_086","from":"\\bNORTH\\s*WESTERLY\\b","to":"NW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_087","from":"\\bSOUTH\\s*EAST\\b","to":"SE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_088","from":"\\bSOUTH\\s*WEST\\b","to":"SW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_089","from":"\\bNORTH\\s*EAST\\b","to":"NE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_090","from":"\\bNORTH\\s*WEST\\b","to":"NW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_091","from":"\\bSOUTHERLY\\b","to":"S","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_092","from":"\\bNORTHEASTERLY\\b","to":"NE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_093","from":"\\bNORTHWESTERLY\\b","to":"NW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_094","from":"\\bSOUTHEASTERLY\\b","to":"SE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_095","from":"\\bSOUTHWESTERLY\\b","to":"SW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_096","from":"\\bSOUTHEAST\\b","to":"SE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_097","from":"\\bSOUTHWEST\\b","to":"SW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_098","from":"\\bNORTHEAST\\b","to":"NE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_099","from":"\\bNORTHWEST\\b","to":"NW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_100","from":"\\bSOUTH\\b","to":"S","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_101","from":"\\bNORTH\\b","to":"N","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_102","from":"\\bEAST\\b","to":"E","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_103","from":"\\bWEST\\b","to":"W","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_104","from":"\\bMID[- ]CHANNEL\\b","to":"MID-CH","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_105","from":"\\bFAR\\s+W(?:EST)?\\b","to":"FAR W","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_106","from":"\\bIN\\s+THE\\s+AM\\b","to":"AM","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_107","from":"\\bTOMORROW\\b","to":"TMW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_108","from":"\\bFROM\\b","to":"FR","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_109","from":"\\bHEAVY\\b","to":"HVY","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_110","from":"\\bISOLATED\\b","to":"ISO","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_111","from":"\\bCLEARING\\b","to":"CLR","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_112","from":"\\bSPREADING\\b","to":"SPR","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_113","from":"\\bTHUNDERY\\b","to":"TH","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_114","from":"\\bSEV\\s+9\\s+OR\\s+STM\\s+10\\b","to":"9/10","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_115","from":"\\bSEV\\s+9\\s+OR\\s+STORM\\s+10\\b","to":"9/10","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_116","from":"\\bOCC\\s+SEV\\s+9\\b","to":"OCC 9","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_117","from":"\\bBUT\\s+OCC\\s+SEV\\s+9\\b","to":"BUT OCC 9","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_118","from":"\\b(\\d{1,2})\\s+OR\\s+(\\d{1,2})\\b","to":"$1/$2","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_119","from":"\\b([A-Z]{1,3})\\s+OR\\s+([A-Z]{1,3})\\b","to":"$1/$2","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_120","from":"\\bTO\\b","to":"-","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_121","from":"\\b(\\d{1,2})\\s*-\\s*(\\d{1,2})\\b","to":"$1-$2","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_122","from":"\\b(\\d{1,2})\\s*-\\s*GALE\\s*(\\d{1,2})\\b","to":"$1-$2","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_123","from":"\\bPERHAPS\\s+([A-Z]{1,3})\\b","to":"$1?","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_124","from":"\\bPERHAPS\\s+([A-Z]{1,3}\\/[A-Z]{1,3})\\b","to":"$1?","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_125","from":"\\bPERHAPS\\b","to":"?","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_126","from":"\\s+\\.","to":".","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_127","from":"\\s+,","to":",","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_128","from":"\\s{2,}","to":" ","mode":"regex","enabled":true,"flags":"g"}],"byCategory":{"wind":[],"sea":[],"weather":[],"vis":[],"swl":[]}},"meteofrance":{"global":[],"byCategory":{"wind":[],"sea":[],"weather":[],"vis":[],"swl":[]}}}}};
}

function loadAbbrDb(options){
  // CL-081 (v0.7.7): Flat Abbreviations DB (no categories, no provider differentiation)
  // options:
  //  - forceReset: overwrite DB with shipped defaults
  const opts = options || {};
  const shipped = getDefaultAbbrDb(); // legacy-shaped defaults (we flatten them)

  const flattenGroups = (groups) => {
    const out = [];
    const seen = new Set();
    const pushArr = (arr) => {
      (arr || []).forEach(r => {
        if (!r || typeof r !== "object") return;
        const id = r.id || ("r_" + out.length);
        if (seen.has(id)) return;
        seen.add(id);
        out.push(Object.assign({ enabled:true, mode:"word" }, r, { id }));
      });
    };

    if (!groups || typeof groups !== "object") return out;

    // global
    pushArr(groups.global);

    // byCategory (legacy) — we now ignore category, but we include the rules
    if (groups.byCategory){
      ["wind","sea","weather","vis","swl"].forEach(k => pushArr(groups.byCategory[k]));
    }

    // providers (legacy) — we now ignore provider, but we include the rules
    if (groups.providers){
      Object.keys(groups.providers).forEach(p => {
        const gp = groups.providers[p] || {};
        pushArr(gp.global);
        if (gp.byCategory){
          ["wind","sea","weather","vis","swl"].forEach(k => pushArr(gp.byCategory[k]));
        }
      });
    }
    return out;
  };

  const shippedFlat = () => ({
    version: 2,
    seededFromDefaults: true,
    updatedAt: null,
    rules: flattenGroups(shipped.groups)
  });

  const mergeById = (targetRules, shippedRules) => {
    const ids = new Set((targetRules||[]).map(r => r && r.id).filter(Boolean));
    (shippedRules||[]).forEach(r => { if (r && r.id && !ids.has(r.id)) targetRules.push(r); });
    return targetRules;
  };

  try{
    if (opts.forceReset){
      const d = shippedFlat();
      localStorage.setItem(ABBR_DB_KEY, JSON.stringify(d));
      return d;
    }

    const raw = localStorage.getItem(ABBR_DB_KEY);
    if (!raw){
      const d = shippedFlat();
      localStorage.setItem(ABBR_DB_KEY, JSON.stringify(d));
      return d;
    }

    let db = JSON.parse(raw);

    // Already flat?
    if (db && typeof db === "object" && Array.isArray(db.rules)){
      if (db.seededFromDefaults !== true){
        // one-time upgrade merge of shipped defaults (non-destructive)
        db.rules = mergeById(db.rules, shippedFlat().rules);
        db.seededFromDefaults = true;
        db.updatedAt = new Date().toISOString();
        localStorage.setItem(ABBR_DB_KEY, JSON.stringify(db));
      }
      return db;
    }

    // Legacy shaped DB — migrate once to flat, preserving user edits and adding shipped defaults.
    const migrated = shippedFlat();
    const legacyRules = flattenGroups(db && db.groups ? db.groups : null);
    migrated.rules = mergeById(legacyRules, migrated.rules); // keep legacy first (user wins on duplicate ids)
    migrated.seededFromDefaults = true;
    migrated.updatedAt = new Date().toISOString();
    localStorage.setItem(ABBR_DB_KEY, JSON.stringify(migrated));
    return migrated;

  }catch(e){
    // Fallback: restore shipped defaults
    const d = shippedFlat();
    localStorage.setItem(ABBR_DB_KEY, JSON.stringify(d));
    return d;
  }
}

function saveAbbrDb(db){
  try{
    db.updatedAt = new Date().toISOString();
    localStorage.setItem(ABBR_DB_KEY, JSON.stringify(db));
    return true;
  }catch(e){ return false; }
}

function applyAbbrRules(text, rules){
  let s = String(text ?? "");
  (rules || []).forEach(rule => {
    try{
      if (!rule || rule.enabled === false) return;
      const from = String(rule.from ?? "");
      const to   = String(rule.to   ?? "");
      if (!from) return;

      const mode = (rule.mode || "plain").toLowerCase();

      if (mode === "regex"){
        // Default to case-insensitive global matching so rules work with native-case forecasts
        let flags = rule.flags ? String(rule.flags) : "gi";
        if (!flags.includes("g")) flags += "g";
        if (!flags.includes("i")) flags += "i";
        const re = new RegExp(from, flags);
        s = s.replace(re, to);
      } else if (mode === "word"){
        const re = new RegExp("\\b" + _escapeRegExp(from) + "\\b", "gi");
        s = s.replace(re, to);
      } else { // plain
        const re = new RegExp(_escapeRegExp(from), 'gi');
        s = s.replace(re, to);
      }
    }catch(e){
      // ignore bad rule
    }
  });
  return s;
}


function applyAbbrDbToText(text, provider, category){
  // v0.7.7: Flat DB — provider/category ignored.
  const db = loadAbbrDb();
  const rules = Array.isArray(db.rules) ? db.rules : [];
  let out = String(text ?? "");
  // Apply in order; defaults are case-insensitive by default.
  rules.forEach(r => {
    if (!r || r.enabled === false) return;
    out = applyAbbrRules(out, [r]);
  });
  return out;
}

function abbreviateTextWithDb(text, provider, category){
  // CL-081: Apply shorthands from DB only (single source of truth)
  const p = (provider || "").toLowerCase();
  const base = normalizeSpaces(text);
  return applyAbbrDbToText(base, p, category);
}

function stripMetOfficeCopyright(raw){
  if(!raw) return raw;
  // Remove the copyright footer and URLs if present
  return raw
    .replace(/\[©\s*Crown\s*copyright\][\s\S]*?===\s*End\s*Met\s*Office\s*===/i, "=== End Met Office ===")
    .replace(/\[©\s*CROWN\s*COPYRIGHT\][\s\S]*?===\s*End\s*Met\s*Office\s*===/i, "=== End Met Office ===")
    .replace(/\[©\s*CROWN\s*COPYRIGHT\][\s\S]*$/i, "")
    .trim();
}

function abbreviateMetOfficeText(t){
  let s = toUpperSafe(normalizeSpaces(t));

  // Common phrase reductions (order matters)
  const reps = [
    [/\bSOUTH\s+OR\s+SOUTHEAST\b/g, "S/SE"],
    [/\bSOUTH\s+TO\s+SOUTHEAST\b/g, "S/SE"],
    [/\bSOUTH\s+OR\s+SOUTHWEST\b/g, "S/SW"],
    [/\bSOUTH\s+TO\s+SOUTHWEST\b/g, "S/SW"],
    [/\bWEST\s+OR\s+SOUTHWEST\b/g, "W/SW"],
    [/\bWEST\s+TO\s+SOUTHWEST\b/g, "W/SW"],
    [/\bSOUTH\s+OR\s+WEST\b/g, "S/W"],
    [/\bSOUTHEAST\s+OR\s+VARIABLE\b/g, "SE/VAR"],
    [/\bNORTH\s+OR\s+NORTHEAST\b/g, "N/NE"],
    [/\bNORTH\s+TO\s+NORTHEAST\b/g, "N/NE"],
    [/\bEAST\s+OR\s+SOUTHEAST\b/g, "E/SE"],
    [/\bEAST\s+TO\s+SOUTHEAST\b/g, "E/SE"],
    [/\bSOUTHERLY\b/g, "S"],
    [/\bNORTHERLY\b/g, "N"],
    [/\bEASTERLY\b/g, "E"],
    [/\bWESTERLY\b/g, "W"],
    [/\bSOUTHEASTERLY\b/g, "SE"],
    [/\bSOUTHWESTERLY\b/g, "SW"],
    [/\bNORTHEASTERLY\b/g, "NE"],
    [/\bNORTHWESTERLY\b/g, "NW"],
  ];
  reps.forEach(([re, rep]) => { s = s.replace(re, rep); });

  // Words/verbs
  const reps2 = [
    [/\bOCCASIONALLY\b/g, "OCC"],
    [/\bOCCASIONAL\b/g, "OCC"],
    [/\bINCREASING\b/g, "INC"],
    [/\bINCREASE\b/g, "INC"],
    [/\bDECREASING\b/g, "DEC"],
    [/\bDECREASE\b/g, "DEC"],
    [/\bVEERING\b/g, "V"],
    [/\bBACKING\b/g, "BK"],
    [/\bBECOMING\b/g, "→"],
    [/\bTHEN\b/g, "→"],
    [/\bLATER\b/g, "LTR"],
    [/\bAT\s+FIRST\b/g, "1ST"],
    [/\bFOR\s+A\s+TIME\b/g, "T"],
    [/\bAT\s+TIMES\b/g, "TS"],
    [/\bMAINLY\b/g, "MLY"],
    [/\bVARIABLE\b/g, "VRB"],
    [/\bLOCALLY\b/g, "LOC"],
    [/\bSWELL\b/g, "SWL"],
    [/\bA\s+TIME\b/g, "T"],
    [/\bUNTIL\b/g, "UNTIL"],
    [/\bTILL\b/g, "TIL"],
    [/\bOVER\s+NIGHT\b/g, "O/N"],
    [/\bOVERNIGHT\b/g, "O/N"],
    [/\bTHIS\s+EVENING\b/g, "EVE"],
    [/\bEVENING\b/g, "EVE"],
    [/\bAFTER\s+MIDNIGHT\b/g, "AFT MID"],
    [/\bAFTER\s+DUSK\b/g, "AFT DUSK"],
    [/\bTOWARDS\s+DAWN\b/g, "TWD DAWN"],
    [/\bBY\s+MIDDAY\b/g, "MID"],
    [/\bMIDDAY\b/g, "MID"],
    [/\bMORNING\b/g, "AM"],
    [/\bAFTERNOON\b/g, "PM"],
    [/\bCLEARING\b/g, "CLR"],
    [/\bSPREADING\b/g, "SPR"],
    [/\bEASTWARDS\b/g, "E"],
    [/\bWESTWARDS\b/g, "W"],
    [/\bNORTHWARDS\b/g, "N"],
    [/\bSOUTHWARDS\b/g, "S"],
    [/\bMID\s+CHANNEL\b/g, "MID-CH"],
  ];
  reps2.forEach(([re, rep]) => { s = s.replace(re, rep); });

  // Beaufort descriptors
  s = s.replace(/\bGALE\s+8\b/g, "8");
  s = s.replace(/\bSEVERE\s+GALE\s+9\b/g, "SEV 9");
  s = s.replace(/\bSTORM\s+10\b/g, "STM 10");
  s = s.replace(/\bVIOLENT\s+STORM\s+11\b/g, "VSTM 11");
  s = s.replace(/\bHURRICANE\s+12\b/g, "HURR 12");

  // Sea state words
  const sea = [
    [/\bVERY\s+ROUGH\b/g, "VR"],
    [/\bRATHER\s+ROUGH\b/g, "RR"],
    [/\bROUGH\b/g, "R"],
    [/\bMODERATE\b/g, "M"],
    [/\bSLIGHT\b/g, "SL"],
    [/\bSMOOTH\b/g, "SM"],
  ];
  sea.forEach(([re, rep]) => { s = s.replace(re, rep); });

  // Weather words
  const wx = [
    [/\bSHOWERS\b/g, "SH"],
    [/\bSHOWER\b/g, "SH"],
    [/\bRAIN\b/g, "R"],
    [/\bDRIZZLE\b/g, "DZ"],
    [/\bFAIR\b/g, "F"],
    [/\bMIST\b/g, "MST"],
    [/\bFOG\b/g, "FG"],
    [/\bTHUNDER\b/g, "TH"],
    [/\bTHUNDERSTORM\b/g, "TH"],
  ];
  wx.forEach(([re, rep]) => { s = s.replace(re, rep); });

  // Visibility words
  s = s.replace(/\bGOOD\b/g, "G");
  s = s.replace(/\bPOOR\b/g, "P");
  // Moderate in VIS context is ambiguous; keep as M.

  // Compass/direction abbreviations (apply BEFORE converting TO -> -)
  // Common combined phrases
  s = s.replace(/\bSOUTH\s+(?:TO|OR)\s+SOUTH\s*EAST\b/g, "S/SE");
  s = s.replace(/\bSOUTH\s+(?:TO|OR)\s+SOUTH\s*WEST\b/g, "S/SW");
  s = s.replace(/\bWEST\s+TO\s+SOUTH\s*WEST\b/g, "W/SW");
  s = s.replace(/\bEAST\s+OR\s+SOUTH\s*EAST\b/g, "E/SE");
  s = s.replace(/\bEAST\s+OR\s+NORTH\s*EAST\b/g, "E/NE");
  s = s.replace(/\bNORTH\s+(?:TO|OR)\s+NORTH\s*EAST\b/g, "N/NE");
  s = s.replace(/\bNORTH\s+(?:TO|OR)\s+NORTH\s*WEST\b/g, "N/NW");
  s = s.replace(/\bWEST\s+OR\s+NORTH\s*WEST\b/g, "W/NW");

  // Geographic "X OF" phrases first (so SOUTH doesn't become S too early)
  s = s.replace(/\bSOUTH\s+OF\b/g, "S OF");
  s = s.replace(/\bNORTH\s+OF\b/g, "N OF");
  s = s.replace(/\bEAST\s+OF\b/g, "E OF");
  s = s.replace(/\bWEST\s+OF\b/g, "W OF");
  s = s.replace(/\bSOUTH\s*EAST\s+OF\b/g, "SE OF");
  s = s.replace(/\bSOUTH\s*WEST\s+OF\b/g, "SW OF");
  s = s.replace(/\bNORTH\s*EAST\s+OF\b/g, "NE OF");
  s = s.replace(/\bNORTH\s*WEST\s+OF\b/g, "NW OF");

  // Standalone compass words
  s = s.replace(/\bSOUTH\s*EASTERLY\b/g, "SE");
  s = s.replace(/\bSOUTH\s*WESTERLY\b/g, "SW");
  s = s.replace(/\bNORTH\s*EASTERLY\b/g, "NE");
  s = s.replace(/\bNORTH\s*WESTERLY\b/g, "NW");
  s = s.replace(/\bSOUTH\s*EAST\b/g, "SE");
  s = s.replace(/\bSOUTH\s*WEST\b/g, "SW");
  s = s.replace(/\bNORTH\s*EAST\b/g, "NE");
  s = s.replace(/\bNORTH\s*WEST\b/g, "NW");
  s = s.replace(/\bSOUTHERLY\b/g, "S");
  s = s.replace(/\bNORTHEASTERLY\b/g, "NE");
  s = s.replace(/\bNORTHWESTERLY\b/g, "NW");
  s = s.replace(/\bSOUTHEASTERLY\b/g, "SE");
  s = s.replace(/\bSOUTHWESTERLY\b/g, "SW");
  s = s.replace(/\bSOUTHEAST\b/g, "SE");
  s = s.replace(/\bSOUTHWEST\b/g, "SW");
  s = s.replace(/\bNORTHEAST\b/g, "NE");
  s = s.replace(/\bNORTHWEST\b/g, "NW");
  s = s.replace(/\bSOUTH\b/g, "S");
  s = s.replace(/\bNORTH\b/g, "N");
  s = s.replace(/\bEAST\b/g, "E");
  s = s.replace(/\bWEST\b/g, "W");

  // Extra Met Office / Channel Islands vocab tweaks
  s = s.replace(/\bMID[- ]CHANNEL\b/g, "MID-CH");
  s = s.replace(/\bFAR\s+W(?:EST)?\b/g, "FAR W");
  s = s.replace(/\bIN\s+THE\s+AM\b/g, "AM");
  s = s.replace(/\bTOMORROW\b/g, "TMW");
  s = s.replace(/\bFROM\b/g, "FR");
  s = s.replace(/\bHEAVY\b/g, "HVY");
  s = s.replace(/\bISOLATED\b/g, "ISO");
  s = s.replace(/\bCLEARING\b/g, "CLR");
  s = s.replace(/\bSPREADING\b/g, "SPR");
  s = s.replace(/\bTHUNDERY\b/g, "TH");

  // Reduce Beaufort descriptors when paired (e.g. "SEV 9 OR STM 10" -> "9/10"; "OCC SEV 9" -> "OCC 9")
  s = s.replace(/\bSEV\s+9\s+OR\s+STM\s+10\b/g, "9/10");
  s = s.replace(/\bSEV\s+9\s+OR\s+STORM\s+10\b/g, "9/10");
  s = s.replace(/\bOCC\s+SEV\s+9\b/g, "OCC 9");
  s = s.replace(/\bBUT\s+OCC\s+SEV\s+9\b/g, "BUT OCC 9");

  // Replace "OR" with "/" in common abbreviated constructions (numbers and short tokens)
  s = s.replace(/\b(\d{1,2})\s+OR\s+(\d{1,2})\b/g, "$1/$2");
  s = s.replace(/\b([A-Z]{1,3})\s+OR\s+([A-Z]{1,3})\b/g, "$1/$2");

  // Replace connector
  s = s.replace(/\bTO\b/g, "-"); // note: later we restore "TO" where needed by numeric rules

  // Numeric ranges: "6 - 8" or "6 - 7" already ok. Handle "6 - 8" tokens from TO->-
  s = s.replace(/\b(\d{1,2})\s*-\s*(\d{1,2})\b/g, "$1-$2");
  s = s.replace(/\b(\d{1,2})\s*-\s*GALE\s*(\d{1,2})\b/g, "$1-$2");

  // Question mark for PERHAPS
  s = s.replace(/\bPERHAPS\s+([A-Z]{1,3})\b/g, "$1?");
  s = s.replace(/\bPERHAPS\s+([A-Z]{1,3}\/[A-Z]{1,3})\b/g, "$1?");
  s = s.replace(/\bPERHAPS\b/g, "?");

  // Clean punctuation spacing
  s = s.replace(/\s+\./g, ".").replace(/\s+,/g, ",");
  s = s.replace(/\s{2,}/g, " ").trim();
  return s;
}

function splitIntoSentences(paragraph){
  // Keep it simple: split on period followed by space/end.
  const p = normalizeSpaces(paragraph);
  if(!p) return [];
  return p.split(/\.\s+/).map(x => x.replace(/\.$/, "").trim()).filter(Boolean);
}

function parseMetOfficeParagraph(paragraph){
  // Returns {wind, sea, weather, vis} with abbreviations applied.
  const sents = splitIntoSentences(paragraph);
  const parts = { wind:"", sea:"", weather:"", vis:"" };
  if(sents.length===0) return parts;
  parts.wind = abbreviateTextWithDb(sents[0], 'metoffice', 'wind');
  if(sents.length>1) parts.sea = abbreviateTextWithDb(sents[1], 'metoffice', 'sea');
  if(sents.length>2) parts.weather = abbreviateTextWithDb(sents[2], 'metoffice', 'weather');
  if(sents.length>3) parts.vis = abbreviateTextWithDb(sents[3], 'metoffice', 'vis');
  return parts;
}

function extractIssuedLine(raw){
  // Example: "Met Office Inshore Waters (Issued 12:00 (UTC) on Sat 24 Jan 2026)"
  const m = raw.match(/Issued\s+([0-9]{2}:[0-9]{2})\s*\(UTC\)\s+on\s+([A-Za-z]{3})\s+([0-9]{1,2})\s+([A-Za-z]{3})\s+([0-9]{4})/i);
  if(!m) return null;
  const hhmm = m[1];
  const dow = m[2].toUpperCase();
  const dd = String(m[3]).padStart(2,"0");
  const mon = m[4].toUpperCase();
  const yyyy = m[5];
  return `IW FCST (${hhmm} UTC ${dow} ${dd} ${mon} ${yyyy})`;
}


function formatMetOfficeShorthand(raw){
  // Single-source-of-truth rendering:
  // - Keep forecast text in its native case
  // - Uppercase only titles + category labels
  // - Apply CL-081 abbreviation DB ONLY to the category content
  if(!raw) return raw;

  let txt = String(raw).replace(/\r\n?/g, "\n");
  txt = stripMetOfficeCopyright(txt);

  const lines = txt.split("\n");

  // Try to normalise the issued line if we can find it
  let issued = null;
  for(const l of lines){
    if(/^\s*IW\s*FCST\s*\(/i.test(l)){ issued = l.trim(); break; }
  }
  if(!issued){
    issued = extractIssuedLine(txt);
  }

  const out = [];
  out.push("Met Office Inshore Waters");
  if(issued) out.push(String(issued).toUpperCase());
  out.push("==================");

  for(let line of lines){
    if(!line) continue;
    const t = String(line).trim();
    if(!t) continue;

    if(/^===.*MET\s*OFFICE.*===$/i.test(t)) continue;
    if(/^===.*END\s*MET\s*OFFICE.*===$/i.test(t)) continue;
    if(/^Met Office Inshore Waters/i.test(t)) continue;
    if(/^IW\s*FCST\s*\(/i.test(t)) continue;

    if(/^[=]{5,}$/.test(t)){
      out.push("==================");
      continue;
    }

    const m = t.match(/^(WIND|SEA|WEATHER|VIS|SWL|SWELL)\s*:\s*(.*)$/i);
    if(m){
      const label = (m[1].toUpperCase()==="SWELL") ? "SWL" : m[1].toUpperCase();
      const catMap = {WIND:"wind", SEA:"sea", WEATHER:"weather", VIS:"vis", SWL:"swl"};
      const cat = catMap[label] || label.toLowerCase();
      const abbr = abbreviateTextWithDb(String(m[2]||"").trim(), "metoffice", cat);
      out.push(`${label}: ${abbr}`);
      continue;
    }

    if(/^O\/L\s*24/i.test(t)){
      out.push("O/L 24");
      continue;
    }

    out.push(t);
  }

  return out.join("\n").trim();
}


function formatMFIssuedShort(issuedLine){
  // Expected patterns include e.g. "CAP DE LA HAGUE ... WEDNESDAY 28 JANUARY 2026 AT 12:30 (LOCAL MF TIME)"
  // Returns "12:30LT WED 28 JAN 2026" or null if not parseable.
  if (!issuedLine) return null;
  const s = String(issuedLine).toUpperCase();

  const dayMap = {
    MONDAY:"MON", TUESDAY:"TUE", WEDNESDAY:"WED", THURSDAY:"THU", FRIDAY:"FRI", SATURDAY:"SAT", SUNDAY:"SUN",
    LUNDI:"MON", MARDI:"TUE", MERCREDI:"WED", JEUDI:"THU", VENDREDI:"FRI", SAMEDI:"SAT", DIMANCHE:"SUN"
  };
  const monMap = {
    JANUARY:"JAN", FEBRUARY:"FEB", MARCH:"MAR", APRIL:"APR", MAY:"MAY", JUNE:"JUN", JULY:"JUL", AUGUST:"AUG",
    SEPTEMBER:"SEP", OCTOBER:"OCT", NOVEMBER:"NOV", DECEMBER:"DEC",
    JANVIER:"JAN", FÉVRIER:"FEB", FEVRIER:"FEB", MARS:"MAR", AVRIL:"APR", MAI:"MAY", JUIN:"JUN", JUILLET:"JUL",
    AOÛT:"AUG", AOUT:"AUG", SEPTEMBRE:"SEP", OCTOBRE:"OCT", NOVEMBRE:"NOV", DÉCEMBRE:"DEC", DECEMBRE:"DEC"
  };

  // Try "DAYNAME DD MONTH YYYY AT HH:MM"
  let m = s.match(/\b(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY|LUNDI|MARDI|MERCREDI|JEUDI|VENDREDI|SAMEDI|DIMANCHE)\b\s+(\d{1,2})\s+([A-ZÉÛÎÔÀÇ]+)\s+(\d{4}).*?\bAT\b\s*(\d{1,2}:\d{2})/);
  if (!m) {
    // Alternate "DD MONTH YYYY ... HH:MM"
    m = s.match(/\b(\d{1,2})\s+([A-ZÉÛÎÔÀÇ]+)\s+(\d{4}).*?(\d{1,2}:\d{2})/);
    if (m) {
      const dd = m[1].padStart(2,"0");
      const mon = monMap[m[2]] || m[2].slice(0,3);
      const yyyy = m[3];
      const time = m[4].padStart(5,"0");
      return `${time}LT ${dd} ${mon} ${yyyy}`;
    }
    return null;
  }
  const day = dayMap[m[1]] || m[1].slice(0,3);
  const dd = m[2].padStart(2,"0");
  const mon = monMap[m[3]] || m[3].slice(0,3);
  const yyyy = m[4];
  const time = m[5].padStart(5,"0");
  return `${time}LT ${day} ${dd} ${mon} ${yyyy}`;
}


function normalizeMeteoFranceLabels(line){
  let l = line;

  // Normalise common MF labels to our 4(+SWL) label set
  l = l.replace(/^\s*SEA\s*STATE\s*:/i, "SEA:");
  l = l.replace(/^\s*SEA\s*:/i, "SEA:");
  l = l.replace(/^\s*SWELL\s*:/i, "SWL:");
  l = l.replace(/^\s*WEATHER\s*:/i, "WEATHER:");
  l = l.replace(/^\s*VISIBILITY\s*:/i, "VIS:");
  l = l.replace(/^\s*VIS\s*:/i, "VIS:");
  l = l.replace(/^\s*WIND\s*:/i, "WIND:");

  return l;
}

function abbreviateMeteoFranceLine(line){
  // Abbreviate only the content, not the label
  const m = line.match(/^(\s*[A-Z\/\s\-]+?:)\s*(.*)$/);
  if(!m) return abbreviateTextWithDb(line, 'meteofrance', '');
  const label = m[1].trim();
  const body  = m[2] || "";
  const canon = label.toUpperCase();

  const catMap = {"WIND:":"wind","SEA:":"sea","WEATHER:":"weather","VIS:":"vis","SWL:":"swl"};

  if(["WIND:","SEA:","WEATHER:","VIS:","SWL:"].includes(canon)){
    const b = abbreviateTextWithDb(body, 'meteofrance', (catMap[canon]||''));
    return `${canon} ${b}`.trim();
  }
  // Unknown label; abbreviate whole
  return abbreviateTextWithDb(line, 'meteofrance', '');
}

function formatMeteoFranceShorthand(raw){
  // Returns ONLY formatted content (no === wrappers)
  if(!raw) return raw;

  // Normalise line breaks so WebKit/Chromium behave identically
  let txt = String(raw).replace(/\r\n?/g, "\n");

  // Drop any existing wrappers if present
  txt = txt.split("\n").filter(l => {
    const t = (l || "").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    if(/^===.*METEO.*FRANCE.*===$/i.test(t)) return false;
    if(/^===.*END.*METEO.*FRANCE.*===$/i.test(t)) return false;
    return true;
  }).join("\n").trim();

  const out = [];
  const issued = extractMFIssuedLine(txt);
  let issuedShort = "";
  if (issued) {
    issuedShort = formatMFIssuedShort(issued);
  }
  out.push(`CÔTE FCST (${issuedShort || issued})`);

  // MF blocks are often separated by "---"
  const blocks = txt.split(/\n-{3,}\n/).map(b => b.trim()).filter(Boolean);

  // If there's no obvious block split, treat whole text as one block
  const useBlocks = blocks.length ? blocks : [txt.trim()];

  useBlocks.forEach((block, idx) => {
    let b = block;

    // Area title: first non-empty line that isn't an "Issued:" or "Forecast" header
    const lines = b.split("\n").map(x => x.trim()).filter(Boolean);
    let area = "";
    for(const ln of lines){
      if(/^ISSUED\s*:/i.test(ln)) continue;
      if(/^(FORECAST|OUTLOOK)\b/i.test(ln)) continue;
      area = ln;
      break;
    }
    area = normalizeSpaces(area).toUpperCase();

    // Split 24h vs outlook
    const m24 = b.match(/FORECAST[\s\S]*?NEXT\s+24\s+HOURS([\s\S]*?)(?=OUTLOOK[\s\S]*?FOLLOWING\s+24\s+HOURS|$)/i);
    const mol = b.match(/OUTLOOK[\s\S]*?FOLLOWING\s+24\s+HOURS([\s\S]*)$/i);

    const part24 = m24 ? m24[1].trim() : b;
    const partOL = mol ? mol[1].trim() : "";

    // Helpers to extract labelled lines from a section, in order encountered
    function sectionToLines(sectionText){
      const rawLines = String(sectionText || "").replace(/\r/g,"").split("\n");
      const outLines = [];
      rawLines.forEach(rawLine => {
        let l = rawLine.trim();
        if(!l) return;

        // Convert narrative period headers into compact tags
        l = l.replace(/^DURING\s+THE\s+AFTERNOON\b.*$/i, "PM");
        l = l.replace(/^DURING\s+THE\s+NIGHT\b.*$/i, "NIGHT");
        l = l.replace(/^OUTLOOK\b.*$/i, "");
        l = l.replace(/^FORECAST\b.*$/i, "");
        if(!l) return;

        l = normalizeMeteoFranceLabels(l);

        // Keep only our key lines + period markers
        if(/^(PM|NIGHT)\b/i.test(l)){
          outLines.push(abbreviateTextWithDb(l, 'meteofrance', ''));
          return;
        }

        if(/^(WIND|SEA|WEATHER|VIS|SWL)\s*:/i.test(l)){
          outLines.push(abbreviateMeteoFranceLine(l));
        }
      });

      // If no labelled lines were detected, fall back to abbreviating paragraph(s)
      if(!outLines.length){
        const compact = abbreviateTextWithDb(sectionText, 'meteofrance', '');
        if(compact) outLines.push(compact);
      }
      return outLines;
    }

    // Only print separator if we have more than one area, or to match Met Office styling
    out.push("==================");
    if(area) out.push(`${area} 24 HR FCST`);
    else if(idx === 0 && !issued) out.push("24 HR FCST");

    sectionToLines(part24).forEach(l => out.push(l.endsWith(".") ? l : (l + (/[A-Z0-9)]$/.test(l) ? "." : "")) ));

    if(partOL){
      out.push("O/L 24");
      sectionToLines(partOL).forEach(l => out.push(l.endsWith(".") ? l : (l + (/[A-Z0-9)]$/.test(l) ? "." : "")) ));
    }
  });

  // Remove any accidental duplicated separator at start if first line is issued header
  // (we always include separators, but that's intentional; keep)
  return out.join("\n").trim();
}

// --- End CL-078 MF shorthand ------------------------------------------------
function weatherTextToHtmlForPlanPanel(text){
  // Turn plain text into HTML with bold labels for display in the Log split-view plan panel.
  if(!text) return "";
  const esc = escapeHtml(text);
  const lines = esc.split(/\n/);
  const boldLabels = new Set(["WIND:", "SEA:", "WEATHER:", "VIS:", "SWL:", "SWELL:", "O/L 24", "24 HR FCST"]);
  const htmlLines = lines.map(line => {
    const trimmed = line.trim();
    if(/^===\s*.*\s*===$/i.test(trimmed)) {
						return `<strong>${line}</strong>`;
				}

    if(trimmed === "=================="){
      return `<span style="font-weight:600;">${line}</span>`;
    }
    // Bold label at start of line
    const m = line.match(/^([A-Z\/\s\-]+?):\s*(.*)$/);
    if(m){
      const label = m[1] + ":";
      if(boldLabels.has(label)){
        return `<strong>${label}</strong> ${m[2]}`;
      }
    }
    if(trimmed === "O/L 24"){
      return `<strong>O/L 24</strong>`;
    }
    return line;
  });
  return htmlLines.join("<br>");
}
// --- End CL-078 ---

function applyWeatherSection(sectionKey, titleLine, content, meta){
  const current = (planWeather && planWeather.value) ? planWeather.value : ((getCurrentPassage()?.plan?.weather) || "");
  let contentToStore = content || "";

  // Allow caller to bypass formatting (already formatted content).
  if(!(meta && meta.skipFormat)){
    if(sectionKey === "Met Office"){
      contentToStore = formatMetOfficeShorthand(contentToStore);
    }else if(sectionKey === "meteofrance"){
      contentToStore = formatMeteoFranceShorthand(contentToStore);
    }
  }

  const merged = upsertWeatherSection(current, sectionKey, titleLine, contentToStore);
  if(planWeather) planWeather.value = merged;

  const p = getCurrentPassage();
  if(p){
    p.plan = p.plan || {};
    p.plan.weather = merged;
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

  const haveDest = !!(toC && Number.isFinite(toC.lat) && Number.isFinite(toC.lon));
  const destDifferent = haveDest && (Math.abs(fromC.lat - toC.lat) > 1e-9 || Math.abs(fromC.lon - toC.lon) > 1e-9);

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


async function fetchInshoreWeatherForCurrent(opts){
  // CL-080: Unified Marine Worker route fetch (handles routing, interim areas, de-dupe, MF translation)
  // Worker endpoint: POST /marine/route
  // Body: { lang:"en", tr:"google", origin:{lat,lon}, via:[{id,lat,lon}], destination:{lat,lon} }
  try{
    const p = getCurrentPassage();
    if(!p) return;

    const routeNames = getRouteNames(p); // [from, ...transits, to]
    if(!routeNames || routeNames.length < 2){
      alert("Set an Origin and Destination first.");
      return;
    }

    // Resolve coordinates for all route points (prefer stored port coords; do NOT auto-save here)
    const resolved = [];
    for(const name of routeNames){
      if(!name) continue;
      let c = getPortCoords(name);
      if(!(c && isFinite(c.lat) && isFinite(c.lon))){
        const ensured = await ensurePortCoords(name, { save: false });
        if(ensured && isFinite(ensured.lat) && isFinite(ensured.lon)){
          c = ensured;
        }
      }
      if(!(c && isFinite(c.lat) && isFinite(c.lon))){
        alert(`Missing coordinates for "${name}".\n\nOpen Manage Ports and add Lat/Lon, then try again.`);
        return;
      }
      resolved.push({ name, lat: c.lat, lon: c.lon });
    }

    if(resolved.length < 2){
      alert("Route needs at least an Origin and Destination with coordinates.");
      return;
    }

    const makeId = (s) => String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "pt";

    const origin = { lat: resolved[0].lat, lon: resolved[0].lon };
    const destination = { lat: resolved[resolved.length-1].lat, lon: resolved[resolved.length-1].lon };

    const via = [];
    for(let i=1; i<resolved.length-1; i++){
      const r = resolved[i];
      via.push({ id: makeId(r.name), lat: r.lat, lon: r.lon });
    }

    const fmtLatLon = (lat, lon) => {
      const la = (typeof lat === "number") ? lat.toFixed(4) : String(lat);
      const lo = (typeof lon === "number") ? lon.toFixed(4) : String(lon);
      return `${la},${lo}`;
    };

    // Progress hint (useful on iPad/Safari): show coords we’re asking the Worker to route
    const viaStr = via.length ? (" VIA " + via.map(v=>fmtLatLon(v.lat,v.lon)).join(", ")) : "";
    setWeatherStatus(`FETCHING IW FCST: ${fmtLatLon(origin.lat, origin.lon)} → ${fmtLatLon(destination.lat, destination.lon)}${viaStr}`);

    const body = {
      lang: "en",
      tr: "google",
      origin,
      destination
    };
    if(via.length) body.via = via;

    const res = await fetch(MARINE_ROUTE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    });

    if(!res.ok){
      throw new Error(`Worker HTTP ${res.status}`);
    }

    const payload = await res.json();

    // Worker may return an array or an object containing an array; accept common shapes.
    let items = [];

// Worker contract (route):
// - payload.legs[].areas[] provides *ordered* provider/refId traversal (may include duplicates)
// - payload.forecasts is a map of composite keys -> forecast objects
if (payload && payload.ok){
  // Build a flat array of forecasts (map -> array)
  const allForecasts = (payload.forecasts && typeof payload.forecasts === "object")
    ? Object.values(payload.forecasts).filter(Boolean)
    : [];

  // Helper to match a legs[].areas ref to a forecast object
  const matchForecast = (areaRef) => {
    const prov = (areaRef && areaRef.provider) ? String(areaRef.provider).toLowerCase() : "";
    const refId = areaRef ? areaRef.refId : null;

    return allForecasts.find(f => {
      if (!f || String(f.provider).toLowerCase() !== prov) return false;
      const raw = f.raw || {};
      if (prov === "metoffice") return String(raw.areaId) === String(refId);
      if (prov === "meteofrance") return String(raw.zoneId) === String(refId);
      return false;
    }) || null;
  };

  // Prefer ordered areas list, de-duping in order
  const orderedRefs = [];
  if (Array.isArray(payload.legs)){
    payload.legs.forEach(leg => {
      if (leg && Array.isArray(leg.areas)){
        leg.areas.forEach(a => orderedRefs.push(a));
      }
    });
  }

  const seen = new Set();
  if (orderedRefs.length){
    orderedRefs.forEach(a => {
      const prov = (a && a.provider) ? String(a.provider).toLowerCase() : "";
      const refId = (a && a.refId != null) ? String(a.refId) : "";
      const key = `${prov}|${refId}`;
      if (seen.has(key)) return;
      const f = matchForecast(a);
      if (f && f.ok){
        items.push(f);
        seen.add(key);
      }
    });
  }

  // Fallback: if we didn't build anything from legs, use all forecasts (stable-ish order)
  if (!items.length){
    items = allForecasts.filter(f => f && f.ok);
  }
const byProvider = { metoffice: [], meteofrance: [] };

    for(const r of items){
      if(!r || !r.ok) continue;
      const key = `${r.provider}|${r.areaName}`;
      if(seen.has(key)) continue;
      seen.add(key);
      if(r.provider === "metoffice") byProvider.metoffice.push(r);
      else if(r.provider === "meteofrance") byProvider.meteofrance.push(r);
    }

    // Update textbox and persist
    const current = (planWeather && planWeather.value) ? planWeather.value : ((getCurrentPassage()?.plan?.weather) || "");

    // Remove any legacy/alternate section keys so we don’t end up with duplicate blocks.
    // IMPORTANT: Use the cleaned text as the base for upserts. (Using `current` here can
    // re-introduce older cached/abbreviated blocks ahead of the newly fetched section.)
    let cleaned = current;
    ["Met Office","metoffice","MET OFFICE"].forEach(k => { cleaned = upsertWeatherSection(cleaned, k, null, null); });
    ["meteofrance","Météo‑France","Meteo France"].forEach(k => { cleaned = upsertWeatherSection(cleaned, k, null, null); });

    let merged = upsertWeatherSection(cleaned, "Met Office", "Met Office Inshore Waters", byProvider.metoffice.length ? formatMetOfficeFromWorker(byProvider.metoffice) : null);
    merged = upsertWeatherSection(merged, "meteofrance", "Météo‑France", byProvider.meteofrance.length ? formatMeteoFranceFromWorker(byProvider.meteofrance) : null);

    if (planWeather) planWeather.value = merged;

    const pp = getCurrentPassage();
    if (pp){
      if (!pp.plan) pp.plan = {};
      pp.plan.weather = merged;
      savePassages();
    }

  }
  }catch(err){
    console.error(err);
    alert("Fetch failed — you can still type it manually.");
  }
}


// --- CL-080 formatting (worker contract -> shorthand text) ---

function shortMetOfficeIssued(issuedText){
  if(!issuedText) return "";
  const t = String(issuedText).toUpperCase();
  // Examples:
  // "ISSUED AT: 12:00 (UTC) ON MON 2 FEB 2026"
  let m = t.match(/(\d{1,2}:\d{2})\s*\(?(UTC)\)?\s*ON\s*([A-Z]{3})\s*(\d{1,2})\s*([A-Z]{3})\s*(\d{4})/);
  if(m){
    const dd = m[4].padStart(2,"0");
    return `${m[1]} ${m[2]} ${m[3]} ${dd} ${m[5]} ${m[6]}`;
  }
  m = t.match(/(\d{1,2}:\d{2})\s*\(?(UTC)\)?\s*ON\s*([A-Z]{3})\s*(\d{1,2})\s*([A-Z]{3})\s*(\d{4})/);
  if(m) return `${m[1]} ${m[2]} ${m[3]} ${m[4].padStart(2,"0")} ${m[5]} ${m[6]}`;
  return t.replace(/^ISSUED AT:\s*/,"").replace(/\s*\(UTC\)\s*/," UTC ").trim();
}

function shortMFIssued(issuedText){
  if(!issuedText) return "";
  // Worker may return either:
  //  - "12:30 LT LUNDI 02 FEBRUARY 2026"
  //  - "06:30 LT FRIDAY, FEBRUARY 6, 2026"
  const t = String(issuedText).toUpperCase().replace(/,/g," ").replace(/\s+/g," ").trim();

  // Pattern A: "HH:MM LT DOW DD MONTH YYYY"
  let m = t.match(/(\d{1,2}:\d{2})\s*LT\s*([A-Z]{3,})\s+(\d{1,2})\s+([A-Z]{3,})\s+(\d{4})/);
  if(m){
    const hhmm = m[1];
    const dow = m[2].slice(0,3);
    const dd  = m[3].padStart(2,"0");
    const mon = m[4].slice(0,3);
    const yyyy = m[5];
    return `${hhmm} LT ${dow} ${dd} ${mon} ${yyyy}`;
  }

  // Pattern B: "HH:MM LT DOW MONTH DD YYYY"
  m = t.match(/(\d{1,2}:\d{2})\s*LT\s*([A-Z]{3,})\s+([A-Z]{3,})\s+(\d{1,2})\s+(\d{4})/);
  if(m){
    const hhmm = m[1];
    const dow = m[2].slice(0,3);
    const mon = m[3].slice(0,3);
    const dd  = m[4].padStart(2,"0");
    const yyyy = m[5];
    return `${hhmm} LT ${dow} ${dd} ${mon} ${yyyy}`;
  }

  return t;
}

function shortMFPeriodId(id){
  if(!id) return "";
  const t = String(id).toUpperCase().replace(/,/g," ").replace(/\s+/g," ").trim();

  // Identify time-of-day bucket
  let bucket = null;
  if(/AFTERNOON/.test(t) || /PM\b/.test(t)) bucket = "PM";
  else if(/MORNING/.test(t) || /\bAM\b/.test(t)) bucket = "AM";
  else if(/NIGHT/.test(t)) bucket = "NIGHT";
  else if(/TREND/.test(t)) bucket = "TREND";
  else bucket = "DAY";

  // Extract dates (month + day)
  // e.g. "... FEBRUARY 6TH ...", "... FEBRUARY 6 TO ... FEBRUARY 7 ..."
  const months = {
    JANUARY:"JAN", FEBRUARY:"FEB", MARCH:"MAR", APRIL:"APR", MAY:"MAY", JUNE:"JUN",
    JULY:"JUL", AUGUST:"AUG", SEPTEMBER:"SEP", OCTOBER:"OCT", NOVEMBER:"NOV", DECEMBER:"DEC"
  };

  // Capture sequences like "FEBRUARY 6", allowing "6TH"
  const reDate = /(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(\d{1,2})(?:ST|ND|RD|TH)?/g;
  const dates = [];
  let m;
  while((m = reDate.exec(t))){
    dates.push({ mon: months[m[1]] || m[1].slice(0,3), day: parseInt(m[2],10) });
    if(dates.length >= 2) break; // we only need up to 2
  }

  if(dates.length === 0) return t;

  const mon = dates[0].mon;
  const d1 = dates[0].day;

  if(bucket === "NIGHT" && dates.length >= 2){
    const d2 = dates[1].day;
    const mon2 = dates[1].mon;
    if(mon2 === mon) return `NIGHT ${mon} ${d1}-${d2}`;
    return `NIGHT ${mon} ${d1} - ${mon2} ${d2}`;
  }

  if(bucket === "PM" || bucket === "AM" || bucket === "DAY"){
    return `${bucket} ${mon} ${d1}`;
  }

  if(bucket === "TREND"){
    return `TREND ${mon} ${d1}`;
  }

  return t;
}


function formatMetOfficeFromWorker(responses){
  if(!responses || !responses.length) return "";
  const first = responses[0];
  const lines = [];
  lines.push(`IW FCST (${shortMetOfficeIssued(first.issuedText)})`);
  for(const r of responses){
    lines.push("==================");
    lines.push(`${String(r.areaName||"").toUpperCase()} 24 HR FCST`);
    const p24 = (r.periods||[]).find(p => (p.id||"").toUpperCase()==="24H") || (r.periods||[])[0];
    const pol = (r.periods||[]).find(p => (p.id||"").toUpperCase()==="OL24");

    const pushLabels = (p) => {
      if(!p) return;
      if(p.wind)   lines.push(`WIND: ${abbreviateTextWithDb(p.wind,"metoffice","wind")}`);
      if(p.sea)    lines.push(`SEA: ${abbreviateTextWithDb(p.sea,"metoffice","sea")}`);
      if(p.weather)lines.push(`WEATHER: ${abbreviateTextWithDb(p.weather,"metoffice","weather")}`);
      if(p.vis)    lines.push(`VIS: ${abbreviateTextWithDb(p.vis,"metoffice","vis")}`);
    };

    pushLabels(p24);
    if(pol){
      lines.push("O/L 24");
      pushLabels(pol);
    }
  }
  return lines.join("\n");
}

function formatMeteoFranceFromWorker(responses){
  if(!responses || !responses.length) return "";
  const first = responses[0];
  const lines = [];
  lines.push(`CÔTE FCST (${shortMFIssued(first.issuedText)})`);
  for(const r of responses){
    lines.push("==================");
    lines.push(`${String(r.areaName||"").toUpperCase()} 24 HR FCST`);
    for(const p of (r.periods||[])){
      if(p && p.id) lines.push(shortMFPeriodId(p.id));
      if(p.wind)   lines.push(abbreviateMeteoFranceLine(`WIND: ${p.wind}`));
      if(p.sea)    lines.push(abbreviateMeteoFranceLine(`SEA: ${p.sea}`));
      if(p.swell)  lines.push(abbreviateMeteoFranceLine(`SWL: ${p.swell}`));
      if(p.weather)lines.push(abbreviateMeteoFranceLine(`WEATHER: ${p.weather}`));
      if(p.vis)    lines.push(abbreviateMeteoFranceLine(`VIS: ${p.vis}`));
      lines.push(""); // blank line between periods
    }
  }
  return lines.join("\n").replace(/\n{3,}/g,"\n\n").trim();
}

if (btnFetchWeather){
  btnFetchWeather.addEventListener("click", (e) => {
    e.preventDefault();
    fetchInshoreWeatherForCurrent();
  });
}



if (btnFetchWeatherFR){
  // CL-080: Worker now handles all providers; hide legacy FR button if present.
  btnFetchWeatherFR.style.display = "none";
}
// Save plan -> remember ports, ensure tide stations, then jump to Log
planForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const p = getCurrentPassage();
  if (!p) return;

  p.plan.date = planDate.value;
  p.plan.from = planFrom.value.trim();
  p.plan.to   = planTo.value.trim();

    // Bind Origin/Destination to specific ports (stable ids).
  // The Plan inputs are free-text, so we store the selected port id (when chosen from suggestions)
  // and fall back to a name lookup only for legacy passages.
  const readPortId = (el) => (el && el.dataset && el.dataset.portId) ? String(el.dataset.portId) : "";
  const fromId = readPortId(planFrom);
  const toId   = readPortId(planTo);

  // Persist selected ids (source of truth for downstream features like Météo-France).
  if (fromId) p.plan.fromPortId = fromId; else delete p.plan.fromPortId;
  if (toId)   p.plan.toPortId   = toId;   else delete p.plan.toPortId;

  // Keep optional coords datasets in-sync for convenience (but do NOT persist per-passage coords).
  // If ids are missing, attempt a single conservative resolution for legacy data.
  if (!fromId && p.plan.from){
    const pi = findPortItemByName(p.plan.from);
    if (pi && pi.id){ p.plan.fromPortId = String(pi.id); planFrom.dataset.portId = String(pi.id); }
  }
  if (!toId && p.plan.to){
    const pi = findPortItemByName(p.plan.to);
    if (pi && pi.id){ p.plan.toPortId = String(pi.id); planTo.dataset.portId = String(pi.id); }
  }

  // Purge any old per-passage coords (we now use Manage Ports as the single source of truth).
  delete p.plan.fromLat; delete p.plan.fromLon; delete p.plan.toLat; delete p.plan.toLon;

  // CL-077: Transit Ports (bind by id when chosen from suggestions)
  try {
    normaliseTransitPorts(p);
    // Ensure we read current form values into p.plan.transitPorts
    readTransitPortsFromForm(p);
    const tInputs = [planTransit1, planTransit2, planTransit3];
    const tps = Array.isArray(p.plan.transitPorts) ? p.plan.transitPorts : [];
    for (let i=0;i<tps.length && i<3;i++){
      const el = tInputs[i];
      if (!el) continue;
      const name = (el.value||"").trim();
      tps[i].name = name;
      const tid = readPortId(el);
      if (tid) tps[i].portId = String(tid);
      // Conservative legacy resolution if id missing
      if (!tps[i].portId && name){
        const pi = findPortItemByName(name);
        if (pi && pi.id){ tps[i].portId = String(pi.id); el.dataset.portId = String(pi.id); }
      }
    }
    p.plan.transitPorts = tps;
  } catch(e) {
    console.warn("Transit ports save failed", e);
  }
p.plan.vessel = planVessel.value.trim();
  p.plan.skipper = planSkipper.value.trim();
  p.plan.crew = planCrew.value.trim();
  p.plan.sunriseSet = planSunriseSet.value.trim();
  if (planMoonPhase) p.plan.moonPhase = planMoonPhase.value.trim();
  if (planMoonRiseSet) p.plan.moonRiseSet = planMoonRiseSet.value.trim();
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
  const sunriseSet = p.plan.sunriseSet || "";
  const moonPhase = (p.plan.moonPhase || "").trim() || (p.plan.date ? getMoonPhaseLabel(p.plan.date) : "");
  const moonRiseSet = p.plan.moonRiseSet || "";
  const currents = p.plan.currents || "";
  const weather  = p.plan.weather || "";
  const comms    = p.plan.comms || "";
  const tideStations = p.plan.tideStations || [];
  const dailySummaries = p.plan.dailySummaries || [];

  const tideStationsHtml = tideStations.length
    ? tideStations.map(ts => {
        const stationName = (ts.name || "Station");
        const name = escapeHtml(stationName);

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
        <div class="block plan-link" data-goto="planSunriseSet">
          <p class="section-title">SUN &amp; MOON</p>
          <p><strong>Sunrise / Sunset:</strong> ${sunriseSet ? escapeHtml(sunriseSet) : "–"}</p>
          <p><strong>Moon phase:</strong> ${moonPhase ? escapeHtml(moonPhase) : "–"}</p>
          <p><strong>Moon rise / set:</strong> ${moonRiseSet ? escapeHtml(moonRiseSet) : "–"}</p>
        </div>

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
          <p>${weather ? weatherTextToHtmlForPlanPanel(weather) : "<em>–</em>"}</p>
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
  // A passage is considered "shutdown" only once the FINAL leg has a Shutdown entry.
  // Earlier legs also end with Shutdown entries in multi-leg passages, so we must
  // not use a simple "any shutdown" flag.
  if (!p) return false;
  const finalLegIdx = Math.max(0, getLegCount(p) - 1);
  return hasSpecialForLeg(p, 'shutdown', finalLegIdx);
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
    leg: getCurrentLegIndex(p),
    leg: getCurrentLegIndex(p),
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
    leg: getCurrentLegIndex(p),
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

  // If a Shutdown entry was deleted, we only clear the passage "finish" flag
  // when that deleted shutdown belonged to the FINAL leg.
  const finalLegIdx = Math.max(0, getLegCount(p) - 1);
  if (deleted && typeof deleted.notes === "string" && deleted.notes.toLowerCase().startsWith("shutdown")) {
    const deletedLeg = (typeof deleted.leg === 'number') ? deleted.leg : 0;
    if (deletedLeg === finalLegIdx) {
      if (!p.finish) p.finish = {};
      p.finish.shutdownLogged = false;
      // Clear finish fields that are only meaningful after final shutdown
      p.finish.finishedAt = null;
      p.finish.engineHoursEnd = null;
      p.finish.fuelEndPercent = null;
    }
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

  // Keep passage shutdown flag consistent: true ONLY when final leg has a Shutdown.
  p.finish = p.finish || {};
  p.finish.shutdownLogged = hasSpecialForLeg(p, 'shutdown', finalLegIdx);
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
  const legIdx = getCurrentLegIndex(p);
  if (hasSpecialForLeg(p, 'engine start', legIdx)) return alert("Engine Start already recorded for this leg.");

  // Prefill rules (CL-077):
  // - Leg 1: use Plan start values (existing behaviour)
  // - Leg 2+: use previous leg's Shutdown snapshot (NOT Plan start values)
  let prefillEh = "";
  let prefillFu = "";
  if (legIdx === 0) {
    prefillEh = (p.plan && p.plan.engineHoursStart) ? String(p.plan.engineHoursStart) : "";
    prefillFu = (p.plan && p.plan.fuelStartPercent) ? String(p.plan.fuelStartPercent) : "";
  } else {
    const legEnds = Array.isArray(p.legEnds) ? p.legEnds : [];
    const prevEnd = legEnds[legIdx - 1] || {};
    prefillEh = prevEnd.engineHoursEnd ? String(prevEnd.engineHoursEnd) : "";
    prefillFu = prevEnd.fuelEndPercent ? String(prevEnd.fuelEndPercent) : "";
  }

  // Persisted per-passage (not carried across passages)
  const prevEnv = (p.plan && p.plan.engineStartEnv) ? p.plan.engineStartEnv : {};

  showModal({
    title: "Engine Start",
    bodyHtml: `
      <label style="display:flex;flex-direction:column;gap:0.25rem;">
        Fuel % at start
        <input id="fuelStart" type="number" inputmode="numeric" step="1" value="${escapeHtml(prefillFu)}">
      </label>

      <label style="display:flex;flex-direction:column;gap:0.25rem;margin-bottom:0.5rem;">
        Engine hours at start
        <input id="ehStart" type="number" inputmode="decimal" step="0.1" value="${escapeHtml(prefillEh)}">
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

      // Only persist to Plan start values for Leg 1.
      // For Leg 2+, we keep Plan values immutable and rely on the previous leg's Shutdown snapshot.
      if (legIdx === 0) {
        p.plan.engineHoursStart = eh;
        p.plan.fuelStartPercent = fu;
      }

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
  const legIdx = getCurrentLegIndex(p);
  if (hasSpecialForLeg(p, 'slipped lines', legIdx)) return alert("Slip already recorded for this leg.");
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
  const legIdx = getCurrentLegIndex(p);
  if (hasSpecialForLeg(p, 'alongside', legIdx) || hasSpecialForLeg(p, 'docked', legIdx)) return alert("Dock already recorded for this leg.");
  addDockEntry();
  p.flags.dock = true;
  savePassages();
});

// Shutdown: once per leg (final leg sets passage completion)
shutdownBtn.addEventListener("click", () => {
  const p = getCurrentPassage();
  if (!p) return alert("No passage selected.");
  ensureFlags(p);

  // Once the final leg has shutdown, the passage is complete.
  if (passageIsShutdown(p)) return alert("Shutdown already recorded – no further log entries allowed.");

  const legIdx = getCurrentLegIndex(p);
  if (hasSpecialForLeg(p, 'shutdown', legIdx)) return alert("Shutdown already recorded for this leg.");

  const isFinalLeg = (legIdx >= (getLegCount(p) - 1));

  // Per-leg end snapshots (used for leg summaries and for chaining starts).
  p.legEnds = Array.isArray(p.legEnds) ? p.legEnds : [];
  const prev = p.legEnds[legIdx] || {};

  showModal({
    title: isFinalLeg ? "Shutdown (final leg)" : "Shutdown (end of leg)",
    bodyHtml: `
      <label style="display:flex;flex-direction:column;gap:0.25rem;margin-bottom:0.5rem;">
        Fuel % at end
        <input id="fuelEnd" type="number" inputmode="numeric" step="1" value="${escapeHtml(prev.fuelEndPercent || (isFinalLeg ? (p.finish?.fuelEndPercent || "") : ""))}">
      </label>
      <label style="display:flex;flex-direction:column;gap:0.25rem;margin-bottom:0.5rem;">
        Engine hours (end)
        <input id="ehEnd" type="number" inputmode="decimal" step="0.1" value="${escapeHtml(prev.engineHoursEnd || (isFinalLeg ? (p.finish?.engineHoursEnd || "") : ""))}">
      </label>
      <label style="display:flex;flex-direction:column;gap:0.25rem;">
        Notes / defects
        <input id="shNotes" type="text" value="${escapeHtml(prev.notes || (isFinalLeg ? (p.finish?.notes || "") : ""))}">
      </label>
    `,
    onOk: () => {
      const notesVal = (document.getElementById("shNotes")?.value || "").trim();
      const ehEndVal = (document.getElementById("ehEnd")?.value || "").trim();
      const fuelEndVal = (document.getElementById("fuelEnd")?.value || "").trim();

      // Persist per-leg end snapshot
      p.legEnds[legIdx] = {
        engineHoursEnd: ehEndVal,
        fuelEndPercent: fuelEndVal,
        notes: notesVal,
        at: new Date().toISOString(),
      };

      // If this is the final leg, also persist the traditional passage end fields.
      if (isFinalLeg) {
        p.finish = p.finish || {};
        p.finish.engineHoursEnd = ehEndVal;
        p.finish.fuelEndPercent = fuelEndVal;
        p.finish.notes = notesVal;
        p.finish.shutdownLogged = true;
      }

      // Include key figures in the notes for quick scanability (CL-066)
      const shutBits = [];
      if (ehEndVal) shutBits.push(`EH ${ehEndVal}`);
      if (fuelEndVal) shutBits.push(`Fuel ${fuelEndVal}%`);
      const shutPrefix = shutBits.length ? `Shutdown / alongside — ${shutBits.join(" | ")}` : "Shutdown / alongside";
      const note = notesVal ? `${shutPrefix} — ${notesVal}` : shutPrefix;

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
        notes: note,
        leg: legIdx
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
  updateLegIndicator();
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
    addInputCell(entry.speed,  { field: "speed",  className: "log-input log-input-speed", type: "text", inputMode: "decimal" });
    addInputCell(entry.rpm,    { field: "rpm",    className: "log-input log-input-rpm", type: "text", inputMode: "numeric" });
    addInputCell(entry.engTP,  { field: "engTP",  className: "log-input log-input-engtp", type: "text", inputMode: "decimal" });

    addInputCell(entry.waterLog || "", { field: "waterLog", className: "log-input log-input-log", type: "text", inputMode: "decimal" });
    addInputCell(entry.groundLog,      { field: "groundLog", className: "log-input log-input-log", type: "text", inputMode: "decimal" });

    addInputCell(entry.fuelUsed, { field: "fuelUsed", className: "log-input log-input-fuel", type: "text", inputMode: "decimal" });

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

    // CL-077 (v0.6.4d): Presentation-only inline leg summary row.
    // After each Shutdown entry, insert a display-only “LEG X SUMMARY” row.
    // This must NOT touch logging logic or persist any data.
    if (typeof entry?.notes === "string" && entry.notes.toLowerCase().startsWith("shutdown")) {
      const legIdx = (typeof entry.leg === "number") ? entry.leg : 0;
      const s = computeLegLogSummary(p, legIdx);

      const trSum = document.createElement("tr");
      trSum.className = "leg-summary-row";

      const td = document.createElement("td");
      td.colSpan = 9;

      const bits = [];
      bits.push(`Engine hours: ${s.ehText}`);
      bits.push(`Fuel ${s.fuelStart}%→${s.fuelEnd}%`);
      bits.push(`Fuel used: ${s.fuelUsed}`);
      bits.push(`NM(G): ${s.nmG}`);
      bits.push(`Under Way: ${s.durationText}`);

      td.innerHTML = `<div class="leg-summary-title">LEG ${legIdx + 1} SUMMARY</div>` +
        `<div class="leg-summary-bits">${escapeHtml(bits.join("  |  "))}</div>`;

      trSum.appendChild(td);
      logEntriesContainer.appendChild(trSum);
    }
  });

  updateLogSummary();
}

function _num(v) {
  const n = parseFloat(String(v ?? "").trim());
  return isNaN(n) ? null : n;
}

function _fmt1(v) {
  const n = _num(v);
  return (n === null) ? "–" : (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "");
}

function _fmtDurationFromMinutes(totalMinutes) {
  const m = Math.max(0, Math.round(totalMinutes || 0));
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function computeLegMetricsFromEntries(p, legIdx) {
  const entries = Array.isArray(p?.entries) ? p.entries : [];
  const legEntries = entries.filter(e => (e.leg ?? 0) === legIdx);
  const sorted = legEntries.slice().sort((a, b) => new Date(a.time || 0) - new Date(b.time || 0));

  // Fuel used: last numeric in this leg
  let fuelUsed = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const fu = _num(sorted[i].fuelUsed);
    if (fu !== null) { fuelUsed = fu; break; }
  }

  // NM(G): use the final Ground Log reading for the leg.
  // (Users often record NM(G) per-leg rather than a cumulative trip total.)
  let lastG = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const g = _num(sorted[i].groundLog);
    if (g !== null) { lastG = g; break; }
  }
  const nmG = lastG;

  // Under way minutes: Slip -> Dock within this leg (fallback: first->last)
  let durationMinutes = null;
  const slipEntry = sorted.find(e => typeof e.notes === 'string' && e.notes.toLowerCase().startsWith('slipped lines'));
  let dockEntry = null;
  if (slipEntry && slipEntry.time) {
    dockEntry = sorted.find(e => e.time && e.time > slipEntry.time && typeof e.notes === 'string' && e.notes.toLowerCase().startsWith('alongside'));
  }
  const tStart = slipEntry?.time ? new Date(slipEntry.time) : null;
  const tEnd = dockEntry?.time ? new Date(dockEntry.time) : null;
  if (tStart && tEnd && !isNaN(tStart) && !isNaN(tEnd)) {
    const ms = tEnd - tStart;
    if (!isNaN(ms) && ms > 0) durationMinutes = Math.round(ms / 60000);
  } else {
    const times = sorted.map(e => e.time).filter(Boolean).map(t => new Date(t)).filter(d => !isNaN(d));
    if (times.length >= 2) {
      const min = times.reduce((a, b) => (a < b ? a : b));
      const max = times.reduce((a, b) => (a > b ? a : b));
      const ms = max - min;
      if (!isNaN(ms) && ms > 0) durationMinutes = Math.round(ms / 60000);
    }
  }

  return {
    fuelUsed,
    nmG,
    durationMinutes
  };
}

function computePassageLogSummary(p) {
  if (!p) {
    return { ehText: "–", fuelUsed: "–", fuelStart: "–", fuelEnd: "–", gLog: "–", durationText: "–" };
  }

  const entries = Array.isArray(p.entries) ? p.entries : [];
  const fuelStart = (p.plan && typeof p.plan.fuelStartPercent !== "undefined" && p.plan.fuelStartPercent !== null && p.plan.fuelStartPercent !== "")
    ? p.plan.fuelStartPercent
    : "–";
  const fuelEnd = (p.finish && typeof p.finish.fuelEndPercent !== "undefined" && p.finish.fuelEndPercent !== null && p.finish.fuelEndPercent !== "")
    ? p.finish.fuelEndPercent
    : "–";

  if (entries.length === 0) {
    return { ehText: "–", fuelUsed: "–", fuelStart, fuelEnd, gLog: "–", durationText: "–" };
  }

  const sorted = entries
    .slice()
    .sort((a, b) => new Date(a.time || 0) - new Date(b.time || 0));

  // Engine hours used: prefer plan/finish snapshot, else fall back to any per-entry EH (legacy)
  const planEhStart = (p.plan && p.plan.engineHoursStart !== undefined && p.plan.engineHoursStart !== null && p.plan.engineHoursStart !== "") ? `${p.plan.engineHoursStart}` : null;
  const finishEhEnd = (p.finish && p.finish.engineHoursEnd !== undefined && p.finish.engineHoursEnd !== null && p.finish.engineHoursEnd !== "") ? `${p.finish.engineHoursEnd}` : null;

  let ehText = "–";
  if (planEhStart && finishEhEnd) {
    ehText = `${planEhStart}→${finishEhEnd}`;
  } else {
    let ehStart = null, ehEnd = null;
    for (let i = 0; i < sorted.length; i++) {
      const v = parseFloat(sorted[i].engineHours);
      if (!isNaN(v)) { ehStart = v; break; }
    }
    for (let i = sorted.length - 1; i >= 0; i--) {
      const v = parseFloat(sorted[i].engineHours);
      if (!isNaN(v)) { ehEnd = v; break; }
    }
    ehText = (ehStart !== null && ehEnd !== null) ? `${ehStart}→${ehEnd}` : "–";
  }

  // Totals across legs (fuel used, NM(G), under way time)
  const legCount = getLegCount(p);
  let fuelUsedTotal = 0;
  let fuelUsedHas = false;
  let nmGTotal = 0;
  let nmGHas = false;
  let underwayMinutesTotal = 0;
  let underwayHas = false;

  for (let i = 0; i < legCount; i++) {
    const m = computeLegMetricsFromEntries(p, i);
    if (m.fuelUsed !== null) { fuelUsedTotal += m.fuelUsed; fuelUsedHas = true; }
    if (m.nmG !== null) { nmGTotal += m.nmG; nmGHas = true; }
    if (m.durationMinutes !== null) { underwayMinutesTotal += m.durationMinutes; underwayHas = true; }
  }

  const fuelUsed = fuelUsedHas ? _fmt1(fuelUsedTotal) : "–";
  const gLog = nmGHas ? _fmt1(nmGTotal) : "–";
  const durationText = underwayHas ? _fmtDurationFromMinutes(underwayMinutesTotal) : "–";

  return { ehText, fuelUsed, fuelStart, fuelEnd, gLog, durationText };
}


function computeLegLogSummary(p, legIdx) {
  if (!p) {
    return { ehText: "–", fuelUsed: "–", fuelStart: "–", fuelEnd: "–", gLog: "–", durationText: "–" };
  }

  const entries = Array.isArray(p.entries) ? p.entries : [];
  const legEntries = entries.filter(e => (e.leg ?? 0) === legIdx);

  const sorted = legEntries.slice().sort((a, b) => new Date(a.time || 0) - new Date(b.time || 0));
  const m = computeLegMetricsFromEntries(p, legIdx);
  const fuelUsed = (m.fuelUsed === null) ? "–" : _fmt1(m.fuelUsed);
  const nmG = (m.nmG === null) ? "–" : _fmt1(m.nmG);
  const durationText = (m.durationMinutes === null) ? "–" : _fmtDurationFromMinutes(m.durationMinutes);

  // Fuel start/end + engine hours start/end based on snapshots
  const legEnds = Array.isArray(p.legEnds) ? p.legEnds : [];
  const endSnap = legEnds[legIdx] || {};
  const prevEndSnap = legIdx > 0 ? (legEnds[legIdx - 1] || {}) : {};

  const fuelStart = (legIdx === 0)
    ? (p.plan?.fuelStartPercent ?? "–")
    : (prevEndSnap.fuelEndPercent ?? "–");
  const fuelEnd = endSnap.fuelEndPercent ?? "–";

  const ehStart = (legIdx === 0)
    ? (p.plan?.engineHoursStart ?? "–")
    : (prevEndSnap.engineHoursEnd ?? "–");
  const ehEnd = endSnap.engineHoursEnd ?? "–";

  const ehText = (ehStart !== "–" && ehEnd !== "–" && ehStart !== "" && ehEnd !== "") ? `${ehStart}→${ehEnd}` : "–";

  return { ehText, fuelUsed, fuelStart: fuelStart || "–", fuelEnd: fuelEnd || "–", nmG, durationText };
}

function updateLogSummary() {
  const p = getCurrentPassage();
  if (!p) {
    logSummaryPanel.textContent = "";
    return;
  }

  // Only show an overall summary once the FINAL leg has been shut down.
  // (Per-leg summaries are shown inline after each Shutdown.)
  if (!p.finish?.shutdownLogged) {
    logSummaryPanel.textContent = "";
    return;
  }

  const total = computePassageLogSummary(p);
  const html = `<strong>Total:</strong>
    Engine hours: ${total.ehText} |
    Fuel Used: ${total.fuelUsed} |
    Fuel ${total.fuelStart}%→${total.fuelEnd}% |
    NM(G): ${total.gLog} |
    Under Way: ${total.durationText}`;

  logSummaryPanel.innerHTML = html;
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

function exportCurrentPassageToPdf() {
  const p = getCurrentPassage();
  if (!p) return alert("No passage selected.");

  // Ensure panels reflect current data before cloning
  try { updatePlanSummaryPanel(); } catch(e) {}
  try { renderLogEntries(); } catch(e) {}

  const date = p.plan.date || p.createdAt.slice(0, 10);
  const from = p.plan.from || "UnknownFrom";
  const to = p.plan.to || "UnknownTo";
  const title = `${date} — ${from} → ${to}`;

  // Optional header metadata
  const skipper = (p.plan?.skipper || "").trim();
  const crew = (p.plan?.crew || "").trim();
  const metaParts = [];
  if (skipper) metaParts.push(`Skipper: ${skipper}`);
  if (crew) metaParts.push(`Crew: ${crew}`);
  const metaInline = metaParts.length ? escapeHtml(metaParts.join(" • ")) : "";

  const headerHtml = `
    <div class="print-header">
      <div class="print-title">STEELER Logbook</div>
      <div class="print-subline">
        <div class="print-subtitle">${escapeHtml(title)}</div>
        ${metaInline ? `<div class="print-meta-inline">${metaInline}</div>` : ""}
      </div>
    </div>
  `;

  // Plan summary is already formatted for readability
  const planHtml = `
    <section class="print-plan">
      ${planSummaryPanel ? planSummaryPanel.innerHTML : ""}
    </section>
  `;

  // Clone the log table structure (headers/colgroup) and current rows
  const logTable = document.querySelector(".log-table");
  // Use a print-specific colgroup so the table reliably fits A4 landscape.
  // Widths are tuned so the numeric formats fit on one line WITHOUT truncation.
  // (Padding + borders consume space, so these are slightly wider than the raw character counts.)
  const colgroupHtml = `
    <colgroup>
      <col style="width:5.5ch"> <!-- TIME (12:34) -->
      <col style="width:3.5ch"> <!-- COG (000) -->
      <col style="width:4.5ch"> <!-- SPD (00.0) -->
      <col style="width:4.5ch"> <!-- RPM (0000) -->
      <col style="width:7.5ch"> <!-- ENG T/P (00/0.0) -->
      <col style="width:6.5ch"> <!-- LOG W (000.0) -->
      <col style="width:6.5ch"> <!-- LOG G (000.0) -->
      <col style="width:6.5ch"> <!-- FUEL (000.0) -->
      <col style="width:auto">  <!-- NOTES -->
    </colgroup>
  `;
  const theadHtml = `
      <thead>
        <tr>
          <th>TIME</th>
          <th>COG</th>
          <th>SPD</th>
          <th>RPM</th>
          <th>ENG&nbsp;T/P</th>
          <th>LOG&nbsp;W</th>
          <th>LOG&nbsp;G</th>
          <th>FUEL</th>
          <th>NOTES / ACTIONS</th>
        </tr>
      </thead>`;

  // IMPORTANT: we must build rows from data (not innerHTML), otherwise <input> values are lost in print
  const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const entries = (p.entries || []).slice().sort((a,b) => (a.time > b.time ? 1 : -1));
  const rowsHtml = entries.map(e => {
    const t = e.time ? timeOnlyFromIso(e.time) : "";
    return `<tr>
      <td>${esc(t)}</td>
      <td>${esc(e.course || "")}</td>
      <td>${esc(e.speed || "")}</td>
      <td>${esc(e.rpm || "")}</td>
      <td>${esc(e.engTP || "")}</td>
      <td>${esc(e.waterLog || "")}</td>
      <td>${esc(e.groundLog || "")}</td>
      <td>${esc(e.fuelUsed || "")}</td>
      <td>${esc(e.notes || "")}</td>
    </tr>`;
  }).join("");
const logHtml = `
    <section class="print-log">
      <table class="print-log-table">
        ${colgroupHtml}
        ${theadHtml}
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </section>
  `;

  if (!printArea) return alert("Print area not available.");

  printArea.innerHTML = `<div class="print-wrap">${headerHtml}<div class="print-grid">${planHtml}${logHtml}</div></div>`;

  // Trigger the browser print dialog (user can “Save as PDF”)
  window.print();

  // Clean up the print DOM afterwards to avoid any confusion
  setTimeout(() => { printArea.innerHTML = ""; }, 500);
}


exportCsvBtn.addEventListener("click", exportCurrentPassageToCsv);
exportPdfBtn?.addEventListener("click", exportCurrentPassageToPdf);
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


// --- CL-081: Weather Shorthand (Abbreviations DB) Settings UI -----------------

function __wxAbbrFindSettingsContainer() {
  const settingsTab = document.getElementById("settingsTab");
  if (!settingsTab) return null;

  const elPorts  = document.getElementById("managePortsBtn");
  const elBackup = document.getElementById("exportBackupBtn");
  const elCache  = document.getElementById("resetPwaCacheBtn");

  const els = [elPorts, elBackup, elCache].filter(Boolean);
  if (els.length < 2) return null;

  const chain = (el) => {
    const out = [];
    let n = el;
    while (n) {
      out.push(n);
      if (n === settingsTab) break;
      n = n.parentElement;
    }
    return out;
  };

  const c0 = chain(els[0]);
  const sets = els.slice(1).map(e => new Set(chain(e)));
  let lca = null;
  for (const n of c0) {
    if (sets.every(s => s.has(n))) { lca = n; break; }
  }
  if (!lca) return null;

  // We want the container that *contains the blocks* as direct children (cards).
  // If the LCA is the settingsTab itself, we still use it.
  return lca;
}

function __wxAbbrBlockForEl(el, container) {
  if (!el || !container) return null;
  let n = el;
  while (n && n.parentElement && n.parentElement !== container) n = n.parentElement;
  return (n && n.parentElement === container) ? n : null;
}

function reorderSettingsBlocksAndInjectWx() {
  const container = __wxAbbrFindSettingsContainer();
  if (!container) return;

  const portsBtn  = document.getElementById("managePortsBtn");
  const backupBtn = document.getElementById("exportBackupBtn");
  const cacheBtn  = document.getElementById("resetPwaCacheBtn");

  const portsBlock  = __wxAbbrBlockForEl(portsBtn, container);
  const backupBlock = __wxAbbrBlockForEl(backupBtn, container);
  const cacheBlock  = __wxAbbrBlockForEl(cacheBtn, container);

  if (!portsBlock || !backupBlock || !cacheBlock) return;

  // Create Weather Shorthand block (card) if not already present
  let wxBlock = document.getElementById("wxAbbrSettingsBlock");
  if (!wxBlock) {
    wxBlock = document.createElement(portsBlock.tagName.toLowerCase());
    wxBlock.id = "wxAbbrSettingsBlock";
    wxBlock.className = portsBlock.className || "";

    // Basic structure that should look reasonable even without CSS.
    wxBlock.innerHTML = `
      <div class="settings-block-inner">
        <h3 style="margin:0 0 8px 0;">Weather Shorthand</h3>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <button type="button" id="manageWxAbbrBtn">Manage Weather Abbreviations</button>
        </div>
        <div style="margin-top:10px; opacity:0.85;">
          Define abbreviation / expansion rules for Met Office and Météo-France forecasts.
        </div>
        <div id="wxAbbrEditorWrap" style="display:none; margin-top:14px; border-top:1px solid rgba(0,0,0,0.12); padding-top:12px;"></div>
      </div>
    `;
  }

  // Detach blocks first (preserve any other content)
  const blocks = [portsBlock, wxBlock, backupBlock, cacheBlock];
  blocks.forEach(b => { if (b && b.parentElement === container) container.removeChild(b); });

  // Re-insert in desired order: Ports, Weather Shorthand, Backup, Cache
  container.appendChild(portsBlock);
  container.appendChild(wxBlock);
  container.appendChild(backupBlock);
  container.appendChild(cacheBlock);

  // Now wire up editor UI once
  try { setupWeatherShorthandEditorUI(); } catch (e) { console.warn("wxAbbr UI setup failed", e); }
}

function setupWeatherShorthandEditorUI(){
  const btn  = document.getElementById("manageWxAbbrBtn");
  const wrap = document.getElementById("wxAbbrEditorWrap");
  if (!btn || !wrap) return;

  // Toggle editor visibility
  const toggle = () => {
    wrap.style.display = (wrap.style.display === "none" || !wrap.style.display) ? "block" : "none";
  };

  // Wire toggle every time (safe)
  btn.onclick = toggle;

  // Build UI once
  if (wrap.dataset.built === "1") return;
  wrap.dataset.built = "1";

  const mk = (tag, attrs={}, children=[]) => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v]) => {
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "text") el.textContent = v;
      else if (k === "value") el.value = v;
      else el.setAttribute(k, v);
    });
    children.forEach(c => el.appendChild(c));
    return el;
  };

  // Helpers
  const isAutoRegex = (s) => {
    const t = String(s||"");
    return (t.startsWith("\\b") && t.endsWith("\\b") && /\\s\+/.test(t));
  };
  const regexToHuman = (s) => {
    let t = String(s||"");
    t = t.replace(/\\b/g, "");
    t = t.replace(/\\s\+/g, " ");
    t = t.replace(/\\s\*/g, " ");
    t = t.replace(/\\s\?/g, " ");
    t = t.replace(/\\\\/g, "\\");
    t = t.replace(/\(\?:/g, "(");
    return t.trim();
  };

  const modeOptions = [
    ["plain","Plain"],
    ["word","Whole word"],
    ["regex","Regex"],
  ];

  // Hidden file input for import
  const importFile = mk("input", { id:"wxAbbrImportFile", type:"file", accept:".json,application/json", style:"display:none" });
  wrap.appendChild(importFile);

  const searchInp = mk("input", { id:"wxAbbrSearch", type:"search", placeholder:"Filter rules…", style:"min-width:220px;" });
  const addBtn    = mk("button", { type:"button", id:"wxAbbrAddBtn", text:"Add rule" });
  const sortBtn   = mk("button", { type:"button", id:"wxAbbrSortBtn", text:"Sort A→Z" });
  const exportBtn = mk("button", { type:"button", id:"wxAbbrExportBtn", text:"Export JSON" });
  const importBtn = mk("button", { type:"button", id:"wxAbbrImportBtn", text:"Import .json" });
  const resetBtn  = mk("button", { type:"button", id:"wxAbbrResetBtn",  text:"Reset to shipped defaults" });
  const clearBtn  = mk("button", { type:"button", id:"wxAbbrClearBtn",  text:"Clear all rules" });

  const topRow = mk("div", { style:"display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:10px;" }, [
    searchInp, addBtn, sortBtn, exportBtn, importBtn, resetBtn, clearBtn
  ]);

  const table = mk("table", { id:"wxAbbrTable", style:"width:100%; border-collapse:collapse;" });
  const thead = mk("thead", {}, [
    mk("tr", {}, [
      mk("th", { text:"On",   style:"text-align:left; padding:6px 4px; border-bottom:1px solid rgba(0,0,0,0.12);" }),
      mk("th", { text:"FROM", style:"text-align:left; padding:6px 4px; border-bottom:1px solid rgba(0,0,0,0.12);" }),
      mk("th", { text:"TO",   style:"text-align:left; padding:6px 4px; border-bottom:1px solid rgba(0,0,0,0.12);" }),
      mk("th", { text:"Mode", style:"text-align:left; padding:6px 4px; border-bottom:1px solid rgba(0,0,0,0.12);" }),
      mk("th", { text:"",     style:"padding:6px 4px; border-bottom:1px solid rgba(0,0,0,0.12);" }),
    ])
  ]);
  const tbody = mk("tbody", { id:"wxAbbrTbody" });
  table.appendChild(thead); table.appendChild(tbody);

  // Preview
  const prevProvider = mk("select", { id:"wxAbbrPrevProvider" });
  [["metoffice","Met Office"],["meteofrance","Météo-France"]].forEach(([v,t])=>prevProvider.appendChild(mk("option",{value:v,text:t})));
  const prevCat = mk("select", { id:"wxAbbrPrevCat" });
  [["wind","Wind"],["sea","Sea"],["weather","Weather"],["vis","Visibility"],["swl","Swell"]].forEach(([v,t])=>prevCat.appendChild(mk("option",{value:v,text:t})));

  const prevIn  = mk("textarea", { id:"wxAbbrPrevIn", rows:"4", style:"width:100%;", placeholder:"Paste forecast snippet here…" });
  const prevOut = mk("textarea", { id:"wxAbbrPrevOut", rows:"4", style:"width:100%;", readonly:"readonly" });

  const prevRow = mk("div", { style:"display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:14px;" }, [
    mk("div",{style:"display:flex; gap:8px; align-items:center;"},[mk("div",{text:"Preview as:", style:"opacity:0.8;"}), prevProvider, prevCat])
  ]);
  const prevGrid = mk("div", { style:"display:grid; grid-template-columns:1fr; gap:10px; margin-top:10px;" }, [
    mk("div",{},[mk("div",{text:"Original", style:"opacity:0.8; margin-bottom:4px;"}), prevIn]),
    mk("div",{},[mk("div",{text:"Result",   style:"opacity:0.8; margin-bottom:4px;"}), prevOut]),
  ]);

  wrap.appendChild(topRow);
  wrap.appendChild(table);
  wrap.appendChild(prevRow);
  wrap.appendChild(prevGrid);

  const getDb = () => loadAbbrDb();
  const saveDb = (db) => saveAbbrDb(db);

  const rebuildPreview = () => {
    try{
      const provider = prevProvider.value || "metoffice";
      const cat      = prevCat.value || "wind";
      const txt      = prevIn.value || "";
      // Use the runtime function if available; otherwise fall back to db apply directly.
      if (typeof abbreviateTextWithDb === "function") {
        prevOut.value = abbreviateTextWithDb(txt, provider, cat);
      } else if (typeof applyAbbrDbToText === "function") {
        prevOut.value = applyAbbrDbToText(txt, provider, cat);
      } else {
        prevOut.value = txt;
      }
    }catch(e){
      prevOut.value = (prevIn.value || "");
    }
  };

  const render = () => {
    const db = getDb();
    const q = (searchInp.value || "").trim().toLowerCase();
    const rules = Array.isArray(db.rules) ? db.rules : [];
    tbody.innerHTML = "";

    rules.forEach((rule, idx) => {
      const fromRaw = String(rule.from || "");
      const toRaw   = String(rule.to || "");
      const mode    = String(rule.mode || "plain");
      const enabled = (rule.enabled !== false);

      const fromDisp = (mode === "regex" && isAutoRegex(fromRaw)) ? regexToHuman(fromRaw) : fromRaw;

      if (q && !(fromDisp.toLowerCase().includes(q) || toRaw.toLowerCase().includes(q) || mode.toLowerCase().includes(q))) return;

      const tr = mk("tr", {}, []);

      const onTd = mk("td", { style:"padding:6px 4px; border-bottom:1px solid rgba(0,0,0,0.06);" });
      const onCb = mk("input", { type:"checkbox" });
      onCb.checked = enabled;
      onCb.onchange = () => {
        const db2 = getDb();
        if (!Array.isArray(db2.rules)) db2.rules = [];
        if (db2.rules[idx]) db2.rules[idx].enabled = !!onCb.checked;
        saveDb(db2);
        rebuildPreview();
      };
      onTd.appendChild(onCb);

      const fromTd = mk("td", { style:"padding:6px 4px; border-bottom:1px solid rgba(0,0,0,0.06);" });
      const fromIn = mk("input", { type:"text", value:fromDisp, style:"width:100%;" });
      fromIn.onchange = () => {
        const db2 = getDb();
        if (!Array.isArray(db2.rules)) db2.rules = [];
        if (!db2.rules[idx]) return;
        // If this is an auto-regex rule, preserve regex storage; else store plain text
        if (String(db2.rules[idx].mode || "plain") === "regex" && isAutoRegex(String(db2.rules[idx].from||""))) {
          // Convert human back to regex-ish minimal: keep original if you didn't change much
          // Safer: just replace display tokens back to \s+ and wrap \b...\b
          const human = String(fromIn.value||"").trim().toUpperCase();
          db2.rules[idx].from = "\\b" + human.replace(/\s+/g, "\\\\s+") + "\\\\b";
        } else {
          db2.rules[idx].from = String(fromIn.value||"");
        }
        saveDb(db2);
        rebuildPreview();
      };
      fromTd.appendChild(fromIn);

      const toTd = mk("td", { style:"padding:6px 4px; border-bottom:1px solid rgba(0,0,0,0.06);" });
      const toIn = mk("input", { type:"text", value:toRaw, style:"width:100%;" });
      toIn.onchange = () => {
        const db2 = getDb();
        if (!Array.isArray(db2.rules)) db2.rules = [];
        if (db2.rules[idx]) db2.rules[idx].to = String(toIn.value||"");
        saveDb(db2);
        rebuildPreview();
      };
      toTd.appendChild(toIn);

      const modeTd = mk("td", { style:"padding:6px 4px; border-bottom:1px solid rgba(0,0,0,0.06);" });
      const modeSel = mk("select", {});
      modeOptions.forEach(([v,t]) => modeSel.appendChild(mk("option",{value:v,text:t})));
      modeSel.value = mode;
      modeSel.onchange = () => {
        const db2 = getDb();
        if (!Array.isArray(db2.rules)) db2.rules = [];
        if (db2.rules[idx]) db2.rules[idx].mode = String(modeSel.value||"plain");
        saveDb(db2);
        render();
        rebuildPreview();
      };
      modeTd.appendChild(modeSel);

      const actTd = mk("td", { style:"padding:6px 4px; border-bottom:1px solid rgba(0,0,0,0.06);" });
      const delBtn = mk("button", { type:"button", text:"Delete" });
      delBtn.onclick = () => {
        const db2 = getDb();
        if (!Array.isArray(db2.rules)) db2.rules = [];
        if (idx >= 0 && idx < db2.rules.length) {
          db2.rules.splice(idx, 1);
          saveDb(db2);
          render();
          rebuildPreview();
        }
      };
      actTd.appendChild(delBtn);

      tr.appendChild(onTd);
      tr.appendChild(fromTd);
      tr.appendChild(toTd);
      tr.appendChild(modeTd);
      tr.appendChild(actTd);
      tbody.appendChild(tr);
    });
  };

  // Wire buttons
  searchInp.oninput = () => render();

  addBtn.onclick = () => {
    const db = getDb();
    if (!Array.isArray(db.rules)) db.rules = [];
    db.rules.unshift({ id:"r_"+Date.now(), from:"", to:"", mode:"plain", enabled:true });
    saveDb(db);
    render();
  };

  sortBtn.onclick = () => {
    const db = getDb();
    if (!Array.isArray(db.rules)) db.rules = [];
    db.rules.sort((a,b) => String(a.from||"").toUpperCase().localeCompare(String(b.from||"").toUpperCase()));
    saveDb(db);
    render();
  };

  exportBtn.onclick = async () => {
    const db = getDb();
    const json = JSON.stringify(db, null, 2);
    // Download
    try{
      const blob = new Blob([json], {type:"application/json"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");
      a.download = `STEELER_Abbreviations_${ts}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 200);
    }catch(e){}
    // Clipboard (best effort)
    try{
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(json);
    }catch(e){}
    alert("Abbreviations JSON exported (downloaded and copied to clipboard).");
  };

  importBtn.onclick = () => { importFile.value=""; importFile.click(); };

  importFile.addEventListener("change", (ev) => {
    const f = (ev.target && ev.target.files && ev.target.files[0]) ? ev.target.files[0] : null;
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const obj = JSON.parse(String(reader.result||""));
        // Accept either flat (rules[]) or legacy (groups)
        if (obj && Array.isArray(obj.rules)) {
          saveDb({ ...getDb(), ...obj, rules: obj.rules });
        } else {
          // Store raw and let loadAbbrDb normalise on next call
          localStorage.setItem(ABBR_DB_KEY, JSON.stringify(obj));
          loadAbbrDb(); // normalise + save
        }
        render();
        rebuildPreview();
        alert("Abbreviations DB imported.");
      }catch(e){
        alert("Import failed: invalid JSON.");
      }
    };
    reader.readAsText(f);
  });

  resetBtn.onclick = () => {
    if (!confirm("Reset abbreviations to shipped defaults? This will overwrite your current rules.")) return;
    const db = loadAbbrDb({forceReset:true});
    saveDb(db);
    render();
    rebuildPreview();
  };

  clearBtn.onclick = () => {
    if (!confirm("Clear all abbreviation rules?")) return;
    const db = getDb();
    db.rules = [];
    saveDb(db);
    render();
    rebuildPreview();
  };

  prevProvider.onchange = rebuildPreview;
  prevCat.onchange = rebuildPreview;
  prevIn.oninput = rebuildPreview;

  // Initial render
  render();
  rebuildPreview();
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

  // CL-081: Settings block order + Weather Shorthand editor
  try { reorderSettingsBlocksAndInjectWx(); } catch (e) { console.warn('reorderSettingsBlocksAndInjectWx failed', e); }


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