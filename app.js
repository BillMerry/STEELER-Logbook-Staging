// --- Constants & state ---------------------------------------------

const STORAGE_KEY = "steeler_logbook_passages_v5";
const THEME_KEY   = "steeler_logbook_theme_v1";
const PORTS_KEY   = "steeler_logbook_ports_v1";
const DPP_TEMPLATES_KEY = "steeler_dpp_templates_v1";

const APP_VERSION = "1.1.0-rc6b";

const storageSaveWarningsShown = new Set();
const storageRecoveryWarningsShown = new Set();

const STORAGE_SAFETY_CONFIG = {
  "steeler_logbook_passages_v5": {
    label: "passages",
    mirrorKey: "steeler_lkg_passages_v5",
    mirrorMetaKey: "steeler_lkg_passages_v5_meta"
  },
  "steeler_logbook_ports_v1": {
    label: "ports",
    mirrorKey: "steeler_lkg_ports_v1",
    mirrorMetaKey: "steeler_lkg_ports_v1_meta"
  },
  "steeler_safety_emergency_info_v1": {
    label: "Safety / Emergency Info",
    mirrorKey: "steeler_lkg_safety_emergency_info_v1",
    mirrorMetaKey: "steeler_lkg_safety_emergency_info_v1_meta"
  },
  "steeler_ec_settings_v1": {
    label: "legacy emergency contact settings",
    mirrorKey: "steeler_lkg_ec_settings_v1",
    mirrorMetaKey: "steeler_lkg_ec_settings_v1_meta"
  },
  "STEELER_ABBR_DB_V1": {
    label: "weather abbreviations",
    mirrorKey: "steeler_lkg_abbr_db_v1",
    mirrorMetaKey: "steeler_lkg_abbr_db_v1_meta"
  },
  "steeler_dpp_templates_v1": {
    label: "DPP templates",
    mirrorKey: "steeler_lkg_dpp_templates_v1",
    mirrorMetaKey: "steeler_lkg_dpp_templates_v1_meta"
  }
};

const storage = {
  getItem(key){
    return localStorage.getItem(key);
  },
  setItem(key, value){
    localStorage.setItem(key, value);
  },
  removeItem(key){
    localStorage.removeItem(key);
  }
};

function warnStorageSaveFailed(label, error){
  console.warn(`Failed to save ${label}`, error);
  if (storageSaveWarningsShown.has(label)) return;
  storageSaveWarningsShown.add(label);
  alert(`Warning: ${label} could not be saved on this device. Your latest changes may not be stored. Please make a backup when possible.`);
}

function getStorageSafetyConfig(key, label){
  const cfg = STORAGE_SAFETY_CONFIG[key] || null;
  return cfg ? { ...cfg, label: label || cfg.label } : null;
}

function parseStorageJson(raw, validate){
  const value = JSON.parse(raw);
  if (validate && !validate(value)) {
    throw new Error("Unexpected stored data shape.");
  }
  return value;
}

function mirrorLocalStorageRaw(key, raw, label){
  const cfg = getStorageSafetyConfig(key, label);
  if (!cfg || !raw) return;
  try{
    JSON.parse(raw);
    storage.setItem(cfg.mirrorKey, raw);
    storage.setItem(cfg.mirrorMetaKey, JSON.stringify({
      sourceKey: key,
      label: cfg.label,
      mirroredAt: new Date().toISOString(),
      appVersion: APP_VERSION
    }));
  }catch(e){
    console.warn(`Skipping last-known-good mirror for ${cfg.label}`, e);
  }
}

function exportRawStorageData({ key, label, raw, error }){
  try{
    const payload = {
      format: "steeler-corrupt-localstorage-export",
      version: 1,
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      key,
      label,
      error: error && error.message ? error.message : String(error || ""),
      raw: String(raw ?? "")
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g, "");
    const safeLabel = String(label || key || "localstorage")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "localstorage";
    const a = document.createElement("a");
    a.href = url;
    a.download = `STEELER-raw-${safeLabel}-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }catch(e){
    console.warn("Could not export raw localStorage data", e);
    alert("Could not export the raw stored data from this browser.");
  }
}

function handleStorageReadFailure({ key, label, raw, error, fallback, validate }){
  const cfg = getStorageSafetyConfig(key, label);
  const displayLabel = cfg?.label || label || key;
  console.error(`Failed to load ${displayLabel}`, error);

  if (!storageRecoveryWarningsShown.has(key)) {
    storageRecoveryWarningsShown.add(key);
    const message =
      `${displayLabel} could not be loaded from this device.\n\n` +
      "The stored data appears to be damaged or in an unexpected format.";

    if (confirm(`${message}\n\nDownload the raw stored data before recovery?`)) {
      exportRawStorageData({ key, label: displayLabel, raw, error });
    }

    if (cfg){
      const mirrorRaw = storage.getItem(cfg.mirrorKey);
      if (mirrorRaw){
        try{
          const recovered = parseStorageJson(mirrorRaw, validate);
          if (confirm(`A last-known-good copy of ${displayLabel} is available. Restore it now?`)) {
            storage.setItem(key, mirrorRaw);
            alert(`${displayLabel} restored from the last-known-good copy.`);
            return recovered;
          }
        }catch(e){
          console.warn(`Last-known-good copy for ${displayLabel} could not be used`, e);
        }
      }
    }

    alert(`${displayLabel} will use an empty/default value for now. If you exported raw data, keep that file for recovery.`);
  }

  return fallback;
}

function loadLocalStorageJsonItem(key, label, fallback, validate){
  const raw = storage.getItem(key);
  if (!raw) return fallback;
  try{
    const value = parseStorageJson(raw, validate);
    mirrorLocalStorageRaw(key, raw, label);
    return value;
  }catch(e){
    return handleStorageReadFailure({ key, label, raw, error: e, fallback, validate });
  }
}

function saveLocalStorageItem(key, value, label){
  try{
    const cfg = getStorageSafetyConfig(key, label);
    if (cfg) {
      parseStorageJson(value);
      mirrorLocalStorageRaw(key, storage.getItem(key), label);
    }
    storage.setItem(key, value);
    return true;
  }catch(e){
    warnStorageSaveFailed(label, e);
    return false;
  }
}

// --- Safety / Emergency data helpers ------------------------------
// Extracted to js/safety-emergency.js. Settings UI remains in app.js.

function loadEmergencyContactIntoSettingsForm(contact){
  const c = contact || createBlankEmergencyContact();

  const idEl = document.getElementById("seiEcId");
  if (idEl) idEl.value = c.id || "";

  const nameEl = document.getElementById("seiEcName");
  const telEl = document.getElementById("seiEcTel");
  const emailEl = document.getElementById("seiEcEmail");
  const notesEl = document.getElementById("seiEcNotes");

  if (nameEl) nameEl.value = c.name || "";
  if (telEl) telEl.value = c.tel || "";
  if (emailEl) emailEl.value = c.email || "";
  if (notesEl) notesEl.value = c.notes || "";
}

function renderEmergencyContactsManager(){
  const listEl = document.getElementById("seiEcList");
  if (!listEl) return;

  const contacts = getEmergencyContacts();
  listEl.innerHTML = "";

  contacts.forEach(c => {
    const row = document.createElement("div");
    row.className = "st-list-card";

    const left = document.createElement("div");
    left.className = "st-list-card-main";
    left.innerHTML = `
      <div style="font-weight:600;">${escapeHtml(c.name || "(unnamed contact)")} ${c.isDefault ? '<span style="opacity:0.7;">[default]</span>' : ''}</div>
      <div style="opacity:0.85;">${escapeHtml(c.tel || "")}</div>
      ${c.email ? `<div style="opacity:0.75;">${escapeHtml(c.email)}</div>` : ""}
      ${c.notes ? `<div style="opacity:0.75;">${escapeHtml(c.notes)}</div>` : ""}
    `;

    const right = document.createElement("div");
    right.className = "st-list-card-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-secondary btn-small";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => loadEmergencyContactIntoSettingsForm(c));

    const defBtn = document.createElement("button");
    defBtn.type = "button";
    defBtn.className = "btn btn-secondary btn-small";
    defBtn.textContent = "Make Default";
    defBtn.disabled = !!c.isDefault;
    defBtn.addEventListener("click", () => {
      setDefaultEmergencyContact(c.id);
      renderEmergencyContactsManager();
      loadEmergencyContactIntoSettingsForm(getDefaultEmergencyContact());
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn btn-secondary btn-small";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => {
      if (!confirm(`Delete emergency contact "${c.name || c.tel || "this contact"}"?`)) return;
      deleteEmergencyContact(c.id);
      renderEmergencyContactsManager();
      loadEmergencyContactIntoSettingsForm(getDefaultEmergencyContact());
    });

    right.appendChild(editBtn);
    right.appendChild(defBtn);
    right.appendChild(delBtn);

    row.appendChild(left);
    row.appendChild(right);
    listEl.appendChild(row);
  });
}

function chooseEmergencyContactForNotification(){
  const contacts = getEmergencyContacts();

  const lines = contacts.map((c, i) => {
    const mark = c.isDefault ? " [default]" : "";
    return `${i+1}. ${c.name || "(unnamed)"} – ${c.tel || "(no number)"}${mark}`;
  }).join("\n");

  const choice = prompt(
    "Notify Emergency Contact\n\n" +
    "Enter a saved contact number, or type NEW for a one-off contact.\n\n" +
    lines,
    ""
  );

  if (choice == null) return null;

  const raw = String(choice).trim();
  if (!raw) return null;

  if (raw.toUpperCase() === "NEW"){
    const name = prompt("One-off EC name:", "") || "";
    const tel = prompt("One-off EC telephone number:", "") || "";
    if (!String(tel).trim()) return null;
    const email = prompt("One-off EC email (optional):", "") || "";
    const notes = prompt("One-off EC notes / relationship (optional):", "") || "";
    return { id: "oneoff", name: name.trim(), tel: tel.trim(), email: email.trim(), notes: notes.trim(), isDefault: false };
  }

  const idx = parseInt(raw, 10);
  if (Number.isFinite(idx) && idx >= 1 && idx <= contacts.length){
    return contacts[idx - 1];
  }

  return null;
}

function saveSafetyInfoFromSettingsFields(){
  const s = getSafetyInfo();

  s.vessel.boatName  = (document.getElementById("seiBoatName")?.value || "").trim();
  s.vessel.boatType  = (document.getElementById("seiBoatType")?.value || "").trim();
  s.vessel.boatModel = (document.getElementById("seiBoatModel")?.value || "").trim();
		s.vessel.callsign  = (document.getElementById("seiCallsign")?.value || "").trim();
		s.vessel.mmsi      = (document.getElementById("seiMmsi")?.value || "").trim();
		s.vessel.ukSsr     = (document.getElementById("seiUkSsr")?.value || "").trim();
		s.vessel.marineTrafficShipId = (document.getElementById("seiMarineTrafficShipId")?.value || "").trim();		s.vessel.homePort  = (document.getElementById("seiHomePort")?.value || "").trim();  s.vessel.length    = (document.getElementById("seiLength")?.value || "").trim();
  s.vessel.beam      = (document.getElementById("seiBeam")?.value || "").trim();
  s.vessel.draft     = (document.getElementById("seiDraft")?.value || "").trim();

  s.appearanceSafety.topsides       = (document.getElementById("seiTopsides")?.value || "").trim();
  s.appearanceSafety.hull           = (document.getElementById("seiHull")?.value || "").trim();
  s.appearanceSafety.superstructure = (document.getElementById("seiSuperstructure")?.value || "").trim();
  s.appearanceSafety.liferaft       = (document.getElementById("seiLiferaft")?.value || "").trim();
  s.appearanceSafety.dinghy         = (document.getElementById("seiDinghy")?.value || "").trim();
  s.appearanceSafety.lifejackets    = (document.getElementById("seiLifejackets")?.value || "").trim();
  s.appearanceSafety.epirb          = (document.getElementById("seiEpirb")?.value || "").trim();
  s.appearanceSafety.safetyEquip    = (document.getElementById("seiSafetyEquip")?.value || "").trim();
  s.appearanceSafety.rnEquip        = (document.getElementById("seiRnEquip")?.value || "").trim();

  s.owner.names   = (document.getElementById("seiOwnerNames")?.value || "").trim();
  s.owner.tel     = (document.getElementById("seiOwnerTel")?.value || "").trim();
  s.owner.email   = (document.getElementById("seiOwnerEmail")?.value || "").trim();
  s.owner.address = (document.getElementById("seiOwnerAddr")?.value || "").trim();

  s.defaults.overdueHours = Number(document.getElementById("seiOverdueHours")?.value || 2);
  s.defaults.engineToSlipMins = Number(document.getElementById("seiEngineToSlip")?.value || 7);
  s.defaults.detailsPageUrl = (document.getElementById("seiDetailsUrl")?.value || "").trim();
  s.defaults.includeDetailsUrlInSms = !!document.getElementById("seiIncludeDetailsUrl")?.checked;
  s.defaults.includeMarineTrafficInSms = !!document.getElementById("seiIncludeMarineTraffic")?.checked;

		if (!Array.isArray(s.emergencyContacts) || !s.emergencyContacts.length){
				s.emergencyContacts = [createBlankEmergencyContact()];
				s.emergencyContacts[0].name = "Emergency Contact";
				s.emergencyContacts[0].isDefault = true;
		}
		
		const selectedId = (document.getElementById("seiEcId")?.value || "").trim();
		let ec = s.emergencyContacts.find(c => String(c.id) === String(selectedId));
		
		if (!ec){
				ec = createBlankEmergencyContact();
				ec.isDefault = !s.emergencyContacts.some(c => c.isDefault);
				s.emergencyContacts.push(ec);
		}
		
		ec.name  = (document.getElementById("seiEcName")?.value || "").trim();
		ec.tel   = (document.getElementById("seiEcTel")?.value || "").trim();
		ec.email = (document.getElementById("seiEcEmail")?.value || "").trim();
		ec.notes = (document.getElementById("seiEcNotes")?.value || "").trim();
		
		if (!s.emergencyContacts.some(c => c.isDefault)) ec.isDefault = true;

  saveSafetyInfo(s);
  alert("Safety / Emergency Info saved.");
}

// ---------------------------------------------------------------------------
// Emergency cache reset hook
// ---------------------------------------------------------------------------
// Use: http://localhost:8001/?reset=1
// This runs *before* any UI init so it works even if buttons/modals are broken.
// It must never delete logbook or settings data.
(function earlyResetHook(){
  try{
    const qs = new URLSearchParams(window.location.search);
    if (!qs.has("reset")) return;

    // Clear SW + cache storage only; localStorage contains user logbook data.
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
document.addEventListener("click", (e) => {
  if (e.target.closest(".entry-del-btn, .passage-delete-btn")) return;
  if (e.target.closest("tr.show-delete, .passage-card.show-delete")) return;
  hideAllSwipeDeleteButtons();
});
window.addEventListener("DOMContentLoaded", applyLogReadabilityPolish);
window.addEventListener("DOMContentLoaded", function(){ try{ loadAbbrDb(); }catch(e){} });


let passages = [];
let currentPassageId = null;
let knownPorts = [];
let recentPorts = [];
const PORTS_RECENT_LIMIT = 20;




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
    row.className = "ports-row st-list-card";

    const left = document.createElement("div");
    left.className = "ports-left st-list-card-main";

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
    latInput.type = "text";
    latInput.inputMode = "decimal";
    latInput.placeholder = "Lat";
    latInput.className = "ports-coord-input";
    latInput.value = (item && typeof item === "object" && item.lat != null) ? item.lat : "";

    const lonInput = document.createElement("input");
    lonInput.type = "text";
    lonInput.inputMode = "decimal";
    lonInput.placeholder = "Lon";
    lonInput.className = "ports-coord-input";
    lonInput.value = (item && typeof item === "object" && item.lon != null) ? item.lon : "";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "ports-mini";
    saveBtn.textContent = "Save coords";

    saveBtn.addEventListener("click", () => {
      const pair = parseSingleLatLonField(latInput.value) || parseLatLon(latInput.value, lonInput.value);
      if (!pair){
        alert("Please enter both latitude and longitude.");
        return;
      }
      const la = pair.lat;
      const lo = pair.lon;
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
								const hit = await lookupPortCoordsOnline(name);
								if (!hit) {
										alert(`Couldn’t find a reliable place match for "${name}". You can enter coordinates manually.`);
										return;
								}
								latInput.value = hit.lat.toFixed(6);
								lonInput.value = hit.lon.toFixed(6);
						} catch (e) {
								console.error(e);
								alert("Could not look up that port (offline or blocked). You can enter coordinates manually.");
						}
				});

    coords.appendChild(latInput);
    coords.appendChild(lonInput);

    const dmm = document.createElement("div");
    dmm.className = "ports-dmm";
    const latV = (item && typeof item === "object" && item.lat != null) ? item.lat : NaN;
    const lonV = (item && typeof item === "object" && item.lon != null) ? item.lon : NaN;
    if (isNaN(latV) || isNaN(lonV)) {
      dmm.textContent = "";
    } else {
      const mapsLink = document.createElement("a");
      mapsLink.href = `https://maps.apple.com/?ll=${latV},${lonV}&q=${encodeURIComponent(name)}`;
      mapsLink.target = "_blank";
      mapsLink.rel = "noopener noreferrer";
      mapsLink.textContent = formatDMM(latV, lonV);
      dmm.appendChild(mapsLink);
    }
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
    right.className = "ports-right st-list-card-actions";

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
    if (overlay) overlay.classList.remove("hidden");
  };
  const close = () => {
    modal.classList.add("hidden");
    if (overlay) overlay.classList.add("hidden");
  };

  openBtn.addEventListener("click", open);
  if (closeBtn) closeBtn.addEventListener("click", close);
  if (overlay) overlay.addEventListener("click", close);
}

function setupSettingsCardToggles(){
  const settingsGrid = document.querySelector(".settings-grid");
  document.querySelectorAll("[data-settings-card]").forEach(card => {
    const btn = card.querySelector("[data-settings-toggle]");
    const panel = card.querySelector("[data-settings-panel]");
    if (!btn || !panel || btn.dataset.bound === "1") return;

    const setOpen = (open) => {
      document.querySelectorAll("[data-settings-card]").forEach(other => {
        if (other !== card) {
          const otherBtn = other.querySelector("[data-settings-toggle]");
          const otherPanel = other.querySelector("[data-settings-panel]");
          if (otherPanel) otherPanel.hidden = true;
          if (otherBtn) {
            otherBtn.textContent = "›";
            otherBtn.setAttribute("aria-expanded", "false");
          }
          other.classList.remove("open");
        }
      });
      panel.hidden = !open;
      btn.textContent = open ? "Back to Settings" : "›";
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      card.classList.toggle("open", open);
      settingsGrid?.classList.toggle("settings-detail-mode", open);
      if (open) card.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    setOpen(card.classList.contains("open"));
    btn.dataset.bound = "1";
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      setOpen(panel.hidden);
    });
    card.querySelector(".settings-card-header")?.addEventListener("click", () => {
      if (panel.hidden) setOpen(true);
    });
  });
}

function closeSettingsPanels(){
  document.querySelector(".settings-grid")?.classList.remove("settings-detail-mode");
  document.querySelectorAll("[data-settings-card]").forEach(card => {
    const btn = card.querySelector("[data-settings-toggle]");
    const panel = card.querySelector("[data-settings-panel]");
    if (!btn || !panel) return;
    panel.hidden = true;
    btn.textContent = "›";
    btn.setAttribute("aria-expanded", "false");
    card.classList.remove("open");
  });
  if (dppTemplatesManager) dppTemplatesManager.style.display = "none";
  if (manageDppTemplatesBtn) manageDppTemplatesBtn.textContent = "Manage Detailed Passage Plans";
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
      if (parsed.stationName) stations[idx].name = parsed.stationName;

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

// --- Storage helpers -----------------------------------------------

function loadPassages() {
  passages = loadLocalStorageJsonItem(
    STORAGE_KEY,
    "passages",
    [],
    Array.isArray
  );
}

function savePassages() {
  try {
    saveLocalStorageItem(STORAGE_KEY, JSON.stringify(passages), "passages");
  } catch (e) {
    console.error("Failed to save passages", e);
    warnStorageSaveFailed("passages", e);
  }
}

function loadPorts() {
  const parsed = loadLocalStorageJsonItem(
    PORTS_KEY,
    "ports",
    null,
    value => Array.isArray(value) || (value && typeof value === "object")
  );

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
    saveLocalStorageItem(PORTS_KEY, JSON.stringify(payload), "ports");
    // If Plan comms is empty, auto-fill from updated port data
    try { updatePlanCommsFromPorts(); } catch(e) {}
    try { updatePlanSummaryPanel(); } catch(e) {}
  } catch (e) {
    console.warn("Failed to save ports", e);
    warnStorageSaveFailed("ports", e);
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

function formatDateShort(isoDate){
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || "";

  try {
    const d = new Date(isoDate + "T12:00:00");
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const day = d.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase();
    return `${dd}/${mm} ${day}`;
  } catch(e) {
    return isoDate;
  }
}

// --- Port coordinate helpers (offline-first) -----------------------------

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
  if (OFFLINE_PORTS[q]) return { name, lat: OFFLINE_PORTS[q].lat, lon: OFFLINE_PORTS[q].lon };

  // 3) fuzzy: allow prefix match for e.g. "Chichester Harbour"
  const keys = Object.keys(OFFLINE_PORTS);
  const hit = keys.find(k => q === k || q.startsWith(k + " ") || k.startsWith(q + " "));
  if (hit) return { name, lat: OFFLINE_PORTS[hit].lat, lon: OFFLINE_PORTS[hit].lon };

  return null;
}

// --- Sunrise / sunset calculation (NOAA approximation, offline) ----------

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

// --- EC SMS Builders (CL-085) -------------------------------------
// Extracted to js/ec-sms.js. Keep app.js as the workflow coordinator.

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
        if (typeof readDetailedPassagePlanFromForm === "function") readDetailedPassagePlanFromForm();
        try { savePassages(); } catch {}
      }
    }
  } catch {}


  tabButtons.forEach(b => {
    const isActive = b.dataset.tab === tabId;
    b.classList.toggle("active", isActive);
    b.classList.toggle("st-tab-active", isActive);
  });
  tabs.forEach(t => t.classList.toggle("active", t.id === tabId));

  if (tabId === "settingsTab") {
    try { closeSettingsPanels(); } catch(e) {}
  }

  // Keep Home passage highlight in sync with the currently selected passage
  if (tabId === "homeTab") {
    try { refreshHomePassageList(); } catch {}
  }

  if (tabId === "planTab" && planForm?.dataset?.openingDpp !== "1") {
    try { showPassagePlanPage(); } catch {}
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

  const parsedPair = parseSingleLatLonField(val);
  if (parsedPair) {
    return {
      lat: formatLatFromDecimal(parsedPair.lat),
      lon: formatLonFromDecimal(parsedPair.lon)
    };
  }

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
const homePassageSearch = document.getElementById("homePassageSearch");
const homePassageFilterBtn = document.getElementById("homePassageFilterBtn");
const homePassageSortBtn = document.getElementById("homePassageSortBtn");
const homePassageCount = document.getElementById("homePassageCount");
let homePassageFilterMode = "all";
let homePassageSortMode = "newest";

const exportBackupBtn = document.getElementById("exportBackupBtn");
const importBackupBtn = document.getElementById("importBackupBtn");
const importFileInput = document.getElementById("importFileInput");
const exportPortsBtn = document.getElementById("exportPortsBtn");
const importPortsBtn = document.getElementById("importPortsBtn");
const importPortsFileInput = document.getElementById("importPortsFileInput");
const manageDppTemplatesBtn = document.getElementById("manageDppTemplatesBtn");
const exportDppTemplatesBtn = document.getElementById("exportDppTemplatesBtn");
const importDppTemplatesBtn = document.getElementById("importDppTemplatesBtn");
const importDppTemplatesFileInput = document.getElementById("importDppTemplatesFileInput");
const dppTemplatesManager = document.getElementById("dppTemplatesManager");

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
const planPageSummaryStrip = document.getElementById("planPageSummaryStrip");
const planOpenDppBtn = document.getElementById("planOpenDppBtn");

const addEntryBtn = document.getElementById("addEntryBtn");
const logEntriesContainer = document.getElementById("logEntriesContainer");
const logEmptyMessage = document.getElementById("logEmptyMessage");
const planSummaryPanel = document.getElementById("planSummaryPanel");
const logStatusStrip = document.getElementById("logStatusStrip");
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
  saveLocalStorageItem(THEME_KEY, theme, "theme setting");
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
  headerPassageMain.textContent = "";
  headerSunrise.textContent = "";
  headerCrew.textContent = "";
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

function getRouteLegNames(p, legIdx){
  const route = getRouteNames(p);
  const idx = Math.max(0, Math.min(Number(legIdx) || 0, Math.max(0, route.length - 2)));
  return {
    origin: route[idx] || "",
    destination: route[idx + 1] || ""
  };
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

  const base = "https://nominatim.openstreetmap.org/search";
  const viewbox = "-6.8,58.8,7.5,45.5"; // UK, CI, IoM, FR, BE, NL
  const countrycodes = "gb,fr,be,nl,gg,je,im";

  const q0 = normalisePortQuery(n);

  // Keep this simple and fast: plain place lookup first, then a light marine-biased variant.
  const queries = [
    q0,
    `${q0} port`,
    `${q0} harbour`
  ].map(q => q.trim()).filter(Boolean);

  function normaliseLoose(s){
    return String(s || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenise(s){
    return normaliseLoose(s).split(/\s+/).filter(Boolean);
  }

  function scoreResult(item){
    const cls = String(item.class || "").toLowerCase();
    const typ = String(item.type || "").toLowerCase();
    const addrt = String(item.addresstype || "").toLowerCase();
    const dn = String(item.display_name || "");
    const dnNorm = normaliseLoose(dn);
    const qNorm = normaliseLoose(n);

    let score = 0;

    // Strong preference for proper places
    if (cls === "place") score += 60;
    if (["city","town","village","hamlet","locality","suburb","island"].includes(typ)) score += 40;
    if (["city","town","village","hamlet","locality","suburb","island"].includes(addrt)) score += 30;

    // Exact whole-name style match
    if (dnNorm === qNorm) score += 120;
    if (dnNorm.startsWith(qNorm + " ")) score += 80;

    const qTokens = tokenise(n);
    const dnTokens = tokenise(dn);

    if (qTokens.length){
      let matched = 0;
      qTokens.forEach(t => { if (dnTokens.includes(t)) matched += 1; });
      score += matched * 18;
      if (matched === qTokens.length) score += 35;
    }

    // Marine / coastal hints are a bonus, but not mandatory
    if (/\b(port|harbour|harbor|marina|quay|dock|pier|haven)\b/i.test(dn)) score += 24;

    // Hard penalties for obvious junk
    if (/\b(road|street|avenue|lane|close|drive|way|court|terrace|house|farm|cottage|chateau|office|business park|industrial estate)\b/i.test(dn)) score -= 140;
    if (cls === "highway") score -= 180;
    if (["road","house","building","commercial","industrial"].includes(addrt)) score -= 120;

    // If the matched string only appears as part of another word, penalise
    const wholeWord = new RegExp(`\\b${qNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (!wholeWord.test(dnNorm) && dnNorm.includes(qNorm)) score -= 30;

    // Light postcode/address penalty
    if (/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i.test(dn)) score -= 25;

    return score;
  }

  for (const q of queries){
    try{
      const url = `${base}?format=jsonv2&limit=8&countrycodes=${countrycodes}&viewbox=${viewbox}&bounded=1&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        headers: { "Accept":"application/json", "Accept-Language":"en,fr,nl" }
      });
      if (!res.ok) continue;

      const data = await res.json();
      if (!Array.isArray(data) || !data.length) continue;

      const ranked = data
        .map(item => {
          const lat = parseFloat(item.lat);
          const lon = parseFloat(item.lon);
          return { item, lat, lon, score: scoreResult(item) };
        })
        .filter(x => isFinite(x.lat) && isFinite(x.lon) && saneForSteeler(x.lat, x.lon))
        .sort((a,b) => b.score - a.score);

      if (ranked.length){
        const best = ranked[0];
        return {
          lat: best.lat,
          lon: best.lon,
          displayName: best.item.display_name || "",
          mapsUrl: `https://maps.apple.com/?ll=${best.lat},${best.lon}&q=${encodeURIComponent(best.item.display_name || n)}`
        };
      }
    }catch(e){
      // try next query
    }
  }

  return null;
}

function showPortConfirmModal({ name, lat, lon, displayName, mapsUrl }){
  return new Promise((resolve) => {
    const n = normalisePortDisplay(name);
    const dmm = formatDMM(lat, lon);
    const safeDisplay = escapeHtml(displayName || "");
    const safeMaps = escapeHtml(mapsUrl || `https://maps.apple.com/?ll=${lat},${lon}&q=${encodeURIComponent(n)}`);

    const body = `
      <p><strong>${escapeHtml(n)}</strong> isn’t in your saved ports yet.</p>
      ${safeDisplay ? `<p class="muted" style="margin-top:6px">Suggested match: ${safeDisplay}</p>` : ""}
      <div style="margin-top:10px; padding:10px; border:1px solid var(--line); border-radius:12px;">
        <div><strong>Lat/Lon</strong>: ${lat.toFixed(6)}, ${lon.toFixed(6)}</div>
        <div style="margin-top:4px">${escapeHtml(dmm)}</div>
        <div style="margin-top:8px"><a href="${safeMaps}" target="_blank" rel="noopener noreferrer">Check on Apple Maps</a></div>
      </div>
      <p style="margin-top:10px" class="muted">Please check this suggested location before saving.</p>
      <div style="margin-top:10px">
        <label class="muted" for="pcManualCoords" style="display:block; margin-bottom:4px">Correct coordinates manually (optional)</label>
        <input id="pcManualCoords" type="text" placeholder="e.g. 49.710, -1.880" style="width:100%; border:1px solid var(--line); border-radius:12px; padding:8px; background:var(--panel); color:var(--fg);">
      </div>
      <div style="margin-top:10px">
        <label class="muted" for="pcCommsPilotage" style="display:block; margin-bottom:4px">Comms / Pilotage (optional)</label>
        <textarea id="pcCommsPilotage" rows="2" style="width:100%; border:1px solid var(--line); border-radius:12px; padding:8px; background:var(--panel); color:var(--fg);"></textarea>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px">
        <button id="pcSave" class="btn">Save port</button>
        <button id="pcSkip" class="btn secondary">Not now</button>
      </div>
    `;

    showModal({
      title: "Save port coordinates",
      bodyHtml: body,
      hideButtons: true,
      onOk: null
    });

    const finish = (result) => {
      modalOverlay.classList.add("hidden");
      modalBody.innerHTML = "";
      if (modalOkBtn) modalOkBtn.style.display = "";
      if (modalCancelBtn) modalCancelBtn.style.display = "";
      resolve(result);
    };

    document.getElementById("pcSave")?.addEventListener("click", () => {
      const manualRaw = (document.getElementById("pcManualCoords")?.value || "").trim();
      let finalLat = lat;
      let finalLon = lon;

      if (manualRaw){
        const parsed = parseSingleLatLonField(manualRaw);
        if (!parsed){
          alert("Please enter coordinates as decimal lat, lon — for example: 49.710, -1.880");
          return;
        }
        if (!saneForSteeler(parsed.lat, parsed.lon)){
          alert("Those coordinates look outside your normal cruising range. Please double-check.");
          return;
        }
        finalLat = parsed.lat;
        finalLon = parsed.lon;
      }

      const c = (document.getElementById("pcCommsPilotage")?.value || "").trim();
      finish({ action: "save", lat: finalLat, lon: finalLon, commsPilotage: c });
    });

    document.getElementById("pcSkip")?.addEventListener("click", () => finish({ action: "skip" }));

    document.getElementById("modalOverlay")?.addEventListener("click", (e) => {
      if (e.target === modalOverlay) finish({ action: "skip" });
    }, { once: true });
  });
}

function showPortNoMatchModal(name){
  return new Promise((resolve) => {
    const n = normalisePortDisplay(name);
    const body = `
      <p>Couldn’t find a reliable place match for <strong>${escapeHtml(n)}</strong>.</p>
      <p class="muted" style="margin-top:6px">Enter coordinates manually if you want to save it now.</p>
      <div style="margin-top:10px; padding:10px; border:1px solid var(--line); border-radius:12px;">
        <div>
          <label class="muted" for="pnmCoords" style="display:block; margin-bottom:4px">Coordinates</label>
          <input id="pnmCoords" type="text" placeholder="e.g. 49.710, -1.880" style="width:100%; border:1px solid var(--line); border-radius:12px; padding:8px; background:var(--panel); color:var(--fg);">
        </div>
        <div style="margin-top:10px">
          <label class="muted" for="pnmComments" style="display:block; margin-bottom:4px">Comms / Pilotage (optional)</label>
          <textarea id="pnmComments" rows="2" style="width:100%; border:1px solid var(--line); border-radius:12px; padding:8px; background:var(--panel); color:var(--fg);"></textarea>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px">
          <button id="pnmSave" class="btn">Save coords</button>
          <button id="pnmSkip" class="btn secondary">Not now</button>
        </div>
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
      const raw = document.getElementById("pnmCoords")?.value || "";
      const parsed = parseSingleLatLonField(raw);
      if (!parsed){
        alert("Please enter coordinates as decimal lat, lon — for example: 49.710, -1.880");
        return;
      }
      if (!saneForSteeler(parsed.lat, parsed.lon)){
        alert("Those coordinates look outside your normal cruising range. Please double-check.");
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

  const decision = await showPortConfirmModal({
				name: n,
				lat: hit.lat,
				lon: hit.lon,
				displayName: hit.displayName,
				mapsUrl: hit.mapsUrl
			});
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

function applyLogReadabilityPolish(){
  // v0.13.0: CSS moved to styles.css. Kept as a no-op for existing startup flow.
}

function applyModalTopSheetPolish(){
  // v0.13.0: CSS moved to styles.css. Kept as a no-op for existing modal flow.
}

function showModal({ title, bodyHtml, onOk, onCancel, okText = "OK", cancelText = "Cancel", hideButtons = false }) {
  applyModalTopSheetPolish();

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
    version: 3,
    exportedAt: new Date().toISOString(),
    data: {
						passages,
						theme: storage.getItem(THEME_KEY) || "day",
						safetyInfo: getSafetyInfo(),
      dppTemplates: loadDppTemplateStore()
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

function exportPortsBackup() {
  const payload = {
    format: "steeler-ports-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      knownPorts: { all: knownPorts, recent: recentPorts }
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
  const filename = `STEELER-Ports-backup-${y}${mo}${da}${hh}${mm}.json`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportDppTemplatesBackup() {
  const payload = {
    format: "steeler-dpp-templates-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      dppTemplates: loadDppTemplateStore()
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
  const filename = `STEELER-DPP-Templates-backup-${y}${mo}${da}${hh}${mm}.json`;

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
      if (!Array.isArray(obj.data.passages)) {
        alert("Backup file is missing expected passage data.");
        return;
      }
      const hasDppTemplates = !!obj.data.dppTemplates;
      const ok = confirm(
        "Restore backup? This will REPLACE the current passages and Safety / Emergency Info on this device if present in the backup." +
        (hasDppTemplates ? " DPP templates in the backup will also replace current DPP templates." : "") +
        " Ports will be left unchanged."
      );
      if (!ok) return;

      passages = obj.data.passages;
      saveLocalStorageItem(STORAGE_KEY, JSON.stringify(passages), "passages");
							if (obj.data.safetyInfo) {
									try {
											saveLocalStorageItem(SAFETY_INFO_KEY, JSON.stringify(obj.data.safetyInfo), "Safety / Emergency Info");
									} catch(e) {
											console.warn("Failed to restore Safety / Emergency Info", e);
											warnStorageSaveFailed("Safety / Emergency Info", e);
									}
							}
      if (hasDppTemplates) {
        saveDppTemplateStore(obj.data.dppTemplates);
      }
      // Legacy support: if an older full backup still contains ports, preserve current ports.
      // Ports are now managed separately via Export/Import Ports.
      applyTheme(obj.data.theme || "day");

      refreshHomePassageList();
      currentPassageId = passages[0]?.id || null;
      loadPassageIntoUI();
      try { injectSafetyEmergencySettingsBlock(); } catch(e) {}
      renderDppTemplatesManager();
      alert("Backup restored successfully. Ports were left unchanged.");
    } catch (e) {
      console.error(e);
      alert("Could not restore that file (invalid JSON).");
    }
  };
  reader.readAsText(file);
}

function importDppTemplatesBackupFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(reader.result);
      const templatesPayload = obj?.data?.dppTemplates || obj?.dppTemplates;
      const valid = obj && obj.format === "steeler-dpp-templates-backup" && templatesPayload;
      if (!valid) {
        alert("That file doesn’t look like a STEELER Detailed Passage Plans backup.");
        return;
      }

      const imported = normaliseDppTemplateStore(templatesPayload).templates;
      if (!imported.length) {
        alert("That Detailed Passage Plans backup does not contain any templates.");
        return;
      }

      const ok = confirm("Import Detailed Passage Plans? Matching template names will be updated; new templates will be added.");
      if (!ok) return;

      const store = loadDppTemplateStore();
      const byName = new Map();
      store.templates.forEach(tpl => {
        const name = String(tpl.name || "").trim().toLowerCase();
        if (name) byName.set(name, tpl);
      });

      imported.forEach(tpl => {
        const name = String(tpl.name || "").trim();
        if (!name) return;
        const key = name.toLowerCase();
        const existing = byName.get(key);
        byName.set(key, {
          id: existing?.id || tpl.id || ("dpp_tpl_" + Date.now() + "_" + Math.random().toString(36).slice(2)),
          name,
          createdAt: existing?.createdAt || tpl.createdAt || new Date().toISOString(),
          updatedAt: tpl.updatedAt || new Date().toISOString(),
          detailed: cloneDetailedPassagePlan(tpl.detailed, { regenerateIds: true })
        });
      });

      saveDppTemplateStore({
        version: 1,
        updatedAt: new Date().toISOString(),
        templates: Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name))
      });
      renderDppTemplatesManager();
      alert("Detailed Passage Plan templates imported successfully.");
    } catch (e) {
      console.error(e);
      alert("Could not import that file (invalid JSON).");
    }
  };
  reader.readAsText(file);
}

function importPortsBackupFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(reader.result);
      const portsPayload = obj?.data?.knownPorts;
      const valid = obj && obj.format === "steeler-ports-backup" && portsPayload;
      if (!valid) {
        alert("That file doesn’t look like a STEELER Ports backup.");
        return;
      }

      const importedAll = Array.isArray(portsPayload.all) ? portsPayload.all : [];
      const importedRecent = Array.isArray(portsPayload.recent) ? portsPayload.recent : [];
      const ok = confirm("Import Ports? Matching port names will be updated; new ports will be added.");
      if (!ok) return;

      const byName = new Map();
      (knownPorts || []).forEach(p => {
        const name = portName(p).trim();
        if (name) byName.set(name, p);
      });

      importedAll.forEach(p => {
        const name = portName(p).trim();
        if (!name) return;
        byName.set(name, p);
      });

      knownPorts = Array.from(byName.values()).map(p => ensurePortId(p));
      knownPorts.sort((a,b) => portName(a).localeCompare(portName(b)));

      const mergedRecent = [];
      const pushRecent = (name) => {
        const n = String(name || "").trim();
        if (!n || mergedRecent.includes(n)) return;
        mergedRecent.push(n);
      };
      importedRecent.forEach(pushRecent);
      recentPorts.forEach(pushRecent);
      recentPorts = mergedRecent.slice(0, PORTS_RECENT_LIMIT);

      cleanPortsInPlace();
      savePorts();
      refreshPortUI();
      try { updatePlanSummaryPanel(); } catch(e) {}
      alert("Ports imported successfully.");
    } catch (e) {
      console.error(e);
      alert("Could not import that file (invalid JSON).");
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

exportPortsBtn?.addEventListener("click", exportPortsBackup);
importPortsBtn?.addEventListener("click", () => importPortsFileInput?.click());
importPortsFileInput?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  importPortsBackupFile(file);
  e.target.value = "";
});

exportDppTemplatesBtn?.addEventListener("click", exportDppTemplatesBackup);
importDppTemplatesBtn?.addEventListener("click", () => importDppTemplatesFileInput?.click());
importDppTemplatesFileInput?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  importDppTemplatesBackupFile(file);
  e.target.value = "";
});

manageDppTemplatesBtn?.addEventListener("click", () => {
  if (!dppTemplatesManager) return;
  const open = dppTemplatesManager.style.display === "none" || !dppTemplatesManager.style.display;
  dppTemplatesManager.style.display = open ? "block" : "none";
  manageDppTemplatesBtn.textContent = open ? "Hide Detailed Passage Plans" : "Manage Detailed Passage Plans";
  if (open) renderDppTemplatesManager();
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
  let startY = 0;
  let cardWasOpen = false;
  let isHorizontalSwipe = false;
  let wheelX = 0;
  let wheelTimer = null;
  const revealPx = 76;
  const lockThresholdPx = 76;
  const commitThresholdPx = 220;

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const setSwipeOffset = (px) => {
    card.classList.add("swipe-dragging");
    card.style.setProperty("--swipe-x", `${px}px`);
  };
  const clearSwipeOffset = () => {
    card.classList.remove("swipe-dragging");
    card.style.removeProperty("--swipe-x");
  };

  card.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];
    startX = t.screenX;
    startY = t.screenY;
    cardWasOpen = card.classList.contains("show-delete");
    isHorizontalSwipe = false;
  }, { passive: true });

  card.addEventListener("touchmove", (e) => {
    const t = e.changedTouches[0];
    const dx = t.screenX - startX;
    const dy = t.screenY - startY;

    if (!isHorizontalSwipe && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      isHorizontalSwipe = true;
      hideAllSwipeDeleteButtons(card);
    }

    if (!isHorizontalSwipe) return;

    e.preventDefault();
    const base = cardWasOpen ? -revealPx : 0;
    const offset = clamp(base + dx, -commitThresholdPx, 0);
    setSwipeOffset(offset);
  }, { passive: false });

  card.addEventListener("touchend", (e) => {
    const t = e.changedTouches[0];
    const dx = t.screenX - startX;
    const dy = t.screenY - startY;

    if (isHorizontalSwipe || (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy) * 1.25)) {
      if (dx < -commitThresholdPx) {
        hideAllSwipeDeleteButtons(card);
        card.classList.remove("show-delete");
        clearSwipeOffset();
        card.dataset.justSwiped = "1";
        setTimeout(() => { delete card.dataset.justSwiped; }, 350);
        deletePassageById(passageId);
        return;
      }

      if (cardWasOpen) {
        if (dx > 18) {
          card.classList.remove("show-delete");
        } else {
          card.classList.add("show-delete");
        }
      } else if (dx < -lockThresholdPx) {
        hideAllSwipeDeleteButtons(card);
        card.classList.add("show-delete");
      } else {
        card.classList.remove("show-delete");
      }

      clearSwipeOffset();
      card.dataset.justSwiped = "1";
      setTimeout(() => { delete card.dataset.justSwiped; }, 350);
    }
  }, { passive: true });

  card.addEventListener("touchcancel", clearSwipeOffset, { passive: true });

  card.addEventListener("wheel", (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;

    wheelX += e.deltaX;
    clearTimeout(wheelTimer);

    wheelTimer = setTimeout(() => {
      if (wheelX > commitThresholdPx) {
        hideAllSwipeDeleteButtons(card);
        card.classList.remove("show-delete");
        deletePassageById(passageId);
      } else if (wheelX > lockThresholdPx) {
        hideAllSwipeDeleteButtons(card);
        card.classList.add("show-delete");
      } else if (wheelX < -lockThresholdPx) {
        card.classList.remove("show-delete");
      }

      wheelX = 0;
      card.dataset.justSwiped = "1";
      setTimeout(() => { delete card.dataset.justSwiped; }, 300);
    }, 60);
  }, { passive: true });

  card.addEventListener("click", (e) => {
    if (card.dataset.justSwiped === "1") {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
}

function getPassageDashboardStatus(passage) {
  const hasEngineStart = (passage.entries || []).some(e => inferEntryType(e) === "engine-start");
  if (passage.finish?.shutdownLogged) return "Complete";
  if (hasEngineStart) return "Under Way";
  return "Planned";
}

function getPassageDateValue(passage) {
  return passage.plan?.date || passage.createdAt?.slice(0, 10) || "";
}

function passageMatchesHomeFilter(passage) {
  const status = getPassageDashboardStatus(passage);
  if (homePassageFilterMode === "active") return passage.id === currentPassageId || status === "Under Way";
  if (homePassageFilterMode === "complete") return status === "Complete";
  return true;
}

function passageMatchesHomeSearch(passage) {
  const q = (homePassageSearch?.value || "").trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    getRouteNames(passage).join(" "),
    getPassageDateValue(passage),
    getPassageDashboardStatus(passage),
    passage.plan?.skipper || "",
    passage.plan?.crew || ""
  ].join(" ").toLowerCase();
  return haystack.includes(q);
}

function getPassageDashboardMetrics(passage) {
  const status = getPassageDashboardStatus(passage);
  const legIdx = getCurrentLegIndex(passage);
  const summary = status === "Complete"
    ? computePassageLogSummary(passage)
    : computeLegLogSummary(passage, legIdx);

  return [
    { label: "Under Way", value: summary.durationText || "–" },
    { label: "Engine Hours", value: summary.ehText || "–" },
    { label: "Fuel Used", value: summary.fuelUsed || "–" },
    { label: "NM(G)", value: summary.gLog || summary.nmG || "–" }
  ].map(m => `
    <span class="st-metric-chip passage-metric">
      <span>${escapeHtml(m.label)}</span>
      <strong>${escapeHtml(m.value && m.value !== "undefined" ? String(m.value) : "–")}</strong>
    </span>
  `).join("");
}

function getPassageStatusClass(status) {
  return String(status || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function refreshHomePassageList() {
  homePassageList.innerHTML = "";

  if (passages.length === 0) {
    const p = document.createElement("p");
    p.textContent = "No passages yet. Tap “+ New Passage” to get started.";
    p.className = "hint";
    homePassageList.appendChild(p);
    if (homePassageCount) homePassageCount.textContent = "0 passages";
    return;
  }

  const visiblePassages = passages
    .filter(passage => passageMatchesHomeFilter(passage) && passageMatchesHomeSearch(passage))
    .slice()
    .sort((a, b) => {
      const av = getPassageDateValue(a);
      const bv = getPassageDateValue(b);
      return homePassageSortMode === "oldest" ? av.localeCompare(bv) : bv.localeCompare(av);
    });

  if (homePassageCount) {
    const totalEntries = passages.reduce((sum, p) => sum + (p.entries?.length || 0), 0);
    homePassageCount.textContent = `${visiblePassages.length} passages • ${totalEntries} entries`;
  }

  if (visiblePassages.length === 0) {
    const p = document.createElement("p");
    p.textContent = "No passages match the current search or filter.";
    p.className = "hint";
    homePassageList.appendChild(p);
    return;
  }

  visiblePassages.forEach(passage => {
    const card = document.createElement("div");
    card.className = "passage-card" + (passage.id === currentPassageId ? " selected" : "");

    const date = getPassageDateValue(passage);
    const routeText = getRouteNames(passage).join(" → ") || "?";
    const status = getPassageDashboardStatus(passage);
    const entriesCount = passage.entries?.length || 0;

    const left = document.createElement("div");
    left.className = "passage-card-left";
    left.innerHTML = `
      <div class="passage-card-title">${escapeHtml(routeText)}</div>
      <div class="passage-card-meta"><span>${escapeHtml(date)}</span><span>${entriesCount} entries</span><span class="st-status-chip status-${escapeHtml(getPassageStatusClass(status))}">${escapeHtml(status)}</span></div>
    `;

    const summary = document.createElement("div");
    summary.className = "passage-card-summary";
    summary.innerHTML = getPassageDashboardMetrics(passage);

    const chevron = document.createElement("div");
    chevron.className = "passage-card-chevron";
    chevron.textContent = ">";

    const main = document.createElement("div");
    main.className = "passage-card-main";
    main.appendChild(left);
    main.appendChild(summary);
    main.appendChild(chevron);

    const actions = document.createElement("div");
    actions.className = "passage-card-actions";

    const del = document.createElement("button");
    del.className = "passage-delete-btn";
    del.innerHTML = deleteBinSvg();
				del.title = "Delete passage";
    
    del.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      deletePassageById(passage.id);
    });

    actions.appendChild(del);
    card.appendChild(main);
    card.appendChild(actions);

    card.addEventListener("click", (e) => {
      if (card.dataset.justSwiped === "1") return;
      if (e.target.closest(".passage-delete-btn")) return;

      currentPassageId = passage.id;
      loadPassageIntoUI();
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

function updateLogStatusStrip() {
  if (!logStatusStrip) return;
  const p = getCurrentPassage();
  if (!p) {
    logStatusStrip.innerHTML = "";
    logStatusStrip.hidden = true;
    return;
  }

  const legIdx = getCurrentLegIndex(p);
  const legCount = getLegCount(p);
  const route = getRouteLegNames(p, legIdx);
  const legSummary = computeLegLogSummary(p, legIdx);
  const entries = Array.isArray(p.entries) ? p.entries : [];
  const hasEngineStart = hasSpecialForLeg(p, "engine start", legIdx);
  const hasSlip = hasSpecialForLeg(p, "slipped lines", legIdx);
  const hasDock = hasSpecialForLeg(p, "alongside", legIdx) || hasSpecialForLeg(p, "docked", legIdx);
  const hasShutdown = hasSpecialForLeg(p, "shutdown", legIdx);
  const status = p.finish?.shutdownLogged
    ? "Passage Complete"
    : hasShutdown ? "Leg Complete" : hasDock ? "Docked" : hasSlip ? "Under Way" : hasEngineStart ? "Engine Started" : "Planned";

  const legLabel = legCount > 1 ? `Leg ${legIdx + 1} of ${legCount}` : "Current Passage";
  const routeText = [route.origin, route.destination].filter(Boolean).join(" → ") || getRouteNames(p).join(" → ") || "Route not set";
  const passageDate = p.plan?.date || p.createdAt?.slice(0, 10) || "Date not set";
  const crewText = [
    p.plan?.skipper ? `Skipper: ${p.plan.skipper}` : "",
    p.plan?.crew ? `Crew: ${p.plan.crew}` : ""
  ].filter(Boolean).join(" | ") || "Crew not set";
  const statusClass = getPassageStatusClass(status);

  logStatusStrip.hidden = false;
  logStatusStrip.innerHTML = `
    <button type="button" class="log-status-route log-status-link" data-status-nav="dpp">
      <span class="log-status-label">Current Passage</span>
      <strong>${escapeHtml(routeText)}</strong>
      <span>${escapeHtml(legLabel)}</span>
    </button>
    <button type="button" class="log-status-state log-status-link" data-status-nav="home-status">
      <span class="log-status-label">Status</span>
      <strong class="log-status-badge status-${escapeHtml(statusClass)}">${escapeHtml(status)}</strong>
    </button>
    <button type="button" class="st-metric-chip log-status-link" data-status-nav="plan-date"><span>Date</span><strong>${escapeHtml(passageDate)}</strong></button>
    <button type="button" class="st-metric-chip log-status-link log-status-crew" data-status-nav="plan-crew"><span>Crew</span><strong>${escapeHtml(crewText)}</strong></button>
    <button type="button" class="st-metric-chip log-status-link" data-status-nav="latest-log"><span>Under Way</span><strong>${escapeHtml(legSummary.durationText || "–")}</strong></button>
    <button type="button" class="st-metric-chip log-status-link" data-status-nav="latest-log"><span>Entries</span><strong>${entries.length}</strong></button>
  `;
  logStatusStrip.querySelectorAll("[data-status-nav]").forEach((btn) => {
    btn.addEventListener("click", () => handleStatusStripNavigation(btn.dataset.statusNav));
  });
}

function flashNavigationTarget(el) {
  if (!el || !el.classList) return;
  el.classList.remove("status-nav-highlight");
  void el.offsetWidth;
  el.classList.add("status-nav-highlight");
  window.setTimeout(() => el.classList.remove("status-nav-highlight"), 1400);
}

function scrollToSelectedHomePassage() {
  const target = homePassageList?.querySelector(".passage-card.selected") || homePassageList?.querySelector(".passage-card");
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  flashNavigationTarget(target);
}

function scrollToPlanFields(ids) {
  showPassagePlanPage();
  switchToTab("planTab");
  window.setTimeout(() => {
    const fields = ids.map((id) => document.getElementById(id)).filter(Boolean);
    const target = fields[0];
    if (!target) return;
    const scrollTarget = target.closest(".row") || target.closest("label") || target;
    scrollTarget.scrollIntoView({ behavior: "smooth", block: "center" });
    fields.forEach((field) => flashNavigationTarget(field.closest("label") || field));
    if (typeof target.focus === "function") target.focus({ preventScroll: true });
  }, 80);
}

function showPassagePlanPage() {
  if (planForm?.classList) planForm.classList.remove("dpp-page-mode");
}

function openDetailedPassagePlanPage() {
  if (planForm?.dataset) planForm.dataset.openingDpp = "1";
  switchToTab("planTab");
  if (planForm?.dataset) delete planForm.dataset.openingDpp;
  const p = getCurrentPassage();
  if (p && typeof renderDetailedPassagePlan === "function") renderDetailedPassagePlan(p);
  if (planForm?.classList) planForm.classList.add("dpp-page-mode");
  window.setTimeout(() => {
    const target = document.getElementById("detailedPassagePlanSection");
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    flashNavigationTarget(target);
  }, 80);
}

function handleStatusStripNavigation(action) {
  if (action === "dpp") {
    openDetailedPassagePlanPage();
    return;
  }

  if (action === "latest-log") {
    switchToTab("logTab");
    requestScrollToNewestLogEntry();
    renderLogEntries();
    return;
  }

  if (action === "plan-date") {
    scrollToPlanFields(["planDate"]);
    return;
  }

  if (action === "plan-crew") {
    scrollToPlanFields(["planSkipper", "planCrew"]);
    return;
  }

  if (action === "home-status") {
    switchToTab("homeTab");
    window.setTimeout(scrollToSelectedHomePassage, 80);
  }
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
    name: "",
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
    const preservedName = String((st && st.name) || "").trim();
    st = { ...st, name: preservedName, role: r.role, auto:true };
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

function removeTransitPortAt(index){
  const p = getCurrentPassage();
  if (!p) return;
  readTransitPortsFromForm(p);
  const tps = normaliseTransitPorts(p);
  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= tps.length) return;

  const name = String(tps[idx]?.name || "").trim();
  const label = name ? ` "${name}"` : ` ${idx + 1}`;
  const ok = confirm(
    `Remove transit port${label}?\n\n` +
    "This will rebuild the route legs and tide station list. Existing Detailed Passage Plan leg data is kept, but you should review the DPP after the route changes."
  );
  if (!ok) return;

  tps.splice(idx, 1);
  p.plan.transitPorts = tps;

  if (Array.isArray(p.plan.detailedLegs) && Number(p.plan.detailedLegIndex) >= getLegCount(p)) {
    p.plan.detailedLegIndex = Math.max(0, getLegCount(p) - 1);
  }

  renderTransitPortsUI(p);
  readTransitPortsFromForm(p);
  ensureAutoTideStations(p);
  ensureDetailedPassagePlans(p);
  renderTideStations(p);
  renderDetailedPassagePlan(p);
  try { updatePlanCommsFromPorts(); } catch(e) {}
  savePassages();
  updatePlanSummaryPanel();
  updatePassageHeader();
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
      ],
      detailed: {
        waypoints: [],
        hazards: "",
        portsOfRefuge: "",
        crewWelfare: ""
      },
      detailedLegs: [],
      detailedLegIndex: 0
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
  renderDetailedPassagePlan(p);
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
    row.dataset.raw = st.raw || "";
    row.dataset.source = st.source || "";
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
      raw: row.dataset.raw || "",
      source: row.dataset.source || "",
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

function ensureDetailedPassagePlan(p){
  if (!p || !p.plan) return;
  if (!p.plan.detailed || typeof p.plan.detailed !== "object") {
    p.plan.detailed = { waypoints: [], hazards: "", portsOfRefuge: "", crewWelfare: "" };
  }
  if (!Array.isArray(p.plan.detailed.waypoints)) p.plan.detailed.waypoints = [];
  if (typeof p.plan.detailed.hazards !== "string") p.plan.detailed.hazards = "";
  if (typeof p.plan.detailed.portsOfRefuge !== "string") p.plan.detailed.portsOfRefuge = "";
  if (typeof p.plan.detailed.crewWelfare !== "string") p.plan.detailed.crewWelfare = "";
}
function ensureDetailedPassagePlans(p){
  if (!p || !p.plan) return;
  ensureDetailedPassagePlan(p);

  const legCount = getLegCount(p);
  if (!Array.isArray(p.plan.detailedLegs)) {
    p.plan.detailedLegs = [cloneDetailedPassagePlan(p.plan.detailed)];
  }

  p.plan.detailedLegs = p.plan.detailedLegs.map(d => normaliseDetailedPassagePlan(d));
  if (!p.plan.detailedLegs.length) p.plan.detailedLegs.push(createBlankDetailedPassagePlan());

  if (detailedPassagePlanHasContent(p.plan.detailed) && !detailedPassagePlanHasContent(p.plan.detailedLegs[0])) {
    p.plan.detailedLegs[0] = cloneDetailedPassagePlan(p.plan.detailed);
  }

  while (p.plan.detailedLegs.length < legCount) {
    p.plan.detailedLegs.push(createBlankDetailedPassagePlan());
  }

  p.plan.detailed = p.plan.detailedLegs[0];
}

function getSelectedDetailedPlanLegIndex(p){
  ensureDetailedPassagePlans(p);
  const max = Math.max(0, getLegCount(p) - 1);
  const saved = Number(p?.plan?.detailedLegIndex);
  const fallback = getCurrentLegIndex(p);
  const raw = Number.isFinite(saved) ? saved : fallback;
  return Math.max(0, Math.min(raw, max));
}

function setSelectedDetailedPlanLegIndex(p, legIdx){
  ensureDetailedPassagePlans(p);
  const max = Math.max(0, getLegCount(p) - 1);
  p.plan.detailedLegIndex = Math.max(0, Math.min(Number(legIdx) || 0, max));
  return p.plan.detailedLegIndex;
}

function getDetailedPassagePlanForLeg(p, legIdx = null){
  ensureDetailedPassagePlans(p);
  const idx = legIdx == null ? getSelectedDetailedPlanLegIndex(p) : Math.max(0, Math.min(Number(legIdx) || 0, Math.max(0, getLegCount(p) - 1)));
  return p.plan.detailedLegs[idx] || p.plan.detailedLegs[0] || p.plan.detailed;
}

function setDetailedPassagePlanForLeg(p, legIdx, detailed){
  ensureDetailedPassagePlans(p);
  const idx = Math.max(0, Math.min(Number(legIdx) || 0, Math.max(0, getLegCount(p) - 1)));
  p.plan.detailedLegs[idx] = normaliseDetailedPassagePlan(detailed);
  if (idx === 0) p.plan.detailed = p.plan.detailedLegs[0];
  return p.plan.detailedLegs[idx];
}

function getDetailedPlanFromTarget(target, legIdx = null){
  if (target && Array.isArray(target.waypoints)) return target;
  if (target && target.plan) return getDetailedPassagePlanForLeg(target, legIdx);
  return createBlankDetailedPassagePlan();
}

function normaliseDppTemplateStore(store){
  const source = store && typeof store === "object" ? store : {};
  const rawTemplates = Array.isArray(source.templates) ? source.templates : [];

  return {
    version: 1,
    updatedAt: String(source.updatedAt || ""),
    templates: rawTemplates
      .map((tpl) => ({
        id: String(tpl?.id || "").trim(),
        name: String(tpl?.name || "").trim(),
        createdAt: String(tpl?.createdAt || ""),
        updatedAt: String(tpl?.updatedAt || ""),
        detailed: normaliseDetailedPassagePlan(tpl?.detailed || tpl?.plan || {})
      }))
      .filter((tpl) => tpl.id && tpl.name)
  };
}

function loadDppTemplateStore(){
  const fallback = { version: 1, updatedAt: "", templates: [] };
  const stored = loadLocalStorageJsonItem(
    DPP_TEMPLATES_KEY,
    "DPP templates",
    fallback,
    (v) => v && typeof v === "object"
  );
  return normaliseDppTemplateStore(stored);
}

function saveDppTemplateStore(store){
  const clean = normaliseDppTemplateStore(store);
  clean.updatedAt = new Date().toISOString();
  return saveLocalStorageItem(DPP_TEMPLATES_KEY, JSON.stringify(clean), "DPP templates");
}

function getDppTemplates(){
  return loadDppTemplateStore().templates;
}

function getDppTemplateById(id){
  const wanted = String(id || "");
  return getDppTemplates().find((tpl) => String(tpl.id) === wanted) || null;
}

function saveDppTemplate(name, detailed){
  const cleanName = String(name || "").trim();
  if (!cleanName) throw new Error("Please enter a name for this DPP template.");

  const now = new Date().toISOString();
  const store = loadDppTemplateStore();
  const existing = store.templates.find((tpl) => tpl.name.toLowerCase() === cleanName.toLowerCase());
  const template = {
    id: existing?.id || ("dpp_tpl_" + Date.now() + "_" + Math.random().toString(36).slice(2)),
    name: cleanName,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    detailed: cloneDetailedPassagePlan(detailed, { regenerateIds: true })
  };

  if (existing) {
    store.templates = store.templates.map((tpl) => tpl.id === existing.id ? template : tpl);
  } else {
    store.templates.push(template);
  }

  store.templates.sort((a, b) => a.name.localeCompare(b.name));
  saveDppTemplateStore(store);
  return template;
}

function deleteDppTemplate(id){
  const wanted = String(id || "");
  const store = loadDppTemplateStore();
  const before = store.templates.length;
  store.templates = store.templates.filter((tpl) => String(tpl.id) !== wanted);
  if (store.templates.length === before) return false;
  saveDppTemplateStore(store);
  return true;
}

function renameDppTemplate(id, name){
  const wanted = String(id || "");
  const cleanName = String(name || "").trim();
  if (!wanted || !cleanName) return false;

  const store = loadDppTemplateStore();
  const duplicate = store.templates.find((tpl) =>
    String(tpl.id) !== wanted &&
    String(tpl.name || "").trim().toLowerCase() === cleanName.toLowerCase()
  );
  if (duplicate) {
    alert("A DPP template with that name already exists.");
    return false;
  }

  let changed = false;
  store.templates = store.templates.map((tpl) => {
    if (String(tpl.id) !== wanted) return tpl;
    changed = true;
    return {
      ...tpl,
      name: cleanName,
      updatedAt: new Date().toISOString()
    };
  });
  if (!changed) return false;

  store.templates.sort((a, b) => a.name.localeCompare(b.name));
  saveDppTemplateStore(store);
  return true;
}

function updateDppTemplate(id, patch){
  const wanted = String(id || "");
  if (!wanted) return false;

  const store = loadDppTemplateStore();
  let changed = false;
  store.templates = store.templates.map((tpl) => {
    if (String(tpl.id) !== wanted) return tpl;
    changed = true;
    return {
      ...tpl,
      ...patch,
      id: tpl.id,
      createdAt: tpl.createdAt,
      updatedAt: new Date().toISOString()
    };
  });
  if (!changed) return false;

  store.templates.sort((a, b) => a.name.localeCompare(b.name));
  saveDppTemplateStore(store);
  return true;
}

function readDppTemplateEditorForm(){
  const rows = modalBody.querySelectorAll("[data-template-wp-row]");
  const waypoints = [];

  rows.forEach((row, idx) => {
    const name = (row.querySelector(".template-wp-name")?.value || "").trim();
    const coordsRaw = row.querySelector(".template-wp-coords")?.value || "";
    const parsed = parseDetailedWaypointCoords(coordsRaw);
    waypoints.push({
      id: row.getAttribute("data-template-wp-id") || ("wp_" + Date.now() + "_" + idx + "_" + Math.random().toString(36).slice(2)),
      time: "",
      name,
      coordsText: parsed ? formatDetailedWaypointCoords(parsed.lat, parsed.lon) : coordsRaw,
      lat: parsed ? parsed.lat : null,
      lon: parsed ? parsed.lon : null,
      distToNext: "",
      cogToNext: "",
      plannedSpeed: (row.querySelector(".template-wp-speed")?.value || "").trim(),
      timeToNext: "",
      fuelToNext: ""
    });
  });

  const detailed = {
    waypoints,
    hazards: modalBody.querySelector("#templateDppHazards")?.value || "",
    portsOfRefuge: modalBody.querySelector("#templateDppPortsOfRefuge")?.value || "",
    crewWelfare: modalBody.querySelector("#templateDppCrewWelfare")?.value || ""
  };

  recalcDetailedPassagePlan(detailed);
  return detailed;
}

function renderDppTemplateEditorRows(detailed){
  const body = modalBody.querySelector("#templateDppRows");
  if (!body) return;

  const wps = detailed.waypoints || [];
  body.innerHTML = wps.map((wp, idx) => `
    <tr data-template-wp-row="${idx}" data-template-wp-id="${escapeHtml(wp.id || "")}">
      <td><input type="text" class="template-wp-name" value="${escapeHtml(wp.name || "")}" placeholder="Waypoint"></td>
      <td><input type="text" class="template-wp-coords" value="${escapeHtml(wp.coordsText || formatDetailedWaypointCoords(Number(wp.lat), Number(wp.lon)))}" placeholder="50.57507° N, 2.44846° W"></td>
      <td><input type="number" step="0.1" inputmode="decimal" class="template-wp-speed" value="${escapeHtml(wp.plannedSpeed || "")}" placeholder="kt"></td>
      <td><button type="button" class="btn btn-secondary btn-small template-wp-delete">Delete</button></td>
    </tr>
  `).join("");

  body.querySelectorAll(".template-wp-delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      const active = readDppTemplateEditorForm();
      const row = btn.closest("[data-template-wp-row]");
      const idx = Number(row?.getAttribute("data-template-wp-row"));
      if (!Number.isFinite(idx)) return;
      active.waypoints.splice(idx, 1);
      renderDppTemplateEditorRows(active);
    });
  });
}

function openDppTemplateEditor(id){
  const tpl = getDppTemplateById(id);
  if (!tpl) return;

  const detailed = cloneDetailedPassagePlan(tpl.detailed);
  showModal({
    title: "Edit Detailed Passage Plan Template",
    okText: "Save Template",
    bodyHtml: `
      <label>
        Template Name
        <input type="text" id="templateDppName" value="${escapeHtml(tpl.name)}">
      </label>
      <div style="overflow-x:auto; margin-top:0.8rem;">
        <table class="log-table template-dpp-table" style="min-width:760px;">
          <thead>
            <tr>
              <th>Waypoint</th>
              <th>WP Lat/Lon</th>
              <th>Plan kt</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="templateDppRows"></tbody>
        </table>
      </div>
      <button type="button" class="btn btn-secondary btn-small" id="templateDppAddWaypoint" style="margin-top:0.55rem;">+ Add Waypoint</button>
      <div style="margin-top:0.8rem;">
        <label class="template-dpp-notes-label"><span>Hazards</span><textarea id="templateDppHazards" rows="2">${escapeHtml(detailed.hazards || "")}</textarea></label>
      </div>
      <div style="margin-top:0.6rem;">
        <label class="template-dpp-notes-label"><span>Ports of Refuge</span><textarea id="templateDppPortsOfRefuge" rows="2">${escapeHtml(detailed.portsOfRefuge || "")}</textarea></label>
      </div>
      <div style="margin-top:0.6rem;">
        <label class="template-dpp-notes-label"><span>Crew Welfare</span><textarea id="templateDppCrewWelfare" rows="2">${escapeHtml(detailed.crewWelfare || "")}</textarea></label>
      </div>
    `,
    onOk: () => {
      const name = (modalBody.querySelector("#templateDppName")?.value || "").trim();
      if (!name) {
        alert("Please enter a template name.");
        return false;
      }

      const duplicate = getDppTemplates().find((other) =>
        String(other.id) !== String(id) &&
        String(other.name || "").trim().toLowerCase() === name.toLowerCase()
      );
      if (duplicate) {
        alert("A Detailed Passage Plan template with that name already exists.");
        return false;
      }

      const updatedDetailed = readDppTemplateEditorForm();
      updateDppTemplate(id, {
        name,
        detailed: cloneDetailedPassagePlan(updatedDetailed, { regenerateIds: true })
      });
      renderDppTemplatesManager();
      try { renderDetailedPassagePlan(getCurrentPassage()); } catch(e) {}
    }
  });

  renderDppTemplateEditorRows(detailed);
  modalBody.querySelector("#templateDppAddWaypoint")?.addEventListener("click", () => {
    const active = readDppTemplateEditorForm();
    active.waypoints.push({
      id: "wp_" + Date.now() + "_" + Math.random().toString(36).slice(2),
      time: "",
      name: "",
      coordsText: "",
      lat: null,
      lon: null,
      distToNext: "",
      cogToNext: "",
      plannedSpeed: "",
      timeToNext: "",
      fuelToNext: ""
    });
    renderDppTemplateEditorRows(active);
  });
}

function renderDppTemplatesManager(){
  if (!dppTemplatesManager) return;

  const templates = getDppTemplates();
  if (!templates.length) {
    dppTemplatesManager.innerHTML = '<p class="hint">No saved DPP templates yet.</p>';
    return;
  }

  dppTemplatesManager.innerHTML = templates.map((tpl) => {
    const detailed = normaliseDetailedPassagePlan(tpl.detailed);
    const wps = detailed.waypoints || [];
    const totals = calcDetailedPassagePlanTotals(wps);
    const notes = [
      detailed.hazards ? "Hazards" : "",
      detailed.portsOfRefuge ? "Ports of Refuge" : "",
      detailed.crewWelfare ? "Crew Welfare" : ""
    ].filter(Boolean).join(", ");

    return `
      <div class="dpp-template-manager-row st-list-card" data-dpp-template-id="${escapeHtml(tpl.id)}">
        <div class="dpp-template-manager-main st-list-card-main">
          <input type="text" class="dpp-template-name-input" value="${escapeHtml(tpl.name)}" aria-label="DPP template name">
          <div class="hint">
            ${wps.length} waypoint${wps.length === 1 ? "" : "s"} · ${escapeHtml(String(totals.totalNm || 0))} NM · ${escapeHtml(totals.totalDuration || "00:00")}
            ${notes ? ` · ${escapeHtml(notes)}` : ""}
          </div>
          <details class="dpp-template-preview">
            <summary>Preview</summary>
            <ol>
              ${wps.map((wp) => `<li>${escapeHtml(wp.name || "Waypoint")} ${wp.plannedSpeed ? `· ${escapeHtml(String(wp.plannedSpeed))} kt` : ""}</li>`).join("")}
            </ol>
            ${detailed.hazards ? `<p><strong>Hazards:</strong> ${escapeHtml(detailed.hazards).replace(/\n/g, "<br>")}</p>` : ""}
            ${detailed.portsOfRefuge ? `<p><strong>Ports of Refuge:</strong> ${escapeHtml(detailed.portsOfRefuge).replace(/\n/g, "<br>")}</p>` : ""}
            ${detailed.crewWelfare ? `<p><strong>Crew Welfare:</strong> ${escapeHtml(detailed.crewWelfare).replace(/\n/g, "<br>")}</p>` : ""}
          </details>
        </div>
        <div class="dpp-template-manager-actions st-list-card-actions">
          <button type="button" class="btn btn-secondary btn-small dpp-template-edit-btn">Edit</button>
          <button type="button" class="btn btn-secondary btn-small dpp-template-rename-btn">Rename</button>
          <button type="button" class="btn btn-secondary btn-small dpp-template-delete-btn">Delete</button>
        </div>
      </div>
    `;
  }).join("");

  dppTemplatesManager.querySelectorAll("[data-dpp-template-id]").forEach((row) => {
    const id = row.getAttribute("data-dpp-template-id") || "";
    const input = row.querySelector(".dpp-template-name-input");

    row.querySelector(".dpp-template-edit-btn")?.addEventListener("click", () => {
      openDppTemplateEditor(id);
    });

    row.querySelector(".dpp-template-rename-btn")?.addEventListener("click", () => {
      const name = input?.value || "";
      if (renameDppTemplate(id, name)) renderDppTemplatesManager();
    });

    row.querySelector(".dpp-template-delete-btn")?.addEventListener("click", () => {
      const tpl = getDppTemplateById(id);
      if (!tpl) return;
      if (!confirm(`Delete DPP template "${tpl.name}"?`)) return;
      deleteDppTemplate(id);
      renderDppTemplatesManager();
      try { renderDetailedPassagePlan(getCurrentPassage()); } catch(e) {}
    });
  });
}

// --- Detailed Passage Plan UI -------------------------------------
// Extracted to js/dpp-ui.js. Keep app.js as the workflow coordinator.

addDailySummaryBtn.addEventListener("click", () => {
  const p = getCurrentPassage();
  if (!p) return;
  p.plan.dailySummaries = readDailySummariesFromForm();
  p.plan.dailySummaries.push({ id: "ds_" + Date.now(), date: "", fee: "", notes: "" });
  renderDailySummaries(p);
});

planOpenDppBtn?.addEventListener("click", () => {
  openDetailedPassagePlanPage();
});

window.addEventListener("DOMContentLoaded", () => { try { const p = getCurrentPassage(); if (p) renderDetailedPassagePlan(p); } catch(e){} });

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
    ensureDetailedPassagePlans(p);
    renderTideStations(p);
    renderDetailedPassagePlan(p);
    updatePlanSummaryPanel();
    updatePassageHeader();
  });
}

document.querySelectorAll("[data-transit-remove]").forEach(btn => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    removeTransitPortAt(Number(btn.dataset.transitRemove));
  });
});

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
	        ensureDetailedPassagePlans(p);
	        setSelectedDetailedPlanLegIndex(p, tps.length);
	        renderTideStations(p);
	        renderDetailedPassagePlan(p);

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
// Rough bboxes (lat/lon) to auto-pick a zone from Origin/Destination.
// These are intentionally broad, but constrained to Northern France / Channel / Biscay coast.
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
// --- CL-081: Abbreviations DB (v0.7.0) ----------------------------------
// We keep the existing hard-coded shorthand (abbreviateMetOfficeText) as the
// baseline, then apply user-defined rules from localStorage on top.
// This lets Bill add context-specific rules (e.g. "R" => "RAIN" in WEATHER,
// but "R" => "ROUGH" in SEA) without risking regression in the base logic.

const ABBR_DB_KEY = "STEELER_ABBR_DB_V1";

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
      saveLocalStorageItem(ABBR_DB_KEY, JSON.stringify(d), "weather abbreviations");
      return d;
    }

    const db = loadLocalStorageJsonItem(
      ABBR_DB_KEY,
      "weather abbreviations",
      null,
      value => value && typeof value === "object" && !Array.isArray(value)
    );
    if (!db){
      const d = shippedFlat();
      saveLocalStorageItem(ABBR_DB_KEY, JSON.stringify(d), "weather abbreviations");
      return d;
    }

    // Already flat?
    if (db && typeof db === "object" && Array.isArray(db.rules)){
      if (db.seededFromDefaults !== true){
        // one-time upgrade merge of shipped defaults (non-destructive)
        db.rules = mergeById(db.rules, shippedFlat().rules);
        db.seededFromDefaults = true;
        db.updatedAt = new Date().toISOString();
        saveLocalStorageItem(ABBR_DB_KEY, JSON.stringify(db), "weather abbreviations");
      }
      return db;
    }

    // Legacy shaped DB — migrate once to flat, preserving user edits and adding shipped defaults.
    const migrated = shippedFlat();
    const legacyRules = flattenGroups(db && db.groups ? db.groups : null);
    migrated.rules = mergeById(legacyRules, migrated.rules); // keep legacy first (user wins on duplicate ids)
    migrated.seededFromDefaults = true;
    migrated.updatedAt = new Date().toISOString();
    saveLocalStorageItem(ABBR_DB_KEY, JSON.stringify(migrated), "weather abbreviations");
    return migrated;

  }catch(e){
    // Fallback: restore shipped defaults
    const d = shippedFlat();
    saveLocalStorageItem(ABBR_DB_KEY, JSON.stringify(d), "weather abbreviations");
    return d;
  }
}

function saveAbbrDb(db){
  try{
    db.updatedAt = new Date().toISOString();
    return saveLocalStorageItem(ABBR_DB_KEY, JSON.stringify(db), "weather abbreviations");
  }catch(e){ return false; }
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

    const body = buildMarineRouteRequest(origin, destination, via);

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
  if (typeof readDetailedPassagePlanFromForm === "function") readDetailedPassagePlanFromForm();
  ensureDetailedPassagePlans(p);

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

  p.plan.tideStations = readTideStationsFromForm();
  p.plan.dailySummaries = readDailySummariesFromForm();
  if (typeof readDetailedPassagePlanFromForm === "function") readDetailedPassagePlanFromForm();
		ensureDetailedPassagePlans(p);
		recalcDetailedPassagePlan(p, getSelectedDetailedPlanLegIndex(p));

  const sunriseSet = p.plan.sunriseSet || "";
  const moonPhase = p.plan.moonPhase || "";
  const moonRiseSet = p.plan.moonRiseSet || "";
  const tidalCoeff = p.plan.tidalCoeff || "";
  const tideStations = p.plan.tideStations || [];
  const currents = p.plan.currents || "";
  const weather = p.plan.weather || "";
		const comms = p.plan.comms || "";
		const dailySummaries = p.plan.dailySummaries || [];
		const detailedLegIdx = getSelectedDetailedPlanLegIndex(p);
		const detailedRouteLeg = getRouteLegNames(p, detailedLegIdx);
		const detailedLegLabel = getLegCount(p) > 1
				? `LEG ${detailedLegIdx + 1}${detailedRouteLeg.origin && detailedRouteLeg.destination ? `: ${escapeHtml(detailedRouteLeg.origin)} → ${escapeHtml(detailedRouteLeg.destination)}` : ""}`
				: "PASSAGE PLAN";
		const detailed = getDetailedPassagePlanForLeg(p, detailedLegIdx);
		const detailedWpHtml = (detailed.waypoints || []).length
				? detailed.waypoints.map(wp => {
								const bits = [];
								if (wp.time) bits.push(escapeHtml(wp.time));
								if (wp.name) bits.push(escapeHtml(wp.name));
								return `<div class="daily-summary-item">${bits.join(" – ") || "–"}</div>`;
						}).join("")
				: "<p><em>–</em></p>";
		const detailedHazardsHtml = detailed.hazards ? escapeHtml(detailed.hazards).replace(/\n/g, "<br>") : "<em>–</em>";
		const detailedRefugeHtml = detailed.portsOfRefuge ? escapeHtml(detailed.portsOfRefuge).replace(/\n/g, "<br>") : "<em>–</em>";
		const detailedWelfareHtml = detailed.crewWelfare ? escapeHtml(detailed.crewWelfare).replace(/\n/g, "<br>") : "<em>–</em>";

  const tideStationsBlocks = tideStations.map(ts => {
    const stationName = (ts.name || "").trim();
    const nameHtml = stationName ? `<p><strong>${escapeHtml(stationName)}</strong></p>` : "";

    const ev = Array.isArray(ts.events) && ts.events.length
      ? ts.events.slice()
      : [
          ts.hw1 ? { type:"HW", time:ts.hw1, height: ts.hw1h } : null,
          ts.lw1 ? { type:"LW", time:ts.lw1, height: ts.lw1h } : null,
          ts.hw2 ? { type:"HW", time:ts.hw2, height: ts.hw2h } : null,
          ts.lw2 ? { type:"LW", time:ts.lw2, height: ts.lw2h } : null,
        ].filter(Boolean);

    ev.sort((a,b) => (a.time||"").localeCompare(b.time||""));

    if (!ev.length) {
      return stationName ? `<div class="tide-station-block">${nameHtml}<div class="tide-empty"><em>–</em></div></div>` : "";
    }

    const rowsHtml = ev.map(e => {
      const sym = (e.type === "HW") ? "▲" : "▼";
      const hRaw = (e && (e.height ?? e.ht ?? e.h ?? e.Ht ?? e.height_m ?? e.heightM));
      const hh = (typeof hRaw === "number") ? hRaw : parseFloat(String(hRaw ?? "").replace(",", "."));
      const h = (!isNaN(hh)) ? `${hh.toFixed(1)}m` : "";
      return `<tr><td class="tide-sym">${sym}</td><td>${escapeHtml(e.time || "")}</td><td>${escapeHtml(h)}</td></tr>`;
    }).join("");

    return `
      <div class="tide-station-block">
        ${nameHtml}
        <table class="tide-table">
          <thead><tr><th></th><th>Time</th><th>Ht</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }).filter(Boolean);

  const tideStationsHtml = tideStationsBlocks.length
    ? tideStationsBlocks.join("")
    : "<p><em>–</em></p>";

  const dailySummaryHtml = dailySummaries.length
    ? dailySummaries.map(ds => {
        const dateLabel = ds.date ? formatDateShort(ds.date) : "No date";
        const feeLabel  = ds.fee  ? ` – ${escapeHtml(ds.fee)}` : "";
        const notesLabel = ds.notes ? ` – ${escapeHtml(ds.notes)}` : "";
        return `<div class="daily-summary-item plan-link" data-goto="dailySummariesContainer">${escapeHtml(dateLabel)}${feeLabel}${notesLabel}</div>`;
      }).join("")
    : '<p class="plan-link" data-goto="dailySummariesContainer"><em>–</em></p>';
  
  planSummaryPanel.innerHTML = `
    <div class="plan-summary-grid">
      <div class="col plan-summary-col plan-summary-col-left">
        <div class="block plan-link" data-goto="planSunriseSet">
          <p class="section-title">SUN &amp; MOON</p>
          <p><strong>Sunrise / Sunset:</strong> ${sunriseSet ? escapeHtml(sunriseSet) : "–"}</p>
          <p><strong>Moon phase:</strong> ${moonPhase ? escapeHtml(moonPhase) : "–"}</p>
          <p><strong>Moon rise / set:</strong> ${moonRiseSet ? escapeHtml(moonRiseSet) : "–"}</p>
        </div>

        <div class="block plan-link" data-goto="planTidalCoeff">
          <p class="section-title">TIDES</p>
          <p>${tidalCoeff ? `<strong>Coeff:</strong> ${escapeHtml(tidalCoeff)}` : "<strong>Coeff:</strong> –"}</p>
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

        <div class="block">
          <p class="section-title">DAILY SUMMARY</p>
          ${dailySummaryHtml}
        </div>

        <div class="block plan-link" data-goto="detailedPassagePlanSection">
          <p class="section-title">${detailedLegLabel}</p>
          ${detailedWpHtml}
          <p style="margin-top:0.5rem;"><strong>Hazards:</strong> ${detailedHazardsHtml}</p>
          <p><strong>Ports of Refuge:</strong> ${detailedRefugeHtml}</p>
          <p><strong>Crew Welfare:</strong> ${detailedWelfareHtml}</p>
        </div>
      </div>

      <div class="col plan-summary-col plan-summary-col-right">
        <div class="block plan-link" data-goto="planWeather">
          <p class="section-title">WEATHER</p>
          <p>${weather ? weatherTextToHtmlForPlanPanel(weather) : "<em>–</em>"}</p>
        </div>
      </div>
    </div>
  `;

  try { setupPlanSummaryIndependentScroll(); } catch (e) {}
  try { updatePlanPageSummaryStrip(); } catch (e) {}
}

function getPlanPageDetailedTotals(p) {
  if (!p || typeof ensureDetailedPassagePlans !== "function") {
    return { legs: 0, distance: "–", duration: "–", fuel: "–" };
  }

  ensureDetailedPassagePlans(p);
  const legCount = getLegCount(p);
  let totalNm = 0;
  let totalFuel = 0;
  let totalMinutes = 0;
  let hasNm = false;
  let hasFuel = false;
  let hasMinutes = false;

  for (let i = 0; i < legCount; i += 1) {
    recalcDetailedPassagePlan(p, i);
    const detailed = getDetailedPassagePlanForLeg(p, i);
    const totals = calcDetailedPassagePlanTotals(detailed?.waypoints || []);
    const nm = parseFloat(totals.totalNm);
    const fuel = parseFloat(totals.totalFuel);
    const minutes = durationHHMMToMinutes(totals.totalDuration || "00:00");

    if (Number.isFinite(nm) && nm > 0) {
      totalNm += nm;
      hasNm = true;
    }
    if (Number.isFinite(fuel) && fuel > 0) {
      totalFuel += fuel;
      hasFuel = true;
    }
    if (Number.isFinite(minutes) && minutes > 0) {
      totalMinutes += minutes;
      hasMinutes = true;
    }
  }

  return {
    legs: legCount,
    distance: hasNm ? totalNm.toFixed(1) : "–",
    duration: hasMinutes ? minutesToHHMM(totalMinutes) : "–",
    fuel: hasFuel ? totalFuel.toFixed(1) : "–"
  };
}

function updatePlanPageSummaryStrip() {
  if (!planPageSummaryStrip) return;
  const p = getCurrentPassage();
  if (!p) {
    planPageSummaryStrip.innerHTML = '<span class="st-metric-chip"><span>Passage</span><strong>None selected</strong></span>';
    return;
  }

  const totals = getPlanPageDetailedTotals(p);
  planPageSummaryStrip.innerHTML = `
    <span class="st-metric-chip"><span>Legs</span><strong>${escapeHtml(String(totals.legs || "–"))}</strong></span>
    <span class="st-metric-chip"><span>Distance (NM)</span><strong>${escapeHtml(totals.distance)}</strong></span>
    <span class="st-metric-chip"><span>Est. Duration</span><strong>${escapeHtml(totals.duration)}</strong></span>
    <span class="st-metric-chip"><span>Est. Fuel (L)</span><strong>${escapeHtml(totals.fuel)}</strong></span>
  `;
}

function setupPlanSummaryIndependentScroll(){
  const grid = planSummaryPanel.querySelector('.plan-summary-grid');
  if (!grid) return;
  grid.querySelectorAll('.plan-summary-col').forEach(col => {
    col.style.overflowY = 'auto';
  });
}

planSummaryPanel.addEventListener("click", (e) => {
  const target = e.target.closest(".plan-link");
  if (!target) return;
  const fieldId = target.dataset.goto;
  if (!fieldId) return;

  if (fieldId === "detailedPassagePlanSection") {
    openDetailedPassagePlanPage();
    return;
  }

  showPassagePlanPage();
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
let __scrollLogToNewestOnRender = false;

function requestScrollToNewestLogEntry() {
  __scrollLogToNewestOnRender = true;
}

function inferEntryType(entry) {
  if (entry?.entryType) return entry.entryType;
  const note = String(entry?.notes || '').toLowerCase();
  if (note.startsWith('engine start')) return 'engine-start';
  if (note.startsWith('shutdown')) return 'shutdown';
  if (note.startsWith('slipped lines')) return 'slip';
  if (note.startsWith('alongside') || note.startsWith('docked')) return 'dock';
  return 'manual';
}

function parseEngineStartFromNotes(entry) {
  const note = String(entry?.notes || '');
  const env = entry.engineStartEnv || {};
  const mEh = note.match(/EH\s+([0-9.]+)/i);
  const mFuelR = note.match(/Fuel\s+([0-9.]+)%/i);
  const mFuelC = note.match(/FuelC\s+([0-9.]+)%/i);
  const mEnv = note.match(/Env\s+([^|]+)/i);
  const mNotes = note.match(/Notes:\s*(.+)$/i);
  return {
    engineHoursStart: entry.engineHoursStart ?? (mEh ? mEh[1] : ''),
    fuelStartPercentR: entry.fuelStartPercentR ?? (mFuelR ? mFuelR[1] : ''),
    fuelStartPercentC: entry.fuelStartPercentC ?? (mFuelC ? mFuelC[1] : ''),
    airPressureMb: env.airPressureMb || ((mEnv && /([0-9.]+)mb/i.test(mEnv[1])) ? RegExp.$1 : ''),
    humidityPct: env.humidityPct || ((mEnv && /([0-9.]+)%RH/i.test(mEnv[1])) ? RegExp.$1 : ''),
    airTempC: env.airTempC || ((mEnv && /Air\s+([0-9.]+)°C/i.test(mEnv[1])) ? RegExp.$1 : ''),
    seaTempC: env.seaTempC || ((mEnv && /Sea\s+([0-9.]+)°C/i.test(mEnv[1])) ? RegExp.$1 : ''),
    windDir: env.windDir || ((mEnv && /Wind\s+([A-Z]+)/i.test(mEnv[1])) ? RegExp.$1 : ''),
    windBft: env.windBft || ((mEnv && /Wind\s+[A-Z]*\s*([0-9]+)/i.test(mEnv[1])) ? RegExp.$1 : ''),
    notes: env.notes || (mNotes ? mNotes[1] : ''),
  };
}

function buildEngineStartNotes(data) {
  const startBits = [];
  if (data.engineHoursStart) startBits.push(`EH ${data.engineHoursStart}`);
  if (data.fuelStartPercentR) startBits.push(`Fuel ${data.fuelStartPercentR}%`);
  if (data.fuelStartPercentC) startBits.push(`FuelC ${data.fuelStartPercentC}%`);

  const envParts = [];
  if (data.airPressureMb) envParts.push(`${data.airPressureMb}mb`);
  if (data.humidityPct) envParts.push(`${data.humidityPct}%RH`);
  if (data.airTempC) envParts.push(`Air ${data.airTempC}°C`);
  if (data.seaTempC) envParts.push(`Sea ${data.seaTempC}°C`);
  if (data.windDir || data.windBft) envParts.push(`Wind ${(data.windDir || '')}${(data.windBft || '')}`.trim());
  if (envParts.length) startBits.push(`Env ${envParts.join(', ')}`);
  if (data.notes) startBits.push(`Notes: ${data.notes}`);
  return startBits.length ? `Engine start — ${startBits.join(' | ')}` : 'Engine start';
}

function parseShutdownFromNotes(entry) {
  const note = String(entry?.notes || '');
  const mEh = note.match(/EH\s+([0-9.]+)/i);
  const mFuelR = note.match(/Fuel\s+([0-9.]+)%/i);
  const mFuelC = note.match(/FuelC\s+([0-9.]+)%/i);
  const mNotes = note.match(/Shutdown \/ alongside(?:\s+—\s+[^—]+)?(?:\s+—\s+(.+))?$/i);
  return {
    engineHoursEnd: entry.engineHoursEnd ?? (mEh ? mEh[1] : ''),
    fuelEndPercentR: entry.fuelEndPercentR ?? (mFuelR ? mFuelR[1] : ''),
    fuelEndPercentC: entry.fuelEndPercentC ?? (mFuelC ? mFuelC[1] : ''),
    waterLog: entry.waterLog || '',
    groundLog: entry.groundLog || '',
    fuelUsed: entry.fuelUsed || '',
    notes: entry.shutdownNotes ?? (mNotes && mNotes[1] ? mNotes[1] : ''),
  };
}

function buildShutdownNotes(data) {
  const shutBits = [];
  if (data.engineHoursEnd) shutBits.push(`EH ${data.engineHoursEnd}`);
  if (data.fuelEndPercentR) shutBits.push(`Fuel ${data.fuelEndPercentR}%`);
  if (data.fuelEndPercentC) shutBits.push(`FuelC ${data.fuelEndPercentC}%`);
  if (data.waterLog) shutBits.push(`W ${data.waterLog}`);
  if (data.groundLog) shutBits.push(`G ${data.groundLog}`);
  if (data.fuelUsed) shutBits.push(`Fuel used ${data.fuelUsed}`);
  const shutPrefix = shutBits.length ? `Shutdown / alongside — ${shutBits.join(' | ')}` : 'Shutdown / alongside';
  return data.notes ? `${shutPrefix} — ${data.notes}` : shutPrefix;
}

function getDialogFieldValues(fieldIds) {
  const out = {};
  for (const id of fieldIds) out[id] = (document.getElementById(id)?.value || '').trim();
  return out;
}

function dialogSection(title, inner) {
  return `<div class="entry-dialog-section"><div class="entry-dialog-section-title">${escapeHtml(title)}</div>${inner}</div>`;
}

function dialogField(label, id, value, opts = {}) {
  const type = opts.type || 'text';
  const inputMode = opts.inputMode ? ` inputmode="${opts.inputMode}"` : '';
  const step = opts.step ? ` step="${opts.step}"` : '';
  const min = opts.min !== undefined ? ` min="${opts.min}"` : '';
  const max = opts.max !== undefined ? ` max="${opts.max}"` : '';
  const cls = opts.className ? ` ${opts.className}` : '';
  if (opts.tag === 'textarea') {
    return `<label class="entry-dialog-field entry-dialog-field-full${cls}"><span>${escapeHtml(label)}</span><textarea id="${id}" rows="${opts.rows || 3}" class="modal-notes" style="resize:vertical;">${escapeHtml(value || '')}</textarea></label>`;
  }
  if (opts.tag === 'select') {
    const options = (opts.options || []).map(opt => `<option value="${escapeHtml(opt)}" ${String(value||'')===String(opt)?'selected':''}>${escapeHtml(opt)}</option>`).join('');
    return `<label class="entry-dialog-field${cls}"><span>${escapeHtml(label)}</span><select id="${id}"><option value=""></option>${options}</select></label>`;
  }
  return `<label class="entry-dialog-field${cls}"><span>${escapeHtml(label)}</span><input id="${id}" type="${type}"${inputMode}${step}${min}${max} value="${escapeHtml(value || '')}"></label>`;
}

async function openManualEntryDialog(entry, { isNew = false, passage = null } = {}) {
  return await new Promise((resolve) => {
    const existingPos = ((entry.lat || '').trim() && (entry.lon || '').trim())
      ? `${String(entry.lat).trim()}, ${String(entry.lon).trim()}`
      : ((entry.lat || '').trim() || (entry.lon || '').trim() || '');

    function splitEngTP(val){
      const s = String(val || "").trim();
      if (!s) return { temp:"", pressure:"" };
      const parts = s.split("/");
      return {
        temp: (parts[0] || "").trim(),
        pressure: (parts[1] || "").trim()
      };
    }

    const eng = splitEngTP(entry.engTP || "");
    const existingStw = entry.stw || "";

    showModal({
      title: isNew ? 'New Log Entry' : 'Edit Log Entry',
      okText: isNew ? 'Add entry' : 'Save changes',
      bodyHtml: `
        <div class="manual-log-grid">

          <div class="manual-log-title">Log entry</div>

          <div class="manual-log-row manual-log-main">
            <label class="entry-dialog-field">
              <span>Time</span>
              <input id="dlgTime" type="text" inputmode="numeric" value="${escapeHtml(entry.time ? timeOnlyFromIso(entry.time) : '')}">
            </label>

												<label class="entry-dialog-field">
														<span>Position Lat/Lon</span>
														<div class="position-input-wrap">
																<input id="dlgPosition" type="text" value="${escapeHtml(existingPos || '')}">
																<button id="dlgClearPosition" type="button" class="btn btn-secondary btn-small manual-log-clear-btn" title="Clear position">✕</button>
														</div>
												</label>
												
            <label class="entry-dialog-field">
              <span>W Log</span>
              <input id="dlgWaterLog" type="text" inputmode="decimal" step="0.1" value="${escapeHtml(entry.waterLog || '')}">
            </label>

            <label class="entry-dialog-field">
              <span>G Log</span>
              <input id="dlgGroundLog" type="text" inputmode="decimal" step="0.1" value="${escapeHtml(entry.groundLog || '')}">
            </label>

            <label class="entry-dialog-field">
              <span>Fuel</span>
              <input id="dlgFuelUsed" type="text" inputmode="decimal" step="0.1" value="${escapeHtml(entry.fuelUsed || '')}">
            </label>
          </div>

          <div class="manual-log-row manual-log-secondary">
            <label class="entry-dialog-field">
              <span>RPM</span>
              <input id="dlgRpm" type="text" inputmode="numeric" value="${escapeHtml(entry.rpm || '')}">
            </label>

            <label class="entry-dialog-field">
              <span>TEMP</span>
              <input id="dlgEngTemp" type="text" inputmode="decimal" step="0.1" value="${escapeHtml(eng.temp || '')}">
            </label>

            <label class="entry-dialog-field">
              <span>PRESS</span>
              <input id="dlgEngPressure" type="text" inputmode="decimal" step="0.1" value="${escapeHtml(eng.pressure || '')}">
            </label>

            <label class="entry-dialog-field">
              <span>COG</span>
              <input id="dlgCourse" type="text" inputmode="numeric" value="${escapeHtml(entry.course || '')}">
            </label>

            <label class="entry-dialog-field">
              <span>SOG</span>
              <input id="dlgSpeed" type="text" inputmode="decimal" step="0.1" value="${escapeHtml(entry.speed || '')}">
            </label>

            <label class="entry-dialog-field">
              <span>STW</span>
              <input id="dlgStw" type="text" inputmode="decimal" step="0.1" value="${escapeHtml(existingStw || '')}">
            </label>

            <div></div>
          </div>

          <label class="entry-dialog-field">
            <span>Notes</span>
            <textarea id="dlgNotes" rows="2" class="modal-notes" style="resize:vertical;">${escapeHtml(entry.notes || '')}</textarea>
          </label>

        </div>
      `,
      
						onOk: () => {
        const vals = getDialogFieldValues([
          'dlgTime',
          'dlgPosition',
          'dlgWaterLog',
          'dlgGroundLog',
          'dlgFuelUsed',
          'dlgRpm',
          'dlgEngTemp',
          'dlgEngPressure',
          'dlgCourse',
          'dlgSpeed',
          'dlgStw',
          'dlgNotes'
        ]);

        entry.time = normalizeEntryTimeInput(
          vals.dlgTime,
          entry.time,
          (passage?.plan?.date || getCurrentPassage()?.plan?.date || '')
        );

        const posRaw = String(vals.dlgPosition || "").trim();
        if (!posRaw || posRaw.toLowerCase() === "n/a") {
          entry.lat = posRaw.toLowerCase() === "n/a" ? "n/a" : "";
          entry.lon = "";
        } else {
          const pos = parseAndFormatPositionInput(posRaw, entry.lat, entry.lon);
          entry.lat = pos.lat;
          entry.lon = pos.lon;
        }

        entry.waterLog = vals.dlgWaterLog;
        entry.groundLog = vals.dlgGroundLog;
        entry.fuelUsed = vals.dlgFuelUsed;
        entry.rpm = vals.dlgRpm;

        const temp = String(vals.dlgEngTemp || "").trim();
        const pressure = String(vals.dlgEngPressure || "").trim();
        entry.engTP = (temp || pressure) ? `${temp}/${pressure}` : "";

        entry.course = vals.dlgCourse;
        entry.speed = vals.dlgSpeed;  // SOG
        entry.stw = vals.dlgStw;

        let notes = vals.dlgNotes || "";
        notes = notes
          .replace(/\n?STW:\s*[\d.]+\s*kts?/ig, "")
          .trim();

        if (entry.stw) {
          notes = notes ? `${notes}\nSTW: ${entry.stw} kts` : `STW: ${entry.stw} kts`;
        }

        entry.notes = notes;
        entry.entryType = 'manual';

        if (!isNew) {
          savePassages();
          renderLogEntries();
          refreshHomePassageList();
        }

        resolve(true);
      },
      onCancel: () => resolve(false)
    });

    const clearBtn = document.getElementById("dlgClearPosition");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        const posEl = document.getElementById("dlgPosition");
        if (posEl) posEl.value = "";
      });
    }

    // CL-083: Prefill Lat/Lon for NEW manual entries
    if (isNew) {
      const posInput = document.getElementById('dlgPosition');
      if (posInput && !String(posInput.value || '').trim()) {
        posInput.value = 'n/a';

        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              // Only replace fallback if user hasn't typed over it
              const el = document.getElementById('dlgPosition');
              if (el && el.value === 'n/a') {
                el.value = `${formatLatFromDecimal(pos.coords.latitude)}, ${formatLonFromDecimal(pos.coords.longitude)}`;
              }
            },
            () => {
              const el = document.getElementById('dlgPosition');
              if (el && !String(el.value || '').trim()) el.value = 'n/a';
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
          );
        }
      }
    }
  });
}

async function openEngineStartEntryDialog(p, legIdx, entry = null) {
  const existing = entry ? parseEngineStartFromNotes(entry) : {};
  let prefillEh = existing.engineHoursStart || '';
  let prefillFuR = existing.fuelStartPercentR || '';
  if (!entry) {
    if (legIdx === 0) {
      prefillEh = (p.plan && p.plan.engineHoursStart) ? String(p.plan.engineHoursStart) : '';
      prefillFuR = (p.plan && p.plan.fuelStartPercent) ? String(p.plan.fuelStartPercent) : '';
    } else {
      const legEnds = Array.isArray(p.legEnds) ? p.legEnds : [];
      const prevEnd = legEnds[legIdx - 1] || {};
      prefillEh = prevEnd.engineHoursEnd ? String(prevEnd.engineHoursEnd) : '';
      prefillFuR = prevEnd.fuelEndPercent ? String(prevEnd.fuelEndPercent) : '';
    }
  }
  const prevEnv = existing.engineHoursStart ? existing : ((p.plan && p.plan.engineStartEnv) ? { ...p.plan.engineStartEnv } : {});

  return await new Promise((resolve) => {
    showModal({
      title: 'Engine Start',
      okText: entry ? 'Save changes' : 'Add entry',
      bodyHtml: `
        <div class="st-task-sheet engine-start-grid">

          <div class="engine-start-title st-modal-section-title">Start values</div>
          <div class="engine-start-row engine-start-values st-modal-section">
            <label class="entry-dialog-field">
              <span>Time</span>
              <input id="esTime" type="text" inputmode="numeric" value="${escapeHtml(entry?.time ? timeOnlyFromIso(entry.time) : timeOnlyFromIso(localDateTimeInputValue(new Date())))}">
            </label>

            <label class="entry-dialog-field">
              <span>POB</span>
              <input id="esPob" type="number" inputmode="numeric" step="1" min="1" value="${escapeHtml(entry?.pob || p.pob || '')}">
            </label>

            <label class="entry-dialog-field">
              <span>Fuel R</span>
              <input id="esFuelR" type="number" inputmode="numeric" step="1" value="${escapeHtml(prefillFuR)}">
            </label>

            <label class="entry-dialog-field">
              <span>Fuel C</span>
              <input id="esFuelC" type="number" inputmode="numeric" step="1" value="${escapeHtml(existing.fuelStartPercentC || '')}">
            </label>

            <label class="entry-dialog-field">
              <span>Eng hrs</span>
              <input id="esEh" type="number" inputmode="decimal" step="0.1" value="${escapeHtml(prefillEh)}">
            </label>

            <div></div>
          </div>

          <div class="engine-start-title st-modal-section-title">Environment / checks</div>
          <div class="engine-start-row engine-start-env st-modal-section">
            <label class="entry-dialog-field">
              <span>Air press</span>
              <input id="esAirPress" type="number" inputmode="numeric" step="1" value="${escapeHtml(prevEnv.airPressureMb || '')}">
            </label>

            <label class="entry-dialog-field">
              <span>Humidity</span>
              <input id="esHumidity" type="number" inputmode="numeric" step="1" value="${escapeHtml(prevEnv.humidityPct || '')}">
            </label>

            <label class="entry-dialog-field">
              <span>Air °C</span>
              <input id="esAirTemp" type="number" inputmode="decimal" step="0.1" value="${escapeHtml(prevEnv.airTempC || '')}">
            </label>

            <label class="entry-dialog-field">
              <span>Sea °C</span>
              <input id="esSeaTemp" type="number" inputmode="decimal" step="0.1" value="${escapeHtml(prevEnv.seaTempC || '')}">
            </label>

            <label class="entry-dialog-field">
              <span>Wind dir</span>
              <select id="esWindDir">
                <option value=""></option>
                ${['N','NE','E','SE','S','SW','W','NW'].map(opt => `<option value="${opt}" ${String(prevEnv.windDir||'')===opt?'selected':''}>${opt}</option>`).join('')}
              </select>
            </label>

            <label class="entry-dialog-field">
              <span>Bft</span>
              <input id="esWindBft" type="number" inputmode="numeric" step="1" min="0" max="12" value="${escapeHtml(prevEnv.windBft || '')}">
            </label>

            <div></div>
          </div>

          <div class="engine-start-vhf-notes st-modal-section">
            <div class="vhf-box">
              <label>
                <input id="esVhfCheck" type="checkbox">
                <span>VHF CHECK COMPLETE</span>
              </label>
              <div class="hint">Confirm VHF radio check before recording Engine Start.</div>
            </div>

            <label class="entry-dialog-field">
              <span>Notes (optional)</span>
              <textarea id="esNotes" rows="2" class="modal-notes" style="resize:vertical;">${escapeHtml(prevEnv.notes || '')}</textarea>
            </label>
          </div>

        </div>
      `,
            
        onOk: () => {
        const vals = getDialogFieldValues(['esTime','esPob','esFuelR','esFuelC','esEh','esAirPress','esHumidity','esAirTemp','esSeaTemp','esWindDir','esWindBft','esNotes']);
                if (!entry && !document.getElementById("esVhfCheck")?.checked) {
          alert("Please confirm VHF CHECK COMPLETE before adding Engine Start.");
          return false;
        }
        if (entry) {
          entry.time = normalizeEntryTimeInput(vals.esTime, entry.time, (p.plan?.date || ''));
          if (legIdx === 0) { p.plan.engineHoursStart = vals.esEh; p.plan.fuelStartPercent = vals.esFuelR; }
          p.plan.engineStartEnv = {
            airPressureMb: vals.esAirPress, humidityPct: vals.esHumidity, airTempC: vals.esAirTemp,
            seaTempC: vals.esSeaTemp, windDir: vals.esWindDir, windBft: vals.esWindBft, notes: vals.esNotes
          };
										entry.fuelStartPercentR = vals.esFuelR;
										entry.fuelStartPercentC = vals.esFuelC;
										entry.engineHoursStart = vals.esEh;
										entry.pob = vals.esPob;
										p.pob = vals.esPob;
										entry.engineStartEnv = {
												airPressureMb: vals.esAirPress, humidityPct: vals.esHumidity, airTempC: vals.esAirTemp,
												seaTempC: vals.esSeaTemp, windDir: vals.esWindDir, windBft: vals.esWindBft, notes: vals.esNotes
										};
          entry.notes = buildEngineStartNotes({
            engineHoursStart: vals.esEh, fuelStartPercentR: vals.esFuelR, fuelStartPercentC: vals.esFuelC,
            airPressureMb: vals.esAirPress, humidityPct: vals.esHumidity, airTempC: vals.esAirTemp,
            seaTempC: vals.esSeaTemp, windDir: vals.esWindDir, windBft: vals.esWindBft, notes: vals.esNotes
          });
          savePassages(); renderLogEntries(); refreshHomePassageList(); updateLogSummary(); updatePlanSummaryPanel();
          resolve(true); return;
        }

        if (legIdx === 0) {
          p.plan.engineHoursStart = vals.esEh;
          p.plan.fuelStartPercent = vals.esFuelR;
        }
        p.plan.engineStartEnv = {
          airPressureMb: vals.esAirPress, humidityPct: vals.esHumidity, airTempC: vals.esAirTemp,
          seaTempC: vals.esSeaTemp, windDir: vals.esWindDir, windBft: vals.esWindBft, notes: vals.esNotes
        };
        const startNotes = buildEngineStartNotes({
          engineHoursStart: vals.esEh, fuelStartPercentR: vals.esFuelR, fuelStartPercentC: vals.esFuelC,
          airPressureMb: vals.esAirPress, humidityPct: vals.esHumidity, airTempC: vals.esAirTemp,
          seaTempC: vals.esSeaTemp, windDir: vals.esWindDir, windBft: vals.esWindBft, notes: vals.esNotes
        });
								const newEntry = {
										id: 'e_' + Date.now(), time: normalizeEntryTimeInput(vals.esTime, '', (p.plan?.date || '')), leg: legIdx,
										lat: '', lon: '', course: '', speed: '', rpm: '', engTP: '', waterLog: '', groundLog: '', fuelUsed: '',
										notes: startNotes, entryType: 'engine-start', fuelStartPercentR: vals.esFuelR, fuelStartPercentC: vals.esFuelC,
										engineHoursStart: vals.esEh, pob: vals.esPob, engineStartEnv: p.plan.engineStartEnv
								};
								p.entries.unshift(newEntry);
								p.pob = vals.esPob;
								p.flags.engineStart = true;
								
								// CL-085: retime WP1 from Engine Start + configured allowance
								try {
										// Pull the live DPP rows back into passage data first
										if (typeof readDetailedPassagePlanFromForm === "function") {
													readDetailedPassagePlanFromForm();
										}
											if (typeof ensureDetailedPassagePlans === "function") {
														ensureDetailedPassagePlans(p);
											}
											setSelectedDetailedPlanLegIndex(p, legIdx);
								
										const settings = getSafetyInfo();
										const minsToAdd = Number(settings?.defaults?.engineToSlipMins || 7);
								
										function addMinutesToHHMM(hhmm, mins){
												const m = String(hhmm || "").trim().match(/^(\d{1,2}):(\d{2})$/);
												if (!m) return hhmm || "";
												let total = (parseInt(m[1], 10) * 60) + parseInt(m[2], 10) + mins;
												total = ((total % 1440) + 1440) % 1440;
												const hh = String(Math.floor(total / 60)).padStart(2, "0");
												const mm = String(total % 60).padStart(2, "0");
												return `${hh}:${mm}`;
										}
								
											const activeDetailed = getDetailedPassagePlanForLeg(p, legIdx);
											if (activeDetailed?.waypoints?.length) {
													const wp1 = activeDetailed.waypoints[0];
												const startTime = String(vals.esTime || "").trim();
												wp1.time = addMinutesToHHMM(startTime, minsToAdd);
										}
								
										if (typeof recalcDetailedPassagePlan === "function") {
													recalcDetailedPassagePlan(p, legIdx);
										}
								} catch (e) {
										console.warn("WP1 retime failed", e);
								}								
								savePassages();
								requestScrollToNewestLogEntry();
								renderLogEntries();
								refreshHomePassageList();
								if (typeof renderDetailedPassagePlan === "function") renderDetailedPassagePlan(p);
								updatePlanSummaryPanel();
								updateLogSummary();								
								try{
																if (confirm("Notify Emergency Contact now?")){
																																const msg = buildEcStartSms(p, legIdx);
																																setTimeout(() => chooseEmergencyContactAndSend(msg), 80);
																}
								}catch(e){
																console.warn("EC notify failed", e);
																alert("EC notify failed: " + (e && e.message ? e.message : e));
								}								       
        resolve(true);
      },
      onCancel: () => resolve(false)
    });
  });
}

async function openShutdownEntryDialog(p, legIdx, isFinalLeg, entry = null) {
  p.legEnds = Array.isArray(p.legEnds) ? p.legEnds : [];
  const prev = entry ? parseShutdownFromNotes(entry) : (p.legEnds[legIdx] || {});
  return await new Promise((resolve) => {
    showModal({
      title: isFinalLeg ? 'Shutdown (final leg)' : 'Shutdown (end of leg)',
      okText: entry ? 'Save changes' : 'Add entry',
      bodyHtml: `
        <div class="st-task-sheet shutdown-sheet entry-dialog-grid entry-dialog-grid-two">
          ${dialogSection('Shutdown values',
            dialogField('Time', 'shTime', entry?.time ? timeOnlyFromIso(entry.time) : timeOnlyFromIso(localDateTimeInputValue(new Date())), { inputMode: 'numeric' }) +
            dialogField('Fuel %(R)', 'shFuelR', prev.fuelEndPercentR || prev.fuelEndPercent || '', { type: 'number', inputMode: 'numeric', step: '1' }) +
            dialogField('Fuel %(C)', 'shFuelC', prev.fuelEndPercentC || '', { type: 'number', inputMode: 'numeric', step: '1' }) +
            dialogField('Engine hours (end)', 'shEh', prev.engineHoursEnd || '', { type: 'number', inputMode: 'decimal', step: '0.1' })
          )}
          ${dialogSection('Logs / fuel',
            dialogField('W Log', 'shWLog', prev.waterLog || '', { inputMode: 'decimal', step: '0.1' }) +
            dialogField('G Log', 'shGLog', prev.groundLog || '', { inputMode: 'decimal', step: '0.1' }) +
            dialogField('Fuel Used', 'shFuelUsed', prev.fuelUsed || '', { inputMode: 'decimal', step: '0.1' })
          )}
        </div>
        <div class="shutdown-notes">${dialogField('Notes / defects', 'shNotes', prev.notes || '', { tag: 'textarea', rows: 3 })}</div>
      `,
      onOk: () => {
        const vals = getDialogFieldValues(['shTime','shFuelR','shFuelC','shEh','shWLog','shGLog','shFuelUsed','shNotes']);
        const builtNotes = buildShutdownNotes({
          engineHoursEnd: vals.shEh, fuelEndPercentR: vals.shFuelR, fuelEndPercentC: vals.shFuelC,
          waterLog: vals.shWLog, groundLog: vals.shGLog, fuelUsed: vals.shFuelUsed, notes: vals.shNotes
        });
        p.legEnds[legIdx] = {
          engineHoursEnd: vals.shEh, fuelEndPercent: vals.shFuelR, fuelEndPercentC: vals.shFuelC,
          waterLog: vals.shWLog, groundLog: vals.shGLog, fuelUsed: vals.shFuelUsed, notes: vals.shNotes,
          at: new Date().toISOString(),
        };
        if (isFinalLeg) {
          p.finish = p.finish || {};
          p.finish.engineHoursEnd = vals.shEh;
          p.finish.fuelEndPercent = vals.shFuelR;
          p.finish.notes = vals.shNotes;
          p.finish.shutdownLogged = true;
        }
        if (entry) {
          entry.time = normalizeEntryTimeInput(vals.shTime, entry.time, (p.plan?.date || ''));
          entry.notes = builtNotes;
          entry.entryType = 'shutdown';
          entry.engineHoursEnd = vals.shEh;
          entry.fuelEndPercentR = vals.shFuelR;
          entry.fuelEndPercentC = vals.shFuelC;
          entry.waterLog = vals.shWLog;
          entry.groundLog = vals.shGLog;
          entry.fuelUsed = vals.shFuelUsed;
          entry.shutdownNotes = vals.shNotes;
        } else {
          p.entries.unshift({
            id: 'e_' + Date.now(), time: normalizeEntryTimeInput(vals.shTime, '', (p.plan?.date || '')), leg: legIdx,
            lat: '', lon: '', course: '', speed: '0', rpm: '', engTP: '',
            waterLog: vals.shWLog, groundLog: vals.shGLog, fuelUsed: vals.shFuelUsed,
            notes: builtNotes, entryType: 'shutdown', engineHoursEnd: vals.shEh,
            fuelEndPercentR: vals.shFuelR, fuelEndPercentC: vals.shFuelC, shutdownNotes: vals.shNotes
          });
        }
								savePassages(); requestScrollToNewestLogEntry(); renderLogEntries(); refreshHomePassageList(); updatePassageHeader(); updateLogSummary();
								
								try{
																if (confirm("Notify Emergency Contact of safe arrival?")){
																																const msg = buildEcEndSms(p, legIdx);
																																setTimeout(() => chooseEmergencyContactAndSend(msg), 80);
																}
								}catch(e){
																console.warn("EC shutdown notify failed", e);
																alert("EC shutdown notify failed: " + (e && e.message ? e.message : e));
								}        
        resolve(true);
      },
      onCancel: () => resolve(false)
    });
  });
}

function openSimpleSpecialEntryDialog(p, entry) {
  const title = inferEntryType(entry) === 'slip' ? 'Slip' : 'Dock';
  showModal({
    title,
    okText: 'Save changes',
    bodyHtml: `
      <div class="entry-dialog-grid entry-dialog-grid-two">
        ${dialogSection('Entry', dialogField('Time', 'spTime', entry.time ? timeOnlyFromIso(entry.time) : '', { inputMode: 'numeric' }))}
      </div>
      ${dialogField('Notes', 'spNotes', entry.notes || '', { tag: 'textarea', rows: 3 })}
    `,
    onOk: () => {
      const vals = getDialogFieldValues(['spTime','spNotes']);
      entry.time = normalizeEntryTimeInput(vals.spTime, entry.time, (p.plan?.date || ''));
      entry.notes = vals.spNotes;
      savePassages(); renderLogEntries(); refreshHomePassageList();
    }
  });
}

function openEntryDialog(entry) {
  const p = getCurrentPassage();
  if (!p || !entry) return;
  const entryType = inferEntryType(entry);
  const legIdx = (typeof entry.leg === 'number') ? entry.leg : getCurrentLegIndex(p);
  if (entryType === 'engine-start') return openEngineStartEntryDialog(p, legIdx, entry);
  if (entryType === 'shutdown') return openShutdownEntryDialog(p, legIdx, legIdx >= (getLegCount(p) - 1), entry);
  if (entryType === 'slip' || entryType === 'dock') return openSimpleSpecialEntryDialog(p, entry);
  return openManualEntryDialog(entry, { isNew: false, passage: p });
}

function addSpecialEntry(noteText, notesOverride = null) {
  const p = getCurrentPassage();
  if (!p) return alert("No passage selected.");
  ensureFlags(p);
  if (passageIsShutdown(p)) return alert("Shutdown already recorded – no further log entries allowed.");

  const now = new Date();
  const timeStr = localDateTimeInputValue(now);

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
  requestScrollToNewestLogEntry();
  renderLogEntries();
  refreshHomePassageList();
}

async function addLogEntry(){
  const p = getCurrentPassage();
  if (!p) return;

  ensureEntries(p);
  ensureFinish(p);
  ensureFlags(p);

  const entry = {
    id: newId('e'),
    time: localDateTimeInputValue(new Date()),
    leg: getCurrentLegIndex(p),
    course: "",
    speed: "",
    rpm: "",
    engTP: "",
    waterLog: "",
    groundLog: "",
    fuelUsed: "",
    notes: "",
    lat: "",
    lon: "",
    entryType: "manual"
  };

  const saved = await openManualEntryDialog(entry, { isNew: true, passage: p });
  if (!saved) return;

  p.entries.unshift(entry);
  savePassages();
  requestScrollToNewestLogEntry();
  renderLogEntries();
  refreshHomePassageList();
}


function addDockEntry() {
  const p = getCurrentPassage();
  if (!p) return alert("No passage selected.");
  ensureFlags(p);
  if (passageIsShutdown(p)) return alert("Shutdown already recorded – no further log entries allowed.");

  const now = new Date();
  const timeStr = localDateTimeInputValue(now);

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
  requestScrollToNewestLogEntry();
  renderLogEntries();
  refreshHomePassageList();
}

function deleteBinSvg(){
  return `
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="currentColor" d="M8 4h8l.8 2H21v2H3V6h4.2L8 4z"/>
      <path fill="currentColor" d="M6 9h12l-1 11H7L6 9zm3 2v7h2v-7H9zm4 0v7h2v-7h-2z"/>
    </svg>
  `;
}

function hideAllSwipeDeleteButtons(exceptEl = null){
  document.querySelectorAll("tr.show-delete, .passage-card.show-delete").forEach(el => {
    if (exceptEl && el === exceptEl) return;
    el.classList.remove("show-delete");
  });
}

function attachSwipeToRow(tr, entryId) {
  let startX = 0;
  let startY = 0;
  let rowWasOpen = false;
  let isHorizontalSwipe = false;
  let wheelX = 0;
  let wheelTimer = null;
  const revealPx = 76;
  const lockThresholdPx = 76;
  const commitThresholdPx = 220;

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const setSwipeOffset = (px) => {
    tr.classList.add("swipe-dragging");
    tr.style.setProperty("--swipe-x", `${px}px`);
  };
  const clearSwipeOffset = () => {
    tr.classList.remove("swipe-dragging");
    tr.style.removeProperty("--swipe-x");
  };

  tr.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];
    startX = t.screenX;
    startY = t.screenY;
    rowWasOpen = tr.classList.contains("show-delete");
    isHorizontalSwipe = false;
  }, { passive: true });

  tr.addEventListener("touchmove", (e) => {
    const t = e.changedTouches[0];
    const dx = t.screenX - startX;
    const dy = t.screenY - startY;

    if (!isHorizontalSwipe && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      isHorizontalSwipe = true;
      hideAllSwipeDeleteButtons(tr);
    }

    if (!isHorizontalSwipe) return;

    e.preventDefault();
    const base = rowWasOpen ? -revealPx : 0;
    const offset = clamp(base + dx, -commitThresholdPx, 0);
    setSwipeOffset(offset);
  }, { passive: false });

  tr.addEventListener("touchend", (e) => {
    const t = e.changedTouches[0];
    const dx = t.screenX - startX;
    const dy = t.screenY - startY;

    if (isHorizontalSwipe || (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy) * 1.25)) {
      if (dx < -commitThresholdPx) {
        hideAllSwipeDeleteButtons(tr);
        tr.classList.remove("show-delete");
        clearSwipeOffset();
        tr.dataset.justSwiped = "1";
        setTimeout(() => { delete tr.dataset.justSwiped; }, 350);
        deleteLogEntryById(entryId);
        return;
      }

      if (rowWasOpen) {
        if (dx > 18) {
          tr.classList.remove("show-delete");
        } else {
          tr.classList.add("show-delete");
        }
      } else if (dx < -lockThresholdPx) {
        hideAllSwipeDeleteButtons(tr);
        tr.classList.add("show-delete");
      } else {
        tr.classList.remove("show-delete");
      }

      clearSwipeOffset();
      tr.dataset.justSwiped = "1";
      setTimeout(() => { delete tr.dataset.justSwiped; }, 350);
    }
  }, { passive: true });

  tr.addEventListener("touchcancel", clearSwipeOffset, { passive: true });

  tr.addEventListener("wheel", (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;

    wheelX += e.deltaX;
    clearTimeout(wheelTimer);

    wheelTimer = setTimeout(() => {
      if (wheelX > commitThresholdPx) {
        hideAllSwipeDeleteButtons(tr);
        tr.classList.remove("show-delete");
        deleteLogEntryById(entryId);
      } else if (wheelX > lockThresholdPx) {
        hideAllSwipeDeleteButtons(tr);
        tr.classList.add("show-delete");
      } else if (wheelX < -lockThresholdPx) {
        tr.classList.remove("show-delete");
      }

      wheelX = 0;
      tr.dataset.justSwiped = "1";
      setTimeout(() => { delete tr.dataset.justSwiped; }, 300);
    }, 60);
  }, { passive: true });

  tr.addEventListener("click", (e) => {
    if (tr.dataset.justSwiped === "1") {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
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
      requestScrollToNewestLogEntry();
      renderLogEntries();
    },
    (err) => alert("Unable to get GPS position: " + err.message),
    { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
  );
}

// Engine start: numeric-friendly modal + only once
engineStartBtn.addEventListener("click", async () => {
  const p = getCurrentPassage();
  if (!p) return alert("No passage selected.");
  ensureFlags(p);
  if (passageIsShutdown(p)) return alert("Shutdown already recorded – no further log entries allowed.");
  const legIdx = getCurrentLegIndex(p);
  if (hasSpecialForLeg(p, 'engine start', legIdx)) return alert("Engine Start already recorded for this leg.");
  await openEngineStartEntryDialog(p, legIdx, null);
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
shutdownBtn.addEventListener("click", async () => {
  const p = getCurrentPassage();
  if (!p) return alert("No passage selected.");
  ensureFlags(p);

  if (passageIsShutdown(p)) return alert("Shutdown already recorded – no further log entries allowed.");

  const legIdx = getCurrentLegIndex(p);
  if (hasSpecialForLeg(p, 'shutdown', legIdx)) return alert("Shutdown already recorded for this leg.");

  const isFinalLeg = (legIdx >= (getLegCount(p) - 1));
  await openShutdownEntryDialog(p, legIdx, isFinalLeg, null);
});
function renderLogEntries() {
  updateLegIndicator();
  updateLogStatusStrip();
  const p = getCurrentPassage();
  logEntriesContainer.innerHTML = "";
  const showLegSummaries = p ? getLegCount(p) > 1 : false;
    
  if (!p || (p.entries?.length || 0) === 0) {
    logEmptyMessage.style.display = "block";
    logSummaryPanel.textContent = "";
    return;
  }
  logEmptyMessage.style.display = "none";

  const entries = p.entries.slice().sort((a, b) => (a.time > b.time ? 1 : -1));

  entries.forEach(entry => {
    const tr = document.createElement("tr");
    tr.className = 'log-entry-row';
    attachSwipeToRow(tr, entry.id);

    function addDisplayCell(value, className, clickHandler) {
      const td = document.createElement('td');
      td.className = `log-display-cell ${className || ''}`.trim();
      td.textContent = (value ?? '') === '' ? '—' : String(value);
      td.addEventListener('click', (ev) => {
        ev.stopPropagation();
        clickHandler?.();
      });
      tr.appendChild(td);
      return td;
    }

    addDisplayCell(entry.time ? timeOnlyFromIso(entry.time) : '', 'log-time-cell', () => openEntryDialog(entry));
    addDisplayCell(entry.course || entry.cog || '', 'log-cog-cell', () => openEntryDialog(entry));
    addDisplayCell(entry.speed || '', 'log-speed-cell', () => openEntryDialog(entry));
    addDisplayCell(entry.rpm || '', 'log-rpm-cell', () => openEntryDialog(entry));
    addDisplayCell(entry.engTP || '', 'log-engtp-cell', () => openEntryDialog(entry));
    addDisplayCell(entry.waterLog || '', 'log-log-cell', () => openEntryDialog(entry));
    addDisplayCell(entry.groundLog || '', 'log-log-cell', () => openEntryDialog(entry));
    addDisplayCell(entry.fuelUsed || '', 'log-fuel-cell', () => openEntryDialog(entry));

    const tdNotes = document.createElement('td');
    tdNotes.className = 'log-display-cell log-notes-cell';
    tdNotes.addEventListener('click', (ev) => { ev.stopPropagation(); openEntryDialog(entry); });

    const notesText = document.createElement('div');
    notesText.className = 'log-notes-display';
    notesText.textContent = entry.notes || '—';
    tdNotes.appendChild(notesText);

    const latStr = (entry.lat == null) ? "" : String(entry.lat);
    const lonStr = (entry.lon == null) ? "" : String(entry.lon);
    const hasPos = (latStr.trim() !== "") || (lonStr.trim() !== "");
    if (hasPos) {
      const posSpan = document.createElement("span");
      posSpan.className = "pos-field log-position-display";
      posSpan.textContent = (latStr.trim() && lonStr.trim()) ? `${latStr.trim()}, ${lonStr.trim()}` : (latStr.trim() || lonStr.trim());
      posSpan.title = "Position (tap to edit)";
      posSpan.addEventListener("click", (ev) => { ev.stopPropagation(); handlePositionEdit(entry); });
      tdNotes.appendChild(posSpan);
    }

    const actions = document.createElement("div");
    actions.className = "entry-actions";
					const delBtn = document.createElement("button");
				delBtn.className = "entry-del-btn";
		  delBtn.innerHTML = deleteBinSvg();
				delBtn.title = "Delete entry";
				
				delBtn.addEventListener("click", (ev) => {
						ev.preventDefault();
						ev.stopPropagation();
						deleteLogEntryById(entry.id);
				});
				actions.appendChild(delBtn);

    tdNotes.appendChild(actions);
    tr.appendChild(tdNotes);
    tr.addEventListener('click', () => openEntryDialog(entry));

    logEntriesContainer.appendChild(tr);

    if (showLegSummaries && typeof entry?.notes === "string" && entry.notes.toLowerCase().startsWith("shutdown")) {
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

  if (__scrollLogToNewestOnRender) {
    __scrollLogToNewestOnRender = false;
    requestAnimationFrame(() => {
      const wrapper = document.querySelector("#logLayout .log-table-wrapper");
      const newestRows = logEntriesContainer.querySelectorAll(".log-entry-row");
      const newestRow = newestRows[newestRows.length - 1] || logEntriesContainer.lastElementChild;
      if (wrapper) {
        wrapper.scrollTop = wrapper.scrollHeight;
      }
      if (newestRow && typeof newestRow.scrollIntoView === "function") {
        newestRow.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
  }
}

function ensureLogTableHeadingsVisible(targetEl){
  const wrapper = document.querySelector('#logLayout .log-table-wrapper');
  const logHeader = document.querySelector('#logTab .log-header');
  const appHeader = document.querySelector('.app-header');
  if (!wrapper || !targetEl) return;

  const row = targetEl.closest('tr') || targetEl;
  const thead = wrapper.querySelector('thead');
  const stickyH = (thead ? thead.getBoundingClientRect().height : 0) + 8;
  const rowTop = row.offsetTop || 0;
  const desired = Math.max(0, rowTop - stickyH - 8);
  if (Math.abs(wrapper.scrollTop - desired) > 4) wrapper.scrollTop = desired;

  setTimeout(() => {
    const appH = appHeader ? appHeader.getBoundingClientRect().height : 0;
    const logH = logHeader ? logHeader.getBoundingClientRect().height : 0;
    const desiredTop = appH + logH + 8;
    const rect = wrapper.getBoundingClientRect();
    if (rect.top < desiredTop || rect.top > desiredTop + 24) {
      window.scrollBy({ top: rect.top - desiredTop, left: 0, behavior: 'auto' });
    }
  }, 80);
}

document.addEventListener('focusin', (e) => {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  if (!t.closest('#logLayout .log-table-wrapper')) return;
  setTimeout(() => ensureLogTableHeadingsVisible(t), 50);
  setTimeout(() => ensureLogTableHeadingsVisible(t), 250);
});

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest('#logLayout .log-table-wrapper')) {
      setTimeout(() => ensureLogTableHeadingsVisible(active), 50);
    }
  });
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
  updateLogStatusStrip();
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
    updateLogStatusStrip();
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

homePassageSearch?.addEventListener("input", refreshHomePassageList);
homePassageFilterBtn?.addEventListener("click", () => {
  homePassageFilterMode = homePassageFilterMode === "all"
    ? "active"
    : homePassageFilterMode === "active" ? "complete" : "all";
  const label = homePassageFilterMode === "active" ? "Active" : homePassageFilterMode === "complete" ? "Complete" : "Filter";
  homePassageFilterBtn.textContent = label;
  homePassageFilterBtn.classList.toggle("active", homePassageFilterMode !== "all");
  refreshHomePassageList();
});
homePassageSortBtn?.addEventListener("click", () => {
  homePassageSortMode = homePassageSortMode === "newest" ? "oldest" : "newest";
  homePassageSortBtn.textContent = homePassageSortMode === "newest" ? "Date" : "Oldest";
  refreshHomePassageList();
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
  const elDpp = document.getElementById("manageDppTemplatesBtn");
  const elBackup = document.getElementById("exportBackupBtn");

  const els = [elPorts, elDpp, elBackup].filter(Boolean);
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
  const dppBtn = document.getElementById("manageDppTemplatesBtn");
  const backupBtn = document.getElementById("exportBackupBtn");

  const portsBlock  = __wxAbbrBlockForEl(portsBtn, container);
  const dppBlock = __wxAbbrBlockForEl(dppBtn, container);
  const backupBlock = __wxAbbrBlockForEl(backupBtn, container);

  if (!portsBlock || !backupBlock) return;

  // Create Weather Shorthand block (card) if not already present
  let wxBlock = document.getElementById("wxAbbrSettingsBlock");
  if (!wxBlock) {
    wxBlock = document.createElement(portsBlock.tagName.toLowerCase());
    wxBlock.id = "wxAbbrSettingsBlock";
    wxBlock.className = portsBlock.className || "";
    wxBlock.setAttribute("data-settings-card", "");

    // Basic structure that should look reasonable even without CSS.
    wxBlock.innerHTML = `
      <div class="settings-block-inner">
        <div class="settings-card-header">
          <div class="settings-card-main">
            <span class="settings-card-icon" aria-hidden="true">WX</span>
            <div>
              <h3>Weather Shorthand</h3>
              <p>Define forecast abbreviation and expansion rules.</p>
            </div>
          </div>
          <button type="button" class="btn btn-secondary btn-small settings-toggle" data-settings-toggle>›</button>
        </div>
        <div class="settings-card-panel" data-settings-panel hidden>
          <section class="settings-panel-card st-panel st-stack">
            <button type="button" id="manageWxAbbrBtn" class="btn btn-secondary">Manage Weather Abbreviations</button>
            <p class="hint">Define abbreviation / expansion rules for Met Office and Météo-France forecasts.</p>
            <div id="wxAbbrEditorWrap" class="st-stack" style="display:none;"></div>
          </section>
        </div>
      </div>
    `;
  }

  // Detach blocks first (preserve any other content)
  const blocks = [portsBlock, dppBlock, wxBlock, backupBlock].filter(Boolean);
  blocks.forEach(b => { if (b && b.parentElement === container) container.removeChild(b); });

  // Re-insert in desired order: Ports, DPP Templates, Weather Shorthand, Backup
  container.appendChild(portsBlock);
  if (dppBlock) container.appendChild(dppBlock);
  container.appendChild(wxBlock);
  container.appendChild(backupBlock);

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
  const addBtn    = mk("button", { type:"button", id:"wxAbbrAddBtn", class:"btn btn-secondary", text:"Add rule" });
  const sortBtn   = mk("button", { type:"button", id:"wxAbbrSortBtn", class:"btn btn-secondary", text:"Sort A→Z" });
  const exportBtn = mk("button", { type:"button", id:"wxAbbrExportBtn", class:"btn btn-secondary", text:"Export JSON" });
  const importBtn = mk("button", { type:"button", id:"wxAbbrImportBtn", class:"btn btn-secondary", text:"Import .json" });
  const resetBtn  = mk("button", { type:"button", id:"wxAbbrResetBtn", class:"btn btn-secondary", text:"Reset to shipped defaults" });
  const clearBtn  = mk("button", { type:"button", id:"wxAbbrClearBtn", class:"btn btn-secondary", text:"Clear all rules" });

  const topRow = mk("div", { class:"st-action-row" }, [
    searchInp, addBtn, sortBtn, exportBtn, importBtn, resetBtn, clearBtn
  ]);

  const table = mk("table", { id:"wxAbbrTable", class:"st-table" });
  const thead = mk("thead", {}, [
    mk("tr", {}, [
      mk("th", { text:"On" }),
      mk("th", { text:"From" }),
      mk("th", { text:"To" }),
      mk("th", { text:"Mode" }),
      mk("th", { text:"" }),
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

  const prevRow = mk("div", { class:"st-action-row" }, [
    mk("div",{class:"st-action-row"},[mk("div",{text:"Preview as:", class:"hint"}), prevProvider, prevCat])
  ]);
  const prevGrid = mk("div", { class:"st-stack" }, [
    mk("div",{},[mk("div",{text:"Original", class:"st-panel-title"}), prevIn]),
    mk("div",{},[mk("div",{text:"Result", class:"st-panel-title"}), prevOut]),
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

      const onTd = mk("td", {});
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

      const fromTd = mk("td", {});
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

      const toTd = mk("td", {});
      const toIn = mk("input", { type:"text", value:toRaw, style:"width:100%;" });
      toIn.onchange = () => {
        const db2 = getDb();
        if (!Array.isArray(db2.rules)) db2.rules = [];
        if (db2.rules[idx]) db2.rules[idx].to = String(toIn.value||"");
        saveDb(db2);
        rebuildPreview();
      };
      toTd.appendChild(toIn);

      const modeTd = mk("td", {});
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

      const actTd = mk("td", {});
      const delBtn = mk("button", { type:"button", class:"btn btn-secondary btn-small", text:"Delete" });
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
          saveLocalStorageItem(ABBR_DB_KEY, JSON.stringify(obj), "weather abbreviations");
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

// --- Safety / Emergency Info Settings UI ---------------------------

function injectSafetyEmergencySettingsBlock(){
  const container = __wxAbbrFindSettingsContainer();
  if (!container) return;

  const portsBtn = document.getElementById("managePortsBtn");
  const portsBlock = __wxAbbrBlockForEl(portsBtn, container);
  if (!portsBlock) return;

  let block = document.getElementById("safetyEmergencySettingsBlock");
  if (!block){
    block = document.createElement(portsBlock.tagName.toLowerCase());
    block.id = "safetyEmergencySettingsBlock";
    block.className = portsBlock.className || "";
    block.setAttribute("data-settings-card", "");

    block.innerHTML = `
      <div class="settings-block-inner">
        <div class="settings-card-header">
          <div class="settings-card-main">
            <span class="settings-card-icon" aria-hidden="true">EC</span>
            <div>
              <h3>Passage Safety Information</h3>
              <p>Passage Safety Information.</p>
            </div>
          </div>
          <button type="button" id="toggleSafetyEmergencyBtn" class="btn btn-secondary btn-small settings-toggle" data-settings-toggle>›</button>
        </div>
        <div id="safetyEmergencyFullPanel" class="settings-card-panel safety-emergency-panel st-stack" data-settings-panel hidden>
          <div class="st-panel st-stack">
            <div class="st-panel-title">Vessel</div>
            <div class="st-form-grid st-form-grid-compact">
              <input id="seiBoatName" placeholder="Boat Name">
              <input id="seiBoatType" placeholder="Boat Type">
														<input id="seiBoatModel" placeholder="Boat Model">
														<input id="seiCallsign" placeholder="Callsign">
														<input id="seiMmsi" placeholder="MMSI">
														<input id="seiUkSsr" placeholder="UK SSR">
														<input id="seiMarineTrafficShipId" placeholder="MarineTraffic Ship ID">														
														<input id="seiHomePort" placeholder="Home Port">              
														<input id="seiLength" placeholder="Length">
              <input id="seiBeam" placeholder="Beam">
              <input id="seiDraft" placeholder="Draft">
            </div>
          </div>

          <div class="st-panel st-stack">
            <div class="st-panel-title">Appearance & Safety</div>
            <div class="st-form-grid">
              <input id="seiTopsides" placeholder="Hull Colour (topsides)">
              <input id="seiHull" placeholder="Hull Colour (lower)">
              <input id="seiSuperstructure" placeholder="Superstructure Colour">
              <input id="seiLiferaft" placeholder="Liferaft Details">
              <input id="seiDinghy" placeholder="Dinghy Details">
              <input id="seiLifejackets" placeholder="Lifejacket Details">
              <input id="seiEpirb" placeholder="EPIRB Details">
              <input id="seiSafetyEquip" placeholder="Other Safety Equipment">
              <input id="seiRnEquip" placeholder="Radio / Navigation Equipment">
            </div>
          </div>

          <div class="st-panel st-stack">
            <div class="st-panel-title">Owner Details</div>
            <div class="st-form-grid">
              <input id="seiOwnerNames" placeholder="Owner Names">
              <input id="seiOwnerTel" placeholder="Owner Tel">
              <input id="seiOwnerEmail" placeholder="Owner Email">
              <input id="seiOwnerAddr" placeholder="Owner Address">
            </div>
          </div>

          <div class="st-panel st-stack">
            <div class="st-panel-title">Default Emergency Contact</div>
            <div class="st-form-grid">
              <input id="seiEcName" placeholder="Contact Name">
              <input id="seiEcTel" placeholder="Contact Tel">
              <input id="seiEcEmail" placeholder="Contact Email">
              <input id="seiEcNotes" placeholder="Relationship / Notes">
            </div>
          </div>

          <div class="st-panel st-stack">
            <div class="st-panel-title">Notification Defaults</div>
            <div class="st-form-grid">
              <input id="seiOverdueHours" type="number" min="1" step="1" placeholder="Overdue hours">
              <input id="seiEngineToSlip" type="number" min="0" step="1" placeholder="Engine Start → WP1 mins">
              <input id="seiDetailsUrl" placeholder="Published details URL">
              <label class="st-form-field"><input id="seiIncludeDetailsUrl" type="checkbox"> Include details URL in SMS</label>
              <label class="st-form-field"><input id="seiIncludeMarineTraffic" type="checkbox"> Include MarineTraffic link in SMS</label>
            </div>
          </div>

          <div class="st-action-row">
            <button type="button" id="saveSafetyEmergencyBtn" class="btn btn-primary">Save Safety / Emergency Info</button>
            <button type="button" id="exportVesselDetailsBtn" class="btn btn-secondary">Export Vessel Details HTML</button>
          </div>
        </div>
      </div>
    `;
  }

  if (!block.parentElement){
    container.insertBefore(block, portsBlock.nextSibling);
  }

  const s = getSafetyInfo();
  const ec = getDefaultEmergencyContact() || {};

  document.getElementById("seiBoatName").value = s.vessel?.boatName || "";
  document.getElementById("seiBoatType").value = s.vessel?.boatType || "";
  document.getElementById("seiBoatModel").value = s.vessel?.boatModel || "";
  document.getElementById("seiCallsign").value = s.vessel?.callsign || "";
		document.getElementById("seiMmsi").value = s.vessel?.mmsi || "";
		document.getElementById("seiUkSsr").value = s.vessel?.ukSsr || "";
		document.getElementById("seiMarineTrafficShipId").value = s.vessel?.marineTrafficShipId || "";  document.getElementById("seiHomePort").value = s.vessel?.homePort || "";
  document.getElementById("seiLength").value = s.vessel?.length || "";
  document.getElementById("seiBeam").value = s.vessel?.beam || "";
  document.getElementById("seiDraft").value = s.vessel?.draft || "";

  document.getElementById("seiTopsides").value = s.appearanceSafety?.topsides || "";
  document.getElementById("seiHull").value = s.appearanceSafety?.hull || "";
  document.getElementById("seiSuperstructure").value = s.appearanceSafety?.superstructure || "";
  document.getElementById("seiLiferaft").value = s.appearanceSafety?.liferaft || "";
  document.getElementById("seiDinghy").value = s.appearanceSafety?.dinghy || "";
  document.getElementById("seiLifejackets").value = s.appearanceSafety?.lifejackets || "";
  document.getElementById("seiEpirb").value = s.appearanceSafety?.epirb || "";
  document.getElementById("seiSafetyEquip").value = s.appearanceSafety?.safetyEquip || "";
  document.getElementById("seiRnEquip").value = s.appearanceSafety?.rnEquip || "";

  document.getElementById("seiOwnerNames").value = s.owner?.names || "";
  document.getElementById("seiOwnerTel").value = s.owner?.tel || "";
  document.getElementById("seiOwnerEmail").value = s.owner?.email || "";
  document.getElementById("seiOwnerAddr").value = s.owner?.address || "";

  document.getElementById("seiEcName").value = ec.name || "";
  document.getElementById("seiEcTel").value = ec.tel || "";
  document.getElementById("seiEcEmail").value = ec.email || "";
  document.getElementById("seiEcNotes").value = ec.notes || "";

  document.getElementById("seiOverdueHours").value = s.defaults?.overdueHours ?? 2;
  document.getElementById("seiEngineToSlip").value = s.defaults?.engineToSlipMins ?? 7;
  document.getElementById("seiDetailsUrl").value = s.defaults?.detailsPageUrl || "";
  document.getElementById("seiIncludeDetailsUrl").checked = !!s.defaults?.includeDetailsUrlInSms;
  document.getElementById("seiIncludeMarineTraffic").checked = !!s.defaults?.includeMarineTrafficInSms;

		let ecIdEl = document.getElementById("seiEcId");
		if (!ecIdEl){
				ecIdEl = document.createElement("input");
				ecIdEl.type = "hidden";
				ecIdEl.id = "seiEcId";
				block.appendChild(ecIdEl);
		}
		
		let ecManager = document.getElementById("seiEcManager");
		if (!ecManager){
				ecManager = document.createElement("div");
				ecManager.id = "seiEcManager";
				ecManager.className = "st-stack";
				ecManager.innerHTML = `
						<div class="st-action-row">
								<button type="button" id="seiEcNewBtn" class="btn btn-secondary">New Contact</button>
								<button type="button" id="seiEcSaveBtn" class="btn btn-secondary">Save Contact</button>
								<button type="button" id="seiEcDefaultBtn" class="btn btn-secondary">Make Default</button>
								<button type="button" id="seiEcDeleteBtn" class="btn btn-secondary">Delete Contact</button>
						</div>
						<div id="seiEcList" class="st-list"></div>
				`;
		
				const defaultContactSection = document.getElementById("seiEcNotes")?.closest("div")?.parentElement;
				if (defaultContactSection) {
						defaultContactSection.appendChild(ecManager);
				} else {
						block.appendChild(ecManager);
				}
		}
		
		loadEmergencyContactIntoSettingsForm(getDefaultEmergencyContact());
		renderEmergencyContactsManager();
		
		const newBtn = document.getElementById("seiEcNewBtn");
		if (newBtn && !newBtn.dataset.bound){
				newBtn.dataset.bound = "1";
				newBtn.addEventListener("click", () => loadEmergencyContactIntoSettingsForm(createBlankEmergencyContact()));
		}
		
		const saveEcBtn = document.getElementById("seiEcSaveBtn");
		if (saveEcBtn && !saveEcBtn.dataset.bound){
				saveEcBtn.dataset.bound = "1";
				saveEcBtn.addEventListener("click", () => {
						saveSafetyInfoFromSettingsFields();
						renderEmergencyContactsManager();
				});
		}
		
		const makeDefBtn = document.getElementById("seiEcDefaultBtn");
		if (makeDefBtn && !makeDefBtn.dataset.bound){
				makeDefBtn.dataset.bound = "1";
				makeDefBtn.addEventListener("click", () => {
						saveSafetyInfoFromSettingsFields();
						const id = (document.getElementById("seiEcId")?.value || "").trim();
						if (id) setDefaultEmergencyContact(id);
						renderEmergencyContactsManager();
				});
		}
		
		const delEcBtn = document.getElementById("seiEcDeleteBtn");
		if (delEcBtn && !delEcBtn.dataset.bound){
				delEcBtn.dataset.bound = "1";
				delEcBtn.addEventListener("click", () => {
						const id = (document.getElementById("seiEcId")?.value || "").trim();
						if (!id) return;
						deleteEmergencyContact(id);
						renderEmergencyContactsManager();
						loadEmergencyContactIntoSettingsForm(getDefaultEmergencyContact());
				});
		}

		const exportDetailsBtn = document.getElementById("exportVesselDetailsBtn");
		if (exportDetailsBtn && !exportDetailsBtn.dataset.bound){
				exportDetailsBtn.dataset.bound = "1";
				exportDetailsBtn.addEventListener("click", () => {
						saveSafetyInfoFromSettingsFields();
						exportVesselDetailsHtml();
				});
		}

  const saveBtn = document.getElementById("saveSafetyEmergencyBtn");
  if (saveBtn && !saveBtn.dataset.bound){
    saveBtn.dataset.bound = "1";
    saveBtn.addEventListener("click", saveSafetyInfoFromSettingsFields);
  }
}

// --- Initial load --------------------------------------------------

if (new URLSearchParams(location.search).has("reset")) {
  // Emergency cache recovery: add ?reset=1 to the URL and reload
  resetPwaCache({ silent:true });
} else {
  loadPassages();
  loadPorts();
  setupPortAutocomplete();
  setupPortCoordConfirmation();
  setupPortsManagerModal();
  setupTidePasteModal();
  refreshPortUI();
  applyTheme(storage.getItem(THEME_KEY) || "day");

  // CL-081: Settings block order + Weather Shorthand editor
  try { reorderSettingsBlocksAndInjectWx(); } catch (e) { console.warn('reorderSettingsBlocksAndInjectWx failed', e); }
		try { migrateLegacyEcSettingsIntoSafetyInfo(); } catch (e) { console.warn('migrateLegacyEcSettingsIntoSafetyInfo failed', e); }
		try { injectSafetyEmergencySettingsBlock(); } catch (e) { console.warn('injectSafetyEmergencySettingsBlock failed', e); }
		try { setupSettingsCardToggles(); } catch (e) { console.warn('setupSettingsCardToggles failed', e); }

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
  const overlay = document.getElementById("portsModalOverlay");
  if (modal) modal.classList.add("hidden");
  if (overlay) overlay.classList.add("hidden");
}
