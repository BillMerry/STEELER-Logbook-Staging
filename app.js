// --- Constants & state ---------------------------------------------

const STORAGE_KEY = "steeler_logbook_passages_v5";
const THEME_KEY   = "steeler_logbook_theme_v1";
const PORTS_KEY   = "steeler_logbook_ports_v1";
const DPP_TEMPLATES_KEY = "steeler_dpp_templates_v1";
const DPP_WAYPOINTS_KEY = "steeler_dpp_waypoints_v1";
const FUEL_MANAGEMENT_KEY = "steeler_fuel_management_v1";
const LOG_SPLIT_RATIO_KEY = "steeler_log_split_ratio_v1";
const DEVICE_ID_KEY = "steeler_device_id_v1";
const DEVICE_NAME_KEY = "steeler_device_name_v1";
const SYNC_STATUS_KEY = "steeler_sync_status_v1";
const SYNC_CONFIG_KEY = "steeler_sync_config_v1";
const SYNC_RECORD_META_KEY = "steeler_sync_record_meta_v1";

const APP_VERSION = "1.3.1-rc1";
const LOCAL_DATA_SCHEMA_VERSION = 1;
const DATA_BACKUP_FORMAT = "steeler-data-backup";
const DEFAULT_SYNC_WORKER_URL = "https://steeler-logbook-sync.bill-merry-52f.workers.dev";
const LEGACY_STAGING_SYNC_WORKER_URL = "https://steeler-logbook-sync-staging.bill-merry-52f.workers.dev";
const FULL_DATA_SYNC_RECORD_ID = "global:full-data-sync";
const FULL_DATA_SYNC_RECORD_TYPE = "full-data-sync";
const DEFAULT_PASSAGE_TIME_ZONE = "Europe/London";
const PASSAGE_TIME_ZONES = {
  "Europe/London": "BST",
  "UTC": "GMT / UTC",
  "Europe/Paris": "CET"
};

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
  },
  "steeler_dpp_waypoints_v1": {
    label: "DPP waypoints",
    mirrorKey: "steeler_lkg_dpp_waypoints_v1",
    mirrorMetaKey: "steeler_lkg_dpp_waypoints_v1_meta"
  },
  "steeler_fuel_management_v1": {
    label: "fuel management",
    mirrorKey: "steeler_lkg_fuel_management_v1",
    mirrorMetaKey: "steeler_lkg_fuel_management_v1_meta"
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

function nowIso(){
  return new Date().toISOString();
}

function isValidIsoString(value){
  if (!value || typeof value !== "string") return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function makeStableId(prefix = "id"){
  const safePrefix = String(prefix || "id").replace(/[^a-z0-9_-]/gi, "") || "id";
  if (window.crypto && crypto.randomUUID) return `${safePrefix}_${crypto.randomUUID()}`;
  return `${safePrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getOrCreateDeviceId(){
  let id = "";
  try{
    id = storage.getItem(DEVICE_ID_KEY) || "";
    if (!id) {
      id = makeStableId("device");
      storage.setItem(DEVICE_ID_KEY, id);
    }
  }catch(e){
    console.warn("Could not read or create device id", e);
    id = id || makeStableId("device");
  }
  return id;
}

function guessDeviceName(){
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  if (/iPad/i.test(ua) || (platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "iPad";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/Mac/i.test(platform)) return "MacBook";
  if (/Windows/i.test(platform)) return "Windows PC";
  if (/Android/i.test(ua)) return "Android device";
  return "This device";
}

function getDeviceName(){
  try{
    return String(storage.getItem(DEVICE_NAME_KEY) || "").trim() || guessDeviceName();
  }catch{
    return guessDeviceName();
  }
}

function saveDeviceName(name){
  const clean = String(name || "").trim().slice(0, 80);
  try{
    if (clean) storage.setItem(DEVICE_NAME_KEY, clean);
    else storage.removeItem(DEVICE_NAME_KEY);
  }catch(e){
    console.warn("Could not save device name", e);
  }
  return getDeviceName();
}

function displayDeviceName(name, id = ""){
  const cleanName = String(name || "").trim();
  if (cleanName) return cleanName;
  const cleanId = String(id || "").trim();
  return cleanId ? cleanId.slice(0, 18) : "Unknown";
}

function loadSyncConfig(){
  const fallback = {
    version: 1,
    workerUrl: DEFAULT_SYNC_WORKER_URL,
    token: ""
  };
  const stored = loadLocalStorageJsonItem(
    SYNC_CONFIG_KEY,
    "sync config",
    fallback,
    value => value && typeof value === "object" && !Array.isArray(value)
  );
  const cleanWorkerUrl = String(stored?.workerUrl || fallback.workerUrl).trim().replace(/\/+$/g, "");
  return {
    ...fallback,
    ...stored,
    version: 1,
    workerUrl: cleanWorkerUrl === LEGACY_STAGING_SYNC_WORKER_URL ? DEFAULT_SYNC_WORKER_URL : cleanWorkerUrl,
    token: String(stored?.token || "")
  };
}

function saveSyncConfig(config){
  const clean = {
    ...loadSyncConfig(),
    ...(config || {}),
    version: 1
  };
  clean.workerUrl = String(clean.workerUrl || DEFAULT_SYNC_WORKER_URL).trim().replace(/\/+$/g, "");
  clean.token = String(clean.token || "");
  storage.setItem(SYNC_CONFIG_KEY, JSON.stringify(clean));
  return clean;
}

function loadLocalSyncStatus(){
  const fallback = {
    version: 1,
    deviceId: getOrCreateDeviceId(),
    syncEnabled: false,
    status: "local-only",
    lastLocalChangeAt: "",
    lastSyncAt: "",
    lastSyncError: "",
    pendingLocalChanges: 0,
    updatedAt: nowIso()
  };
  const stored = loadLocalStorageJsonItem(
    SYNC_STATUS_KEY,
    "sync status",
    fallback,
    value => value && typeof value === "object" && !Array.isArray(value)
  );
  return {
    ...fallback,
    ...stored,
    version: 1,
    deviceId: getOrCreateDeviceId(),
    syncEnabled: false
  };
}

function saveLocalSyncStatus(status){
  try{
    const clean = {
      ...loadLocalSyncStatus(),
      ...(status || {}),
      version: 1,
      deviceId: getOrCreateDeviceId(),
      syncEnabled: false,
      updatedAt: nowIso()
    };
    storage.setItem(SYNC_STATUS_KEY, JSON.stringify(clean));
    return clean;
  }catch(e){
    console.warn("Could not save sync status", e);
    return status || null;
  }
}

function countPendingLocalChanges(){
  let count = 0;
  (Array.isArray(passages) ? passages : []).forEach((p) => {
    if (p?.syncDirty) count += 1;
    (Array.isArray(p?.entries) ? p.entries : []).forEach((entry) => {
      if (entry?.syncDirty) count += 1;
    });
  });
  (Array.isArray(knownPorts) ? knownPorts : []).forEach((port) => {
    if (port?.syncDirty) count += 1;
  });
  return count;
}

function countRecoverableDeletedEntries(){
  return (Array.isArray(passages) ? passages : []).reduce((sum, p) => {
    return sum + (Array.isArray(p?.entries) ? p.entries.filter(isDeletedLogEntry).length : 0);
  }, 0);
}

function isDeletedPassage(passage){
  return !!(passage && passage.deleted === true);
}

function activePassages(){
  return (Array.isArray(passages) ? passages : []).filter((passage) => !isDeletedPassage(passage));
}

function getFirstActivePassage(){
  return activePassages()[0] || null;
}

function recordLocalSyncChange(reason = "local-change", timestamp = nowIso()){
  if (reason === "ports-change") forgetSyncRecordMeta("global:ports");
  const pending = countPendingLocalChanges();
  saveLocalSyncStatus({
    status: pending > 0 ? "local-pending" : "local-only",
    lastLocalChangeAt: timestamp,
    lastLocalChangeReason: reason,
    pendingLocalChanges: pending
  });
  renderLocalSyncStatus();
}

function getLocalSyncSummary(){
  const status = loadLocalSyncStatus();
  const pending = countPendingLocalChanges();
  const deleted = countRecoverableDeletedEntries();
  if (status.pendingLocalChanges !== pending) {
    status.pendingLocalChanges = pending;
    status.status = pending > 0 ? "local-pending" : (status.status === "full-sync-ok" ? "full-sync-ok" : "local-only");
    saveLocalSyncStatus(status);
  }
  return {
    ...status,
    pendingLocalChanges: pending,
    recoverableDeletedEntries: deleted
  };
}

function formatSyncStatusTime(value){
  if (!isValidIsoString(value)) return "Never";
  try{
    return new Date(value).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
  }catch{
    return value;
  }
}

function renderLocalSyncStatus(){
  const el = document.getElementById("syncStatusSummary");
  if (!el) return;
  const summary = getLocalSyncSummary();
  const config = loadSyncConfig();
  const deviceName = getDeviceName();
  const displayedCloudAt = summary.lastObservedFullSyncAt || summary.lastFullSyncAt || "";
  const lastCloudDeviceName = summary.lastObservedFullSyncDeviceName || summary.lastFullSyncDeviceName || summary.lastCloudBackupDeviceName || "";
  const lastCloudDeviceId = summary.lastObservedFullSyncDeviceId || summary.lastFullSyncDeviceId || summary.lastCloudBackupDeviceId || "";
  const cloudDeviceText = displayDeviceName(lastCloudDeviceName, lastCloudDeviceId);
  const lastSyncText = formatSyncStatusTime(summary.lastSyncAt);
  const hasConnection = Boolean(config.workerUrl && config.token);
  let statusText = "Ready to sync";
  let statusDetail = "Sync Now checks cloud first, then updates only the copy that needs it.";
  if (!hasConnection) {
    statusText = "Cloud sync not set up";
    statusDetail = "Open connection settings and enter the sync details to use cloud sync.";
  } else if (summary.lastRemoteStatus === "error") {
    statusText = "Sync needs attention";
    statusDetail = summary.lastSyncError || "The last cloud check did not complete.";
  } else if (summary.status === "full-sync-ok" && summary.pendingLocalChanges === 0) {
    statusText = "Synced";
    statusDetail = summary.lastSyncAt
      ? `This device was last synced ${lastSyncText}.`
      : "This device matches the latest cloud copy.";
  } else if (summary.pendingLocalChanges > 0) {
    statusText = "Ready to sync changes";
    statusDetail = "Sync Now will check cloud first, then save this device's latest changes if it is safe to do so.";
  } else if (displayedCloudAt) {
    statusText = "Ready to sync";
    statusDetail = `Latest cloud copy was saved ${formatSyncStatusTime(displayedCloudAt)}${cloudDeviceText ? ` by ${cloudDeviceText}` : ""}.`;
  }
  el.innerHTML = `
    <div class="sync-overview-card">
      <span>Cloud sync</span>
      <strong>${escapeHtml(statusText)}</strong>
      <p>${escapeHtml(statusDetail)}</p>
    </div>
    <div class="sync-check-panel">
      <div class="st-action-row">
        <button type="button" id="syncPreviewBtn" class="btn btn-secondary">Check Cloud</button>
        <button type="button" id="syncFullBtn" class="btn" data-sync-now-btn="1">Sync Now</button>
      </div>
      <details class="sync-advanced">
        <summary>Connection settings</summary>
        <label class="sync-check-field">
          <span>Device name</span>
          <input id="syncDeviceName" type="text" value="${escapeHtml(deviceName)}" autocomplete="off" spellcheck="false" placeholder="Bill's MacBook Pro">
        </label>
        <label class="sync-check-field">
          <span>Worker URL</span>
          <input id="syncWorkerUrl" type="url" value="${escapeHtml(config.workerUrl)}" autocomplete="off" spellcheck="false">
        </label>
        <label class="sync-check-field">
          <span>Sync token</span>
          <input id="syncWorkerToken" type="password" value="${escapeHtml(config.token)}" autocomplete="off" spellcheck="false">
        </label>
      </details>
      <details class="sync-advanced">
        <summary>Recovery backups</summary>
        <div class="st-action-row">
          <button type="button" id="syncRefreshBackupsBtn" class="btn btn-secondary">Refresh Cloud Backups</button>
        </div>
      </details>
      <div id="syncPreviewResults" class="sync-preview-results">
        <p class="hint">Cloud is treated as the main copy. Sync Now checks it first, then confirms before changing anything important.</p>
      </div>
      <div id="syncCloudBackups" class="sync-cloud-backups">
        <p class="hint">Recovery backups are kept when the cloud copy is replaced. They can be downloaded or restored manually.</p>
      </div>
      <p id="syncCheckMessage" class="hint">${escapeHtml(summary.lastSyncError || "Ready to sync.")}</p>
    </div>
  `;
  bindSyncStatusControls();
}

function setSyncCheckMessage(message){
  const el = document.getElementById("syncCheckMessage");
  if (el) el.textContent = message || "";
}

function bindSyncStatusControls(){
  const deviceNameInput = document.getElementById("syncDeviceName");
  if (deviceNameInput && deviceNameInput.dataset.bound !== "1") {
    deviceNameInput.dataset.bound = "1";
    const saveName = () => saveDeviceName(deviceNameInput.value);
    deviceNameInput.addEventListener("change", saveName);
    deviceNameInput.addEventListener("blur", saveName);
  }

  const refreshBtn = document.getElementById("syncRefreshBackupsBtn");
  if (refreshBtn && refreshBtn.dataset.bound !== "1") {
    refreshBtn.dataset.bound = "1";
    refreshBtn.addEventListener("click", () => refreshCloudBackups());
  }

  const previewBtn = document.getElementById("syncPreviewBtn");
  if (previewBtn && previewBtn.dataset.bound !== "1") {
    previewBtn.dataset.bound = "1";
    previewBtn.addEventListener("click", checkFullDataCloudSync);
  }

  const fullBtn = document.getElementById("syncFullBtn");
  if (fullBtn && fullBtn.dataset.bound !== "1") {
    fullBtn.dataset.bound = "1";
    fullBtn.addEventListener("click", runFullDataCloudSync);
  }

}

function getSavedSyncConnection(){
  const urlEl = document.getElementById("syncWorkerUrl");
  const tokenEl = document.getElementById("syncWorkerToken");
  const deviceNameEl = document.getElementById("syncDeviceName");
  if (deviceNameEl) saveDeviceName(deviceNameEl.value);
  const currentConfig = loadSyncConfig();
  const config = saveSyncConfig({
    workerUrl: urlEl ? urlEl.value : currentConfig.workerUrl,
    token: tokenEl ? tokenEl.value : currentConfig.token
  });

  if (!config.token) {
    return { error: "Enter the sync token first." };
  }

  try{
    const baseUrl = new URL(config.workerUrl);
    return {
      config,
      baseUrl: baseUrl.toString().replace(/\/+$/g, "")
    };
  }catch{
    return { error: "The Worker URL is not valid." };
  }
}

async function checkSyncWorkerStatus(){
  const btn = document.getElementById("syncCheckStatusBtn");
  const connection = getSavedSyncConnection();
  if (connection.error) {
    setSyncCheckMessage(connection.error);
    return;
  }

  if (btn) btn.disabled = true;
  setSyncCheckMessage("Checking staging Worker...");
  const checkedAt = nowIso();

  try{
    const res = await fetch(`${connection.baseUrl}/v1/status`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${connection.config.token}`
      },
      cache: "no-store"
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok !== true) {
      throw new Error(data.error || `Worker returned ${res.status}`);
    }

    saveLocalSyncStatus({
      status: "remote-check-ok",
      lastRemoteStatus: "ok",
      lastRemoteCheckAt: checkedAt,
      lastRemoteRevision: data.serverRevision,
      lastSyncError: ""
    });
    renderLocalSyncStatus();
    setSyncCheckMessage(`Worker OK. Server revision ${data.serverRevision || 0}. No data transferred.`);
  }catch(e){
    saveLocalSyncStatus({
      status: "remote-check-error",
      lastRemoteStatus: "error",
      lastRemoteCheckAt: checkedAt,
      lastSyncError: e && e.message ? e.message : String(e || "Sync check failed")
    });
    renderLocalSyncStatus();
    setSyncCheckMessage(`Sync check failed: ${e && e.message ? e.message : e}`);
  }finally{
    if (btn) btn.disabled = false;
  }
}

function latestTimestampFromValues(values, fallback = ""){
  return values.reduce((latest, value) => {
    const candidate = String(value || "");
    if (!isValidIsoString(candidate)) return latest;
    return !latest || candidate > latest ? candidate : latest;
  }, fallback || "");
}

function latestPassageTimestamp(p){
  if (isDeletedPassage(p)) {
    return latestTimestampFromValues([p?.deletedAt, p?.updatedAt, p?.dirtyAt, p?.createdAt], "");
  }
  const entryTimes = (Array.isArray(p?.entries) ? p.entries : []).flatMap((entry) => [
    entry?.updatedAt,
    entry?.createdAt,
    entry?.dirtyAt,
    entry?.deletedAt
  ]);
  return latestTimestampFromValues([
    p?.updatedAt,
    p?.createdAt,
    p?.dirtyAt,
    ...(Array.isArray(p?.legEnds) ? p.legEnds.map((leg) => leg?.updatedAt || leg?.endedAt) : []),
    ...entryTimes
  ], "");
}

function loadSyncRecordMeta(){
  try{
    const parsed = JSON.parse(storage.getItem(SYNC_RECORD_META_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  }catch{
    return {};
  }
}

function saveSyncRecordMeta(meta){
  try{
    storage.setItem(SYNC_RECORD_META_KEY, JSON.stringify(meta && typeof meta === "object" ? meta : {}));
  }catch(e){
    console.warn("Could not save sync record metadata", e);
  }
}

function rememberSyncRecordMeta(record){
  const recordId = String(record?.recordId || "");
  const clientUpdatedAt = String(record?.clientUpdatedAt || "");
  if (!recordId || !isValidIsoString(clientUpdatedAt)) return;
  const meta = loadSyncRecordMeta();
  meta[recordId] = {
    clientUpdatedAt,
    lastChangedDeviceId: String(record?.lastChangedDeviceId || "")
  };
  saveSyncRecordMeta(meta);
}

function forgetSyncRecordMeta(recordId){
  const cleanRecordId = String(recordId || "");
  if (!cleanRecordId) return;
  const meta = loadSyncRecordMeta();
  if (!meta[cleanRecordId]) return;
  delete meta[cleanRecordId];
  saveSyncRecordMeta(meta);
}

function createSyncRecord(recordId, recordType, payload, timestamp, lastChangedDeviceId = getOrCreateDeviceId()){
  const cleanTimestamp = isValidIsoString(timestamp) ? timestamp : nowIso();
  return {
    recordId,
    recordType,
    schemaVersion: LOCAL_DATA_SCHEMA_VERSION,
    clientUpdatedAt: cleanTimestamp,
    lastChangedDeviceId,
    lastChangedDeviceName: getDeviceName(),
    deleted: payload?.deleted === true,
    payload: {
      format: "steeler-sync-record",
      version: 1,
      appVersion: APP_VERSION,
      recordType,
      updatedAt: cleanTimestamp,
      data: payload
    }
  };
}

function createGlobalSyncRecord(recordId, recordType, payload, fallbackTime, meta){
  const saved = meta?.[recordId];
  if (saved && isValidIsoString(saved.clientUpdatedAt)) {
    return createSyncRecord(recordId, recordType, payload, saved.clientUpdatedAt, saved.lastChangedDeviceId || getOrCreateDeviceId());
  }
  return createSyncRecord(recordId, recordType, payload, fallbackTime);
}

function buildLocalSyncRecords(){
  normalisePassagesForSync(passages);
  const status = getLocalSyncSummary();
  const fallbackTime = status.lastLocalChangeAt || nowIso();
  const syncMeta = loadSyncRecordMeta();
  const records = [];

  (Array.isArray(passages) ? passages : []).forEach((p) => {
    if (!p?.id) return;
    records.push(createSyncRecord(`passage:${p.id}`, "passage", p, latestPassageTimestamp(p) || fallbackTime));
  });

  records.push(createGlobalSyncRecord("global:ports", "ports", { all: knownPorts, recent: recentPorts }, fallbackTime, syncMeta));
  records.push(createGlobalSyncRecord("global:safety-info", "safety-info", getSafetyInfo(), fallbackTime, syncMeta));
  records.push(createGlobalSyncRecord("global:legacy-ec-settings", "legacy-ec-settings", loadEcSettings(), fallbackTime, syncMeta));
  records.push(createGlobalSyncRecord("global:dpp-templates", "dpp-templates", loadDppTemplateStore(), fallbackTime, syncMeta));
  records.push(createGlobalSyncRecord("global:dpp-waypoints", "dpp-waypoints", loadDppWaypointStore(), fallbackTime, syncMeta));
  records.push(createGlobalSyncRecord("global:weather-abbreviations", "weather-abbreviations", loadAbbrDb(), fallbackTime, syncMeta));
  records.push(createGlobalSyncRecord("global:fuel-management", "fuel-management", loadFuelManagementSettings(), fallbackTime, syncMeta));
  records.push(createGlobalSyncRecord("global:app-settings", "app-settings", {
    theme: storage.getItem(THEME_KEY) || "day",
    logSplitRatio: storage.getItem(LOG_SPLIT_RATIO_KEY) || ""
  }, fallbackTime, syncMeta));

  return records;
}

function clearSyncDirtyForRecordIds(recordIds){
  const ids = new Set(Array.isArray(recordIds) ? recordIds : []);
  let passagesChanged = false;
  let portsChanged = false;

  (Array.isArray(passages) ? passages : []).forEach((p) => {
    if (!p?.id || !ids.has(`passage:${p.id}`)) return;
    if (p.syncDirty || p.syncStatus || p.dirtyAt) {
      p.syncDirty = false;
      p.syncStatus = "synced";
      p.dirtyAt = "";
      passagesChanged = true;
    }
    (Array.isArray(p.entries) ? p.entries : []).forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      if (entry.syncDirty || entry.syncStatus || entry.dirtyAt) {
        entry.syncDirty = false;
        entry.syncStatus = "synced";
        entry.dirtyAt = "";
        passagesChanged = true;
      }
    });
  });

  if (ids.has("global:ports")) {
    (Array.isArray(knownPorts) ? knownPorts : []).forEach((port) => {
      if (!port || typeof port !== "object") return;
      if (port.syncDirty || port.syncStatus || port.dirtyAt) {
        port.syncDirty = false;
        port.syncStatus = "synced";
        port.dirtyAt = "";
        portsChanged = true;
      }
    });
  }

  if (passagesChanged) savePassages();
  if (portsChanged) {
    saveLocalStorageItem(PORTS_KEY, JSON.stringify({ all: knownPorts, recent: recentPorts }), "ports");
    refreshPortUI();
  }

  return { passagesChanged, portsChanged };
}

function markReceivedRecordClean(record){
  const data = record?.payload?.data;
  if (record?.recordType === "passage" && data && typeof data === "object") {
    data.syncDirty = false;
    data.syncStatus = "synced";
    data.dirtyAt = "";
    (Array.isArray(data.entries) ? data.entries : []).forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      entry.syncDirty = false;
      entry.syncStatus = "synced";
      entry.dirtyAt = "";
    });
  }
  if (record?.recordType === "ports" && data && typeof data === "object") {
    (Array.isArray(data.all) ? data.all : []).forEach((port) => {
      if (!port || typeof port !== "object") return;
      port.syncDirty = false;
      port.syncStatus = "synced";
      port.dirtyAt = "";
    });
  }
  return record;
}

function cloneDailySummaries(days){
  return (Array.isArray(days) ? days : []).map((day) => ({ ...day }));
}

function dailySummaryContentScore(days){
  return (Array.isArray(days) ? days : []).reduce((score, day) => {
    const date = String(day?.date || "").trim();
    const fee = String(day?.fee || "").trim();
    const notes = String(day?.notes || "").trim();
    return score + (date ? 1 : 0) + (fee ? 2 : 0) + (notes ? 3 + Math.min(notes.length, 200) : 0);
  }, 0);
}

function localDailySummariesAreRicher(localDailySummaries, remoteDailySummaries){
  if (!localDailySummaries.length) return false;
  if (!remoteDailySummaries.length) return true;
  return dailySummaryContentScore(localDailySummaries) > dailySummaryContentScore(remoteDailySummaries)
    && localDailySummaries.length >= remoteDailySummaries.length;
}

function mergeReceivedPassageWithLocal(remotePassage, localPassage){
  if (!remotePassage || typeof remotePassage !== "object") return remotePassage;
  if (!localPassage || typeof localPassage !== "object") return remotePassage;

  const merged = {
    ...remotePassage,
    plan: {
      ...(remotePassage.plan || {})
    }
  };
  const remoteDailySummaries = Array.isArray(remotePassage.plan?.dailySummaries)
    ? remotePassage.plan.dailySummaries
    : [];
  const localDailySummaries = Array.isArray(localPassage.plan?.dailySummaries)
    ? localPassage.plan.dailySummaries
    : [];

  if (localDailySummariesAreRicher(localDailySummaries, remoteDailySummaries)) {
    const changedAt = nowIso();
    merged.plan.dailySummaries = cloneDailySummaries(localDailySummaries);
    merged.updatedAt = changedAt;
    merged.dirtyAt = changedAt;
    merged.syncDirty = true;
    merged.syncStatus = "dirty";
  }

  return merged;
}

function applySyncRecord(record){
  const type = String(record?.recordType || "");
  const data = record?.payload?.data;
  if (!type || data === undefined) return false;

  markReceivedRecordClean(record);

  if (type === "passage") {
    if (!data || typeof data !== "object" || !data.id) return false;
    const idx = (Array.isArray(passages) ? passages : []).findIndex((p) => p?.id === data.id);
    if (idx >= 0) passages[idx] = mergeReceivedPassageWithLocal(data, passages[idx]);
    else passages.unshift(data);
    normalisePassagesForSync(passages);
    saveLocalStorageItem(STORAGE_KEY, JSON.stringify(passages), "passages");
    return true;
  }

  if (type === "ports") {
    knownPorts = Array.isArray(data?.all) ? data.all : [];
    recentPorts = Array.isArray(data?.recent) ? data.recent : [];
    cleanPortsInPlace();
    saveLocalStorageItem(PORTS_KEY, JSON.stringify({ all: knownPorts, recent: recentPorts }), "ports");
    return true;
  }

  if (type === "safety-info") {
    saveLocalStorageItem(SAFETY_INFO_KEY, JSON.stringify(data), "Safety / Emergency Info");
    return true;
  }

  if (type === "legacy-ec-settings") {
    saveLocalStorageItem(EC_SETTINGS_KEY, JSON.stringify(data), "legacy emergency contact settings");
    return true;
  }

  if (type === "dpp-templates") {
    saveDppTemplateStore(data);
    return true;
  }

  if (type === "dpp-waypoints") {
    saveDppWaypointStore(data);
    return true;
  }

  if (type === "weather-abbreviations") {
    saveLocalStorageItem(ABBR_DB_KEY, JSON.stringify(data), "weather abbreviations");
    return true;
  }

  if (type === "fuel-management") {
    saveFuelManagementSettings(data);
    return true;
  }

  if (type === "app-settings") {
    if (data && typeof data === "object") {
      if (data.theme) applyTheme(data.theme);
      if (data.logSplitRatio !== undefined && data.logSplitRatio !== null) {
        storage.setItem(LOG_SPLIT_RATIO_KEY, String(data.logSplitRatio));
      }
      return true;
    }
  }

  return false;
}

function applySyncRecords(records){
  let applied = 0;
  (Array.isArray(records) ? records : []).forEach((record) => {
    if (applySyncRecord(record)) applied += 1;
  });
  if (applied > 0) refreshAfterDataRestore();
  return applied;
}

function compareLocalAndRemoteSyncRecords(localRecords, remoteRecords){
  const remoteById = new Map((Array.isArray(remoteRecords) ? remoteRecords : []).map((record) => [record.recordId, record]));
  const localById = new Map((Array.isArray(localRecords) ? localRecords : []).map((record) => [record.recordId, record]));
  const wouldUpload = [];
  const wouldDownload = [];
  const conflicts = [];
  const matched = [];

  localRecords.forEach((local) => {
    const remote = remoteById.get(local.recordId);
    if (!remote) {
      wouldUpload.push({ record: local, reason: "not in cloud yet" });
      return;
    }
    matched.push(local.recordId);
    const localTime = String(local.clientUpdatedAt || "");
    const remoteTime = String(remote.clientUpdatedAt || "");
    const localDevice = String(local.lastChangedDeviceId || "");
    const remoteDevice = String(remote.lastChangedDeviceId || "");
    const differentDevice = !!(localDevice && remoteDevice && localDevice !== remoteDevice);
    if (local.deleted !== remote.deleted) {
      if (local.deleted) {
        wouldUpload.push({ record: local, local, remote, reason: "deleted on this device" });
      }
      if (remote.deleted) {
        wouldDownload.push({ record: remote, local, remote, reason: "deleted in cloud" });
      }
      return;
    }
    if (localTime !== remoteTime && differentDevice) {
      conflicts.push({
        local,
        remote,
        reason: localTime > remoteTime
          ? "local is newer, but cloud was changed by another device"
          : "cloud is newer, but local data differs"
      });
      return;
    }
    if (localTime > remoteTime) wouldUpload.push({ record: local, local, remote, reason: "local is newer" });
    if (remoteTime > localTime) wouldDownload.push({ record: remote, local, remote, reason: "cloud is newer" });
  });

  remoteRecords.forEach((remote) => {
    if (!localById.has(remote.recordId)) {
      wouldDownload.push({ record: remote, reason: "not on this device" });
    }
  });

  return {
    localCount: localRecords.length,
    remoteCount: remoteRecords.length,
    matchedCount: matched.length,
    wouldUpload,
    wouldDownload,
    conflicts
  };
}

function passageSyncRecordLabel(record){
  const id = String(record?.recordId || "").replace(/^passage:/, "");
  const passage = record?.payload?.data || {};
  const plan = passage?.plan || {};
  const from = String(plan.from || "").trim();
  const to = String(plan.to || "").trim();
  const date = String(passage.date || plan.date || "").trim();
  const route = from && to ? `${from} -> ${to}` : from || to || "";
  if (route && date) return `${route} (${date})`;
  if (route) return route;
  return id ? `Passage ${id}` : "Passage";
}

function syncRecordLabel(record){
  const id = String(record?.recordId || "");
  const type = String(record?.recordType || (id.startsWith("passage:") ? "passage" : id.replace(/^global:/, "")) || "record");
  if (type === "passage") return passageSyncRecordLabel(record);
  return type.replace(/-/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function normalisePortComparisonName(port){
  return portName(port).trim().toLowerCase();
}

function comparablePortValue(port){
  if (!port || typeof port !== "object") return "";
  return JSON.stringify({
    name: portName(port).trim(),
    lat: port.lat ?? "",
    lon: port.lon ?? "",
    commsPilotage: port.commsPilotage || "",
    comments: port.comments || ""
  });
}

function summarisePortsDifference(localRecord, remoteRecord){
  const localPorts = Array.isArray(localRecord?.payload?.data?.all) ? localRecord.payload.data.all : [];
  const remotePorts = Array.isArray(remoteRecord?.payload?.data?.all) ? remoteRecord.payload.data.all : [];
  const localRecent = Array.isArray(localRecord?.payload?.data?.recent) ? localRecord.payload.data.recent : [];
  const remoteRecent = Array.isArray(remoteRecord?.payload?.data?.recent) ? remoteRecord.payload.data.recent : [];
  const localByName = new Map(localPorts.map((port) => [normalisePortComparisonName(port), port]).filter(([name]) => !!name));
  const remoteByName = new Map(remotePorts.map((port) => [normalisePortComparisonName(port), port]).filter(([name]) => !!name));
  const added = [];
  const removed = [];
  const changed = [];

  localByName.forEach((localPort, name) => {
    const remotePort = remoteByName.get(name);
    if (!remotePort) {
      added.push(portName(localPort));
      return;
    }
    if (comparablePortValue(localPort) !== comparablePortValue(remotePort)) changed.push(portName(localPort));
  });
  remoteByName.forEach((remotePort, name) => {
    if (!localByName.has(name)) removed.push(portName(remotePort));
  });

  const parts = [
    `${added.length} added`,
    `${changed.length} changed`,
    `${removed.length} removed`
  ];
  const names = [...added, ...changed, ...removed].filter(Boolean).slice(0, 4);
  if (!added.length && !changed.length && !removed.length && JSON.stringify(localRecent) !== JSON.stringify(remoteRecent)) {
    return "Ports: saved ports match; recent ports list differs";
  }
  return `Ports: ${parts.join(", ")}${names.length ? ` (${names.join(", ")}${added.length + changed.length + removed.length > names.length ? ", ..." : ""})` : ""}`;
}

function stableComparableJson(value){
  if (Array.isArray(value)) return `[${value.map(stableComparableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableComparableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? "");
}

function summariseNamedListDifference(label, localItems, remoteItems, options = {}){
  const keyField = options.keyField || "id";
  const nameField = options.nameField || "name";
  const keyFor = (item) => String(item?.[keyField] || item?.[nameField] || "").trim().toLowerCase();
  const nameFor = (item) => String(item?.[nameField] || item?.[keyField] || "").trim();
  const localByKey = new Map((Array.isArray(localItems) ? localItems : []).map((item) => [keyFor(item), item]).filter(([key]) => !!key));
  const remoteByKey = new Map((Array.isArray(remoteItems) ? remoteItems : []).map((item) => [keyFor(item), item]).filter(([key]) => !!key));
  const added = [];
  const changed = [];
  const removed = [];

  localByKey.forEach((localItem, key) => {
    const remoteItem = remoteByKey.get(key);
    if (!remoteItem) {
      added.push(nameFor(localItem));
      return;
    }
    if (stableComparableJson(localItem) !== stableComparableJson(remoteItem)) changed.push(nameFor(localItem));
  });
  remoteByKey.forEach((remoteItem, key) => {
    if (!localByKey.has(key)) removed.push(nameFor(remoteItem));
  });

  const names = [...added, ...changed, ...removed].filter(Boolean).slice(0, 4);
  return `${label}: ${added.length} added, ${changed.length} changed, ${removed.length} removed${names.length ? ` (${names.join(", ")}${added.length + changed.length + removed.length > names.length ? ", ..." : ""})` : ""}`;
}

function flattenDiffPaths(value, prefix = ""){
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return [prefix || "list"];
  return Object.keys(value).flatMap((key) => {
    const next = prefix ? `${prefix}.${key}` : key;
    const child = value[key];
    if (child && typeof child === "object" && !Array.isArray(child)) return flattenDiffPaths(child, next);
    return [next];
  });
}

function summariseObjectDifference(label, localData, remoteData){
  const localPaths = new Set(flattenDiffPaths(localData));
  const remotePaths = new Set(flattenDiffPaths(remoteData));
  const allPaths = Array.from(new Set([...localPaths, ...remotePaths])).sort();
  const changed = allPaths.filter((path) => {
    const getPath = (obj) => path.split(".").reduce((value, part) => value && typeof value === "object" ? value[part] : undefined, obj);
    return stableComparableJson(getPath(localData)) !== stableComparableJson(getPath(remoteData));
  });
  const shown = changed.slice(0, 4).map((path) => path.replace(/\./g, " / "));
  return `${label}: ${changed.length} field${changed.length === 1 ? "" : "s"} differ${shown.length ? ` (${shown.join(", ")}${changed.length > shown.length ? ", ..." : ""})` : ""}`;
}

function summariseWeatherAbbreviationsDifference(localRecord, remoteRecord){
  const localRules = Array.isArray(localRecord?.payload?.data?.rules) ? localRecord.payload.data.rules : [];
  const remoteRules = Array.isArray(remoteRecord?.payload?.data?.rules) ? remoteRecord.payload.data.rules : [];
  return summariseNamedListDifference("Weather abbreviations", localRules, remoteRules, { keyField: "id", nameField: "abbr" });
}

function syncRecordDetail(item){
  const local = item?.local || item?.record || null;
  const remote = item?.remote || null;
  const recordType = String(local?.recordType || remote?.recordType || "");
  if (recordType === "passage") {
    const localDays = local?.payload?.data?.plan?.dailySummaries;
    const remoteDays = remote?.payload?.data?.plan?.dailySummaries;
    const parts = [];
    if (Array.isArray(localDays)) parts.push(`this device Daily Summary rows: ${localDays.length}`);
    if (Array.isArray(remoteDays)) parts.push(`cloud Daily Summary rows: ${remoteDays.length}`);
    return parts.join("; ");
  }
  if (recordType === "ports") return summarisePortsDifference(local, remote);
  if (recordType === "dpp-templates") {
    return summariseNamedListDifference("DPP templates", local?.payload?.data?.templates, remote?.payload?.data?.templates);
  }
  if (recordType === "dpp-waypoints") {
    return summariseNamedListDifference("DPP waypoints", local?.payload?.data?.waypoints, remote?.payload?.data?.waypoints);
  }
  if (recordType === "weather-abbreviations") return summariseWeatherAbbreviationsDifference(local, remote);
  if (recordType === "safety-info") return summariseObjectDifference("Safety info", local?.payload?.data, remote?.payload?.data);
  if (recordType === "legacy-ec-settings") return summariseObjectDifference("Legacy emergency contacts", local?.payload?.data, remote?.payload?.data);
  if (recordType === "fuel-management") return summariseObjectDifference("Fuel settings", local?.payload?.data, remote?.payload?.data);
  if (recordType === "app-settings") return summariseObjectDifference("App settings", local?.payload?.data, remote?.payload?.data);
  return "";
}

function renderSyncPreview(comparison, remoteRevision){
  const el = document.getElementById("syncPreviewResults");
  if (!el) return;
  const uploadItems = comparison.wouldUpload.slice(0, 8).map((item) => {
    const detail = syncRecordDetail(item);
    return `<li>${escapeHtml(syncRecordLabel(item.local || item.record))} <span>${escapeHtml(item.reason)}</span>${detail ? `<span>${escapeHtml(detail)}</span>` : ""}</li>`;
  }).join("");
  const downloadItems = comparison.wouldDownload.slice(0, 8).map((item) => {
    const detail = syncRecordDetail(item);
    return `<li>${escapeHtml(syncRecordLabel(item.local || item.record))} <span>${escapeHtml(item.reason)}</span>${detail ? `<span>${escapeHtml(detail)}</span>` : ""}</li>`;
  }).join("");
  const conflictItems = (comparison.conflicts || []).slice(0, 8).map((item) => {
    const recordId = item.local?.recordId || item.remote?.recordId || "";
    const detail = syncRecordDetail(item);
    return `
      <li>
        ${escapeHtml(syncRecordLabel(item.local || item.remote))}
        <span>${escapeHtml(item.reason)}</span>
        ${detail ? `<span>${escapeHtml(detail)}</span>` : ""}
        <div class="sync-conflict-actions">
          <button type="button" class="btn btn-secondary sync-conflict-choice-btn" data-record-id="${escapeHtml(recordId)}" data-choice="local">Keep this device</button>
          <button type="button" class="btn btn-secondary sync-conflict-choice-btn" data-record-id="${escapeHtml(recordId)}" data-choice="cloud">Use cloud</button>
        </div>
      </li>
    `;
  }).join("");
  el.innerHTML = `
    <div class="sync-preview-panel">
      <div class="sync-status-grid">
        <div><span>Local sync records</span><strong>${comparison.localCount}</strong></div>
        <div><span>Cloud sync records</span><strong>${comparison.remoteCount}</strong></div>
        <div><span>Safe to send</span><strong>${comparison.wouldUpload.length}</strong></div>
        <div><span>Safe to receive</span><strong>${comparison.wouldDownload.length}</strong></div>
        <div><span>Needs review</span><strong>${(comparison.conflicts || []).length}</strong></div>
        <div><span>Cloud revision</span><strong>${remoteRevision || 0}</strong></div>
      </div>
      <div class="sync-preview-lists">
        <div>
          <strong>Safe send preview</strong>
          <ul>${uploadItems || "<li>Nothing to upload</li>"}</ul>
        </div>
        <div>
          <strong>Safe receive preview</strong>
          <ul>${downloadItems || "<li>Nothing to receive</li>"}</ul>
        </div>
        <div class="${conflictItems ? "sync-conflict-list" : ""}">
          <strong>Needs review</strong>
          <ul>${conflictItems || "<li>No possible conflicts</li>"}</ul>
        </div>
      </div>
      <p class="hint">Preview only. No records were uploaded, downloaded into the app, merged or restored.</p>
    </div>
  `;
  bindSyncConflictControls();
}

function bindSyncConflictControls(){
  document.querySelectorAll(".sync-conflict-choice-btn").forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => resolveSyncConflict(btn.dataset.recordId || "", btn.dataset.choice || "", btn));
  });
}

function setSyncConflictButtonsDisabled(disabled){
  document.querySelectorAll(".sync-conflict-choice-btn").forEach((btn) => {
    btn.disabled = disabled;
  });
}

function getFullDataBackupFromRecord(record){
  const payload = record?.payload || {};
  const backup = payload.backup || payload.data?.backup || null;
  return backup && backup.format === DATA_BACKUP_FORMAT ? backup : null;
}

function createFullDataSyncRecord(backupPayload, timestamp = nowIso()){
  const deviceId = getOrCreateDeviceId();
  const deviceName = getDeviceName();
  return {
    recordId: FULL_DATA_SYNC_RECORD_ID,
    recordType: FULL_DATA_SYNC_RECORD_TYPE,
    schemaVersion: LOCAL_DATA_SCHEMA_VERSION,
    clientUpdatedAt: timestamp,
    lastChangedDeviceId: deviceId,
    lastChangedDeviceName: deviceName,
    deleted: false,
    payload: {
      format: "steeler-full-data-sync-record",
      version: 1,
      createdAt: timestamp,
      appVersion: APP_VERSION,
      deviceId,
      deviceName,
      backup: backupPayload
    }
  };
}

async function pushCloudSyncRecords(connection, records){
  const cleanRecords = (Array.isArray(records) ? records : []).filter(Boolean);
  if (!cleanRecords.length) return { accepted: [], serverRevision: null };
  const res = await fetch(`${connection.baseUrl}/v1/records/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${connection.config.token}`
    },
    cache: "no-store",
    body: JSON.stringify({
      deviceId: getOrCreateDeviceId(),
      deviceName: getDeviceName(),
      records: cleanRecords
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok !== true) {
    throw new Error(getCloudResponseErrorMessage(res, data));
  }
  const accepted = Array.isArray(data.accepted) ? data.accepted : [];
  const rejected = Array.isArray(data.rejected) ? data.rejected : [];
  if (accepted.length !== cleanRecords.length || rejected.length) {
    throw new Error(`Worker accepted ${accepted.length} of ${cleanRecords.length} records.`);
  }
  return { ...data, accepted };
}

function getCloudResponseErrorMessage(response, data = {}){
  if (data && typeof data.error === "string" && data.error.trim()) return data.error.trim();
  if (response?.status === 503) return "Cloud sync is temporarily unavailable. Please try again in a minute.";
  if (response?.status === 504) return "Cloud sync took too long to respond. Please try again in a minute.";
  if (response?.status === 401) return "The sync token was not accepted.";
  if (response?.status === 404) return "The cloud sync service could not find that request.";
  if (response?.status) return `Cloud sync returned ${response.status}.`;
  return "Cloud sync did not respond.";
}

async function fetchCurrentFullDataCloudRecord(connection){
  const res = await fetch(`${connection.baseUrl}/v1/records?since=0&limit=20&type=${encodeURIComponent(FULL_DATA_SYNC_RECORD_TYPE)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${connection.config.token}`
    },
    cache: "no-store"
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok !== true) {
    throw new Error(getCloudResponseErrorMessage(res, data));
  }
  const current = (Array.isArray(data.records) ? data.records : [])
    .filter((record) => record.recordId === FULL_DATA_SYNC_RECORD_ID || record.recordType === FULL_DATA_SYNC_RECORD_TYPE)
    .sort((a, b) => Number(b.serverRevision || 0) - Number(a.serverRevision || 0))[0] || null;
  return {
    record: current,
    backup: getFullDataBackupFromRecord(current),
    serverRevision: current?.serverRevision || data.serverRevision || 0
  };
}

function describeFullDataCloudRecord(cloud){
  const record = cloud?.record || null;
  const backup = cloud?.backup || getFullDataBackupFromRecord(record);
  const updatedAt = record?.clientUpdatedAt || record?.payload?.createdAt || backup?.exportedAt || "";
  const deviceId = record?.lastChangedDeviceId || record?.payload?.deviceId || backup?.exportedByDeviceId || "";
  const deviceName = record?.lastChangedDeviceName || record?.payload?.deviceName || backup?.exportedByDeviceName || "";
  const passageCount = Array.isArray(backup?.data?.passages) ? backup.data.passages.length : 0;
  return {
    revision: Number(record?.serverRevision || cloud?.serverRevision || 0),
    updatedAt,
    deviceId,
    deviceName,
    displayDevice: displayDeviceName(deviceName, deviceId),
    appVersion: record?.payload?.appVersion || backup?.appVersion || "",
    passageCount,
    text: record
      ? `Cloud revision ${Number(record.serverRevision || cloud?.serverRevision || 0)} · ${formatSyncStatusTime(updatedAt)} · ${displayDeviceName(deviceName, deviceId)}`
      : "No cloud copy found"
  };
}

function removeBackupComparisonNoise(value){
  if (Array.isArray(value)) return value.map(removeBackupComparisonNoise);
  if (!value || typeof value !== "object") return value;
  const clean = {};
  Object.keys(value).sort().forEach((key) => {
    if (key === "localSyncStatus" || key === "syncDirty" || key === "syncStatus" || key === "dirtyAt") return;
    clean[key] = removeBackupComparisonNoise(value[key]);
  });
  return clean;
}

function comparableBackupData(backup){
  return removeBackupComparisonNoise(cloneJsonSafe(backup?.data || {}, {}));
}

function fullDataBackupsMatch(localBackup, cloudBackup){
  if (!localBackup || !cloudBackup) return false;
  return stableComparableJson(comparableBackupData(localBackup)) === stableComparableJson(comparableBackupData(cloudBackup));
}

function renderFullDataCloudPreview(cloud, note = ""){
  const el = document.getElementById("syncPreviewResults");
  if (!el) return;
  const summary = describeFullDataCloudRecord(cloud);
  if (!cloud?.record) {
    el.innerHTML = `
      <div class="sync-preview-panel">
        <div class="sync-overview-card">
          <span>Cloud copy</span>
          <strong>None yet</strong>
          <p>${escapeHtml(note || "Sync Now will create the first cloud copy from this device.")}</p>
        </div>
      </div>
    `;
    return;
  }
  el.innerHTML = `
    <div class="sync-preview-panel">
      <div class="sync-status-grid">
        <div><span>Last cloud save</span><strong>${escapeHtml(formatSyncStatusTime(summary.updatedAt))}</strong></div>
        <div><span>Saved by</span><strong>${escapeHtml(summary.displayDevice)}</strong></div>
        <div><span>Cloud data</span><strong>${summary.passageCount} passage${summary.passageCount === 1 ? "" : "s"}</strong></div>
      </div>
      <p class="hint">${escapeHtml(note || "Check only. No data was uploaded, downloaded or changed.")}</p>
    </div>
  `;
}

function saveFullDataCloudStatus(status, cloud, extra = {}){
  const summary = describeFullDataCloudRecord(cloud);
  return saveLocalSyncStatus({
    status,
    lastRemoteStatus: "ok",
    lastRemoteCheckAt: extra.checkedAt || nowIso(),
    lastRemoteRevision: summary.revision,
    lastFullSyncRevision: summary.revision,
    lastFullSyncAt: summary.updatedAt || extra.checkedAt || nowIso(),
    lastFullSyncDeviceId: summary.deviceId || "",
    lastFullSyncDeviceName: summary.deviceName || "",
    lastFullSyncAppVersion: summary.appVersion || "",
    pendingLocalChanges: countPendingLocalChanges(),
    lastSyncError: "",
    ...extra
  });
}

function cloudCopyChangedSinceLastSync(cloud){
  if (!cloud?.record) return false;
  const status = loadLocalSyncStatus();
  const lastSeen = Number(status.lastFullSyncRevision || 0);
  const cloudRevision = Number(cloud.record.serverRevision || 0);
  if (!lastSeen) return true;
  return cloudRevision > lastSeen;
}

function clearAllLocalSyncDirty(){
  let passagesChanged = false;
  let portsChanged = false;
  (Array.isArray(passages) ? passages : []).forEach((p) => {
    if (!p || typeof p !== "object") return;
    if (p.syncDirty || p.syncStatus || p.dirtyAt) {
      p.syncDirty = false;
      p.syncStatus = "synced";
      p.dirtyAt = "";
      passagesChanged = true;
    }
    (Array.isArray(p.entries) ? p.entries : []).forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      if (entry.syncDirty || entry.syncStatus || entry.dirtyAt) {
        entry.syncDirty = false;
        entry.syncStatus = "synced";
        entry.dirtyAt = "";
        passagesChanged = true;
      }
    });
  });
  (Array.isArray(knownPorts) ? knownPorts : []).forEach((port) => {
    if (!port || typeof port !== "object") return;
    if (port.syncDirty || port.syncStatus || port.dirtyAt) {
      port.syncDirty = false;
      port.syncStatus = "synced";
      port.dirtyAt = "";
      portsChanged = true;
    }
  });
  if (passagesChanged) savePassages();
  if (portsChanged) {
    saveLocalStorageItem(PORTS_KEY, JSON.stringify({ all: knownPorts, recent: recentPorts }), "ports");
    refreshPortUI();
  }
}

function chooseFullSyncConflictAction(cloud){
  const summary = describeFullDataCloudRecord(cloud);
  return new Promise((resolve) => {
    showModal({
      title: "Cloud Copy Changed",
      hideButtons: true,
      bodyHtml: `
        <p>Cloud was last updated by <strong>${escapeHtml(summary.displayDevice)}</strong>.</p>
        <p>${escapeHtml(formatSyncStatusTime(summary.updatedAt))} · Revision ${summary.revision}</p>
        <p>Choose which complete STEELER data copy to keep.</p>
        <div class="st-action-row">
          <button type="button" id="syncKeepThisDeviceBtn" class="btn">Keep This Device</button>
          <button type="button" id="syncUseCloudCopyBtn" class="btn btn-secondary">Use Cloud Copy</button>
          <button type="button" id="syncCancelChoiceBtn" class="btn btn-secondary">Cancel</button>
        </div>
      `
    });
    const finish = (choice) => {
      closeModal();
      resolve(choice);
    };
    document.getElementById("syncKeepThisDeviceBtn")?.addEventListener("click", () => finish("local"));
    document.getElementById("syncUseCloudCopyBtn")?.addEventListener("click", () => finish("cloud"));
    document.getElementById("syncCancelChoiceBtn")?.addEventListener("click", () => finish("cancel"));
  });
}

async function uploadFullDataCloudCopy(connection, previousCloud, syncedAt){
  const previousStatus = loadLocalSyncStatus();
  const localBackup = createDataBackupPayload();
  const records = [];
  const previousBackup = getFullDataBackupFromRecord(previousCloud?.record);
  if (previousBackup) records.push(createCloudBackupRecord(previousBackup));
  const currentRecord = createFullDataSyncRecord(localBackup, syncedAt);
  records.push(currentRecord);
  const pushed = await pushCloudSyncRecords(connection, records);
  const acceptedCurrent = pushed.accepted.find((record) => record.recordId === FULL_DATA_SYNC_RECORD_ID);
  const cloud = {
    record: {
      ...currentRecord,
      serverRevision: acceptedCurrent?.serverRevision || pushed.serverRevision || previousCloud?.serverRevision || 0
    },
    backup: localBackup,
    serverRevision: acceptedCurrent?.serverRevision || pushed.serverRevision || previousCloud?.serverRevision || 0
  };
  clearAllLocalSyncDirty();
  saveFullDataCloudStatus("full-sync-ok", cloud, {
    checkedAt: syncedAt,
    lastSyncAt: syncedAt,
    lastCloudBackupAt: previousBackup ? syncedAt : previousStatus.lastCloudBackupAt || "",
    lastCloudBackupRecordId: previousBackup ? records[0].recordId : previousStatus.lastCloudBackupRecordId || "",
    lastSyncDirection: "upload"
  });
  return cloud;
}

async function applyFullDataCloudCopy(cloud, syncedAt){
  const backup = cloud?.backup || getFullDataBackupFromRecord(cloud?.record);
  if (!backup || backup.format !== DATA_BACKUP_FORMAT || !backup.data || !Array.isArray(backup.data.passages)) {
    throw new Error("Cloud copy is not a valid STEELER data backup.");
  }
  downloadJsonPayload(createDataBackupPayload(), "STEELER-Before-cloud-sync-backup");
  const restored = restoreDataBackupObject(backup, {
    skipConfirm: true,
    successMessage: "Cloud copy applied successfully."
  });
  if (!restored) throw new Error("Cloud copy was not applied.");
  clearAllLocalSyncDirty();
  saveFullDataCloudStatus("full-sync-ok", cloud, {
    checkedAt: syncedAt,
    lastSyncAt: syncedAt,
    lastSyncDirection: "download"
  });
}

async function checkFullDataCloudSync(){
  const btn = document.getElementById("syncPreviewBtn");
  const connection = getSavedSyncConnection();
  if (connection.error) {
    setSyncCheckMessage(connection.error);
    return;
  }
  if (btn) btn.disabled = true;
  setSyncCheckMessage("Checking cloud copy...");
  const checkedAt = nowIso();

  try{
    const cloud = await fetchCurrentFullDataCloudRecord(connection);
    const summary = describeFullDataCloudRecord(cloud);
    const localBackup = createDataBackupPayload();
    const localMatchesCloud = Boolean(cloud.record && fullDataBackupsMatch(localBackup, cloud.backup));
    const previousStatus = loadLocalSyncStatus();
    saveLocalSyncStatus({
      status: localMatchesCloud ? "full-sync-ok" : "full-sync-check-ok",
      lastRemoteStatus: "ok",
      lastRemoteCheckAt: checkedAt,
      lastRemoteRevision: summary.revision,
      lastFullSyncRevision: localMatchesCloud ? summary.revision : previousStatus.lastFullSyncRevision || "",
      lastFullSyncAt: localMatchesCloud ? summary.updatedAt || checkedAt : previousStatus.lastFullSyncAt || "",
      lastFullSyncDeviceId: localMatchesCloud ? summary.deviceId || "" : previousStatus.lastFullSyncDeviceId || "",
      lastFullSyncDeviceName: localMatchesCloud ? summary.deviceName || "" : previousStatus.lastFullSyncDeviceName || "",
      lastFullSyncAppVersion: localMatchesCloud ? summary.appVersion || "" : previousStatus.lastFullSyncAppVersion || "",
      lastObservedFullSyncRevision: summary.revision,
      lastObservedFullSyncAt: summary.updatedAt || "",
      lastObservedFullSyncDeviceId: summary.deviceId || "",
      lastObservedFullSyncDeviceName: summary.deviceName || "",
      lastObservedFullSyncAppVersion: summary.appVersion || "",
      checkedAt,
      lastSyncAt: localMatchesCloud ? checkedAt : previousStatus.lastSyncAt || "",
      lastSyncDirection: localMatchesCloud ? "matched" : previousStatus.lastSyncDirection || "",
      lastSyncError: ""
    });
    renderLocalSyncStatus();
    renderFullDataCloudPreview(cloud, localMatchesCloud ? "This device already matches the cloud copy." : "");
    setSyncCheckMessage(cloud.record
      ? (localMatchesCloud ? "This device already matches the cloud copy." : `${summary.text}. No data changed.`)
      : "No cloud copy found yet. Sync Now will create one from this device.");
  }catch(e){
    saveLocalSyncStatus({
      status: "full-sync-check-error",
      lastRemoteStatus: "error",
      lastRemoteCheckAt: checkedAt,
      lastSyncError: e && e.message ? e.message : String(e || "Cloud check failed")
    });
    renderLocalSyncStatus();
    setSyncCheckMessage(`Cloud check failed: ${e && e.message ? e.message : e}`);
  }finally{
    if (btn) btn.disabled = false;
  }
}

function setFullDataSyncBusy(isBusy){
  document.querySelectorAll("[data-sync-now-btn='1'], #syncFullBtn, #homeSyncNowBtn").forEach((button) => {
    button.disabled = Boolean(isBusy);
  });
}

async function runFullDataCloudSync(){
  const connection = getSavedSyncConnection();
  if (connection.error) {
    setSyncCheckMessage(connection.error);
    alert(connection.error);
    return;
  }
  setFullDataSyncBusy(true);
  setSyncCheckMessage("Checking cloud copy before sync...");
  const syncedAt = nowIso();

  try{
    const cloud = await fetchCurrentFullDataCloudRecord(connection);
    const localBackup = createDataBackupPayload();
    const localMatchesCloud = Boolean(cloud.record && fullDataBackupsMatch(localBackup, cloud.backup));
    renderFullDataCloudPreview(cloud, localMatchesCloud ? "This device already matches the cloud copy." : "");
    if (cloud.record && localMatchesCloud) {
      clearAllLocalSyncDirty();
      saveFullDataCloudStatus("full-sync-ok", cloud, {
        checkedAt: syncedAt,
        lastSyncAt: syncedAt,
        lastSyncDirection: "matched"
      });
      renderLocalSyncStatus();
      renderFullDataCloudPreview(cloud, "This device already matches the cloud copy.");
      setSyncCheckMessage("This device is already synced with cloud.");
      return;
    }

    let choice = "local";
    if (cloudCopyChangedSinceLastSync(cloud)) {
      choice = await chooseFullSyncConflictAction(cloud);
      if (choice === "cancel") {
        setSyncCheckMessage("Sync cancelled. Nothing changed.");
        return;
      }
    } else if (!cloud.record) {
      const ok = confirm(
        "Create the first cloud copy?\n\n" +
        "This will save this device's complete STEELER logbook to cloud so your other devices can use it."
      );
      if (!ok) {
        setSyncCheckMessage("Sync cancelled. Nothing changed.");
        return;
      }
    } else {
      const ok = confirm(
        "Save this device's latest changes to cloud?\n\n" +
        "Cloud will remain the main copy. The previous cloud copy will be kept in recovery backups."
      );
      if (!ok) {
        setSyncCheckMessage("Sync cancelled. Nothing changed.");
        return;
      }
    }

    if (choice === "cloud") {
      setSyncCheckMessage("Applying cloud copy to this device...");
      await applyFullDataCloudCopy(cloud, syncedAt);
      renderLocalSyncStatus();
      renderFullDataCloudPreview(cloud, "Cloud copy applied to this device. A safety backup downloaded first.");
      setSyncCheckMessage("Cloud copy applied to this device. A safety backup downloaded first.");
      return;
    }

    setSyncCheckMessage("Uploading this device as the current cloud copy...");
    const updatedCloud = await uploadFullDataCloudCopy(connection, cloud, syncedAt);
    renderLocalSyncStatus();
    renderFullDataCloudPreview(updatedCloud, "This device is now the current cloud copy.");
    setSyncCheckMessage(`Sync complete. This device is now the cloud copy at revision ${describeFullDataCloudRecord(updatedCloud).revision}.`);
    refreshCloudBackups({ silent: true });
  }catch(e){
    saveLocalSyncStatus({
      status: "full-sync-error",
      lastRemoteStatus: "error",
      lastRemoteCheckAt: syncedAt,
      lastSyncError: e && e.message ? e.message : String(e || "Full data sync failed")
    });
    renderLocalSyncStatus();
    setSyncCheckMessage(`Sync failed: ${e && e.message ? e.message : e}`);
  }finally{
    setFullDataSyncBusy(false);
  }
}

async function refreshManualSyncPreview(connection, messagePrefix = ""){
  const checkedAt = nowIso();
  const localRecords = buildLocalSyncRecords();
  const remote = await fetchRemoteSyncRecordSummary(connection);
  const comparison = compareLocalAndRemoteSyncRecords(localRecords, remote.records);
  renderSyncPreview(comparison, remote.serverRevision);
  saveLocalSyncStatus({
    status: "sync-preview-ok",
    lastRemoteStatus: "ok",
    lastRemoteCheckAt: checkedAt,
    lastRemoteRevision: remote.serverRevision,
    lastSyncPreviewAt: checkedAt,
    lastSyncPreviewUploadCount: comparison.wouldUpload.length,
    lastSyncPreviewDownloadCount: comparison.wouldDownload.length,
    lastSyncPreviewConflictCount: (comparison.conflicts || []).length,
    lastSyncError: ""
  });
  setSyncCheckMessage(`${messagePrefix}${comparison.wouldUpload.length} safe to send, ${comparison.wouldDownload.length} safe to receive, ${(comparison.conflicts || []).length} need review.`);
  return { comparison, remote };
}

async function resolveSyncConflict(recordId, choice, btn){
  const cleanRecordId = String(recordId || "").trim();
  const cleanChoice = String(choice || "");
  const connection = getSavedSyncConnection();
  if (connection.error) {
    setSyncCheckMessage(connection.error);
    return;
  }
  if (!cleanRecordId || !["local", "cloud"].includes(cleanChoice)) {
    setSyncCheckMessage("Could not identify the review item. Please run Preview Sync again.");
    return;
  }

  const label = syncRecordLabel({ recordId: cleanRecordId });
  const actionText = cleanChoice === "local" ? "keep this device's version" : "use the cloud version";
  const ok = confirm(
    `Resolve ${label}?\n\n` +
    `This will ${actionText} for this one review item only. Other review items will be left alone.`
  );
  if (!ok) {
    setSyncCheckMessage("Review item left unchanged.");
    return;
  }

  if (btn) btn.disabled = true;
  setSyncConflictButtonsDisabled(true);
  const resolvedAt = nowIso();

  try{
    const localRecords = buildLocalSyncRecords();
    const localRecord = localRecords.find((record) => record.recordId === cleanRecordId);
    if (cleanChoice === "local") {
      if (!localRecord) throw new Error("This device no longer has that local record.");
      setSyncCheckMessage(`Sending ${label} from this device...`);
      const res = await fetch(`${connection.baseUrl}/v1/records/push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${connection.config.token}`
        },
        cache: "no-store",
        body: JSON.stringify({
          deviceId: getOrCreateDeviceId(),
          records: [localRecord]
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok !== true) {
        throw new Error(data.error || `Worker returned ${res.status}`);
      }
      const accepted = Array.isArray(data.accepted) ? data.accepted : [];
      if (accepted.length !== 1 || accepted[0]?.recordId !== cleanRecordId) {
        throw new Error("The Worker did not accept the selected review item.");
      }
      rememberSyncRecordMeta(localRecord);
      clearSyncDirtyForRecordIds([cleanRecordId]);
      saveLocalSyncStatus({
        status: "sync-conflict-local-ok",
        lastRemoteStatus: "ok",
        lastRemoteCheckAt: resolvedAt,
        lastRemoteRevision: data.serverRevision,
        lastSyncAt: resolvedAt,
        pendingLocalChanges: countPendingLocalChanges(),
        lastSyncError: ""
      });
      renderLocalSyncStatus();
      await refreshManualSyncPreview(connection, `${label} resolved by keeping this device. `);
      return;
    }

    setSyncCheckMessage(`Receiving ${label} from cloud...`);
    const remoteFull = await fetchRemoteSyncRecords(connection);
    const remoteRecord = remoteFull.records.find((record) => record.recordId === cleanRecordId);
    if (!remoteRecord) throw new Error("Cloud no longer has that record.");

    downloadJsonPayload(createDataBackupPayload(), "STEELER-Before-sync-review-backup");
    const applied = applySyncRecords([remoteRecord]);
    if (applied !== 1) throw new Error("Could not apply the selected cloud record.");
    rememberSyncRecordMeta(remoteRecord);
    saveLocalSyncStatus({
      status: "sync-conflict-cloud-ok",
      lastRemoteStatus: "ok",
      lastRemoteCheckAt: resolvedAt,
      lastRemoteRevision: remoteFull.serverRevision,
      lastSyncAt: resolvedAt,
      lastSyncRecordReceiveAt: resolvedAt,
      lastSyncRecordReceiveCount: applied,
      pendingLocalChanges: countPendingLocalChanges(),
      lastSyncError: ""
    });
    renderLocalSyncStatus();
    await refreshManualSyncPreview(connection, `${label} resolved by using cloud. `);
  }catch(e){
    saveLocalSyncStatus({
      status: "sync-conflict-error",
      lastRemoteStatus: "error",
      lastRemoteCheckAt: resolvedAt,
      lastSyncError: e && e.message ? e.message : String(e || "Review item failed")
    });
    setSyncCheckMessage(`Review item failed: ${e && e.message ? e.message : e}`);
    setSyncConflictButtonsDisabled(false);
  }
}

async function previewManualSync(){
  const btn = document.getElementById("syncPreviewBtn");
  const connection = getSavedSyncConnection();
  if (connection.error) {
    setSyncCheckMessage(connection.error);
    return;
  }

  if (btn) btn.disabled = true;
  setSyncCheckMessage("Previewing sync...");
  const checkedAt = nowIso();

  try{
    const localRecords = buildLocalSyncRecords();
    const res = await fetch(`${connection.baseUrl}/v1/records/summary?includeBackups=0&limit=500`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${connection.config.token}`
      },
      cache: "no-store"
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok !== true) {
      throw new Error(data.error || `Worker returned ${res.status}`);
    }

    const remoteRecords = Array.isArray(data.records) ? data.records : [];
    const comparison = compareLocalAndRemoteSyncRecords(localRecords, remoteRecords);
    renderSyncPreview(comparison, data.serverRevision);
    saveLocalSyncStatus({
      status: "sync-preview-ok",
      lastRemoteStatus: "ok",
      lastRemoteCheckAt: checkedAt,
      lastRemoteRevision: data.serverRevision,
      lastSyncPreviewAt: checkedAt,
      lastSyncPreviewUploadCount: comparison.wouldUpload.length,
      lastSyncPreviewDownloadCount: comparison.wouldDownload.length,
      lastSyncPreviewConflictCount: (comparison.conflicts || []).length,
      lastSyncError: ""
    });
    setSyncCheckMessage(`Sync preview complete. ${comparison.wouldUpload.length} safe to send, ${comparison.wouldDownload.length} safe to receive, ${(comparison.conflicts || []).length} need review. Nothing changed.`);
  }catch(e){
    saveLocalSyncStatus({
      status: "sync-preview-error",
      lastRemoteStatus: "error",
      lastRemoteCheckAt: checkedAt,
      lastSyncError: e && e.message ? e.message : String(e || "Sync preview failed")
    });
    setSyncCheckMessage(`Sync preview failed: ${e && e.message ? e.message : e}`);
  }finally{
    if (btn) btn.disabled = false;
  }
}

async function fetchRemoteSyncRecordSummary(connection){
  const res = await fetch(`${connection.baseUrl}/v1/records/summary?includeBackups=0&limit=500`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${connection.config.token}`
    },
    cache: "no-store"
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok !== true) {
    throw new Error(data.error || `Worker returned ${res.status}`);
  }
  return {
    records: Array.isArray(data.records) ? data.records : [],
    serverRevision: data.serverRevision
  };
}

async function pushManualSyncRecords(){
  const btn = document.getElementById("syncPushRecordsBtn");
  const connection = getSavedSyncConnection();
  if (connection.error) {
    setSyncCheckMessage(connection.error);
    return;
  }

  if (btn) btn.disabled = true;
  setSyncCheckMessage("Checking which sync records need sending...");
  const pushedAt = nowIso();

  try{
    const localRecords = buildLocalSyncRecords();
    const remote = await fetchRemoteSyncRecordSummary(connection);
    const comparison = compareLocalAndRemoteSyncRecords(localRecords, remote.records);
    renderSyncPreview(comparison, remote.serverRevision);

    const recordsToPush = comparison.wouldUpload.map((item) => item.record);
    if ((comparison.conflicts || []).length) {
      setSyncCheckMessage(`${comparison.conflicts.length} possible conflict${comparison.conflicts.length === 1 ? "" : "s"} need review. Safe records can still be sent, but conflicted records will be left alone.`);
    }
    if (!recordsToPush.length) {
      saveLocalSyncStatus({
        status: "sync-push-noop",
        lastRemoteStatus: "ok",
        lastRemoteCheckAt: pushedAt,
        lastRemoteRevision: remote.serverRevision,
        lastSyncError: ""
      });
      setSyncCheckMessage("No sync records need sending. Nothing changed.");
      return;
    }

    const ok = confirm(
      `Send ${recordsToPush.length} sync record${recordsToPush.length === 1 ? "" : "s"} to Cloudflare?\n\n` +
      "This uploads safe local sync records only. Possible conflicts are left alone. It will not receive, merge, restore or overwrite anything on this device."
    );
    if (!ok) {
      setSyncCheckMessage("Send Sync Records cancelled. Nothing changed.");
      return;
    }

    setSyncCheckMessage(`Sending ${recordsToPush.length} sync record${recordsToPush.length === 1 ? "" : "s"}...`);
    const res = await fetch(`${connection.baseUrl}/v1/records/push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${connection.config.token}`
      },
      cache: "no-store",
      body: JSON.stringify({
        deviceId: getOrCreateDeviceId(),
        records: recordsToPush
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok !== true) {
      throw new Error(data.error || `Worker returned ${res.status}`);
    }

    const accepted = Array.isArray(data.accepted) ? data.accepted : [];
    const rejected = Array.isArray(data.rejected) ? data.rejected : [];
    if (accepted.length !== recordsToPush.length || rejected.length) {
      throw new Error(`Worker accepted ${accepted.length} of ${recordsToPush.length} records.`);
    }

    recordsToPush.forEach(rememberSyncRecordMeta);
    clearSyncDirtyForRecordIds(accepted.map((record) => record.recordId));
    saveLocalSyncStatus({
      status: "sync-push-ok",
      lastRemoteStatus: "ok",
      lastRemoteCheckAt: pushedAt,
      lastRemoteRevision: data.serverRevision,
      lastSyncAt: pushedAt,
      lastSyncRecordPushAt: pushedAt,
      lastSyncRecordPushCount: accepted.length,
      pendingLocalChanges: countPendingLocalChanges(),
      lastSyncError: ""
    });
    renderLocalSyncStatus();
    setSyncCheckMessage(`Sent ${accepted.length} sync record${accepted.length === 1 ? "" : "s"} to Cloudflare. No records were received or merged.`);
  }catch(e){
    saveLocalSyncStatus({
      status: "sync-push-error",
      lastRemoteStatus: "error",
      lastRemoteCheckAt: pushedAt,
      lastSyncError: e && e.message ? e.message : String(e || "Sync record upload failed")
    });
    setSyncCheckMessage(`Send Sync Records failed: ${e && e.message ? e.message : e}`);
  }finally{
    if (btn) btn.disabled = false;
  }
}

async function fetchRemoteSyncRecords(connection){
  const res = await fetch(`${connection.baseUrl}/v1/records?since=0&limit=500`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${connection.config.token}`
    },
    cache: "no-store"
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok !== true) {
    throw new Error(data.error || `Worker returned ${res.status}`);
  }
  return {
    records: Array.isArray(data.records) ? data.records.filter((record) => record.recordType !== "cloud-backup") : [],
    serverRevision: data.serverRevision
  };
}

async function fullManualSync(){
  const btn = document.getElementById("syncFullBtn");
  const connection = getSavedSyncConnection();
  if (connection.error) {
    setSyncCheckMessage(connection.error);
    return;
  }

  if (btn) btn.disabled = true;
  setSyncCheckMessage("Checking what Full Sync can safely move...");
  const syncedAt = nowIso();

  try{
    const localRecords = buildLocalSyncRecords();
    const remote = await fetchRemoteSyncRecordSummary(connection);
    const comparison = compareLocalAndRemoteSyncRecords(localRecords, remote.records);
    renderSyncPreview(comparison, remote.serverRevision);

    const recordsToPush = comparison.wouldUpload.map((item) => item.record);
    const idsToReceive = new Set(comparison.wouldDownload.map((item) => item.record.recordId));
    const conflictCount = (comparison.conflicts || []).length;

    if (!recordsToPush.length && !idsToReceive.size) {
      saveLocalSyncStatus({
        status: "sync-full-noop",
        lastRemoteStatus: "ok",
        lastRemoteCheckAt: syncedAt,
        lastRemoteRevision: remote.serverRevision,
        lastSyncError: ""
      });
      setSyncCheckMessage(conflictCount
        ? `No safe records to sync. ${conflictCount} need review. Nothing changed.`
        : "Everything already looks in sync. Nothing changed.");
      return;
    }

    const reviewText = conflictCount
      ? `\n\n${conflictCount} review item${conflictCount === 1 ? "" : "s"} will be left untouched.`
      : "";
    const receiveText = idsToReceive.size
      ? "\n\nA safety backup of current local data will download before cloud records are received."
      : "";
    const ok = confirm(
      `Run Full Sync?\n\n` +
      `This will send ${recordsToPush.length} safe record${recordsToPush.length === 1 ? "" : "s"} and receive ${idsToReceive.size} safe record${idsToReceive.size === 1 ? "" : "s"}.` +
      reviewText + receiveText
    );
    if (!ok) {
      setSyncCheckMessage("Full Sync cancelled. Nothing changed.");
      return;
    }

    let accepted = [];
    let serverRevision = remote.serverRevision;
    if (recordsToPush.length) {
      setSyncCheckMessage(`Full Sync: sending ${recordsToPush.length} safe record${recordsToPush.length === 1 ? "" : "s"}...`);
      const res = await fetch(`${connection.baseUrl}/v1/records/push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${connection.config.token}`
        },
        cache: "no-store",
        body: JSON.stringify({
          deviceId: getOrCreateDeviceId(),
          records: recordsToPush
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok !== true) {
        throw new Error(data.error || `Worker returned ${res.status}`);
      }
      accepted = Array.isArray(data.accepted) ? data.accepted : [];
      const rejected = Array.isArray(data.rejected) ? data.rejected : [];
      if (accepted.length !== recordsToPush.length || rejected.length) {
        throw new Error(`Worker accepted ${accepted.length} of ${recordsToPush.length} records.`);
      }
      recordsToPush.forEach(rememberSyncRecordMeta);
      clearSyncDirtyForRecordIds(accepted.map((record) => record.recordId));
      serverRevision = data.serverRevision;
    }

    let applied = 0;
    if (idsToReceive.size) {
      setSyncCheckMessage(`Full Sync: receiving ${idsToReceive.size} safe record${idsToReceive.size === 1 ? "" : "s"}...`);
      const remoteFull = await fetchRemoteSyncRecords(connection);
      const recordsToApply = remoteFull.records.filter((record) => idsToReceive.has(record.recordId));
      if (recordsToApply.length !== idsToReceive.size) {
        throw new Error(`Found ${recordsToApply.length} of ${idsToReceive.size} expected cloud records.`);
      }
      downloadJsonPayload(createDataBackupPayload(), "STEELER-Before-full-sync-backup");
      applied = applySyncRecords(recordsToApply);
      recordsToApply.forEach(rememberSyncRecordMeta);
      serverRevision = remoteFull.serverRevision;
    }

    const statusUpdate = {
      status: "sync-full-ok",
      lastRemoteStatus: "ok",
      lastRemoteCheckAt: syncedAt,
      lastRemoteRevision: serverRevision,
      lastSyncAt: syncedAt,
      lastSyncRecordPushCount: accepted.length,
      lastSyncRecordReceiveCount: applied,
      pendingLocalChanges: countPendingLocalChanges(),
      lastSyncError: ""
    };
    if (accepted.length) statusUpdate.lastSyncRecordPushAt = syncedAt;
    if (applied) statusUpdate.lastSyncRecordReceiveAt = syncedAt;
    saveLocalSyncStatus(statusUpdate);
    renderLocalSyncStatus();
    await refreshManualSyncPreview(
      connection,
      `Full Sync complete. Sent ${accepted.length}, received ${applied}. `
    );
  }catch(e){
    saveLocalSyncStatus({
      status: "sync-full-error",
      lastRemoteStatus: "error",
      lastRemoteCheckAt: syncedAt,
      lastSyncError: e && e.message ? e.message : String(e || "Full Sync failed")
    });
    setSyncCheckMessage(`Full Sync failed: ${e && e.message ? e.message : e}`);
  }finally{
    if (btn) btn.disabled = false;
  }
}

async function receiveManualSyncRecords(){
  const btn = document.getElementById("syncReceiveRecordsBtn");
  const connection = getSavedSyncConnection();
  if (connection.error) {
    setSyncCheckMessage(connection.error);
    return;
  }

  if (btn) btn.disabled = true;
  setSyncCheckMessage("Checking which sync records can be received...");
  const receivedAt = nowIso();

  try{
    const localRecords = buildLocalSyncRecords();
    const remote = await fetchRemoteSyncRecordSummary(connection);
    const comparison = compareLocalAndRemoteSyncRecords(localRecords, remote.records);
    renderSyncPreview(comparison, remote.serverRevision);

    const idsToReceive = new Set(comparison.wouldDownload.map((item) => item.record.recordId));
    if ((comparison.conflicts || []).length) {
      setSyncCheckMessage(`${comparison.conflicts.length} possible conflict${comparison.conflicts.length === 1 ? "" : "s"} need review. Safe receive records can still be applied, but conflicted records will be left alone.`);
    }
    if (!idsToReceive.size) {
      saveLocalSyncStatus({
        status: "sync-receive-noop",
        lastRemoteStatus: "ok",
        lastRemoteCheckAt: receivedAt,
        lastRemoteRevision: remote.serverRevision,
        lastSyncError: ""
      });
      setSyncCheckMessage("No sync records need receiving. Nothing changed.");
      return;
    }

    const caution = comparison.wouldUpload.length
      ? `\n\nThis device also has ${comparison.wouldUpload.length} local sync record${comparison.wouldUpload.length === 1 ? "" : "s"} that would upload. Receive Sync Records will NOT send them.`
      : "";
    const ok = confirm(
      `Receive ${idsToReceive.size} sync record${idsToReceive.size === 1 ? "" : "s"} from Cloudflare?` +
      caution + "\n\n" +
      "A safety backup of current local data will download first. This will apply only the cloud records shown in the Safe receive preview. Possible conflicts are left alone."
    );
    if (!ok) {
      setSyncCheckMessage("Receive Sync Records cancelled. Nothing changed.");
      return;
    }

    const secondOk = confirm(
      "Final confirmation\n\n" +
      "This will apply received cloud sync records to this device. It will not send MacBook-local records to Cloudflare.\n\n" +
      "Continue?"
    );
    if (!secondOk) {
      setSyncCheckMessage("Receive Sync Records cancelled. Nothing changed.");
      return;
    }

    setSyncCheckMessage(`Receiving ${idsToReceive.size} sync record${idsToReceive.size === 1 ? "" : "s"}...`);

    const remoteFull = await fetchRemoteSyncRecords(connection);
    const recordsToApply = remoteFull.records.filter((record) => idsToReceive.has(record.recordId));
    if (recordsToApply.length !== idsToReceive.size) {
      throw new Error(`Found ${recordsToApply.length} of ${idsToReceive.size} expected cloud records.`);
    }

    downloadJsonPayload(createDataBackupPayload(), "STEELER-Before-sync-receive-backup");
    const applied = applySyncRecords(recordsToApply);
    recordsToApply.forEach(rememberSyncRecordMeta);
    saveLocalSyncStatus({
      status: "sync-receive-ok",
      lastRemoteStatus: "ok",
      lastRemoteCheckAt: receivedAt,
      lastRemoteRevision: remoteFull.serverRevision,
      lastSyncAt: receivedAt,
      lastSyncRecordReceiveAt: receivedAt,
      lastSyncRecordReceiveCount: applied,
      pendingLocalChanges: countPendingLocalChanges(),
      lastSyncError: ""
    });
    renderLocalSyncStatus();
    setSyncCheckMessage(`Received ${applied} sync record${applied === 1 ? "" : "s"} from Cloudflare. No local records were sent.`);
  }catch(e){
    saveLocalSyncStatus({
      status: "sync-receive-error",
      lastRemoteStatus: "error",
      lastRemoteCheckAt: receivedAt,
      lastSyncError: e && e.message ? e.message : String(e || "Sync receive failed")
    });
    setSyncCheckMessage(`Receive Sync Records failed: ${e && e.message ? e.message : e}`);
  }finally{
    if (btn) btn.disabled = false;
  }
}

function renderCloudBackups(backups){
  const el = document.getElementById("syncCloudBackups");
  if (!el) return;

  if (!Array.isArray(backups) || backups.length === 0) {
    el.innerHTML = `<p class="hint">No cloud backups found yet.</p>`;
    return;
  }

  el.innerHTML = `
    <div class="sync-cloud-backup-list">
      ${backups.map((backup) => {
        const deviceId = String(backup.deviceId || "");
        const deviceText = displayDeviceName(backup.deviceName, deviceId);
        const passageText = backup.passageCount == null
          ? "Passages unknown"
          : `${backup.passageCount} passage${backup.passageCount === 1 ? "" : "s"}`;
        return `
          <div class="sync-cloud-backup-item">
            <div>
              <strong>${escapeHtml(formatSyncStatusTime(backup.createdAt))}</strong>
              <span>${escapeHtml(`${backup.appVersion || "Unknown version"} · ${passageText}`)}</span>
            </div>
            <div>
              <span>${escapeHtml(deviceText)}</span>
              <span>${escapeHtml(`Revision ${backup.serverRevision || 0}`)}</span>
              <button type="button" class="btn btn-secondary sync-download-backup-btn" data-record-id="${escapeHtml(backup.recordId || "")}">Download Backup</button>
              <button type="button" class="btn btn-danger sync-restore-backup-btn" data-record-id="${escapeHtml(backup.recordId || "")}">Restore Backup</button>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
  bindCloudBackupDownloadControls();
  bindCloudBackupRestoreControls();
}

async function refreshCloudBackups(options = {}){
  const btn = document.getElementById("syncRefreshBackupsBtn");
  const connection = getSavedSyncConnection();
  if (connection.error) {
    setSyncCheckMessage(connection.error);
    return;
  }

  if (btn) btn.disabled = true;
  if (!options.silent) setSyncCheckMessage("Checking cloud backup list...");
  const checkedAt = nowIso();

  try{
    const res = await fetch(`${connection.baseUrl}/v1/backups?limit=5`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${connection.config.token}`
      },
      cache: "no-store"
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok !== true) {
      throw new Error(data.error || `Worker returned ${res.status}`);
    }

    const backups = Array.isArray(data.backups) ? data.backups : [];
    saveLocalSyncStatus({
      status: "cloud-backup-list-ok",
      lastRemoteStatus: "ok",
      lastRemoteCheckAt: checkedAt,
      lastRemoteRevision: data.serverRevision,
      lastCloudBackupListAt: checkedAt,
      lastCloudBackupCount: backups.length,
      lastSyncError: ""
    });
    renderCloudBackups(backups);
    if (!options.silent) {
      setSyncCheckMessage(`Found ${backups.length} cloud backup${backups.length === 1 ? "" : "s"}. No data was downloaded or changed.`);
    }
  }catch(e){
    saveLocalSyncStatus({
      status: "cloud-backup-list-error",
      lastRemoteStatus: "error",
      lastRemoteCheckAt: checkedAt,
      lastSyncError: e && e.message ? e.message : String(e || "Cloud backup list failed")
    });
    renderCloudBackups([]);
    setSyncCheckMessage(`Cloud backup list failed: ${e && e.message ? e.message : e}`);
  }finally{
    if (btn) btn.disabled = false;
  }
}

function bindCloudBackupDownloadControls(){
  document.querySelectorAll(".sync-download-backup-btn").forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => downloadCloudBackup(btn.dataset.recordId || "", btn));
  });
}

function bindCloudBackupRestoreControls(){
  document.querySelectorAll(".sync-restore-backup-btn").forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => restoreCloudBackup(btn.dataset.recordId || "", btn));
  });
}

async function downloadCloudBackup(recordId, btn){
  const cleanRecordId = String(recordId || "").trim();
  if (!cleanRecordId) {
    setSyncCheckMessage("Cloud backup record id is missing.");
    return;
  }

  const connection = getSavedSyncConnection();
  if (connection.error) {
    setSyncCheckMessage(connection.error);
    return;
  }

  if (btn) btn.disabled = true;
  setSyncCheckMessage("Downloading cloud backup JSON...");
  const checkedAt = nowIso();

  try{
    const res = await fetch(`${connection.baseUrl}/v1/backups/${encodeURIComponent(cleanRecordId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${connection.config.token}`
      },
      cache: "no-store"
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok !== true || !data.backup) {
      throw new Error(data.error || `Worker returned ${res.status}`);
    }

    downloadJsonPayload(data.backup, "STEELER-Cloud-data-backup");
    saveLocalSyncStatus({
      status: "cloud-backup-download-ok",
      lastRemoteStatus: "ok",
      lastRemoteCheckAt: checkedAt,
      lastRemoteRevision: data.summary?.serverRevision,
      lastCloudBackupDownloadAt: checkedAt,
      lastCloudBackupDownloadRecordId: cleanRecordId,
      lastSyncError: ""
    });
    setSyncCheckMessage("Cloud backup downloaded as a JSON file. Nothing was restored or changed in the app.");
  }catch(e){
    saveLocalSyncStatus({
      status: "cloud-backup-download-error",
      lastRemoteStatus: "error",
      lastRemoteCheckAt: checkedAt,
      lastSyncError: e && e.message ? e.message : String(e || "Cloud backup download failed")
    });
    setSyncCheckMessage(`Cloud backup download failed: ${e && e.message ? e.message : e}`);
  }finally{
    if (btn) btn.disabled = false;
  }
}

function describeDataBackupForRestore(backup, summary = {}){
  const passagesCount = Array.isArray(backup?.data?.passages) ? backup.data.passages.length : 0;
  const exportedAt = backup?.exportedAt || summary.createdAt || "";
  const appVersion = backup?.appVersion || summary.appVersion || "Unknown version";
  const deviceId = backup?.exportedByDeviceId || summary.deviceId || "Unknown device";
  const deviceName = backup?.exportedByDeviceName || summary.deviceName || "";
  const latestPassage = Array.isArray(backup?.data?.passages)
    ? backup.data.passages.reduce((latest, p) => {
        const candidate = p?.updatedAt || p?.createdAt || p?.plan?.date || "";
        if (!candidate) return latest;
        return !latest || String(candidate) > String(latest) ? String(candidate) : latest;
      }, "")
    : "";
  return [
    `Backup date: ${formatSyncStatusTime(exportedAt)}`,
    `App version: ${appVersion}`,
    `Passages: ${passagesCount}`,
    `Device: ${displayDeviceName(deviceName, deviceId)}`,
    latestPassage ? `Latest passage/change: ${latestPassage}` : ""
  ].filter(Boolean).join("\n");
}

async function fetchCloudBackupRecord(recordId){
  const cleanRecordId = String(recordId || "").trim();
  if (!cleanRecordId) throw new Error("Cloud backup record id is missing.");

  const connection = getSavedSyncConnection();
  if (connection.error) throw new Error(connection.error);

  const res = await fetch(`${connection.baseUrl}/v1/backups/${encodeURIComponent(cleanRecordId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${connection.config.token}`
    },
    cache: "no-store"
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok !== true || !data.backup) {
    throw new Error(data.error || `Worker returned ${res.status}`);
  }
  return data;
}

async function restoreCloudBackup(recordId, btn){
  const cleanRecordId = String(recordId || "").trim();
  if (!cleanRecordId) {
    setSyncCheckMessage("Cloud backup record id is missing.");
    return;
  }

  if (btn) btn.disabled = true;
  setSyncCheckMessage("Fetching cloud backup for restore...");
  const checkedAt = nowIso();

  try{
    const data = await fetchCloudBackupRecord(cleanRecordId);
    const backup = data.backup;
    if (!backup || backup.format !== DATA_BACKUP_FORMAT || !backup.data || !Array.isArray(backup.data.passages)) {
      throw new Error("Cloud backup is not a valid STEELER data backup.");
    }

    const details = describeDataBackupForRestore(backup, data.summary || {});
    const firstOk = confirm(
      "Restore this cloud backup?\n\n" +
      details + "\n\n" +
      "This will replace passages, ports, Safety / Emergency Info, DPP templates, saved waypoints, weather abbreviations, fuel settings and app settings on this device.\n\n" +
      "A safety backup of the current local data will download first."
    );
    if (!firstOk) {
      setSyncCheckMessage("Cloud backup restore cancelled. Nothing was changed.");
      return;
    }

    const secondOk = confirm(
      "Final confirmation\n\n" +
      "This is a restore, not a sync. Current local data will be replaced by the selected cloud backup.\n\n" +
      "Continue?"
    );
    if (!secondOk) {
      setSyncCheckMessage("Cloud backup restore cancelled. Nothing was changed.");
      return;
    }

    downloadJsonPayload(createDataBackupPayload(), "STEELER-Before-cloud-restore-backup");
    const restored = restoreDataBackupObject(backup, { skipConfirm: true, successMessage: "Cloud backup restored successfully." });
    if (!restored) throw new Error("Cloud backup restore did not complete.");

    saveLocalSyncStatus({
      status: "cloud-backup-restore-ok",
      lastRemoteStatus: "ok",
      lastRemoteCheckAt: checkedAt,
      lastRemoteRevision: data.summary?.serverRevision,
      lastCloudBackupRestoreAt: checkedAt,
      lastCloudBackupRestoreRecordId: cleanRecordId,
      lastSyncError: ""
    });
    renderLocalSyncStatus();
    setSyncCheckMessage("Cloud backup restored. A safety backup of the previous local data was downloaded first.");
  }catch(e){
    saveLocalSyncStatus({
      status: "cloud-backup-restore-error",
      lastRemoteStatus: "error",
      lastRemoteCheckAt: checkedAt,
      lastSyncError: e && e.message ? e.message : String(e || "Cloud backup restore failed")
    });
    setSyncCheckMessage(`Cloud backup restore failed: ${e && e.message ? e.message : e}`);
  }finally{
    if (btn) btn.disabled = false;
  }
}

function createCloudBackupRecord(backupPayload){
  const timestamp = nowIso();
  const deviceId = getOrCreateDeviceId();
  const deviceName = getDeviceName();
  return {
    recordId: makeStableId("cloud_backup"),
    recordType: "cloud-backup",
    schemaVersion: LOCAL_DATA_SCHEMA_VERSION,
    clientUpdatedAt: timestamp,
    lastChangedDeviceId: deviceId,
    lastChangedDeviceName: deviceName,
    payload: {
      format: "steeler-cloud-backup-record",
      version: 1,
      createdAt: timestamp,
      appVersion: APP_VERSION,
      deviceId,
      deviceName,
      backup: backupPayload
    }
  };
}

async function sendCloudBackup(){
  const btn = document.getElementById("syncSendBackupBtn");
  const connection = getSavedSyncConnection();
  if (connection.error) {
    setSyncCheckMessage(connection.error);
    return;
  }

  const ok = confirm("Send one full STEELER data backup to Cloudflare?\n\nThis uploads a backup copy only. It will not pull, merge, restore or overwrite anything on this device.");
  if (!ok) return;

  if (btn) btn.disabled = true;
  setSyncCheckMessage("Sending one backup copy to Cloudflare...");
  const sentAt = nowIso();

  try{
    const backup = createDataBackupPayload();
    const record = createCloudBackupRecord(backup);
    const res = await fetch(`${connection.baseUrl}/v1/records/push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${connection.config.token}`
      },
      cache: "no-store",
      body: JSON.stringify({
        deviceId: getOrCreateDeviceId(),
        deviceName: getDeviceName(),
        records: [record]
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok !== true) {
      throw new Error(data.error || `Worker returned ${res.status}`);
    }

    const accepted = Array.isArray(data.accepted) ? data.accepted[0] : null;
    if (!accepted || accepted.recordId !== record.recordId) {
      throw new Error("Worker did not accept the backup record.");
    }

    saveLocalSyncStatus({
      status: "cloud-backup-ok",
      lastRemoteStatus: "ok",
      lastRemoteCheckAt: sentAt,
      lastRemoteRevision: data.serverRevision,
      lastCloudBackupAt: sentAt,
      lastCloudBackupRecordId: record.recordId,
      lastCloudBackupRevision: accepted.serverRevision,
      lastSyncError: ""
    });
    renderLocalSyncStatus();
    setSyncCheckMessage(`Cloud backup sent. Server revision ${accepted.serverRevision || data.serverRevision || 0}. No data was pulled or merged.`);
    refreshCloudBackups({ silent: true });
  }catch(e){
    saveLocalSyncStatus({
      status: "cloud-backup-error",
      lastRemoteStatus: "error",
      lastRemoteCheckAt: sentAt,
      lastSyncError: e && e.message ? e.message : String(e || "Cloud backup failed")
    });
    renderLocalSyncStatus();
    setSyncCheckMessage(`Cloud backup failed: ${e && e.message ? e.message : e}`);
  }finally{
    if (btn) btn.disabled = false;
  }
}

function downloadJsonPayload(payload, filenamePrefix){
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const filename = `${filenamePrefix}-${y}${mo}${da}${hh}${mm}.json`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function warnStorageSaveFailed(label, error){
  console.warn(`Failed to save ${label}`, error);
  if (storageSaveWarningsShown.has(label)) return;
  storageSaveWarningsShown.add(label);
  alert(`Warning: ${label} could not be saved on this device. Your latest changes may not be stored. Please make a backup when possible.`);
}

function normaliseMoonPhaseLabel(value) {
  return String(value || "")
    .replace(/^●\s*New/i, "🌑 New")
    .replace(/^◔\s*Wax cres/i, "🌒 Wax cres")
    .replace(/^◐\s*1st qtr/i, "🌓 1st qtr")
    .replace(/^◕\s*Wax gib/i, "🌔 Wax gib")
    .replace(/^○\s*Full/i, "🌕 Full")
    .replace(/^◕\s*Wan gib/i, "🌖 Wan gib")
    .replace(/^◑\s*Last qtr/i, "🌗 Last qtr")
    .replace(/^◔\s*Wan cres/i, "🌘 Wan cres")
    .trim();
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

function saveEmergencyContactFromRow(row, contactId){
  const s = getSafetyInfo();
  if (!Array.isArray(s.emergencyContacts)) s.emergencyContacts = [];

  const wanted = String(contactId || "");
  let contact = s.emergencyContacts.find(c => String(c.id) === wanted);
  if (!contact) {
    contact = createBlankEmergencyContact();
    s.emergencyContacts.push(contact);
  }

  contact.name = (row.querySelector(".sei-ec-row-name")?.value || "").trim();
  contact.tel = (row.querySelector(".sei-ec-row-tel")?.value || "").trim();
  contact.email = (row.querySelector(".sei-ec-row-email")?.value || "").trim();
  contact.notes = (row.querySelector(".sei-ec-row-notes")?.value || "").trim();

  if (!s.emergencyContacts.some(c => c.isDefault)) contact.isDefault = true;
  saveSafetyInfo(s);
  renderEmergencyContactsManager(contact.id);
}

function createEmergencyContactFromSettings(){
  const s = getSafetyInfo();
  if (!Array.isArray(s.emergencyContacts)) s.emergencyContacts = [];
  const contact = createBlankEmergencyContact();
  contact.name = "New Contact";
  contact.isDefault = !s.emergencyContacts.some(c => c.isDefault);
  s.emergencyContacts.push(contact);
  saveSafetyInfo(s);
  renderEmergencyContactsManager(contact.id);
}

function attachSettingsSwipeDelete(row, onDelete, { label = "Delete" } = {}){
  if (!row || row.dataset.settingsSwipeBound === "1") return;
  row.dataset.settingsSwipeBound = "1";
  row.classList.add("st-swipe-row");

  const content = document.createElement("div");
  content.className = "st-swipe-content";
  while (row.firstChild) content.appendChild(row.firstChild);

  const actions = document.createElement("div");
  actions.className = "st-swipe-actions";
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "st-swipe-delete-btn";
  delBtn.textContent = label;
  let deleteTapHandled = false;
  const handleDeleteTap = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation?.();
    if (deleteTapHandled) return;
    deleteTapHandled = true;
    window.setTimeout(() => { deleteTapHandled = false; }, 500);
    row.dataset.justSwiped = "1";
    row.classList.remove("show-delete");
    clearSwipeOffset();
    onDelete?.();
  };
  delBtn.addEventListener("pointerup", handleDeleteTap);
  delBtn.addEventListener("click", handleDeleteTap);
  actions.appendChild(delBtn);
  actions.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation?.();
  });

  row.appendChild(content);
  row.appendChild(actions);

  let startX = 0;
  let startY = 0;
  let isHorizontalSwipe = false;
  let rowWasOpen = false;
  let wheelX = 0;
  let wheelTimer = null;
  const revealPx = 76;
  const lockThresholdPx = 76;
  const commitThresholdPx = 220;

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const setSwipeOffset = (px) => {
    row.classList.add("swipe-dragging");
    row.style.setProperty("--swipe-x", `${px}px`);
  };
  const clearSwipeOffset = () => {
    row.classList.remove("swipe-dragging");
    row.style.removeProperty("--swipe-x");
  };
  const closeOthers = () => {
    document.querySelectorAll(".st-swipe-row.show-delete").forEach(el => {
      if (el !== row) el.classList.remove("show-delete");
    });
  };
  const commitDelete = () => {
    row.dataset.justSwiped = "1";
    row.classList.remove("show-delete");
    clearSwipeOffset();
    onDelete?.();
  };

  row.addEventListener("touchstart", (ev) => {
    if (ev.touches.length !== 1) return;
    if (ev.target.closest("button, input, textarea, select, a")) return;
    startX = ev.touches[0].clientX;
    startY = ev.touches[0].clientY;
    isHorizontalSwipe = false;
    rowWasOpen = row.classList.contains("show-delete");
  }, { passive:true });

  row.addEventListener("touchmove", (ev) => {
    if (ev.touches.length !== 1) return;
    if (ev.target.closest("button, input, textarea, select, a")) return;
    const dx = ev.touches[0].clientX - startX;
    const dy = ev.touches[0].clientY - startY;
    if (!isHorizontalSwipe) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      isHorizontalSwipe = Math.abs(dx) > Math.abs(dy) * 1.2;
    }
    if (!isHorizontalSwipe) return;
    ev.preventDefault();
    closeOthers();
    const base = rowWasOpen ? -revealPx : 0;
    setSwipeOffset(clamp(base + dx, -commitThresholdPx - 16, 18));
  }, { passive:false });

  row.addEventListener("touchend", (ev) => {
    if (!isHorizontalSwipe) return;
    const dx = ev.changedTouches[0].clientX - startX;
    const base = rowWasOpen ? -revealPx : 0;
    const finalX = base + dx;
    clearSwipeOffset();
    if (finalX <= -commitThresholdPx) {
      commitDelete();
    } else if (finalX <= -lockThresholdPx) {
      row.classList.add("show-delete");
      row.dataset.justSwiped = "1";
    } else {
      row.classList.remove("show-delete");
    }
    setTimeout(() => { delete row.dataset.justSwiped; }, 300);
  }, { passive:true });

  row.addEventListener("wheel", (ev) => {
    if (Math.abs(ev.deltaX) <= Math.abs(ev.deltaY)) return;
    if (ev.target.closest("button, input, textarea, select, a")) return;
    ev.preventDefault();
    closeOthers();
    wheelX += ev.deltaX;
    const offset = clamp(-wheelX, -commitThresholdPx - 16, 18);
    setSwipeOffset(offset);
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      clearSwipeOffset();
      if (wheelX >= commitThresholdPx) {
        commitDelete();
      } else if (wheelX >= lockThresholdPx) {
        row.classList.add("show-delete");
        row.dataset.justSwiped = "1";
      } else {
        row.classList.remove("show-delete");
      }
      wheelX = 0;
      setTimeout(() => { delete row.dataset.justSwiped; }, 300);
    }, 120);
  }, { passive:false });
}

function renderEmergencyContactsManager(openId = ""){
  const listEl = document.getElementById("seiEcList");
  if (!listEl) return;

  const contacts = getEmergencyContacts();
  listEl.innerHTML = "";

  contacts.forEach(c => {
    const row = document.createElement("div");
    row.className = "st-list-card st-edit-list-row";
    row.tabIndex = 0;
    if (String(c.id) === String(openId)) row.classList.add("is-editing");

    const left = document.createElement("div");
    left.className = "st-list-card-main";
    left.innerHTML = `
      <div class="st-list-summary">
        <div class="st-list-title">${escapeHtml(c.name || "(unnamed contact)")}${c.isDefault ? ' <span class="st-list-badge">Default</span>' : ''}</div>
        <div class="st-list-meta">${escapeHtml(c.tel || "No telephone saved")}${c.email ? ` · ${escapeHtml(c.email)}` : ""}</div>
      </div>
      <div class="st-row-edit-panel">
        <div class="st-form-grid">
          <label class="st-labelled-field"><span>Contact name</span><input class="sei-ec-row-name" value="${escapeHtml(c.name || "")}"></label>
          <label class="st-labelled-field"><span>Telephone</span><input class="sei-ec-row-tel" value="${escapeHtml(c.tel || "")}"></label>
          <label class="st-labelled-field"><span>Email</span><input class="sei-ec-row-email" value="${escapeHtml(c.email || "")}"></label>
          <label class="st-labelled-field"><span>Relationship / Notes</span><input class="sei-ec-row-notes" value="${escapeHtml(c.notes || "")}"></label>
        </div>
      </div>
    `;

    const right = document.createElement("div");
    right.className = "st-list-card-actions";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn btn-primary btn-small st-row-edit-panel";
    saveBtn.textContent = "Save";
    saveBtn.addEventListener("click", () => saveEmergencyContactFromRow(row, c.id));

    const defBtn = document.createElement("button");
    defBtn.type = "button";
    defBtn.className = "btn btn-secondary btn-small st-row-edit-panel";
    defBtn.textContent = "Make Default";
    defBtn.disabled = !!c.isDefault;
    defBtn.addEventListener("click", () => {
      setDefaultEmergencyContact(c.id);
      renderEmergencyContactsManager(c.id);
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn btn-secondary btn-small st-row-edit-panel";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => {
      if (!confirm(`Delete emergency contact "${c.name || c.tel || "this contact"}"?`)) return;
      deleteEmergencyContact(c.id);
      renderEmergencyContactsManager();
    });

    right.appendChild(saveBtn);
    right.appendChild(defBtn);
    right.appendChild(delBtn);

    row.appendChild(left);
    row.appendChild(right);
    row.addEventListener("click", (ev) => {
      if (ev.target.closest("button, input, textarea, select, a")) return;
      row.classList.toggle("is-editing");
    });
    row.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      if (ev.target.closest("button, input, textarea, select, a")) return;
      ev.preventDefault();
      row.classList.toggle("is-editing");
    });
    attachSettingsSwipeDelete(row, () => {
      if (!confirm(`Delete emergency contact "${c.name || c.tel || "this contact"}"?`)) return;
      deleteEmergencyContact(c.id);
      renderEmergencyContactsManager();
    });
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

		const selectedId = (document.getElementById("seiEcId")?.value || "").trim();
		if (document.getElementById("seiEcName") || selectedId) {
		if (!Array.isArray(s.emergencyContacts) || !s.emergencyContacts.length){
				s.emergencyContacts = [createBlankEmergencyContact()];
				s.emergencyContacts[0].name = "Emergency Contact";
				s.emergencyContacts[0].isDefault = true;
		}
		
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
		}

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
  if (e.target.closest(".entry-del-btn, .passage-copy-btn, .passage-delete-btn, .st-swipe-delete-btn")) return;
  if (e.target.closest("tr.show-delete, .passage-card.show-delete, .st-swipe-row.show-delete")) return;
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
      if (existingObj.privateNotes) out.privateNotes = String(existingObj.privateNotes);
      if (existingObj.portNotes) out.privateNotes = String(existingObj.portNotes);
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

function savePortPrivateNotes(name, notes){
  const n = String(name || "").trim();
  if (!n) return false;
  const idx = knownPorts.findIndex(p => portName(p) === n);
  if (idx < 0) return false;
  const existing = knownPorts[idx];
  const port = ensurePortId(typeof existing === "object" ? { ...existing } : { name: n });
  const clean = String(notes || "").trim();
  if (clean) port.privateNotes = clean;
  else {
    delete port.privateNotes;
    delete port.portNotes;
  }
  knownPorts[idx] = port;
  knownPorts.sort((a,b) => portName(a).localeCompare(portName(b)));
  return true;
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

  updatePassagePortNameReferences(oldN, newN);

  savePorts();
  savePassages();
  refreshPortUI();
  return { ok:true };
}

function updatePassagePortNameReferences(oldN, newN){
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
    console.warn("Port reference update failed", e);
  }
}

function savePortManagerEdit(oldName, values){
  const oldN = String(oldName || "").trim();
  const newN = String(values?.name || "").trim();
  if (!oldN || !newN) return { ok:false, message:"Enter a port name." };
  if (newN !== oldN && knownPorts.some(p => portName(p) === newN)) return { ok:false, message:"That name already exists." };

  const idx = knownPorts.findIndex(p => portName(p) === oldN);
  if (idx < 0) return { ok:false, message:"Could not find that port." };

  const existing = knownPorts[idx];
  const port = ensurePortId(typeof existing === "object" && existing ? { ...existing } : { name: oldN });
  port.name = newN;

  const coordText = String(values?.coordText || "").trim();
  if (coordText) {
    const pair = parseSingleLatLonField(coordText);
    if (!pair) return { ok:false, message:"Please enter latitude and longitude in one field." };
    if (!saneForSteeler(pair.lat, pair.lon)) return { ok:false, message:"Those coordinates look unusual for UK/Channel waters. Please double-check." };
    port.lat = Number(pair.lat);
    port.lon = Number(pair.lon);
  } else {
    delete port.lat;
    delete port.lon;
  }

  const comms = String(values?.commsPilotage || "").trim();
  if (comms) port.commsPilotage = comms;
  else {
    delete port.commsPilotage;
    delete port.comments;
  }

  const privateNotes = String(values?.privateNotes || "").trim();
  if (privateNotes) port.privateNotes = privateNotes;
  else {
    delete port.privateNotes;
    delete port.portNotes;
  }

  knownPorts[idx] = port;
  knownPorts.sort((a,b) => portName(a).localeCompare(portName(b)));
  if (newN !== oldN) {
    recentPorts = recentPorts.map(n => n === oldN ? newN : n);
    updatePassagePortNameReferences(oldN, newN);
    savePassages();
  }
  savePorts();
  refreshPortUI();
  return { ok:true, name:newN };
}

function makeUniquePortName(base = "New Port"){
  const existing = new Set((knownPorts || []).map(p => portName(p).trim()).filter(Boolean));
  if (!existing.has(base)) return base;
  let idx = 2;
  while (existing.has(`${base} ${idx}`)) idx += 1;
  return `${base} ${idx}`;
}

function createNewPortFromSettings(){
  openPortDetailsModal({
    title: "New Port",
    port: { name: makeUniquePortName(), lat: null, lon: null, commsPilotage: "", privateNotes: "" },
    allowLookup: true
  }).then((saved) => {
    if (!saved) return;
    refreshPortUI();
    renderPortsManagerList(saved.name);
  });
}


function renderPortsManagerList(openName = "") {
  const lists = Array.from(new Set([
    ...document.querySelectorAll("[data-ports-manager-list]"),
    document.getElementById("portsManagerList")
  ].filter(Boolean)));
  if (!lists.length) return;

  lists.forEach((list) => {
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
    row.className = "ports-row st-list-card st-edit-list-row";
    row.tabIndex = 0;
    if (String(name) === String(openName)) row.classList.add("is-editing");

    const left = document.createElement("div");
    left.className = "ports-left st-list-card-main";

    const summary = document.createElement("div");
    summary.className = "st-list-summary";

    const title = document.createElement("div");
    title.className = "st-list-title";
    title.textContent = name || "(unnamed port)";

    const meta = document.createElement("div");
    meta.className = "st-list-meta";

    const latV = (item && typeof item === "object" && item.lat != null) ? item.lat : NaN;
    const lonV = (item && typeof item === "object" && item.lon != null) ? item.lon : NaN;
    const hasCoords = !isNaN(latV) && !isNaN(lonV);
    if (hasCoords) {
      const mapsLink = document.createElement("a");
      mapsLink.href = `https://maps.apple.com/?ll=${latV},${lonV}&q=${encodeURIComponent(name)}`;
      mapsLink.target = "_blank";
      mapsLink.rel = "noopener noreferrer";
      mapsLink.textContent = formatDMM(latV, lonV);
      meta.appendChild(mapsLink);
    } else {
      meta.textContent = "No coordinates saved";
    }

    summary.appendChild(title);
    summary.appendChild(meta);

    const editPanel = document.createElement("div");
    editPanel.className = "st-row-edit-panel";

    const nameWrap = document.createElement("div");
    nameWrap.className = "ports-name-wrap";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "ports-name-input";
    nameInput.value = name;

    const nameField = document.createElement("label");
    nameField.className = "st-labelled-field";
    const nameLabel = document.createElement("span");
    nameLabel.textContent = "Port name";
    nameField.appendChild(nameLabel);
    nameField.appendChild(nameInput);

    nameWrap.appendChild(nameField);

    const coords = document.createElement("div");
    coords.className = "ports-coords";

    const coordInput = document.createElement("input");
    coordInput.type = "text";
    coordInput.inputMode = "text";
    coordInput.placeholder = "50°45.085'N, 1°31.628'W";
    coordInput.className = "ports-coord-input ports-coord-combined-input";
    coordInput.value = hasCoords ? formatDMM(latV, lonV) : "";

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
								coordInput.value = formatDMM(hit.lat, hit.lon);
						} catch (e) {
								console.error(e);
								alert("Could not look up that port (offline or blocked). You can enter coordinates manually.");
						}
				});

    const coordField = document.createElement("label");
    coordField.className = "st-labelled-field";
    const coordLabel = document.createElement("span");
    coordLabel.textContent = "Lat / Lon";
    coordField.appendChild(coordLabel);
    coordField.appendChild(coordInput);
    coords.appendChild(coordField);

    coords.appendChild(lookupBtn);

    editPanel.appendChild(nameWrap);
    editPanel.appendChild(coords);

    // Group D (CL-076-11): per-port comments
    const commentsWrap = document.createElement("div");
    commentsWrap.className = "ports-comments";

    const commentsInput = document.createElement("textarea");
    commentsInput.className = "ports-comment-input";
    commentsInput.rows = 2;
    commentsInput.placeholder = "VHF channels, phone numbers, pilotage notes...";
        commentsInput.value = (item && typeof item === "object")
      ? (typeof item.commsPilotage === "string" ? item.commsPilotage : (typeof item.comments === "string" ? item.comments : ""))
      : "";

    const commentsField = document.createElement("label");
    commentsField.className = "st-labelled-field";
    const commentsLabel = document.createElement("span");
    commentsLabel.textContent = "Comms / Pilotage";
    commentsField.appendChild(commentsLabel);
    commentsField.appendChild(commentsInput);
    commentsWrap.appendChild(commentsField);
    editPanel.appendChild(commentsWrap);

    const privateNotesWrap = document.createElement("div");
    privateNotesWrap.className = "ports-comments";

    const privateNotesEditor = document.createElement("div");
    privateNotesEditor.className = "ports-comment-input ports-note-editor";
    privateNotesEditor.contentEditable = "true";
    privateNotesEditor.setAttribute("role", "textbox");
    privateNotesEditor.setAttribute("aria-multiline", "true");
    privateNotesEditor.dataset.placeholder = "Berthing tips, facilities, local reminders...";
    const privateNotesValue = (item && typeof item === "object")
      ? (typeof item.privateNotes === "string" ? item.privateNotes : (typeof item.portNotes === "string" ? item.portNotes : ""))
      : "";
    setEditableNoteText(privateNotesEditor, privateNotesValue);

    const privateNotesField = document.createElement("label");
    privateNotesField.className = "st-labelled-field";
    const privateNotesLabel = document.createElement("span");
    privateNotesLabel.textContent = "Private Notes";
    privateNotesField.appendChild(privateNotesLabel);
    privateNotesField.appendChild(privateNotesEditor);
    privateNotesWrap.appendChild(privateNotesField);

    privateNotesEditor.addEventListener("blur", () => {
      setEditableNoteText(privateNotesEditor, getEditableNoteText(privateNotesEditor));
    });
    privateNotesEditor.addEventListener("paste", (ev) => {
      ev.preventDefault();
      const text = ev.clipboardData?.getData("text/plain") || "";
      document.execCommand("insertText", false, text);
    });
    editPanel.appendChild(privateNotesWrap);

    const saveDetailsBtn = document.createElement("button");
    saveDetailsBtn.type = "button";
    saveDetailsBtn.className = "ports-mini ports-save-details";
    saveDetailsBtn.textContent = "Save Port Details";
    saveDetailsBtn.addEventListener("click", () => {
      const res = savePortManagerEdit(name, {
        name: nameInput.value,
        coordText: coordInput.value,
        commsPilotage: commentsInput.value,
        privateNotes: getEditableNoteText(privateNotesEditor)
      });
      if (!res.ok) {
        alert(res.message || "Could not save port details.");
        return;
      }
      renderPortsManagerList(res.name || nameInput.value || name);
    });
    editPanel.appendChild(saveDetailsBtn);

    left.appendChild(summary);
    left.appendChild(editPanel);

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
    row.addEventListener("click", (ev) => {
      if (ev.target.closest("button, input, textarea, select, a, [contenteditable]")) return;
      row.classList.toggle("is-editing");
    });
    row.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      if (ev.target.closest("button, input, textarea, select, a, [contenteditable]")) return;
      ev.preventDefault();
      row.classList.toggle("is-editing");
    });
    attachSettingsSwipeDelete(row, () => {
      if (!confirm(`Delete port "${name}"?`)) return;
      deletePort(name);
    });
    list.appendChild(row);
  });
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
  const renderSettingsDetail = (card) => {
    if (!card) return;
    if (card.id === "settingsWeatherTidesCard") {
      renderPortsManagerList();
    }
    if (card.id === "settingsDppTemplatesCard") {
      if (dppTemplatesManager) dppTemplatesManager.style.display = "grid";
      importDppTemplateWaypointsToLibrary();
      setSettingsDppLibraryTab(settingsDppLibraryTab);
    }
    if (card.id === "fuelManagementSettingsBlock") {
      renderFuelManagementSettings();
    }
  };
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
      if (open) {
        renderSettingsDetail(card);
        card.scrollIntoView({ behavior: "smooth", block: "start" });
      }
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
  if (dppTemplatesManager) dppTemplatesManager.style.display = "";
  if (dppTemplatesLibrary) dppTemplatesLibrary.hidden = false;
  const dppActions = document.querySelector("#settingsDppTemplatesCard .settings-detail-actions");
  if (dppActions) dppActions.hidden = false;
  if (settingsDppWorkspace) {
    settingsDppWorkspace.hidden = true;
    settingsDppWorkspace.innerHTML = "";
  }
  settingsDppWorkspaceState = null;
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

function normaliseLogEntrySyncFields(entry, passage, fallbackDate, deviceId){
  if (!entry || typeof entry !== "object") return false;
  let changed = false;
  if (!entry.id) {
    entry.id = makeStableId("e");
    changed = true;
  }
  const fallbackCreatedAt = isValidIsoString(entry.time)
    ? new Date(entry.time).toISOString()
    : (isValidIsoString(passage?.createdAt) ? passage.createdAt : fallbackDate);
  if (!isValidIsoString(entry.createdAt)) {
    entry.createdAt = fallbackCreatedAt;
    changed = true;
  }
  if (!isValidIsoString(entry.updatedAt)) {
    entry.updatedAt = entry.createdAt;
    changed = true;
  }
  if (!entry.schemaVersion) {
    entry.schemaVersion = LOCAL_DATA_SCHEMA_VERSION;
    changed = true;
  }
  if (!entry.lastModifiedDeviceId) {
    entry.lastModifiedDeviceId = deviceId;
    changed = true;
  }
  if (entry.deleted === true && !isValidIsoString(entry.deletedAt)) {
    entry.deletedAt = entry.updatedAt;
    changed = true;
  }
  if (entry.deleted !== true && entry.deletedAt) {
    entry.deletedAt = "";
    changed = true;
  }
  return changed;
}

function isDeletedLogEntry(entry){
  return !!(entry && entry.deleted === true);
}

function activeLogEntries(p){
  return (Array.isArray(p?.entries) ? p.entries : []).filter(entry => !isDeletedLogEntry(entry));
}

function markPassageDirty(p, timestamp = nowIso(), reason = "passage-change"){
  if (!p || typeof p !== "object") return;
  p.updatedAt = timestamp;
  p.schemaVersion = LOCAL_DATA_SCHEMA_VERSION;
  p.lastModifiedDeviceId = getOrCreateDeviceId();
  p.syncDirty = true;
  p.syncStatus = "pending";
  p.dirtyAt = timestamp;
  recordLocalSyncChange(reason, timestamp);
}

function markPassageDirtyIfPlanChanged(p, beforePlanJson, reason = "plan-change"){
  if (!p || typeof p !== "object") return;
  const afterPlanJson = stableComparableJson(p.plan || {});
  if (afterPlanJson !== beforePlanJson) markPassageDirty(p, nowIso(), reason);
}

function markLogEntryDirty(entry, p, options = {}){
  if (!entry || typeof entry !== "object") return;
  const timestamp = options.at || nowIso();
  const deviceId = getOrCreateDeviceId();
  if (!entry.id) entry.id = makeStableId("e");
  if (!isValidIsoString(entry.createdAt)) entry.createdAt = isValidIsoString(entry.time) ? new Date(entry.time).toISOString() : timestamp;
  entry.updatedAt = timestamp;
  entry.schemaVersion = LOCAL_DATA_SCHEMA_VERSION;
  entry.lastModifiedDeviceId = deviceId;
  entry.syncDirty = true;
  entry.syncStatus = "pending";
  entry.dirtyAt = timestamp;
  if (options.deleted === true) {
    entry.deleted = true;
    entry.deletedAt = timestamp;
  }
  markPassageDirty(p, timestamp, options.deleted === true ? "log-entry-delete" : "log-entry-change");
}

function normalisePassageSyncFields(passage, deviceId){
  if (!passage || typeof passage !== "object") return false;
  let changed = false;
  const fallbackDate = nowIso();
  if (!passage.id) {
    passage.id = makeStableId("p");
    changed = true;
  }
  if (!isValidIsoString(passage.createdAt)) {
    passage.createdAt = fallbackDate;
    changed = true;
  }
  if (!isValidIsoString(passage.updatedAt)) {
    passage.updatedAt = passage.createdAt;
    changed = true;
  }
  if (!passage.schemaVersion) {
    passage.schemaVersion = LOCAL_DATA_SCHEMA_VERSION;
    changed = true;
  }
  if (!passage.lastModifiedDeviceId) {
    passage.lastModifiedDeviceId = deviceId;
    changed = true;
  }
  if (passage.deleted === true && !isValidIsoString(passage.deletedAt)) {
    passage.deletedAt = passage.updatedAt;
    changed = true;
  }
  if (passage.deleted !== true && passage.deletedAt) {
    passage.deletedAt = "";
    changed = true;
  }
  if (!Array.isArray(passage.entries)) {
    passage.entries = [];
    changed = true;
  }
  passage.entries.forEach((entry) => {
    if (normaliseLogEntrySyncFields(entry, passage, passage.createdAt, deviceId)) changed = true;
  });
  return changed;
}

function normalisePassagesForSync(passagesList){
  if (!Array.isArray(passagesList)) return false;
  const deviceId = getOrCreateDeviceId();
  let changed = false;
  passagesList.forEach((passage) => {
    if (normalisePassageSyncFields(passage, deviceId)) changed = true;
  });
  return changed;
}

function loadPassages() {
  passages = loadLocalStorageJsonItem(
    STORAGE_KEY,
    "passages",
    [],
    Array.isArray
  );
  if (normalisePassagesForSync(passages)) savePassages();
}

function savePassages() {
  try {
    normalisePassagesForSync(passages);
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
  try{
    const deviceId = getOrCreateDeviceId();
    const now = nowIso();
    let changed = false;
    for (const p of knownPorts){
      if (!p || typeof p !== "object") continue;
      if (!isValidIsoString(p.createdAt)) { p.createdAt = now; changed = true; }
      if (!isValidIsoString(p.updatedAt)) { p.updatedAt = p.createdAt; changed = true; }
      if (!p.schemaVersion) { p.schemaVersion = LOCAL_DATA_SCHEMA_VERSION; changed = true; }
      if (!p.lastModifiedDeviceId) { p.lastModifiedDeviceId = deviceId; changed = true; }
    }
    if (changed) savePorts();
  }catch{}

  // Strip any legacy tideId fields from stored ports (no longer used)
  try{ for (const p of knownPorts){ if (p && typeof p === 'object' && 'tideId' in p) delete p.tideId; } }catch{}
}

function savePorts() {
  try {
    const deviceId = getOrCreateDeviceId();
    const now = nowIso();
    let syncTouched = false;
    (knownPorts || []).forEach((p) => {
      if (!p || typeof p !== "object") return;
      ensurePortId(p);
      if (!isValidIsoString(p.createdAt)) p.createdAt = now;
      if (!isValidIsoString(p.updatedAt)) p.updatedAt = now;
      if (!p.schemaVersion) p.schemaVersion = LOCAL_DATA_SCHEMA_VERSION;
      if (!p.lastModifiedDeviceId) p.lastModifiedDeviceId = deviceId;
      if (!p.syncDirty) {
        p.syncDirty = true;
        p.syncStatus = "pending";
        p.dirtyAt = now;
        syncTouched = true;
      }
    });
    const payload = { all: knownPorts, recent: recentPorts };
    saveLocalStorageItem(PORTS_KEY, JSON.stringify(payload), "ports");
    if (syncTouched) recordLocalSyncChange("ports-change", now);
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
  const passage = passages.find(p => p.id === currentPassageId) || null;
  return isDeletedPassage(passage) ? null : passage;
}

function normalisePassageTimeZone(value) {
  const tz = String(value || "").trim();
  return Object.prototype.hasOwnProperty.call(PASSAGE_TIME_ZONES, tz) ? tz : DEFAULT_PASSAGE_TIME_ZONE;
}

function getDevicePassageTimeZone() {
  let deviceZone = "";
  try {
    deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {}

  if (Object.prototype.hasOwnProperty.call(PASSAGE_TIME_ZONES, deviceZone)) return deviceZone;
  if (/^(Europe\/Paris|Europe\/Brussels|Europe\/Berlin|Europe\/Madrid|Europe\/Rome|Europe\/Amsterdam)$/i.test(deviceZone)) return "Europe/Paris";
  if (/^(Europe\/London|Europe\/Dublin|Europe\/Jersey|Europe\/Guernsey|Europe\/Isle_of_Man)$/i.test(deviceZone)) return "Europe/London";
  if (/^(UTC|Etc\/UTC|Etc\/GMT|GMT)$/i.test(deviceZone)) return "UTC";

  const offsetMinutes = -new Date().getTimezoneOffset();
  if (offsetMinutes === 0) return "UTC";
  if (offsetMinutes === 60 || offsetMinutes === 120) return "Europe/Paris";
  return DEFAULT_PASSAGE_TIME_ZONE;
}

function getPassageTimeZone(p) {
  return normalisePassageTimeZone(p?.plan?.timeZone);
}

function getCurrentPassageTimeZone() {
  return getPassageTimeZone(getCurrentPassage());
}

function getPassageTimeZoneLabel(p) {
  const tz = getPassageTimeZone(p);
  return PASSAGE_TIME_ZONES[tz] || tz;
}

function passageDateToday(p = null) {
  return localDateInputValue(new Date(), p ? getPassageTimeZone(p) : getDevicePassageTimeZone());
}

function passageDateTimeNow(p = null) {
  const timeNow = timeOnlyFromIso(localDateTimeInputValue(new Date(), getPassageTimeZone(p)));
  const fallbackDate = getPassageLogDate(p) || passageDateToday(p);
  return normalizeEntryTimeInput(timeNow, "", fallbackDate);
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

function linkifyNoteHtml(value){
  const text = String(value || "");
  if (!text) return "";
  const linkPattern = /\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|(?:https?:\/\/|www\.)[^\s<>"']+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"']*)?)/gi;
  let html = "";
  let lastIndex = 0;
  text.replace(linkPattern, (match, _link, offset) => {
    html += escapeHtml(text.slice(lastIndex, offset));
    const trailing = match.match(/[),.;:!?]+$/)?.[0] || "";
    const clean = trailing ? match.slice(0, -trailing.length) : match;
    const lower = clean.toLowerCase();
    const href = clean.includes("@")
      ? `mailto:${clean}`
      : (lower.startsWith("http://") || lower.startsWith("https://") ? clean : `https://${clean}`);
    html += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" data-note-link="true">${escapeHtml(clean)}</a>${escapeHtml(trailing)}`;
    lastIndex = offset + match.length;
    return match;
  });
  html += escapeHtml(text.slice(lastIndex));
  return html.replace(/\n/g, "<br>");
}

function setEditableNoteText(el, value){
  if (!el) return;
  el.innerHTML = linkifyNoteHtml(value);
  activateNoteLinks(el);
}

function getEditableNoteText(el){
  if (!el) return "";
  return String(el.innerText || "").replace(/\n+$/, "");
}

function activateNoteLinks(root){
  root?.querySelectorAll?.("a[data-note-link]")?.forEach(link => {
    if (link.dataset.noteLinkReady === "true") return;
    link.dataset.noteLinkReady = "true";
    link.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const href = link.getAttribute("href");
      if (!href) return;
      if (href.toLowerCase().startsWith("mailto:")) {
        window.location.href = href;
      } else {
        window.open(href, "_blank", "noopener,noreferrer");
      }
    });
  });
}

function getNoteLinkFromEvent(ev){
  const target = ev?.target?.nodeType === 1 ? ev.target : ev?.target?.parentElement;
  return target?.closest?.("a[data-note-link]") || null;
}

function holdNoteLinkTap(ev){
  const link = getNoteLinkFromEvent(ev);
  if (!link) return;
  ev.stopPropagation();
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
        const beforePlanJson = stableComparableJson(p.plan || {});
        if (typeof planSunriseSet !== "undefined" && planSunriseSet) p.plan.sunriseSet = planSunriseSet.value.trim();
        if (typeof planMoonPhase !== "undefined" && planMoonPhase) p.plan.moonPhase = normaliseMoonPhaseLabel(planMoonPhase.value);
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
        markPassageDirtyIfPlanChanged(p, beforePlanJson, "plan-autosave");
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
const homeSyncNowBtn = document.getElementById("homeSyncNowBtn");
const homeCopyPassageBtn = document.getElementById("homeCopyPassageBtn");
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
const newPortBtn = document.getElementById("newPortBtn");
const importPortsBtn = document.getElementById("importPortsBtn");
const importPortsFileInput = document.getElementById("importPortsFileInput");
const manageDppTemplatesBtn = document.getElementById("manageDppTemplatesBtn");
const newDppTemplateBtn = document.getElementById("newDppTemplateBtn");
const newDppWaypointBtn = document.getElementById("newDppWaypointBtn");
const exportDppTemplatesBtn = document.getElementById("exportDppTemplatesBtn");
const importDppTemplatesBtn = document.getElementById("importDppTemplatesBtn");
const importDppTemplatesFileInput = document.getElementById("importDppTemplatesFileInput");
const dppTemplatesLibrary = document.getElementById("dppTemplatesLibrary");
const dppTemplatesManager = document.getElementById("dppTemplatesManager");
const dppWaypointsManager = document.getElementById("dppWaypointsManager");
const settingsDppPlansTab = document.getElementById("settingsDppPlansTab");
const settingsDppWaypointsTab = document.getElementById("settingsDppWaypointsTab");
const settingsDppWorkspace = document.getElementById("settingsDppWorkspace");
let settingsDppWorkspaceState = null;
let settingsDppLibraryTab = "plans";

const planForm = document.getElementById("planForm");
const planDate = document.getElementById("planDate");
const planTimeZone = document.getElementById("planTimeZone");
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
const logSplitDivider = document.getElementById("logSplitDivider");
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

function savePortDetailsFromFlow(values = {}){
  const name = normalisePortDisplay(values.name);
  if (!isLikelyRealPortName(name)) return { ok: false, message: "Enter a port name." };

  const existing = findPortItemByName(name);
  const port = ensurePortId(existing && typeof existing === "object" ? { ...existing } : { name });
  port.name = name;

  const coordText = String(values.coordText || "").trim();
  const lat = values.lat == null ? NaN : Number(values.lat);
  const lon = values.lon == null ? NaN : Number(values.lon);
  let finalCoords = null;

  if (coordText) {
    finalCoords = parseSingleLatLonField(coordText);
    if (!finalCoords) return { ok: false, message: "Please enter latitude and longitude in one field." };
  } else if (Number.isFinite(lat) && Number.isFinite(lon)) {
    finalCoords = { lat, lon };
  }

  if (finalCoords) {
    if (!saneForSteeler(finalCoords.lat, finalCoords.lon)) {
      return { ok: false, message: "Those coordinates look unusual for UK/Channel waters. Please double-check." };
    }
    port.lat = Number(finalCoords.lat);
    port.lon = Number(finalCoords.lon);
  } else {
    delete port.lat;
    delete port.lon;
  }

  const comms = String(values.commsPilotage || values.comments || "").trim();
  if (comms) port.commsPilotage = comms;
  else {
    delete port.commsPilotage;
    delete port.comments;
  }

  const privateNotes = String(values.privateNotes || values.portNotes || "").trim();
  if (privateNotes) port.privateNotes = privateNotes;
  else {
    delete port.privateNotes;
    delete port.portNotes;
  }

  const idx = knownPorts.findIndex(p => portName(p) === name);
  if (idx >= 0) knownPorts[idx] = port;
  else knownPorts.push(port);
  knownPorts.sort((a,b) => portName(a).localeCompare(portName(b)));
  savePorts();
  rememberPort(name);
  refreshPortUI();
  return { ok: true, port, name };
}

function openPortDetailsModal({ title = "Port Details", port = {}, suggestedDisplayName = "", mapsUrl = "", allowLookup = true } = {}){
  return new Promise((resolve) => {
    const name = normalisePortDisplay(port?.name || "");
    const lat = port?.lat == null ? NaN : Number(port.lat);
    const lon = port?.lon == null ? NaN : Number(port.lon);
    const coordText = Number.isFinite(lat) && Number.isFinite(lon) ? formatDMM(lat, lon) : "";
    const comms = port && typeof port === "object" ? String(port.commsPilotage || port.comments || "") : "";
    const privateNotes = port && typeof port === "object" ? String(port.privateNotes || port.portNotes || "") : "";
    const mapHref = mapsUrl || (Number.isFinite(lat) && Number.isFinite(lon)
      ? `https://maps.apple.com/?ll=${lat},${lon}&q=${encodeURIComponent(name)}`
      : "");

    showModal({
      title,
      hideButtons: true,
      bodyHtml: `
        <label class="st-labelled-field">
          <span>Port name</span>
          <input id="portDetailsName" type="text" value="${escapeHtml(name)}" autocomplete="off">
        </label>
        ${suggestedDisplayName ? `<p class="hint">Suggested match: ${escapeHtml(suggestedDisplayName)}</p>` : ""}
        <div class="ports-coords" style="margin-top:0.65rem">
          <label class="st-labelled-field">
            <span>Lat / Lon</span>
            <input id="portDetailsCoords" type="text" value="${escapeHtml(coordText)}" placeholder="50°45.085'N, 1°31.628'W">
          </label>
          ${allowLookup ? '<button type="button" id="portDetailsLookup" class="ports-mini">Lookup</button>' : ""}
        </div>
        <p id="portDetailsLookupHint" class="hint">${mapHref ? `<a href="${escapeHtml(mapHref)}" target="_blank" rel="noopener noreferrer">Check on Apple Maps</a>` : "Coordinates can be added now or later."}</p>
        <label class="st-labelled-field" style="margin-top:0.65rem">
          <span>Comms / Pilotage</span>
          <textarea id="portDetailsComms" rows="2" placeholder="VHF channels, phone numbers, pilotage notes...">${escapeHtml(comms)}</textarea>
        </label>
        <label class="st-labelled-field" style="margin-top:0.65rem">
          <span>Private Notes</span>
          <textarea id="portDetailsPrivateNotes" rows="2" placeholder="Berthing tips, facilities, local reminders...">${escapeHtml(privateNotes)}</textarea>
        </label>
        <div class="st-action-row" style="margin-top:0.8rem">
          <button type="button" id="portDetailsSave" class="btn">Save Port</button>
          <button type="button" id="portDetailsCancel" class="btn btn-secondary">Not Now</button>
        </div>
      `
    });

    const finish = (value) => {
      closeModal();
      resolve(value);
    };

    document.getElementById("portDetailsLookup")?.addEventListener("click", async () => {
      const lookupName = normalisePortDisplay(document.getElementById("portDetailsName")?.value || "");
      if (!lookupName) {
        alert("Enter a port name first.");
        return;
      }
      const btn = document.getElementById("portDetailsLookup");
      if (btn) btn.disabled = true;
      try {
        const hit = await lookupPortCoordsOnline(lookupName);
        if (!hit) {
          alert(`Couldn’t find a reliable place match for "${lookupName}". You can enter coordinates manually.`);
          return;
        }
        const coordsEl = document.getElementById("portDetailsCoords");
        if (coordsEl) coordsEl.value = formatDMM(hit.lat, hit.lon);
        const hint = document.getElementById("portDetailsLookupHint");
        if (hint) {
          const href = hit.mapsUrl || `https://maps.apple.com/?ll=${hit.lat},${hit.lon}&q=${encodeURIComponent(hit.displayName || lookupName)}`;
          hint.innerHTML = `Suggested match: ${escapeHtml(hit.displayName || lookupName)} · <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">Check on Apple Maps</a>`;
        }
      } catch (err) {
        console.error(err);
        alert("Could not look up that port. You can enter coordinates manually.");
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    document.getElementById("portDetailsSave")?.addEventListener("click", () => {
      const result = savePortDetailsFromFlow({
        name: document.getElementById("portDetailsName")?.value || "",
        coordText: document.getElementById("portDetailsCoords")?.value || "",
        commsPilotage: document.getElementById("portDetailsComms")?.value || "",
        privateNotes: document.getElementById("portDetailsPrivateNotes")?.value || ""
      });
      if (!result.ok) {
        alert(result.message || "Could not save port details.");
        return;
      }
      finish(result.port);
    });

    document.getElementById("portDetailsCancel")?.addEventListener("click", () => finish(null));
  });
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

  const hit = await lookupPortCoordsOnline(n);
  const saved = await openPortDetailsModal({
    title: hit ? "Save Port Details" : "Add Port Manually",
    port: {
      ...(existing && typeof existing === "object" ? existing : { name: n }),
      name: n,
      lat: hit ? hit.lat : existing?.lat,
      lon: hit ? hit.lon : existing?.lon
    },
    suggestedDisplayName: hit?.displayName || "",
    mapsUrl: hit?.mapsUrl || "",
    allowLookup: true
  });

  return saved && portHasCoords(saved)
    ? { name: portName(saved), lat: Number(saved.lat), lon: Number(saved.lon) }
    : null;
}



async function autoComputeSunriseSetForCurrent(){
  const p = getCurrentPassage();
  if (!p) return;

  const date = (p.plan.date || planDate?.value || "").trim();
  const timeZone = normalisePassageTimeZone(planTimeZone?.value || p.plan.timeZone);
  p.plan.timeZone = timeZone;
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

  const sunOrigin = calcSunTimes(date, origin.lat, origin.lon, timeZone);
  if (!sunOrigin) return;

  let sunset = sunOrigin.sunset;
  if (dest && dest !== origin){
    const sunDest = calcSunTimes(date, dest.lat, dest.lon, timeZone);
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

    const riseStr = moonRise ? formatTimeInZone(moonRise, timeZone)
      : (moonOrigin?.alwaysUp ? "Always up" : (moonOrigin?.alwaysDown ? "Always down" : ""));
    const setStr  = moonSet ? formatTimeInZone(moonSet, timeZone) : "";

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

function closeModal(){
  modalOverlay.classList.add("hidden");
  modalBody.innerHTML = "";
  modalOkBtn.onclick = null;
  modalCancelBtn.onclick = null;
  if (modalOkBtn) modalOkBtn.style.display = "";
  if (modalCancelBtn) modalCancelBtn.style.display = "";
}

// --- Backup / Restore ----------------------------------------------

function createDataBackupPayload(){
  normalisePassagesForSync(passages);
  const payload = {
    format: DATA_BACKUP_FORMAT,
    version: 1,
    schemaVersion: LOCAL_DATA_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    exportedByDeviceId: getOrCreateDeviceId(),
    exportedByDeviceName: getDeviceName(),
    data: {
      passages,
      theme: storage.getItem(THEME_KEY) || "day",
      knownPorts: { all: knownPorts, recent: recentPorts },
      safetyInfo: getSafetyInfo(),
      legacyEcSettings: loadEcSettings(),
      dppTemplates: loadDppTemplateStore(),
      dppWaypoints: loadDppWaypointStore(),
      weatherAbbreviations: loadAbbrDb(),
      fuelManagement: loadFuelManagementSettings(),
      settings: {
        logSplitRatio: storage.getItem(LOG_SPLIT_RATIO_KEY) || ""
      },
      localSyncStatus: getLocalSyncSummary()
    }
  };
  return payload;
}

function exportBackup() {
  downloadJsonPayload(createDataBackupPayload(), "STEELER-Data-backup");
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
    version: 2,
    exportedAt: new Date().toISOString(),
    data: {
      dppTemplates: loadDppTemplateStore(),
      dppWaypoints: loadDppWaypointStore()
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

function refreshAfterDataRestore(){
  refreshHomePassageList();
  currentPassageId = getFirstActivePassage()?.id || null;
  loadPassageIntoUI();
  refreshPortUI();
  try { injectSafetyEmergencySettingsBlock(); } catch(e) {}
  try { injectFuelManagementSettingsBlock(); } catch(e) {}
  importDppTemplateWaypointsToLibrary();
  renderDppTemplatesManager();
  renderDppWaypointsManager();
  try { updatePlanSummaryPanel(); } catch(e) {}
  try { renderLocalSyncStatus(); } catch(e) {}
}

function restoreDataBackupObject(obj, options = {}){
  if (!obj || obj.format !== DATA_BACKUP_FORMAT || !obj.data) {
    alert("That file doesn’t look like a STEELER data backup.");
    return false;
  }
  if (!Array.isArray(obj.data.passages)) {
    alert("Backup file is missing expected passage data.");
    return false;
  }

  if (!options.skipConfirm) {
    const ok = confirm(
      "Restore full STEELER data backup?\n\n" +
      "This will replace passages, ports, Safety / Emergency Info, DPP templates, saved waypoints, weather abbreviations, fuel settings and app settings on this device."
    );
    if (!ok) return false;
  }

  passages = obj.data.passages;
  normalisePassagesForSync(passages);
  saveLocalStorageItem(STORAGE_KEY, JSON.stringify(passages), "passages");

  const portsPayload = obj.data.knownPorts || {};
  knownPorts = Array.isArray(portsPayload.all) ? portsPayload.all : [];
  recentPorts = Array.isArray(portsPayload.recent) ? portsPayload.recent : [];
  cleanPortsInPlace();
  savePorts();

  if (obj.data.safetyInfo) {
    saveLocalStorageItem(SAFETY_INFO_KEY, JSON.stringify(obj.data.safetyInfo), "Safety / Emergency Info");
  }
  if (obj.data.legacyEcSettings) {
    saveLocalStorageItem(EC_SETTINGS_KEY, JSON.stringify(obj.data.legacyEcSettings), "legacy emergency contact settings");
  }
  if (obj.data.dppTemplates) saveDppTemplateStore(obj.data.dppTemplates);
  if (obj.data.dppWaypoints) saveDppWaypointStore(obj.data.dppWaypoints);
  if (obj.data.weatherAbbreviations) {
    saveLocalStorageItem(ABBR_DB_KEY, JSON.stringify(obj.data.weatherAbbreviations), "weather abbreviations");
  }
  if (obj.data.fuelManagement) {
    saveFuelManagementSettings(obj.data.fuelManagement);
  }
  if (obj.data.settings && obj.data.settings.logSplitRatio) {
    storage.setItem(LOG_SPLIT_RATIO_KEY, String(obj.data.settings.logSplitRatio));
  }
  applyTheme(obj.data.theme || "day");
  refreshAfterDataRestore();
  alert(options.successMessage || "Full STEELER data backup restored successfully.");
  return true;
}

function restoreLegacyLogbookBackupObject(obj){
  if (!obj || obj.format !== "steeler-logbook-backup" || !obj.data) {
    alert("That file doesn’t look like a STEELER Logbook backup.");
    return false;
  }
  if (!Array.isArray(obj.data.passages)) {
    alert("Backup file is missing expected passage data.");
    return false;
  }
  const hasDppTemplates = !!obj.data.dppTemplates;
  const hasDppWaypoints = !!obj.data.dppWaypoints;
  const ok = confirm(
    "Restore older logbook backup? This will REPLACE the current passages and Safety / Emergency Info on this device if present in the backup." +
    (hasDppTemplates ? " DPP templates in the backup will also replace current DPP templates." : "") +
    (hasDppWaypoints ? " DPP waypoints in the backup will also replace current DPP waypoints." : "") +
    " Ports will be left unchanged."
  );
  if (!ok) return false;

  passages = obj.data.passages;
  normalisePassagesForSync(passages);
  saveLocalStorageItem(STORAGE_KEY, JSON.stringify(passages), "passages");
  if (obj.data.safetyInfo) {
    try {
      saveLocalStorageItem(SAFETY_INFO_KEY, JSON.stringify(obj.data.safetyInfo), "Safety / Emergency Info");
    } catch(e) {
      console.warn("Failed to restore Safety / Emergency Info", e);
      warnStorageSaveFailed("Safety / Emergency Info", e);
    }
  }
  if (hasDppTemplates) saveDppTemplateStore(obj.data.dppTemplates);
  if (hasDppWaypoints) saveDppWaypointStore(obj.data.dppWaypoints);
  applyTheme(obj.data.theme || "day");
  refreshAfterDataRestore();
  alert("Backup restored successfully. Ports were left unchanged.");
  return true;
}

function importBackupFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(reader.result);
      if (obj?.format === DATA_BACKUP_FORMAT) {
        restoreDataBackupObject(obj);
        return;
      }
      restoreLegacyLogbookBackupObject(obj);
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
      const waypointsPayload = obj?.data?.dppWaypoints || obj?.dppWaypoints;
      const valid = obj && obj.format === "steeler-dpp-templates-backup" && (templatesPayload || waypointsPayload);
      if (!valid) {
        alert("That file doesn’t look like a STEELER Detailed Passage Plans backup.");
        return;
      }

      const imported = normaliseDppTemplateStore(templatesPayload).templates;
      const importedWaypoints = normaliseDppWaypointStore(waypointsPayload).waypoints;
      if (!imported.length && !importedWaypoints.length) {
        alert("That Detailed Passage Plans backup does not contain any plans or waypoints.");
        return;
      }

      const ok = confirm("Import Detailed Passage Plans and waypoints? Matching names will be updated; new items will be added.");
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
      importDppTemplateWaypointsToLibrary();

      const waypointStore = loadDppWaypointStore();
      const wpByName = new Map();
      waypointStore.waypoints.forEach(wp => {
        const name = String(wp.name || "").trim().toLowerCase();
        if (name) wpByName.set(name, wp);
      });
      importedWaypoints.forEach(wp => {
        const name = String(wp.name || "").trim();
        if (!name) return;
        const key = name.toLowerCase();
        const existing = wpByName.get(key);
        wpByName.set(key, {
          ...wp,
          id: existing?.id || wp.id || ("dpp_wp_" + Date.now() + "_" + Math.random().toString(36).slice(2)),
          name,
          createdAt: existing?.createdAt || wp.createdAt || new Date().toISOString(),
          updatedAt: wp.updatedAt || new Date().toISOString()
        });
      });
      saveDppWaypointStore({
        version: 1,
        updatedAt: new Date().toISOString(),
        waypoints: Array.from(wpByName.values()).sort((a, b) => a.name.localeCompare(b.name))
      });
      renderDppTemplatesManager();
      renderDppWaypointsManager();
      alert("Detailed Passage Plans and waypoints imported successfully.");
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
newPortBtn?.addEventListener("click", createNewPortFromSettings);
importPortsBtn?.addEventListener("click", () => importPortsFileInput?.click());
importPortsFileInput?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  importPortsBackupFile(file);
  e.target.value = "";
});

exportDppTemplatesBtn?.addEventListener("click", exportDppTemplatesBackup);
newDppTemplateBtn?.addEventListener("click", () => {
  createNewDppTemplateFromSettings();
});
newDppWaypointBtn?.addEventListener("click", () => {
  createNewDppWaypointFromSettings();
});
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
  const ok = confirm(`Delete this passage?\n\n${label}\n\nIt will be hidden from the logbook and the deletion will sync to other devices.`);
  if (!ok) return;

  const timestamp = nowIso();
  p.deleted = true;
  p.deletedAt = timestamp;
  markPassageDirty(p, timestamp, "passage-delete");
  savePassages();

  if (currentPassageId === id) currentPassageId = getFirstActivePassage()?.id || null;

  refreshHomePassageList();
  loadPassageIntoUI();
}

function cloneJsonSafe(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value == null ? fallback : value));
  } catch (e) {
    return fallback;
  }
}

function clonePassagePlanForCopy(plan) {
  const source = plan && typeof plan === "object" ? plan : {};
  const copy = cloneJsonSafe(source, {});
  const now = Date.now();

  copy.transitPorts = Array.isArray(copy.transitPorts)
    ? copy.transitPorts.map(t => t && typeof t === "object"
      ? { ...t, name: String(t.name || "").trim(), portId: t.portId ? String(t.portId) : "" }
      : { name: String(t || "").trim(), portId: "" })
    : [];

  copy.tideStations = Array.isArray(copy.tideStations)
    ? copy.tideStations.map((st, idx) => ({
      ...st,
      id: `ts_${now}_${idx}_${Math.random().toString(36).slice(2)}`,
      events: Array.isArray(st?.events) ? cloneJsonSafe(st.events, []) : []
    }))
    : [];

  copy.dailySummaries = Array.isArray(copy.dailySummaries)
    ? copy.dailySummaries.map((day, idx) => ({
      ...day,
      id: `ds_${now}_${idx}_${Math.random().toString(36).slice(2)}`
    }))
    : [];

  if (typeof cloneDetailedPassagePlan === "function") {
    copy.detailed = cloneDetailedPassagePlan(copy.detailed, { regenerateIds: true });
    copy.detailedLegs = Array.isArray(copy.detailedLegs)
      ? copy.detailedLegs.map(d => cloneDetailedPassagePlan(d, { regenerateIds: true }))
      : [];
  } else {
    copy.detailed = cloneJsonSafe(copy.detailed, { waypoints: [], hazards: "", portsOfRefuge: "", crewWelfare: "" });
    copy.detailedLegs = Array.isArray(copy.detailedLegs) ? cloneJsonSafe(copy.detailedLegs, []) : [];
  }
  copy.detailedLegIndex = 0;

  return {
    ...copy,
    date: copy.date || passageDateToday({ plan: { timeZone: copy.timeZone } }),
    timeZone: normalisePassageTimeZone(copy.timeZone),
    from: copy.from || "",
    to: copy.to || "",
    transitPorts: copy.transitPorts,
    vessel: copy.vessel || "STEELER",
    skipper: copy.skipper || "",
    crew: copy.crew || "",
    sunriseSet: copy.sunriseSet || "",
    moonPhase: copy.moonPhase || "",
    moonRiseSet: copy.moonRiseSet || "",
    tidalCoeff: copy.tidalCoeff || "",
    tideStations: copy.tideStations,
    currents: copy.currents || "",
    weather: copy.weather || "",
    comms: copy.comms || "",
    engineHoursStart: copy.engineHoursStart || "",
    fuelStartPercent: copy.fuelStartPercent || "",
    dailySummaries: copy.dailySummaries,
    detailed: copy.detailed || { waypoints: [], hazards: "", portsOfRefuge: "", crewWelfare: "" },
    detailedLegs: copy.detailedLegs,
    detailedLegIndex: copy.detailedLegIndex
  };
}

function copyPassagePlanById(id) {
  const source = passages.find(p => p.id === id);
  if (!source || !source.plan) return;
  const route = getRouteNames(source).join(" → ") || "this passage";
  const ok = confirm(`Copy the passage plan for ${route}?\n\nA new planned passage will be created with the same plan details, ready to edit. Log entries and completion state will not be copied.`);
  if (!ok) return;

  const copied = {
    id: newId("p"),
    flags: { engineStart: false, slip: false, dock: false },
    plan: clonePassagePlanForCopy(source.plan),
    entries: [],
    finish: {
      engineHoursEnd: "",
      fuelEndPercent: "",
      notes: "",
      shutdownLogged: false
    },
    createdAt: new Date().toISOString()
  };

  ensureAutoTideStations(copied);
  ensureDetailedPassagePlans(copied);
  passages.unshift(copied);
  currentPassageId = copied.id;
  savePassages();
  refreshHomePassageList();
  loadPassageIntoUI();
  switchToTab("planTab");
}

function attachSwipeToCard(card, passageId) {
  let startX = 0;
  let startY = 0;
  let cardWasOpen = false;
  let isHorizontalSwipe = false;
  let wheelX = 0;
  let wheelTimer = null;
  const revealPx = 92;
  const lockThresholdPx = 84;
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

function selectHomePassage(passage, { openLog = false } = {}) {
  if (!passage) return;
  currentPassageId = passage.id;
  loadPassageIntoUI();
  refreshHomePassageList();
  if (openLog) switchToTab("logTab");
}

function refreshHomePassageList() {
  homePassageList.innerHTML = "";
  if (homeCopyPassageBtn) homeCopyPassageBtn.disabled = !currentPassageId || !passages.some(p => p.id === currentPassageId && !isDeletedPassage(p));

  const visibleSourcePassages = activePassages();

  if (visibleSourcePassages.length === 0) {
    const p = document.createElement("p");
    p.textContent = "No passages yet. Tap “+ New Passage” to get started.";
    p.className = "hint";
    homePassageList.appendChild(p);
    if (homePassageCount) homePassageCount.textContent = "0 passages";
    return;
  }

  const visiblePassages = visibleSourcePassages
    .filter(passage => passageMatchesHomeFilter(passage) && passageMatchesHomeSearch(passage))
    .slice()
    .sort((a, b) => {
      const av = getPassageDateValue(a);
      const bv = getPassageDateValue(b);
      return homePassageSortMode === "oldest" ? av.localeCompare(bv) : bv.localeCompare(av);
    });

  if (homePassageCount) {
    const totalEntries = visibleSourcePassages.reduce((sum, p) => sum + activeLogEntries(p).length, 0);
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
    const entriesCount = activeLogEntries(passage).length;

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
    chevron.title = "Open log";
    chevron.setAttribute("role", "button");
    chevron.setAttribute("aria-label", "Open log");
    chevron.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectHomePassage(passage, { openLog: true });
    });

    const main = document.createElement("div");
    main.className = "passage-card-main";
    main.appendChild(left);
    main.appendChild(summary);
    main.appendChild(chevron);

    const actions = document.createElement("div");
    actions.className = "passage-card-actions";

    const copy = document.createElement("button");
    copy.className = "passage-copy-btn";
    copy.innerHTML = copySvg();
    copy.title = "Copy passage plan";
    copy.setAttribute("aria-label", "Copy passage plan");

    copy.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      copyPassagePlanById(passage.id);
    });

    const del = document.createElement("button");
    del.className = "passage-delete-btn";
    del.innerHTML = deleteBinSvg();
    del.title = "Delete passage";
    del.setAttribute("aria-label", "Delete passage");
    
    del.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      deletePassageById(passage.id);
    });

    actions.appendChild(copy);
    actions.appendChild(del);
    card.appendChild(main);
    card.appendChild(actions);

    let homeCardLongPressTimer = null;
    const clearHomeCardLongPress = () => {
      clearTimeout(homeCardLongPressTimer);
      homeCardLongPressTimer = null;
    };

    card.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".passage-copy-btn, .passage-delete-btn")) return;
      clearHomeCardLongPress();
      homeCardLongPressTimer = setTimeout(() => {
        card.dataset.openedByLongPress = "1";
        selectHomePassage(passage, { openLog: true });
        setTimeout(() => { delete card.dataset.openedByLongPress; }, 450);
      }, 650);
    });
    card.addEventListener("pointerup", clearHomeCardLongPress);
    card.addEventListener("pointerleave", clearHomeCardLongPress);
    card.addEventListener("pointercancel", clearHomeCardLongPress);
    card.addEventListener("dblclick", (e) => {
      if (e.target.closest(".passage-copy-btn, .passage-delete-btn")) return;
      e.preventDefault();
      e.stopPropagation();
      selectHomePassage(passage, { openLog: true });
    });

    card.addEventListener("click", (e) => {
      if (card.dataset.justSwiped === "1") return;
      if (card.dataset.openedByLongPress === "1") return;
      if (e.target.closest(".passage-copy-btn, .passage-delete-btn")) return;
      selectHomePassage(passage, { openLog: false });
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
  if (mode === "split") applyLogSplitRatio(getStoredLogSplitRatio());
  if (btn) setActiveViewButton(btn);
}

function clampLogSplitRatio(ratio) {
  const value = Number(ratio);
  if (!Number.isFinite(value)) return 42;
  return Math.min(65, Math.max(32, value));
}

function getStoredLogSplitRatio() {
  return clampLogSplitRatio(storage.getItem(LOG_SPLIT_RATIO_KEY) || 42);
}

function applyLogSplitRatio(ratio) {
  if (!logLayout) return;
  logLayout.style.setProperty("--log-plan-width", `${clampLogSplitRatio(ratio)}%`);
}

function setupLogSplitDivider() {
  if (!logLayout || !logSplitDivider) return;

  const updateFromClientX = (clientX, persist = true) => {
    const rect = logLayout.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = clampLogSplitRatio(((clientX - rect.left) / rect.width) * 100);
    applyLogSplitRatio(ratio);
    if (persist) storage.setItem(LOG_SPLIT_RATIO_KEY, String(ratio));
  };

  logSplitDivider.addEventListener("pointerdown", (e) => {
    if (!logLayout.classList.contains("split")) return;
    e.preventDefault();
    logLayout.classList.add("is-resizing");
    logSplitDivider.setPointerCapture?.(e.pointerId);

    const onMove = (moveEvent) => updateFromClientX(moveEvent.clientX, true);
    const onEnd = () => {
      logLayout.classList.remove("is-resizing");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd, { once: true });
    window.addEventListener("pointercancel", onEnd, { once: true });
  });

  logSplitDivider.addEventListener("keydown", (e) => {
    if (!logLayout.classList.contains("split")) return;
    const step = e.shiftKey ? 5 : 2;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const next = getStoredLogSplitRatio() + (e.key === "ArrowRight" ? step : -step);
      const ratio = clampLogSplitRatio(next);
      applyLogSplitRatio(ratio);
      storage.setItem(LOG_SPLIT_RATIO_KEY, String(ratio));
    }
  });

  applyLogSplitRatio(getStoredLogSplitRatio());
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

function getPassageLogDate(p) {
  return String(p?.plan?.date || p?.createdAt || "").slice(0, 10);
}

function getLogEntrySortKey(p, entry) {
  const raw = String(entry?.time || "").trim();
  if (!raw) return "";
  const passageDate = getPassageLogDate(p);
  const timeOnly = timeOnlyFromIso(raw);
  if (passageDate && /^\d{2}:\d{2}$/.test(timeOnly)) return `${passageDate}T${timeOnly}`;
  return raw;
}

function compareLogEntriesForPassage(p) {
  return (a, b) => {
    const byTime = getLogEntrySortKey(p, a).localeCompare(getLogEntrySortKey(p, b));
    if (byTime !== 0) return byTime;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  };
}

function logEntrySortDate(p, entry) {
  const key = getLogEntrySortKey(p, entry);
  const d = key ? new Date(key) : new Date(0);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
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
  const entries = activeLogEntries(p);
  return entries.filter(e => typeof e?.notes === "string" && e.notes.toLowerCase().startsWith("shutdown")).length;
}

function getCurrentLegIndex(p) {
  const legs = getLegCount(p);
  const done = countShutdowns(p);
  return Math.min(done, Math.max(0, legs - 1));
}

function ensureEntryLegs(p) {
  if (!p || !Array.isArray(p.entries)) return;
  const entries = activeLogEntries(p);
  if (entries.every(e => typeof e.leg === "number")) return;
  const sorted = entries.slice().sort(compareLogEntriesForPassage(p));
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
  const entries = activeLogEntries(p);
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
  const entries = activeLogEntries(p);
  const legEntries = entries.filter(e => (typeof e.leg === "number" ? e.leg : 0) === legIdx);
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
      <span class="log-status-label">Current Passage / Leg</span>
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
    <button type="button" class="st-metric-chip log-status-link" data-status-nav="latest-log"><span>Entries</span><strong>${legEntries.length}</strong></button>
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
  const deviceTimeZone = getDevicePassageTimeZone();
  const today = passageDateToday({ plan: { timeZone: deviceTimeZone } });

  const passage = {
    id,
    flags: { engineStart: false, slip: false, dock: false },
    plan: {
      date: today,
      timeZone: deviceTimeZone,
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
  p.plan.timeZone = getPassageTimeZone(p);
  planDate.value = p.plan.date || "";
  if (planTimeZone) planTimeZone.value = p.plan.timeZone;
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
    const moonPhaseValue = normaliseMoonPhaseLabel(p.plan.moonPhase || (d ? getMoonPhaseLabel(d) : ""));
    planMoonPhase.value = moonPhaseValue;
    if (p.plan.moonPhase && p.plan.moonPhase !== moonPhaseValue) p.plan.moonPhase = moonPhaseValue;
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
      const beforePlanJson = stableComparableJson(p.plan || {});
      p.plan.tideStations = readTideStationsFromForm();
      try { ensureAutoTideStations(p); } catch {}
      markPassageDirtyIfPlanChanged(p, beforePlanJson, "plan-tides-change");
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
    const dayId = d.id || ("ds_" + Date.now() + "_" + Math.random().toString(36).slice(2));
    row.className = "daily-summary-row";
    row.dataset.index = index;
    row.dataset.id = dayId;

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
      id: row.dataset.id || ("ds_" + Date.now() + "_" + Math.random().toString(36).slice(2)),
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
  syncDppWaypointsFromDetailed(template.detailed);
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
  if (patch && patch.detailed) syncDppWaypointsFromDetailed(patch.detailed);
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

function normaliseDppWaypointStore(store){
  const source = store && typeof store === "object" ? store : {};
  const rawWaypoints = Array.isArray(source.waypoints) ? source.waypoints : [];

  return {
    version: 1,
    updatedAt: String(source.updatedAt || ""),
    waypoints: rawWaypoints
      .map((wp) => {
        const coordsRaw = wp?.coordsText || wp?.coords || "";
        const parsed = parseDetailedWaypointCoords(coordsRaw);
        const lat = wp?.lat == null ? NaN : Number(wp.lat);
        const lon = wp?.lon == null ? NaN : Number(wp.lon);
        const cleanLat = parsed ? parsed.lat : (Number.isFinite(lat) ? lat : null);
        const cleanLon = parsed ? parsed.lon : (Number.isFinite(lon) ? lon : null);
        return {
          id: String(wp?.id || "").trim(),
          name: String(wp?.name || "").trim(),
          coordsText: parsed ? formatDetailedWaypointCoords(parsed.lat, parsed.lon) : String(coordsRaw || formatDetailedWaypointCoords(cleanLat, cleanLon) || "").trim(),
          lat: cleanLat,
          lon: cleanLon,
          notes: String(wp?.notes || "").trim(),
          createdAt: String(wp?.createdAt || ""),
          updatedAt: String(wp?.updatedAt || "")
        };
      })
      .filter((wp) => wp.id && wp.name)
  };
}

function loadDppWaypointStore(){
  const fallback = { version: 1, updatedAt: "", waypoints: [] };
  const stored = loadLocalStorageJsonItem(
    DPP_WAYPOINTS_KEY,
    "DPP waypoints",
    fallback,
    (v) => v && typeof v === "object"
  );
  return normaliseDppWaypointStore(stored);
}

function saveDppWaypointStore(store){
  const clean = normaliseDppWaypointStore(store);
  clean.updatedAt = new Date().toISOString();
  return saveLocalStorageItem(DPP_WAYPOINTS_KEY, JSON.stringify(clean), "DPP waypoints");
}

function getDppWaypoints(){
  return loadDppWaypointStore().waypoints;
}

function getDppWaypointById(id){
  const wanted = String(id || "");
  return getDppWaypoints().find((wp) => String(wp.id) === wanted) || null;
}

function saveDppWaypoint(data){
  const name = String(data?.name || "").trim();
  if (!name) throw new Error("Please enter a waypoint name.");

  const coordsRaw = String(data?.coordsText || "").trim();
  const parsed = parseDetailedWaypointCoords(coordsRaw);
  const now = new Date().toISOString();
  const store = loadDppWaypointStore();
  const existing = data?.id
    ? store.waypoints.find((wp) => String(wp.id) === String(data.id))
    : store.waypoints.find((wp) => String(wp.name || "").trim().toLowerCase() === name.toLowerCase());

  const waypoint = {
    id: existing?.id || data?.id || ("dpp_wp_" + Date.now() + "_" + Math.random().toString(36).slice(2)),
    name,
    coordsText: parsed ? formatDetailedWaypointCoords(parsed.lat, parsed.lon) : coordsRaw,
    lat: parsed ? parsed.lat : null,
    lon: parsed ? parsed.lon : null,
    notes: String(data?.notes || "").trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (existing) {
    store.waypoints = store.waypoints.map((wp) => wp.id === existing.id ? waypoint : wp);
  } else {
    store.waypoints.push(waypoint);
  }

  store.waypoints.sort((a, b) => a.name.localeCompare(b.name));
  saveDppWaypointStore(store);
  return waypoint;
}

function deleteDppWaypoint(id){
  const wanted = String(id || "");
  const store = loadDppWaypointStore();
  const before = store.waypoints.length;
  store.waypoints = store.waypoints.filter((wp) => String(wp.id) !== wanted);
  if (store.waypoints.length === before) return false;
  saveDppWaypointStore(store);
  return true;
}

function savedWaypointToDppWaypoint(saved){
  const lat = saved?.lat == null ? NaN : Number(saved.lat);
  const lon = saved?.lon == null ? NaN : Number(saved.lon);
  return {
    id: "wp_" + Date.now() + "_" + Math.random().toString(36).slice(2),
    time: "",
    name: saved?.name || "",
    coordsText: saved?.coordsText || formatDetailedWaypointCoords(saved?.lat, saved?.lon),
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    distToNext: "",
    manualDistToNext: "",
    cogToNext: "",
    plannedSpeed: "",
    tideKt: "",
    sogToNext: "",
    timeToNext: "",
    fuelToNext: "",
    includeInEcSms: true
  };
}

function getCurrentRoutePortWaypointOptions(p = getCurrentPassage()){
  if (!p || !p.plan) return [];
  const points = [];
  const addPoint = (role, name, portId = "") => {
    const cleanName = String(name || "").trim();
    if (!cleanName) return;
    const port = (portId ? findPortItemById(portId) : null) || findPortItemByName(cleanName);
    const coords = portHasCoords(port) ? { lat: Number(port.lat), lon: Number(port.lon) } : getPortCoords(cleanName);
    const lat = coords && Number.isFinite(Number(coords.lat)) ? Number(coords.lat) : null;
    const lon = coords && Number.isFinite(Number(coords.lon)) ? Number(coords.lon) : null;
    points.push({
      id: `${role.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${points.length}`,
      role,
      name: cleanName,
      portId: port?.id || portId || "",
      lat,
      lon,
      coordsText: Number.isFinite(lat) && Number.isFinite(lon) ? formatDetailedWaypointCoords(lat, lon) : ""
    });
  };

  addPoint("Origin", p.plan.from, p.plan.fromPortId);
  normaliseTransitPorts(p).forEach((tp, idx) => {
    addPoint(`Transit Port ${idx + 1}`, tp?.name || "", tp?.portId || "");
  });
  addPoint("Destination", p.plan.to, p.plan.toPortId);

  return points;
}

function routePortToDppWaypoint(point){
  const lat = point?.lat == null ? NaN : Number(point.lat);
  const lon = point?.lon == null ? NaN : Number(point.lon);
  return {
    id: "wp_" + Date.now() + "_" + Math.random().toString(36).slice(2),
    time: "",
    name: point?.name || "",
    coordsText: point?.coordsText || formatDetailedWaypointCoords(lat, lon),
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    distToNext: "",
    manualDistToNext: "",
    cogToNext: "",
    plannedSpeed: "",
    tideKt: "",
    sogToNext: "",
    timeToNext: "",
    fuelToNext: "",
    includeInEcSms: true
  };
}

function syncDppWaypointsFromDetailed(detailed){
  const clean = normaliseDetailedPassagePlan(detailed);
  let addedOrUpdated = 0;

  (clean.waypoints || []).forEach((wp) => {
    const name = String(wp?.name || "").trim();
    if (!name) return;

    const coordsText = String(wp?.coordsText || formatDetailedWaypointCoords(wp?.lat, wp?.lon) || "").trim();
    const existing = getDppWaypoints().find((saved) =>
      String(saved.name || "").trim().toLowerCase() === name.toLowerCase()
    );

    try {
      saveDppWaypoint({
        id: existing?.id || "",
        name,
        coordsText,
        notes: existing?.notes || ""
      });
      addedOrUpdated += 1;
    } catch (err) {
      console.warn("Could not add DPP waypoint to saved waypoint library", err);
    }
  });

  return addedOrUpdated;
}

function importDppTemplateWaypointsToLibrary(){
  let count = 0;
  getDppTemplates().forEach((tpl) => {
    count += syncDppWaypointsFromDetailed(tpl.detailed);
  });
  if (count && settingsDppLibraryTab === "waypoints") renderDppWaypointsManager();
  return count;
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
      manualDistToNext: (row.querySelector(".template-wp-distance-override")?.value || "").trim(),
      cogToNext: "",
      plannedSpeed: (row.querySelector(".template-wp-speed")?.value || "").trim(),
      tideKt: (row.querySelector(".template-wp-tide")?.value || "").trim(),
      sogToNext: "",
      timeToNext: "",
      fuelToNext: "",
      includeInEcSms: row.querySelector(".template-wp-include-sms")?.checked !== false
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
      <td><input type="number" step="0.1" inputmode="decimal" class="template-wp-distance-override" value="${escapeHtml(wp.manualDistToNext || "")}" placeholder="${wp.distToNext !== "" ? escapeHtml(String(wp.distToNext)) : "NM"}"></td>
      <td><input type="number" step="0.1" inputmode="decimal" class="template-wp-speed" value="${escapeHtml(wp.plannedSpeed || "")}" placeholder="kt"></td>
      <td><input type="number" step="0.1" inputmode="decimal" class="template-wp-tide" value="${escapeHtml(wp.tideKt || "")}" placeholder="+/- kt"></td>
      <td class="dpp-sms-cell"><input type="checkbox" class="template-wp-include-sms" title="Include this waypoint in the EC SMS routing" ${wp.includeInEcSms === false ? "" : "checked"}></td>
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
        <table class="log-table template-dpp-table" style="min-width:840px;">
          <thead>
            <tr>
              <th>Waypoint</th>
              <th>WP Lat/Lon</th>
              <th>NM</th>
              <th>STW kt</th>
              <th>Tide kt</th>
              <th>SMS</th>
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
      manualDistToNext: "",
      cogToNext: "",
      plannedSpeed: "",
      tideKt: "",
      sogToNext: "",
      timeToNext: "",
      fuelToNext: ""
    });
    renderDppTemplateEditorRows(active);
  });
}

function uniqueDppTemplateName(baseName = "New Plan"){
  const existing = new Set(getDppTemplates().map(tpl => String(tpl.name || "").trim().toLowerCase()).filter(Boolean));
  let name = baseName;
  let idx = 2;
  while (existing.has(name.toLowerCase())) {
    name = `${baseName} ${idx}`;
    idx += 1;
  }
  return name;
}

function createNewDppTemplateFromSettings(){
  const tpl = saveDppTemplate(uniqueDppTemplateName("New Plan"), createBlankDetailedPassagePlan());
  renderDppTemplatesManager();
  openSettingsDppWorkspace(tpl.id);
}

function setSettingsDppLibraryTab(tab){
  settingsDppLibraryTab = tab === "waypoints" ? "waypoints" : "plans";
  settingsDppPlansTab?.classList.toggle("active", settingsDppLibraryTab === "plans");
  settingsDppWaypointsTab?.classList.toggle("active", settingsDppLibraryTab === "waypoints");
  if (dppTemplatesManager) dppTemplatesManager.hidden = settingsDppLibraryTab !== "plans";
  if (dppWaypointsManager) dppWaypointsManager.hidden = settingsDppLibraryTab !== "waypoints";
  if (newDppTemplateBtn) newDppTemplateBtn.hidden = settingsDppLibraryTab !== "plans";
  if (newDppWaypointBtn) newDppWaypointBtn.hidden = settingsDppLibraryTab !== "waypoints";
  if (exportDppTemplatesBtn) exportDppTemplatesBtn.hidden = settingsDppLibraryTab !== "plans";
  if (importDppTemplatesBtn) importDppTemplatesBtn.hidden = settingsDppLibraryTab !== "plans";
  if (settingsDppLibraryTab === "plans") renderDppTemplatesManager();
  if (settingsDppLibraryTab === "waypoints") renderDppWaypointsManager();
}

settingsDppPlansTab?.addEventListener("click", () => setSettingsDppLibraryTab("plans"));
settingsDppWaypointsTab?.addEventListener("click", () => setSettingsDppLibraryTab("waypoints"));

function createNewDppWaypointFromSettings(){
  setSettingsDppLibraryTab("waypoints");
  openDppWaypointDialog();
}

function openDppWaypointDialog(existingId = ""){
  const existing = existingId ? getDppWaypointById(existingId) : null;
  showModal({
    title: existing ? "Edit Waypoint" : "New Waypoint",
    okText: "Save WP",
    bodyHtml: `
      <div class="st-stack">
        <label class="st-labelled-field">
          <span>WP name</span>
          <input type="text" id="dppWaypointDialogName" value="${escapeHtml(existing?.name || "")}" placeholder="Waypoint name">
        </label>
        <label class="st-labelled-field">
          <span>Lat / Lon</span>
          <input type="text" id="dppWaypointDialogCoords" value="${escapeHtml(existing?.coordsText || "")}" placeholder="50º45.123'N, 001º18.456'W or 50.752, -1.308">
        </label>
        <label class="st-labelled-field">
          <span>Notes</span>
          <textarea id="dppWaypointDialogNotes" rows="3" placeholder="Optional notes">${escapeHtml(existing?.notes || "")}</textarea>
        </label>
      </div>
    `,
    onOk: () => {
      const name = (modalBody.querySelector("#dppWaypointDialogName")?.value || "").trim();
      const coordsText = (modalBody.querySelector("#dppWaypointDialogCoords")?.value || "").trim();
      const notes = (modalBody.querySelector("#dppWaypointDialogNotes")?.value || "").trim();
      if (!name) {
        alert("Please enter a waypoint name.");
        return false;
      }
      const parsed = coordsText ? parseDetailedWaypointCoords(coordsText) : null;
      if (coordsText && !parsed) {
        alert("Please enter Lat / Lon in one of the supported formats.");
        return false;
      }
      const wp = saveDppWaypoint({
        id: existing?.id || "",
        name,
        coordsText,
        notes
      });
      setSettingsDppLibraryTab("waypoints");
      renderDppWaypointsManager(wp.id);
    }
  });
  window.setTimeout(() => modalBody.querySelector("#dppWaypointDialogName")?.focus(), 50);
}

function uniqueDppWaypointName(baseName = "New WP"){
  const existing = new Set(getDppWaypoints().map(wp => String(wp.name || "").trim().toLowerCase()).filter(Boolean));
  let name = baseName;
  let idx = 2;
  while (existing.has(name.toLowerCase())) {
    name = `${baseName} ${idx}`;
    idx += 1;
  }
  return name;
}

function renderDppWaypointsManager(openId = ""){
  if (!dppWaypointsManager) return;

  const waypoints = getDppWaypoints();
  if (!waypoints.length) {
    dppWaypointsManager.innerHTML = '<p class="hint">No saved waypoints yet.</p>';
    return;
  }

  dppWaypointsManager.innerHTML = waypoints.map((wp) => {
    const isOpen = String(wp.id) === String(openId);
    return `
      <div class="dpp-waypoint-manager-row st-list-card st-edit-list-row${isOpen ? " open" : ""}" tabindex="0" data-dpp-waypoint-id="${escapeHtml(wp.id)}">
        <div class="st-list-card-main">
          <div class="st-list-summary">
            <div class="st-list-title">${escapeHtml(wp.name || "Untitled WP")}</div>
            <div class="st-list-meta">${escapeHtml(wp.coordsText || "No position stored")}${wp.notes ? ` · ${linkifyNoteHtml(wp.notes)}` : ""}</div>
          </div>
          <div class="st-row-edit-panel" ${isOpen ? "" : "hidden"}>
            <div class="st-form-grid st-form-grid-compact">
              <label class="st-labelled-field">
                <span>WP name</span>
                <input type="text" class="dpp-waypoint-name-input" value="${escapeHtml(wp.name || "")}">
              </label>
              <label class="st-labelled-field">
                <span>Lat / Lon</span>
                <input type="text" class="dpp-waypoint-coords-input" value="${escapeHtml(wp.coordsText || "")}" placeholder="50º45.123'N, 001º18.456'W or 50.752, -1.308">
              </label>
              <label class="st-labelled-field">
                <span>Notes</span>
                <input type="text" class="dpp-waypoint-notes-input" value="${escapeHtml(wp.notes || "")}">
              </label>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  dppWaypointsManager.querySelectorAll("[data-dpp-waypoint-id]").forEach((row) => {
    const id = row.getAttribute("data-dpp-waypoint-id") || "";
    const panel = row.querySelector(".st-row-edit-panel");
    const openRow = () => {
      dppWaypointsManager.querySelectorAll(".st-row-edit-panel").forEach(el => { if (el !== panel) el.hidden = true; });
      dppWaypointsManager.querySelectorAll(".st-edit-list-row").forEach(el => { if (el !== row) el.classList.remove("open"); });
      if (panel) panel.hidden = false;
      row.classList.add("open");
    };

    row.addEventListener("click", (ev) => {
      if (ev.target.closest("input, textarea, select, button, a")) return;
      openDppWaypointDialog(id);
    });
    row.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      if (ev.target.closest("input, textarea, select, button, a")) return;
      ev.preventDefault();
      openDppWaypointDialog(id);
    });

    const saveRow = () => {
      try {
        saveDppWaypoint({
          id,
          name: row.querySelector(".dpp-waypoint-name-input")?.value || "",
          coordsText: row.querySelector(".dpp-waypoint-coords-input")?.value || "",
          notes: row.querySelector(".dpp-waypoint-notes-input")?.value || ""
        });
        renderDppWaypointsManager(id);
      } catch (err) {
        alert(err?.message || "Could not save that waypoint.");
      }
    };
    row.querySelectorAll("input").forEach(input => bindDppCommitEvents(input, saveRow));

    attachSettingsSwipeDelete(row, () => {
      const wp = getDppWaypointById(id);
      if (!wp) return;
      if (!confirm(`Delete saved waypoint "${wp.name}"?`)) return;
      deleteDppWaypoint(id);
      renderDppWaypointsManager();
    });
  });
}

setSettingsDppLibraryTab("plans");

function closeSettingsDppWorkspace(){
  settingsDppWorkspaceState = null;
  if (settingsDppWorkspace) {
    settingsDppWorkspace.hidden = true;
    settingsDppWorkspace.innerHTML = "";
  }
  if (dppTemplatesLibrary) dppTemplatesLibrary.hidden = false;
  const actions = document.querySelector("#settingsDppTemplatesCard .settings-detail-actions");
  if (actions) actions.hidden = false;
  renderDppTemplatesManager();
}

function readSettingsDppWorkspaceForm(){
  if (!settingsDppWorkspace || !settingsDppWorkspaceState) return createBlankDetailedPassagePlan();

  const fallback = settingsDppWorkspaceState.detailed || createBlankDetailedPassagePlan();
  const rows = settingsDppWorkspace.querySelectorAll("[data-settings-dpp-row]");
  const waypoints = [];

  rows.forEach((row, idx) => {
    const time = normalisePassagePlanTimeInput(row.querySelector(".dpp-time")?.value || "");
    const name = (row.querySelector(".dpp-name")?.value || "").trim();
    const coordsRaw = row.querySelector(".dpp-coords")?.value || "";
    const parsed = parseDetailedWaypointCoords(coordsRaw);

    waypoints.push({
      id: fallback.waypoints[idx]?.id || ("wp_" + Date.now() + "_" + idx + "_" + Math.random().toString(36).slice(2)),
      time,
      name,
      coordsText: parsed ? formatDetailedWaypointCoords(parsed.lat, parsed.lon) : coordsRaw,
      lat: parsed ? parsed.lat : null,
      lon: parsed ? parsed.lon : null,
      distToNext: "",
      manualDistToNext: (row.querySelector(".dpp-distance-override")?.value || "").trim(),
      cogToNext: "",
      plannedSpeed: (row.querySelector(".dpp-speed")?.value || "").trim(),
      tideKt: (row.querySelector(".dpp-tide")?.value || "").trim(),
      sogToNext: "",
      timeToNext: "",
      fuelToNext: "",
      includeInEcSms: row.querySelector(".dpp-include-sms")?.checked !== false,
      actualTime: fallback.waypoints[idx]?.actualTime || ""
    });
  });

  const detailed = {
    waypoints,
    hazards: settingsDppWorkspace.querySelector("#settingsDppHazards")?.value || "",
    portsOfRefuge: settingsDppWorkspace.querySelector("#settingsDppPortsOfRefuge")?.value || "",
    crewWelfare: settingsDppWorkspace.querySelector("#settingsDppCrewWelfare")?.value || ""
  };

  recalcDetailedPassagePlan(detailed);
  settingsDppWorkspaceState.detailed = detailed;
  return detailed;
}

function saveSettingsDppWorkspace(){
  if (!settingsDppWorkspaceState) return false;
  const name = (settingsDppWorkspace?.querySelector("#settingsDppName")?.value || "").trim();
  if (!name) {
    alert("Please enter a plan name.");
    return false;
  }

  const duplicate = getDppTemplates().find((other) =>
    String(other.id) !== String(settingsDppWorkspaceState.templateId) &&
    String(other.name || "").trim().toLowerCase() === name.toLowerCase()
  );
  if (duplicate) {
    alert("A Detailed Passage Plan with that name already exists.");
    return false;
  }

  const detailed = readSettingsDppWorkspaceForm();
  updateDppTemplate(settingsDppWorkspaceState.templateId, {
    name,
    detailed: cloneDetailedPassagePlan(detailed, { regenerateIds: true })
  });
  settingsDppWorkspaceState.name = name;
  settingsDppWorkspaceState.detailed = cloneDetailedPassagePlan(detailed);
  renderDppTemplatesManager();
  return true;
}

function renderSettingsDppWorkspace(){
  if (!settingsDppWorkspace || !settingsDppWorkspaceState) return;

  const template = getDppTemplateById(settingsDppWorkspaceState.templateId);
  if (!template) {
    closeSettingsDppWorkspace();
    return;
  }

  const detailed = normaliseDetailedPassagePlan(settingsDppWorkspaceState.detailed || cloneDetailedPassagePlan(template.detailed));
  recalcDetailedPassagePlan(detailed);
  settingsDppWorkspaceState.detailed = detailed;
  settingsDppWorkspaceState.name = settingsDppWorkspaceState.name || template.name;

  const wps = detailed.waypoints || [];
  const dppTotals = calcDetailedPassagePlanTotals(wps);
  const dppRunningTotals = calcDetailedPassagePlanRunningTotals(wps);
  const dppTemplates = getDppTemplates().filter(tpl => String(tpl.id) !== String(settingsDppWorkspaceState.templateId));
  const dppTemplateOptions = dppTemplates.length
    ? dppTemplates.map((tpl) => `<option value="${escapeHtml(tpl.id)}">${escapeHtml(tpl.name)}</option>`).join("")
    : '<option value="">No other saved DPPs</option>';
  const savedWaypoints = getDppWaypoints();
  const savedWaypointOptions = savedWaypoints.length
    ? savedWaypoints.map((wp) => `<option value="${escapeHtml(wp.id)}">${escapeHtml(wp.name)}${wp.coordsText ? ` · ${escapeHtml(wp.coordsText)}` : ""}</option>`).join("")
    : '<option value="">No saved WPs</option>';
  const routePortWaypoints = getCurrentRoutePortWaypointOptions();
  const routePortWaypointOptions = routePortWaypoints.length
    ? routePortWaypoints.map((pt, idx) => `<option value="${idx}">${escapeHtml(pt.role)} · ${escapeHtml(pt.name)}${pt.coordsText ? ` · ${escapeHtml(pt.coordsText)}` : ""}</option>`).join("")
    : '<option value="">No current route ports</option>';

  settingsDppWorkspace.innerHTML = `
    <div class="dpp-header settings-dpp-header">
      <div>
        <p class="st-card-kicker">Detailed Passage Plan</p>
        <label class="st-labelled-field settings-dpp-name">
          <span>Plan name</span>
          <input type="text" id="settingsDppName" value="${escapeHtml(settingsDppWorkspaceState.name || template.name || "Untitled Detailed Passage Plan")}">
        </label>
      </div>
      <button type="button" class="btn btn-secondary btn-small" id="settingsDppBackBtn">Back to Detailed Passage Plans</button>
    </div>
    <div class="st-metric-strip dpp-summary-strip">
      <span class="st-metric-chip"><span>Distance (NM)</span><strong>${escapeHtml(String(dppTotals.totalNm || 0))}</strong></span>
      <span class="st-metric-chip"><span>Est. Time</span><strong>${escapeHtml(dppTotals.totalDuration || "00:00")}</strong></span>
      <span class="st-metric-chip"><span>Est. Fuel (L)</span><strong>${escapeHtml(String(dppTotals.totalFuel || 0))}</strong></span>
      <span class="st-metric-chip"><span>Total Time</span><strong>${escapeHtml(dppTotals.totalDuration || "00:00")}</strong></span>
    </div>
    <div class="dpp-table-wrap">
      <table class="log-table dpp-table-compact">
        <thead>
          <tr>
            <th>Time</th>
            <th>Waypoint</th>
            <th>Lat / Lon</th>
            <th>Dist<br>NM</th>
            <th>COG<br>°T</th>
            <th>STW<br>kt</th>
            <th>Tide<br>kt</th>
            <th>SOG<br>kt</th>
            <th>Time<br>Next</th>
            <th>Fuel<br>L</th>
            <th colspan="3">Totals to Destination</th>
            <th>SMS</th>
            <th>Actions</th>
          </tr>
          <tr class="dpp-subhead-row">
            <th colspan="10"></th>
            <th>NM</th>
            <th>Time</th>
            <th>Fuel</th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${wps.map((wp, idx) => `
            <tr data-settings-dpp-row="${idx}">
              <td><input type="text" class="dpp-time" value="${escapeHtml(wp.time || "")}" placeholder="HH:MM"></td>
              <td><input type="text" class="dpp-name" value="${escapeHtml(wp.name || "")}" placeholder="Waypoint"></td>
              <td><input type="text" class="dpp-coords" value="${escapeHtml(wp.coordsText || formatDetailedWaypointCoords(wp.lat, wp.lon))}" placeholder="50º45.123'N, 001º18.456'W or 50.752, -1.308"></td>
              <td><input type="number" step="0.1" inputmode="decimal" class="dpp-distance-override" value="${escapeHtml(wp.manualDistToNext || "")}" placeholder="${wp.distToNext !== "" ? escapeHtml(String(wp.distToNext)) : "NM"}" title="Override distance to next waypoint"></td>
              <td>${wp.cogToNext ? escapeHtml(wp.cogToNext) : "–"}</td>
              <td><input type="number" step="0.1" inputmode="decimal" class="dpp-speed" value="${escapeHtml(wp.plannedSpeed || "")}" placeholder="kt"></td>
              <td><input type="number" step="0.1" inputmode="decimal" class="dpp-tide" value="${escapeHtml(wp.tideKt || "")}" placeholder="+/-"></td>
              <td>${wp.sogToNext !== "" && wp.sogToNext != null ? escapeHtml(String(wp.sogToNext)) : "–"}</td>
              <td>${wp.timeToNext ? escapeHtml(wp.timeToNext) : "–"}</td>
              <td>${wp.fuelToNext !== "" && wp.fuelToNext != null ? escapeHtml(String(wp.fuelToNext)) : "–"}</td>
              <td>${escapeHtml(String(dppRunningTotals[idx]?.totalNm ?? 0))}</td>
              <td>${escapeHtml(dppRunningTotals[idx]?.totalTime || "00:00")}</td>
              <td>${escapeHtml(String(dppRunningTotals[idx]?.totalFuel ?? 0))}</td>
              <td class="dpp-sms-cell"><input type="checkbox" class="dpp-include-sms" title="Include this waypoint in the EC SMS routing" ${wp.includeInEcSms === false ? "" : "checked"}></td>
              <td>
                <div class="dpp-row-actions">
                  <button type="button" class="btn btn-secondary btn-small settings-dpp-up" title="Move waypoint up">↑</button>
                  <button type="button" class="btn btn-secondary btn-small settings-dpp-down" title="Move waypoint down">↓</button>
                  <button type="button" class="btn btn-secondary btn-small settings-dpp-del" title="Delete waypoint">✕</button>
                </div>
              </td>
            </tr>
          `).join("")}
          <tr class="dpp-totals-row">
            <td colspan="3">Totals</td>
            <td>${escapeHtml(String(dppTotals.totalNm || 0))}</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td>${escapeHtml(dppTotals.totalDuration || "00:00")}</td>
            <td>${escapeHtml(String(dppTotals.totalFuel || 0))}</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="dpp-action-row">
      <button type="button" class="btn btn-secondary btn-small" id="settingsDppAddWaypointBtn">+ Add Waypoint</button>
      <button type="button" class="btn btn-secondary btn-small" id="settingsDppRecalcBtn">Recalculate</button>
      <button type="button" class="btn btn-secondary btn-small" id="settingsDppAddSavedWpBtn">Add Saved WP</button>
      <button type="button" class="btn btn-secondary btn-small" id="settingsDppAddRoutePortBtn">Add Route Port</button>
      <button type="button" class="btn btn-secondary btn-small" id="settingsDppImportGpxBtn">Import GPX</button>
      <button type="button" class="btn btn-secondary btn-small" id="settingsDppReverseBtn">Reverse Route</button>
      <button type="button" class="btn btn-secondary btn-small" id="settingsDppLoadTemplateBtn">Load DPP Template</button>
      <button type="button" class="btn btn-primary btn-small" id="settingsDppSaveBtn">Save Plan</button>
    </div>
    <div class="dpp-template-load-panel" id="settingsDppTemplateLoadPanel" hidden>
      <select id="settingsDppTemplateSelect" ${dppTemplates.length ? "" : "disabled"}>
        ${dppTemplateOptions}
      </select>
      <button type="button" class="btn btn-secondary btn-small" id="settingsDppUseTemplateBtn" ${dppTemplates.length ? "" : "disabled"}>Load Selected</button>
    </div>
    <div class="dpp-template-load-panel" id="settingsDppWaypointLoadPanel" hidden>
      <select id="settingsDppWaypointSelect" ${savedWaypoints.length ? "" : "disabled"}>
        ${savedWaypointOptions}
      </select>
      <button type="button" class="btn btn-secondary btn-small" id="settingsDppUseWaypointBtn" ${savedWaypoints.length ? "" : "disabled"}>Add Selected</button>
    </div>
    <div class="dpp-template-load-panel" id="settingsDppRoutePortLoadPanel" hidden>
      <select id="settingsDppRoutePortSelect" ${routePortWaypoints.length ? "" : "disabled"}>
        ${routePortWaypointOptions}
      </select>
      <button type="button" class="btn btn-secondary btn-small" id="settingsDppUseRoutePortBtn" ${routePortWaypoints.length ? "" : "disabled"}>Add Selected</button>
    </div>
    <div class="dpp-notes-grid">
      <label class="dpp-note-card">
        <span>Hazards</span>
        <textarea id="settingsDppHazards" rows="3" placeholder="e.g. shipping lanes, traffic separation schemes, shallow areas, weather risks.">${escapeHtml(detailed.hazards || "")}</textarea>
      </label>
      <label class="dpp-note-card">
        <span>Ports of Refuge</span>
        <textarea id="settingsDppPortsOfRefuge" rows="3" placeholder="e.g. Lymington, Cowes, Yarmouth.">${escapeHtml(detailed.portsOfRefuge || "")}</textarea>
      </label>
      <label class="dpp-note-card">
        <span>Crew Welfare</span>
        <textarea id="settingsDppCrewWelfare" rows="3" placeholder="e.g. rest plan, watches, meal schedule, medical notes.">${escapeHtml(detailed.crewWelfare || "")}</textarea>
      </label>
    </div>
  `;

  const rerenderFromForm = () => {
    readSettingsDppWorkspaceForm();
    renderSettingsDppWorkspace();
  };

  settingsDppWorkspace.querySelector("#settingsDppBackBtn")?.addEventListener("click", () => {
    if (!saveSettingsDppWorkspace()) return;
    closeSettingsDppWorkspace();
  });

  settingsDppWorkspace.querySelector("#settingsDppSaveBtn")?.addEventListener("click", () => {
    if (!saveSettingsDppWorkspace()) return;
    closeSettingsDppWorkspace();
  });

  settingsDppWorkspace.querySelector("#settingsDppAddWaypointBtn")?.addEventListener("click", () => {
    const active = readSettingsDppWorkspaceForm();
    active.waypoints.push({
      id: "wp_" + Date.now() + "_" + Math.random().toString(36).slice(2),
      time: "",
      name: "",
      coordsText: "",
      lat: null,
      lon: null,
      distToNext: "",
      manualDistToNext: "",
      cogToNext: "",
      plannedSpeed: "",
      tideKt: "",
      sogToNext: "",
      timeToNext: "",
      fuelToNext: "",
      includeInEcSms: true
    });
    renderSettingsDppWorkspace();
  });

  settingsDppWorkspace.querySelector("#settingsDppRecalcBtn")?.addEventListener("click", rerenderFromForm);

  settingsDppWorkspace.querySelector("#settingsDppReverseBtn")?.addEventListener("click", () => {
    const active = readSettingsDppWorkspaceForm();
    if ((active.waypoints || []).length < 2) return;
    const firstTime = active.waypoints[0]?.time || "";
    active.waypoints.reverse();
    active.waypoints.forEach((wp) => { wp.manualDistToNext = ""; });
    if (active.waypoints.length) active.waypoints[0].time = firstTime;
    for (let i = 1; i < active.waypoints.length; i++) active.waypoints[i].time = "";
    renderSettingsDppWorkspace();
  });

  settingsDppWorkspace.querySelector("#settingsDppLoadTemplateBtn")?.addEventListener("click", () => {
    const panel = settingsDppWorkspace.querySelector("#settingsDppTemplateLoadPanel");
    if (!panel) return;
    panel.hidden = !panel.hidden;
  });

  settingsDppWorkspace.querySelector("#settingsDppAddSavedWpBtn")?.addEventListener("click", () => {
    const panel = settingsDppWorkspace.querySelector("#settingsDppWaypointLoadPanel");
    if (!panel) return;
    panel.hidden = !panel.hidden;
  });

  settingsDppWorkspace.querySelector("#settingsDppAddRoutePortBtn")?.addEventListener("click", () => {
    const panel = settingsDppWorkspace.querySelector("#settingsDppRoutePortLoadPanel");
    if (!panel) return;
    panel.hidden = !panel.hidden;
  });

  settingsDppWorkspace.querySelector("#settingsDppUseWaypointBtn")?.addEventListener("click", () => {
    const selectedId = settingsDppWorkspace.querySelector("#settingsDppWaypointSelect")?.value || "";
    const saved = getDppWaypointById(selectedId);
    if (!saved) return;
    const active = readSettingsDppWorkspaceForm();
    active.waypoints.push(savedWaypointToDppWaypoint(saved));
    renderSettingsDppWorkspace();
  });

  settingsDppWorkspace.querySelector("#settingsDppUseRoutePortBtn")?.addEventListener("click", () => {
    const selectedIdx = Number(settingsDppWorkspace.querySelector("#settingsDppRoutePortSelect")?.value || 0);
    const selected = routePortWaypoints[selectedIdx];
    if (!selected) return;
    const active = readSettingsDppWorkspaceForm();
    active.waypoints.push(routePortToDppWaypoint(selected));
    renderSettingsDppWorkspace();
  });

  settingsDppWorkspace.querySelector("#settingsDppUseTemplateBtn")?.addEventListener("click", () => {
    const selectedId = settingsDppWorkspace.querySelector("#settingsDppTemplateSelect")?.value || "";
    const selected = getDppTemplateById(selectedId);
    if (!selected) return;
    if (!confirm(`Replace this Detailed Passage Plan workspace with "${selected.name}"?`)) return;
    settingsDppWorkspaceState.detailed = cloneDetailedPassagePlan(selected.detailed, { regenerateIds: true });
    renderSettingsDppWorkspace();
  });

  settingsDppWorkspace.querySelector("#settingsDppImportGpxBtn")?.addEventListener("click", () => {
    const input = ensureDppGpxFileInput();
    input.value = "";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const lowerName = String(file.name || "").toLowerCase();
      const declaredType = String(file.type || "").toLowerCase();
      const looksLikeXml = lowerName.endsWith(".gpx") || lowerName.endsWith(".xml") || declaredType.includes("xml") || declaredType.includes("gpx") || declaredType === "";
      if (!looksLikeXml) {
        alert("Please choose a GPX/XML file.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const active = readSettingsDppWorkspaceForm();
          const points = parseDppGpxText(reader.result);
          if (!points.length) {
            alert("No route points or waypoints were found in that GPX file.");
            return;
          }
          const imported = gpxPointsToDetailedWaypoints(points);
          const mode = confirm(
            "Import GPX waypoints?\n\n" +
            "OK = Replace current waypoint rows\n" +
            "Cancel = Append imported rows to the existing waypoint rows"
          ) ? "replace" : "append";
          active.waypoints = mode === "replace" ? imported : [...(active.waypoints || []), ...imported];
          settingsDppWorkspaceState.detailed = active;
          renderSettingsDppWorkspace();
        } catch (err) {
          console.error(err);
          alert(err?.message || "Could not import that GPX file.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });

  settingsDppWorkspace.querySelectorAll("[data-settings-dpp-row]").forEach(row => {
    const idx = Number(row.getAttribute("data-settings-dpp-row"));
    row.querySelector(".settings-dpp-up")?.addEventListener("click", () => {
      const active = readSettingsDppWorkspaceForm();
      if (idx <= 0) return;
      [active.waypoints[idx - 1], active.waypoints[idx]] = [active.waypoints[idx], active.waypoints[idx - 1]];
      renderSettingsDppWorkspace();
    });
    row.querySelector(".settings-dpp-down")?.addEventListener("click", () => {
      const active = readSettingsDppWorkspaceForm();
      if (idx >= active.waypoints.length - 1) return;
      [active.waypoints[idx], active.waypoints[idx + 1]] = [active.waypoints[idx + 1], active.waypoints[idx]];
      renderSettingsDppWorkspace();
    });
    row.querySelector(".settings-dpp-del")?.addEventListener("click", () => {
      const active = readSettingsDppWorkspaceForm();
      active.waypoints.splice(idx, 1);
      renderSettingsDppWorkspace();
    });
  });
}

function openSettingsDppWorkspace(id){
  const tpl = getDppTemplateById(id);
  if (!tpl) return;
  settingsDppWorkspaceState = {
    templateId: tpl.id,
    name: tpl.name,
    detailed: cloneDetailedPassagePlan(tpl.detailed)
  };
  if (dppTemplatesLibrary) dppTemplatesLibrary.hidden = true;
  const actions = document.querySelector("#settingsDppTemplatesCard .settings-detail-actions");
  if (actions) actions.hidden = true;
  if (settingsDppWorkspace) settingsDppWorkspace.hidden = false;
  renderSettingsDppWorkspace();
  settingsDppWorkspace?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderDppTemplatesManager(){
  if (!dppTemplatesManager) return;

  const templates = getDppTemplates();
  if (!templates.length) {
    dppTemplatesManager.innerHTML = '<p class="hint">No saved DPP templates yet.</p>';
    if (settingsDppWorkspaceState) closeSettingsDppWorkspace();
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
      <div class="dpp-template-manager-row st-list-card st-edit-list-row" tabindex="0" data-dpp-template-id="${escapeHtml(tpl.id)}">
        <div class="dpp-template-manager-main st-list-card-main">
          <div class="st-list-summary">
            <div class="st-list-title">${escapeHtml(tpl.name || "Untitled Detailed Passage Plan")}</div>
            <div class="st-list-meta">
              ${wps.length} waypoint${wps.length === 1 ? "" : "s"} · ${escapeHtml(String(totals.totalNm || 0))} NM · ${escapeHtml(totals.totalDuration || "00:00")}
              ${notes ? ` · ${escapeHtml(notes)}` : ""}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  dppTemplatesManager.querySelectorAll("[data-dpp-template-id]").forEach((row) => {
    const id = row.getAttribute("data-dpp-template-id") || "";

    row.addEventListener("click", (ev) => {
      if (ev.target.closest("button, input, textarea, select, a")) return;
      openSettingsDppWorkspace(id);
    });

    row.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      if (ev.target.closest("button, input, textarea, select, a")) return;
      ev.preventDefault();
      openSettingsDppWorkspace(id);
    });

    attachSettingsSwipeDelete(row, () => {
      const tpl = getDppTemplateById(id);
      if (!tpl) return;
      if (!confirm(`Delete DPP template "${tpl.name}"?`)) return;
      deleteDppTemplate(id);
      if (settingsDppWorkspaceState?.templateId === id) closeSettingsDppWorkspace();
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
    p.plan.timeZone = normalisePassageTimeZone(planTimeZone?.value || p.plan.timeZone);
    p.plan.from = planFrom.value.trim();
    p.plan.to   = planTo.value.trim();
    autoComputeSunriseSetForCurrent();

    if (planMoonPhase && planDate.value) {
      const moonPhaseValue = normaliseMoonPhaseLabel(getMoonPhaseLabel(planDate.value));
      planMoonPhase.value = moonPhaseValue;
      p.plan.moonPhase = moonPhaseValue;
    }
  }, 180);
}
planDate.addEventListener("input", scheduleAutoSunSync);
planTimeZone?.addEventListener("change", scheduleAutoSunSync);
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
    const beforePlanJson = stableComparableJson(p.plan || {});
    p.plan = p.plan || {};
    p.plan.weather = merged;
    markPassageDirtyIfPlanChanged(p, beforePlanJson, "plan-weather-change");
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
      const beforePlanJson = stableComparableJson(pp.plan || {});
      if (!pp.plan) pp.plan = {};
      pp.plan.weather = merged;
      markPassageDirtyIfPlanChanged(pp, beforePlanJson, "plan-weather-change");
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
  const beforePlanJson = stableComparableJson(p.plan || {});

  p.plan.date = planDate.value;
  p.plan.timeZone = normalisePassageTimeZone(planTimeZone?.value || p.plan.timeZone);
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
  if (planMoonPhase) p.plan.moonPhase = normaliseMoonPhaseLabel(planMoonPhase.value);
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

  markPassageDirtyIfPlanChanged(p, beforePlanJson, "plan-change");
  savePassages();

  // If ports already exist, update MRU.
  rememberPort(p.plan.from);
  rememberPort(p.plan.to);

  refreshHomePassageList();
  updatePassageHeader();
  updatePlanSummaryPanel();

  switchToTab("logTab");
  renderLogEntries();
  updateLogStatusStrip();
  updateLogSummary();
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
  const timeZoneLabel = getPassageTimeZoneLabel(p);
  const moonPhase = normaliseMoonPhaseLabel(p.plan.moonPhase || "");
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
								const etaAta = wp.time && wp.actualTime
										? `${wp.time}/${wp.actualTime}`
										: (wp.actualTime || wp.time || "");
								const label = `${etaAta ? `${etaAta} ` : ""}${wp.name || ""}`.trim();
								return `<div class="daily-summary-item dpp-progress-item" title="${escapeHtml(label || "–")}">${escapeHtml(label || "–")}</div>`;
						}).join("")
				: "<p><em>–</em></p>";
		const detailedHazardsHtml = detailed.hazards ? linkifyNoteHtml(detailed.hazards) : "<em>–</em>";
		const detailedRefugeHtml = detailed.portsOfRefuge ? linkifyNoteHtml(detailed.portsOfRefuge) : "<em>–</em>";
		const detailedWelfareHtml = detailed.crewWelfare ? linkifyNoteHtml(detailed.crewWelfare) : "<em>–</em>";

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
        const notesLabel = ds.notes ? ` – ${linkifyNoteHtml(ds.notes)}` : "";
        return `<div class="daily-summary-item plan-link" data-goto="dailySummariesContainer">${escapeHtml(dateLabel)}${feeLabel}${notesLabel}</div>`;
      }).join("")
    : '<p class="plan-link" data-goto="dailySummariesContainer"><em>–</em></p>';
  
  planSummaryPanel.innerHTML = `
    <div class="plan-summary-grid">
      <div class="col plan-summary-col plan-summary-col-left">
        <div class="block plan-link" data-goto="detailedPassagePlanSection">
          <p class="section-title">ROUTE SUMMARY</p>
          ${detailedWpHtml}
          <p style="margin-top:0.5rem;"><strong>Hazards:</strong> ${detailedHazardsHtml}</p>
          <p><strong>Ports of Refuge:</strong> ${detailedRefugeHtml}</p>
          <p><strong>Crew Welfare:</strong> ${detailedWelfareHtml}</p>
        </div>

        <div class="block plan-link" data-goto="planComms">
          <p class="section-title">COMMS / PILOTAGE</p>
          <p>${comms ? linkifyNoteHtml(comms) : "<em>–</em>"}</p>
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

        <div class="block">
          <p class="section-title">DAILY SUMMARY</p>
          ${dailySummaryHtml}
        </div>
      </div>

      <div class="col plan-summary-col plan-summary-col-right">
        <div class="block plan-link" data-goto="planSunriseSet">
          <p class="section-title">SUN &amp; MOON</p>
          <p><strong>Time zone:</strong> ${escapeHtml(timeZoneLabel)}</p>
          <p><strong>Sunrise / Sunset:</strong> ${sunriseSet ? escapeHtml(sunriseSet) : "–"}</p>
          <p><strong>Moon phase:</strong> ${moonPhase ? `<span class="moon-phase-display">${escapeHtml(moonPhase)}</span>` : "–"}</p>
          <p><strong>Moon rise / set:</strong> ${moonRiseSet ? escapeHtml(moonRiseSet) : "–"}</p>
        </div>

        <div class="block plan-link" data-goto="planWeather">
          <p class="section-title">WEATHER</p>
          <p>${weather ? weatherTextToHtmlForPlanPanel(weather) : "<em>–</em>"}</p>
        </div>
      </div>
    </div>
  `;

  activateNoteLinks(planSummaryPanel);
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

planSummaryPanel.addEventListener("pointerdown", holdNoteLinkTap, true);
planSummaryPanel.addEventListener("touchstart", holdNoteLinkTap, true);
planSummaryPanel.addEventListener("click", (e) => {
  if (e.target.closest("a")) return;
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
    const pForDialog = passage || getCurrentPassage();
    const legIdxForDialog = pForDialog
      ? ((typeof entry.leg === "number") ? entry.leg : getCurrentLegIndex(pForDialog))
      : 0;
    const waypointOptions = pForDialog ? getCurrentDppWaypointOptions(pForDialog, legIdxForDialog) : [];
    const wpOptionHtml = waypointOptions
      .map(({ wp, waypointIndex }) => {
        const bits = [wp.name || `Waypoint ${waypointIndex + 1}`];
        if (wp.time) bits.push(`ETA ${wp.time}`);
        if (wp.actualTime) bits.push(`ATA ${wp.actualTime}`);
        const selected = Number(entry.wpReached?.waypointIndex) === waypointIndex ? " selected" : "";
        return `<option value="${waypointIndex}"${selected}>${escapeHtml(bits.join(" - "))}</option>`;
      })
      .join("");
    const isWpEntry = entry.entryType === "wp-reached" || !!entry.wpReached;
    const isRefuelEntry = entry.entryType === "refuel" || !!entry.refuel;

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

          <div class="manual-log-row manual-log-options manual-log-wp-row">
            <label class="entry-dialog-check">
              <input id="dlgWpReached" type="checkbox" ${isWpEntry ? "checked" : ""} ${waypointOptions.length ? "" : "disabled"}>
              <span>Waypoint reached</span>
            </label>

            <label class="entry-dialog-field manual-log-wp-fields" ${isWpEntry ? "" : "hidden"}>
              <span>Waypoint</span>
              <select id="dlgWpSelect">${wpOptionHtml}</select>
            </label>
          </div>

          <div class="manual-log-row manual-log-options manual-log-refuel-row">
            <label class="entry-dialog-check">
              <input id="dlgRefuel" type="checkbox" ${isRefuelEntry ? "checked" : ""}>
              <span>Refuel</span>
            </label>

            <label class="entry-dialog-field manual-log-refuel-fields" ${isRefuelEntry ? "" : "hidden"}>
              <span>Litres</span>
              <input id="dlgRefuelLitres" type="number" inputmode="decimal" step="0.1" value="${escapeHtml(entry.refuel?.litres || "")}">
            </label>

            <label class="entry-dialog-field manual-log-refuel-fields" ${isRefuelEntry ? "" : "hidden"}>
              <span>Cost £</span>
              <input id="dlgRefuelCost" type="number" inputmode="decimal" step="0.01" value="${escapeHtml(entry.refuel?.cost || "")}">
            </label>

            <label class="entry-dialog-check manual-log-refuel-fields" ${isRefuelEntry ? "" : "hidden"}>
              <input id="dlgRefuelFull" type="checkbox" ${entry.refuel?.tankFull ? "checked" : ""}>
              <span>Tank full</span>
            </label>
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
          'dlgNotes',
          'dlgWpSelect',
          'dlgRefuelLitres',
          'dlgRefuelCost'
        ]);

        entry.time = normalizeEntryTimeInput(
          vals.dlgTime,
          entry.time,
          (pForDialog?.plan?.date || getCurrentPassage()?.plan?.date || '')
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
          .replace(/\n?WP\s+.+$/im, "")
          .replace(/\n?Refuelled\s+.+$/im, "")
          .trim();

        const wpChecked = !!document.getElementById("dlgWpReached")?.checked;
        if (wpChecked && pForDialog) {
          const selectedIndex = Number(vals.dlgWpSelect);
          const selected = waypointOptions.find(opt => opt.waypointIndex === selectedIndex) || waypointOptions[0];
          if (selected) {
            const oldIdx = Number(entry.wpReached?.waypointIndex);
            if (Number.isFinite(oldIdx) && oldIdx !== selected.waypointIndex && pForDialog) {
              const oldDetailed = getDetailedPassagePlanForLeg(pForDialog, legIdxForDialog);
              if (oldDetailed?.waypoints?.[oldIdx]) oldDetailed.waypoints[oldIdx].actualTime = "";
            }
            const recorded = recordWaypointAtaForEntry(pForDialog, legIdxForDialog, selected.waypointIndex, entry.time);
            const waypointName = String(selected.wp?.name || recorded?.wp?.name || "Waypoint").trim();
            const wpNote = formatWaypointLogLabel({ name: waypointName });
            notes = notes ? `${notes}\n${wpNote}` : wpNote;
            entry.entryType = "wp-reached";
            entry.wpReached = {
              waypointId: selected.wp?.id || recorded?.wp?.id || "",
              waypointName,
              waypointIndex: selected.waypointIndex,
              ata: recorded?.ata || timeOnlyFromIso(entry.time)
            };
          }
        } else {
          if (entry.wpReached && pForDialog) {
            const oldIdx = Number(entry.wpReached.waypointIndex);
            const detailed = getDetailedPassagePlanForLeg(pForDialog, legIdxForDialog);
            if (Number.isFinite(oldIdx) && detailed?.waypoints?.[oldIdx]) {
              detailed.waypoints[oldIdx].actualTime = "";
              recalcDetailedPassagePlan(detailed);
              setDetailedPassagePlanForLeg(pForDialog, legIdxForDialog, detailed);
            }
          }
          delete entry.wpReached;
        }

        const refuelChecked = !!document.getElementById("dlgRefuel")?.checked;
        if (refuelChecked) {
          const litres = numberOrNull(vals.dlgRefuelLitres);
          const cost = numberOrNull(vals.dlgRefuelCost);
          const tankFull = !!document.getElementById("dlgRefuelFull")?.checked;
          const priorRemaining = pForDialog ? estimateFuelTankRemainingBeforeEntry(pForDialog, entry.time, entry.id) : null;
          const tankRemaining = tankFull
            ? STEELER_FUEL_TANK_CAPACITY_L
            : (priorRemaining != null && litres != null ? Math.min(STEELER_FUEL_TANK_CAPACITY_L, priorRemaining + litres) : null);
          const refuelNote = buildRefuelNote(litres, cost, tankFull, tankRemaining);
          if (refuelNote) notes = notes ? `${notes}\n${refuelNote}` : refuelNote;
          entry.entryType = entry.entryType === "wp-reached" ? "wp-reached" : "refuel";
          entry.refuel = {
            litres: litres != null ? Number(litres.toFixed(1)) : "",
            cost: cost != null ? Number(cost.toFixed(2)) : "",
            costPerLitre: (cost != null && litres > 0) ? Number((cost / litres).toFixed(3)) : "",
            tankFull,
            tankRemaining: tankRemaining != null ? Number(tankRemaining.toFixed(1)) : "",
            tankCapacity: STEELER_FUEL_TANK_CAPACITY_L
          };
        } else {
          delete entry.refuel;
        }

        if (entry.stw) {
          notes = notes ? `${notes}\nSTW: ${entry.stw} kts` : `STW: ${entry.stw} kts`;
        }

        entry.notes = notes;
        if (!entry.wpReached && !entry.refuel) entry.entryType = 'manual';

        markLogEntryDirty(entry, pForDialog);
        if (!isNew) {
          savePassages();
          renderLogEntries();
          refreshHomePassageList();
          updatePlanSummaryPanel();
          if (typeof renderDetailedPassagePlan === "function" && pForDialog) renderDetailedPassagePlan(pForDialog);
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

    const notesEl = document.getElementById("dlgNotes");
    const wpCheck = document.getElementById("dlgWpReached");
    const wpSelect = document.getElementById("dlgWpSelect");
    const refuelCheck = document.getElementById("dlgRefuel");

    const toggleFields = (selector, show) => {
      modalBody.querySelectorAll(selector).forEach(el => { el.hidden = !show; });
    };
    const appendUniqueNoteLine = (line) => {
      if (!notesEl || !line) return;
      const current = String(notesEl.value || "").trim();
      const lines = current ? current.split(/\n+/) : [];
      const prefix = line.startsWith("WP ") ? "WP " : (line.startsWith("Refuelled ") ? "Refuelled " : line);
      const filtered = lines.filter(existing => !String(existing).startsWith(prefix));
      filtered.push(line);
      notesEl.value = filtered.join("\n");
    };
    const selectedWaypointNote = () => {
      const selectedIndex = Number(wpSelect?.value);
      const selected = waypointOptions.find(opt => opt.waypointIndex === selectedIndex) || waypointOptions[0];
      return selected ? formatWaypointLogLabel(selected.wp) : "";
    };

    wpCheck?.addEventListener("change", () => {
      toggleFields(".manual-log-wp-fields", wpCheck.checked);
      if (wpCheck.checked) appendUniqueNoteLine(selectedWaypointNote());
    });
    wpSelect?.addEventListener("change", () => {
      if (wpCheck?.checked) appendUniqueNoteLine(selectedWaypointNote());
    });
    refuelCheck?.addEventListener("change", () => {
      toggleFields(".manual-log-refuel-fields", refuelCheck.checked);
    });

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
  const engineStartChecks = [
    { id: "esVhfCheck", label: "VHF CHECK COMPLETE" },
    { id: "esDcDcCheck", label: "DC/DC CONV ON" },
    { id: "esPlotterTrackCheck", label: "START TRACK (PLOTTER)" },
    { id: "esOtherTrackCheck", label: "START TRACK (OTHER)" },
    { id: "esLogsZeroedCheck", label: "LOGS ZEROED" }
  ];

  return await new Promise((resolve) => {
    showModal({
      title: 'Engine Start',
      okText: entry ? 'Save changes' : 'Add entry',
      bodyHtml: `
        <div class="st-task-sheet engine-start-grid">

          <div class="engine-start-main-grid">
            <div class="engine-start-fields">
              <div class="engine-start-title st-modal-section-title">Start values</div>
              <div class="engine-start-row engine-start-values st-modal-section">
                <label class="entry-dialog-field">
                  <span>Time</span>
                  <input id="esTime" type="text" inputmode="numeric" value="${escapeHtml(entry?.time ? timeOnlyFromIso(entry.time) : timeOnlyFromIso(passageDateTimeNow(p)))}">
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
              </div>

              <div class="engine-start-title st-modal-section-title">Environment</div>
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
              </div>
            </div>

            <div class="vhf-box engine-start-checks-panel">
              <div class="engine-start-title st-modal-section-title">Checks</div>
              ${engineStartChecks.map(check => `
                <label>
                  <input id="${check.id}" type="checkbox">
                  <span>${check.label}</span>
                </label>
              `).join('')}
              <div class="hint">Confirm all start checks before recording Engine Start.</div>
            </div>
          </div>

          <div class="engine-start-notes-row st-modal-section">
            <label class="entry-dialog-field">
              <span>Notes (optional)</span>
              <textarea id="esNotes" rows="2" class="modal-notes" style="resize:vertical;">${escapeHtml(prevEnv.notes || '')}</textarea>
            </label>
          </div>
        </div>
      `,
            
        onOk: () => {
        const vals = getDialogFieldValues(['esTime','esPob','esFuelR','esFuelC','esEh','esAirPress','esHumidity','esAirTemp','esSeaTemp','esWindDir','esWindBft','esNotes']);
        const missingChecks = engineStartChecks.filter(check => !document.getElementById(check.id)?.checked);
        if (!entry && missingChecks.length) {
          alert(`Please confirm before adding Engine Start:\n\n${missingChecks.map(check => check.label).join("\n")}`);
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
          markLogEntryDirty(entry, p);
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
								markLogEntryDirty(newEntry, p);
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
            dialogField('Time', 'shTime', entry?.time ? timeOnlyFromIso(entry.time) : timeOnlyFromIso(passageDateTimeNow(p)), { inputMode: 'numeric' }) +
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
          markLogEntryDirty(entry, p);
        } else {
          const newEntry = {
            id: 'e_' + Date.now(), time: normalizeEntryTimeInput(vals.shTime, '', (p.plan?.date || '')), leg: legIdx,
            lat: '', lon: '', course: '', speed: '0', rpm: '', engTP: '',
            waterLog: vals.shWLog, groundLog: vals.shGLog, fuelUsed: vals.shFuelUsed,
            notes: builtNotes, entryType: 'shutdown', engineHoursEnd: vals.shEh,
            fuelEndPercentR: vals.shFuelR, fuelEndPercentC: vals.shFuelC, shutdownNotes: vals.shNotes
          };
          markLogEntryDirty(newEntry, p);
          p.entries.unshift(newEntry);
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
      markLogEntryDirty(entry, p);
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

  const timeStr = passageDateTimeNow(p);

  const entry = {
    id: "e_" + Date.now(),
    time: timeStr,
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

  markLogEntryDirty(entry, p);
  p.entries.unshift(entry);
  savePassages();
  requestScrollToNewestLogEntry();
  renderLogEntries();
  refreshHomePassageList();
  updatePlanSummaryPanel();
  if (typeof renderDetailedPassagePlan === "function") renderDetailedPassagePlan(p);
}

function getCurrentDppWaypointOptions(p, legIdx = null){
  if (!p) return [];
  ensureDetailedPassagePlans(p);
  const idx = legIdx == null ? getCurrentLegIndex(p) : legIdx;
  const detailed = getDetailedPassagePlanForLeg(p, idx);
  return (detailed?.waypoints || [])
    .map((wp, waypointIndex) => ({ wp, waypointIndex }))
    .filter(({ wp }) => String(wp?.name || "").trim());
}

function formatWaypointLogLabel(wp){
  const name = String(wp?.name || "Waypoint").trim();
  return `WP ${name}`;
}

function recordWaypointAtaForEntry(p, legIdx, waypointIndex, entryTime){
  if (!p || waypointIndex == null || waypointIndex < 0) return null;
  ensureDetailedPassagePlans(p);
  const detailed = getDetailedPassagePlanForLeg(p, legIdx);
  const targetWp = detailed?.waypoints?.[waypointIndex];
  if (!targetWp) return null;

  const ata = timeOnlyFromIso(entryTime);
  targetWp.actualTime = ata;
  recalcDetailedPassagePlan(detailed);
  setDetailedPassagePlanForLeg(p, legIdx, detailed);
  return { wp: targetWp, ata };
}

const STEELER_FUEL_TANK_CAPACITY_L = 800;

function numberOrNull(value){
  const n = parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function formatLitres(value){
  const n = numberOrNull(value);
  if (n == null) return "";
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

function defaultFuelManagementSettings(){
  return {
    tankCapacity: STEELER_FUEL_TANK_CAPACITY_L,
    resetAt: "",
    resetLevel: STEELER_FUEL_TANK_CAPACITY_L
  };
}

function loadFuelManagementSettings(){
  const stored = loadLocalStorageJsonItem(
    FUEL_MANAGEMENT_KEY,
    "fuel management",
    defaultFuelManagementSettings(),
    value => !!value && typeof value === "object"
  );
  return {
    ...defaultFuelManagementSettings(),
    ...stored,
    tankCapacity: numberOrNull(stored?.tankCapacity) || STEELER_FUEL_TANK_CAPACITY_L,
    resetLevel: numberOrNull(stored?.resetLevel) ?? STEELER_FUEL_TANK_CAPACITY_L
  };
}

function saveFuelManagementSettings(settings){
  const clean = {
    ...defaultFuelManagementSettings(),
    ...(settings || {})
  };
  clean.tankCapacity = numberOrNull(clean.tankCapacity) || STEELER_FUEL_TANK_CAPACITY_L;
  clean.resetLevel = Math.max(0, Math.min(clean.tankCapacity, numberOrNull(clean.resetLevel) ?? clean.tankCapacity));
  clean.resetAt = clean.resetAt || localDateTimeInputValue(new Date());
  saveLocalStorageItem(FUEL_MANAGEMENT_KEY, JSON.stringify(clean), "fuel management");
  return clean;
}

function getAllFuelRelevantEntries(){
  return passages.flatMap(p => activeLogEntries(p).map(entry => ({ passage:p, entry })))
    .filter(({ entry }) => entry && (entry.time || entry.refuel || entry.fuelUsed))
    .sort((a, b) => getLogEntrySortKey(a.passage, a.entry).localeCompare(getLogEntrySortKey(b.passage, b.entry)));
}

function fuelCutoffDateFromInput(value){
  const raw = String(value || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fuelEntryIsAfterCutoff(passage, entry, cutoffDate){
  if (!cutoffDate) return true;
  const entryDate = logEntrySortDate(passage, entry);
  if (!entryDate || Number.isNaN(entryDate.getTime())) return false;
  return entryDate >= cutoffDate;
}

function fuelEntryIsBeforeLimit(passage, entry, limitDate){
  if (!limitDate) return true;
  const entryDate = logEntrySortDate(passage, entry);
  if (!entryDate || Number.isNaN(entryDate.getTime())) return false;
  return entryDate <= limitDate;
}

function computeFuelManagementStats({ beforeTime = "", excludeEntryId = "" } = {}){
  const settings = loadFuelManagementSettings();
  const resetDate = fuelCutoffDateFromInput(settings.resetAt);
  const beforeDate = fuelCutoffDateFromInput(beforeTime);
  let remaining = numberOrNull(settings.resetLevel);
  let refuelLitres = 0;
  let refuelCost = 0;
  let fuelUsed = 0;
  let refuelCount = 0;
  let fuelUseEntryCount = 0;
  const latestFuelUseByLeg = new Map();
  const fuelEntries = getAllFuelRelevantEntries()
    .filter(({ entry }) => !(excludeEntryId && String(entry.id) === String(excludeEntryId)))
    .filter(({ passage, entry }) => fuelEntryIsBeforeLimit(passage, entry, beforeDate));
  const hasLoggedRefuel = fuelEntries.some(({ entry }) => !!entry.refuel);

  fuelEntries.forEach(({ passage, entry }) => {
    if (!hasLoggedRefuel && !fuelEntryIsAfterCutoff(passage, entry, resetDate)) return;

    const used = numberOrNull(entry.fuelUsed);
    if (used != null && used > 0) {
      const key = `${passage?.id || ""}::${entry.leg ?? 0}`;
      const entryDate = logEntrySortDate(passage, entry);
      const previousUsed = latestFuelUseByLeg.get(key)?.used || 0;
      const deltaUsed = Math.max(0, used - previousUsed);
      if (deltaUsed > 0) {
        fuelUsed += deltaUsed;
        if (remaining != null) remaining = Math.max(0, remaining - deltaUsed);
      }
      latestFuelUseByLeg.set(key, {
        used,
        time: entryDate && !Number.isNaN(entryDate.getTime()) ? entryDate.getTime() : 0
      });
    }

    const refuel = entry.refuel || null;
    if (refuel) {
      const litres = numberOrNull(refuel.litres) || 0;
      const cost = numberOrNull(refuel.cost) || 0;
      if (litres > 0) {
        refuelLitres += litres;
        refuelCost += cost;
        refuelCount += 1;
      }
      if (refuel.tankFull) {
        remaining = settings.tankCapacity;
        fuelUsed = 0;
        latestFuelUseByLeg.clear();
      } else {
        const storedRemaining = numberOrNull(refuel.tankRemaining);
        if (storedRemaining != null) {
          remaining = Math.max(0, Math.min(settings.tankCapacity, storedRemaining));
        } else if (remaining != null) {
          remaining = Math.min(settings.tankCapacity, remaining + litres);
        }
      }
    }
  });
  fuelUseEntryCount = Array.from(latestFuelUseByLeg.values()).filter(item => item && item.used > 0).length;

  return {
    settings,
    remaining,
    refuelLitres,
    refuelCost,
    refuelCount,
    fuelUsed,
    fuelUseEntryCount,
    averageCostPerLitre: refuelLitres > 0 && refuelCost > 0 ? refuelCost / refuelLitres : null
  };
}

function estimateFuelTankRemainingBeforeEntry(p, entryTime, excludeEntryId = ""){
  const targetTime = String(entryTime || localDateTimeInputValue(new Date()));
  return computeFuelManagementStats({ beforeTime: targetTime, excludeEntryId }).remaining;
}

function buildRefuelNote(litresRaw, costRaw, tankFull, tankRemaining){
  const litres = numberOrNull(litresRaw);
  const cost = numberOrNull(costRaw);
  if (litres == null || litres <= 0) return "";

  const litresText = formatLitres(litres);
  const costText = cost != null ? cost.toFixed(2) : "";
  const ppl = (cost != null && litres > 0) ? (cost / litres).toFixed(2) : "";
  const tankText = tankFull
    ? "Tank Full"
    : `Tank ${tankRemaining != null ? formatLitres(tankRemaining) : "unknown"}l remaining`;
  const costPart = costText ? `, £${costText}${ppl ? ` (£${ppl}/l)` : ""}` : "";

  return `Refuelled ${litresText}l${costPart}. ${tankText}`;
}

async function chooseNewLogEntryMode(p){
  const waypointCount = getCurrentDppWaypointOptions(p).length;

  return await new Promise((resolve) => {
    showModal({
      title: "New Log Entry",
      hideButtons: true,
      bodyHtml: `
        <div class="entry-dialog-grid">
          <button type="button" id="newLogManualBtn" class="btn btn-primary">Manual log entry</button>
          <button type="button" id="newLogWpBtn" class="btn btn-secondary" ${waypointCount ? "" : "disabled"}>WP Reached</button>
          ${waypointCount ? "" : `<div class="form-help">No named DPP waypoints are available for the current leg.</div>`}
          <button type="button" id="newLogCancelBtn" class="btn btn-secondary">Cancel</button>
        </div>
      `
    });

    const finish = (mode) => {
      closeModal();
      resolve(mode);
    };

    document.getElementById("newLogManualBtn")?.addEventListener("click", () => finish("manual"));
    document.getElementById("newLogWpBtn")?.addEventListener("click", () => finish("wp"));
    document.getElementById("newLogCancelBtn")?.addEventListener("click", () => finish(""));
  });
}

async function addWaypointReachedEntry(p){
  if (!p) return false;

  ensureEntries(p);
  ensureDetailedPassagePlans(p);
  const legIdx = getCurrentLegIndex(p);
  const options = getCurrentDppWaypointOptions(p, legIdx);

  if (!options.length) {
    alert("No named DPP waypoints are available for the current leg.");
    return false;
  }

  return await new Promise((resolve) => {
    const nowIso = passageDateTimeNow(p);
    const optionHtml = options
      .map(({ wp, waypointIndex }) => {
        const labelBits = [wp.name || `Waypoint ${waypointIndex + 1}`];
        if (wp.time) labelBits.push(`ETA ${wp.time}`);
        if (wp.actualTime) labelBits.push(`ATA ${wp.actualTime}`);
        return `<option value="${waypointIndex}">${escapeHtml(labelBits.join(" - "))}</option>`;
      })
      .join("");

    showModal({
      title: "WP Reached",
      okText: "Add entry",
      cancelText: "Cancel",
      bodyHtml: `
        <div class="entry-dialog-grid">
          <label class="entry-dialog-field entry-dialog-field-full">
            <span>Waypoint</span>
            <select id="wpReachedSelect">${optionHtml}</select>
          </label>
          ${dialogField("ATA", "wpReachedTime", timeOnlyFromIso(nowIso), { inputMode: "numeric" })}
          ${dialogField("Notes", "wpReachedNotes", "", { tag: "textarea", rows: 2 })}
        </div>
      `,
      onOk: () => {
        const selectedIndex = Number(document.getElementById("wpReachedSelect")?.value);
        const selected = options.find(opt => opt.waypointIndex === selectedIndex) || options[0];
        if (!selected) return false;

        const vals = getDialogFieldValues(["wpReachedTime", "wpReachedNotes"]);
        const entryTime = normalizeEntryTimeInput(vals.wpReachedTime, nowIso, (p.plan?.date || ""));
        const ata = timeOnlyFromIso(entryTime);
        const detailed = getDetailedPassagePlanForLeg(p, legIdx);
        const targetWp = detailed.waypoints?.[selected.waypointIndex];
        if (targetWp) {
          targetWp.actualTime = ata;
          recalcDetailedPassagePlan(detailed);
          setDetailedPassagePlanForLeg(p, legIdx, detailed);
        }

        const waypointName = String(selected.wp?.name || targetWp?.name || "Waypoint").trim();
        const extraNotes = String(vals.wpReachedNotes || "").trim();
        const notes = extraNotes ? `WP reached: ${waypointName}\n${extraNotes}` : `WP reached: ${waypointName}`;

        const newEntry = {
          id: newId("e"),
          time: entryTime,
          leg: legIdx,
          course: "",
          speed: "",
          rpm: "",
          engTP: "",
          waterLog: "",
          groundLog: "",
          fuelUsed: "",
          notes,
          lat: "",
          lon: "",
          entryType: "wp-reached",
          wpReached: {
            waypointId: selected.wp?.id || targetWp?.id || "",
            waypointName,
            waypointIndex: selected.waypointIndex,
            ata
          }
        };
        markLogEntryDirty(newEntry, p);
        p.entries.unshift(newEntry);

        savePassages();
        requestScrollToNewestLogEntry();
        renderLogEntries();
        refreshHomePassageList();
        updateLogSummary();
        updatePlanSummaryPanel();
        if (typeof renderDetailedPassagePlan === "function") renderDetailedPassagePlan(p);
        resolve(true);
      },
      onCancel: () => resolve(false)
    });
  });
}

async function addLogEntry(){
  const p = getCurrentPassage();
  if (!p) return;

  ensureEntries(p);
  ensureFinish(p);
  ensureFlags(p);

  const entry = {
    id: newId('e'),
    time: passageDateTimeNow(p),
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

  markLogEntryDirty(entry, p);
  p.entries.unshift(entry);
  savePassages();
  requestScrollToNewestLogEntry();
  renderLogEntries();
  refreshHomePassageList();
  updatePlanSummaryPanel();
  if (typeof renderDetailedPassagePlan === "function") renderDetailedPassagePlan(p);
}


function addDockEntry() {
  const p = getCurrentPassage();
  if (!p) return alert("No passage selected.");
  ensureFlags(p);
  if (passageIsShutdown(p)) return alert("Shutdown already recorded – no further log entries allowed.");

  const timeStr = passageDateTimeNow(p);

  const entry = {
    id: "e_" + Date.now(),
    time: timeStr,
    leg: getCurrentLegIndex(p),
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

function copySvg(){
  return `
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="currentColor" d="M8 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm0 2v10h10V9H8z"/>
      <path fill="currentColor" d="M4 3h10v2H5v9H3V5a2 2 0 0 1 2-2z"/>
    </svg>
  `;
}

function hideAllSwipeDeleteButtons(exceptEl = null){
  document.querySelectorAll("tr.show-delete, .passage-card.show-delete, .st-swipe-row.show-delete").forEach(el => {
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
  const idx = p.entries.findIndex(e => e.id === entryId && !isDeletedLogEntry(e));
  if (idx < 0) return;

  const deleted = p.entries[idx];

  const ok = confirm("Delete this log entry?\n\nIt will be hidden from the log but kept in the backup data so it can be recovered later.");
  if (!ok) return;

  hideAllSwipeDeleteButtons();
  document.querySelectorAll("tr.swipe-dragging").forEach(el => {
    el.classList.remove("swipe-dragging");
    el.style.removeProperty("--swipe-x");
  });

  markLogEntryDirty(deleted, p, { deleted: true });

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
  const entries = activeLogEntries(p);
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
    markLogEntryDirty(entry, getCurrentPassage());
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
      markLogEntryDirty(entry, getCurrentPassage());
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
    
  const visibleEntries = activeLogEntries(p);
  if (!p || visibleEntries.length === 0) {
    logEmptyMessage.style.display = "block";
    logSummaryPanel.textContent = "";
    return;
  }
  logEmptyMessage.style.display = "none";

  const entries = visibleEntries.slice().sort(compareLogEntriesForPassage(p));

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
    tdNotes.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (ev.target.closest("a")) return;
      openEntryDialog(entry);
    });

    const notesText = document.createElement('div');
    notesText.className = 'log-notes-display';
    notesText.innerHTML = entry.notes ? linkifyNoteHtml(entry.notes) : '—';
    activateNoteLinks(notesText);
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
						ev.stopImmediatePropagation?.();
						tr.dataset.justSwiped = "1";
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
  const entries = activeLogEntries(p);
  const legEntries = entries.filter(e => (e.leg ?? 0) === legIdx);
  const sorted = legEntries.slice().sort(compareLogEntriesForPassage(p));

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

  // Under way minutes: Slip -> Dock/Shutdown, or Slip -> now while still under way.
  let durationMinutes = null;
  const slipEntry = sorted.find(e => typeof e.notes === 'string' && e.notes.toLowerCase().startsWith('slipped lines'));
  let endEntry = null;
  if (slipEntry && slipEntry.time) {
    const slipIdx = sorted.indexOf(slipEntry);
    endEntry = sorted.slice(slipIdx + 1).find(e => {
      if (!e.time || typeof e.notes !== 'string') return false;
      const note = e.notes.toLowerCase();
      return note.startsWith('alongside') || note.startsWith('docked') || note.startsWith('shutdown');
    });
  }
  const tStart = slipEntry?.time ? logEntrySortDate(p, slipEntry) : null;
  const tEnd = endEntry?.time ? logEntrySortDate(p, endEntry) : (tStart ? new Date() : null);
  if (tStart && tEnd && !isNaN(tStart) && !isNaN(tEnd)) {
    const ms = tEnd - tStart;
    if (!isNaN(ms) && ms > 0) durationMinutes = Math.round(ms / 60000);
  } else {
    const times = sorted.map(e => logEntrySortDate(p, e)).filter(d => !isNaN(d));
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

  const entries = activeLogEntries(p);
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
    .sort(compareLogEntriesForPassage(p));

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

  const entries = activeLogEntries(p);
  const legEntries = entries.filter(e => (e.leg ?? 0) === legIdx);

  const sorted = legEntries.slice().sort(compareLogEntriesForPassage(p));
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

window.setInterval(() => {
  const p = getCurrentPassage();
  if (!p) return;
  const legIdx = getCurrentLegIndex(p);
  const isUnderWay = hasSpecialForLeg(p, "slipped lines", legIdx)
    && !hasSpecialForLeg(p, "alongside", legIdx)
    && !hasSpecialForLeg(p, "docked", legIdx)
    && !hasSpecialForLeg(p, "shutdown", legIdx);
  if (isUnderWay) updateLogStatusStrip();
}, 30000);

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
  if (activePassages().length > 0) {
    const ok = confirm("Start a new passage? (Existing ones will remain in history.)");
    if (!ok) return;
  }
  createPassage();
  switchToTab("planTab");
});

homeSyncNowBtn?.addEventListener("click", runFullDataCloudSync);

homeCopyPassageBtn?.addEventListener("click", () => {
  const p = getCurrentPassage();
  if (!p) {
    alert("Select a passage to copy first.");
    return;
  }
  copyPassagePlanById(p.id);
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

  const elPorts  = document.getElementById("settingsWeatherTidesCard");
  const elDpp = document.getElementById("settingsDppTemplatesCard");
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

  const portsBtn  = document.getElementById("settingsWeatherTidesCard");
  const dppBtn = document.getElementById("settingsDppTemplatesCard");
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
            <div class="settings-detail-actions st-action-row">
              <button type="button" id="wxAbbrAddBtn" class="btn btn-secondary">Add rule</button>
              <button type="button" id="wxAbbrSortBtn" class="btn btn-secondary">Sort A→Z</button>
              <button type="button" id="wxAbbrExportBtn" class="btn btn-secondary">Export JSON</button>
              <button type="button" id="wxAbbrImportBtn" class="btn btn-secondary">Import .json</button>
              <button type="button" id="wxAbbrResetBtn" class="btn btn-secondary">Reset defaults</button>
              <button type="button" id="wxAbbrClearBtn" class="btn btn-secondary">Clear all</button>
            </div>
            <p class="hint">Define abbreviation / expansion rules for Met Office and Météo-France forecasts.</p>
            <div id="wxAbbrEditorWrap" class="st-stack"></div>
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
  const wrap = document.getElementById("wxAbbrEditorWrap");
  if (!wrap) return;

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
  const addBtn    = document.getElementById("wxAbbrAddBtn");
  const sortBtn   = document.getElementById("wxAbbrSortBtn");
  const exportBtn = document.getElementById("wxAbbrExportBtn");
  const importBtn = document.getElementById("wxAbbrImportBtn");
  const resetBtn  = document.getElementById("wxAbbrResetBtn");
  const clearBtn  = document.getElementById("wxAbbrClearBtn");

  const topRow = mk("div", { class:"st-action-row" }, [searchInp]);

  const ruleList = mk("div", { id:"wxAbbrList", class:"st-list" });

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
  wrap.appendChild(ruleList);
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
    ruleList.innerHTML = "";

    rules.forEach((rule, idx) => {
      const fromRaw = String(rule.from || "");
      const toRaw   = String(rule.to || "");
      const mode    = String(rule.mode || "plain");
      const enabled = (rule.enabled !== false);

      const fromDisp = (mode === "regex" && isAutoRegex(fromRaw)) ? regexToHuman(fromRaw) : fromRaw;

      if (q && !(fromDisp.toLowerCase().includes(q) || toRaw.toLowerCase().includes(q) || mode.toLowerCase().includes(q))) return;

      const row = mk("div", { class:"st-list-card st-edit-list-row", tabindex:"0" });
      const main = mk("div", { class:"st-list-card-main" });
      const summary = mk("div", { class:"st-list-summary" }, [
        mk("div", { class:"st-list-title", text:fromDisp || "(blank rule)" }),
        mk("div", { class:"st-list-meta", text:`${enabled ? "On" : "Off"} · ${mode} · ${toRaw || "(blank output)"}` })
      ]);
      const edit = mk("div", { class:"st-row-edit-panel" });
      const form = mk("div", { class:"st-form-grid" });

      const onField = mk("label", { class:"st-form-field" });
      const onCb = mk("input", { type:"checkbox" });
      onCb.checked = enabled;
      onCb.onchange = () => {
        const db2 = getDb();
        if (!Array.isArray(db2.rules)) db2.rules = [];
        if (db2.rules[idx]) db2.rules[idx].enabled = !!onCb.checked;
        saveDb(db2);
        rebuildPreview();
      };
      onField.appendChild(onCb);
      onField.appendChild(document.createTextNode(" Rule enabled"));

      const fromField = mk("label", { class:"st-labelled-field" }, [mk("span", { text:"From" })]);
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
      fromField.appendChild(fromIn);

      const toField = mk("label", { class:"st-labelled-field" }, [mk("span", { text:"To" })]);
      const toIn = mk("input", { type:"text", value:toRaw, style:"width:100%;" });
      toIn.onchange = () => {
        const db2 = getDb();
        if (!Array.isArray(db2.rules)) db2.rules = [];
        if (db2.rules[idx]) db2.rules[idx].to = String(toIn.value||"");
        saveDb(db2);
        rebuildPreview();
      };
      toField.appendChild(toIn);

      const modeField = mk("label", { class:"st-labelled-field" }, [mk("span", { text:"Mode" })]);
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
      modeField.appendChild(modeSel);

      form.appendChild(fromField);
      form.appendChild(toField);
      form.appendChild(modeField);
      form.appendChild(onField);
      edit.appendChild(form);
      main.appendChild(summary);
      main.appendChild(edit);
      row.appendChild(main);

      row.addEventListener("click", (ev) => {
        if (ev.target.closest("button, input, textarea, select, a")) return;
        row.classList.toggle("is-editing");
      });
      row.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        if (ev.target.closest("button, input, textarea, select, a")) return;
        ev.preventDefault();
        row.classList.toggle("is-editing");
      });
      attachSettingsSwipeDelete(row, () => {
        if (!confirm(`Delete weather shorthand rule "${fromDisp || "(blank rule)"}"?`)) return;
        const db2 = getDb();
        if (!Array.isArray(db2.rules)) db2.rules = [];
        if (idx >= 0 && idx < db2.rules.length) {
          db2.rules.splice(idx, 1);
          saveDb(db2);
          render();
          rebuildPreview();
        }
      });

      ruleList.appendChild(row);
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

function applySettingsFieldLabels(scope){
  if (!scope) return;
  scope.querySelectorAll("input[placeholder], textarea[placeholder]").forEach((field) => {
    if (field.type === "hidden" || field.type === "checkbox") return;
    if (field.closest(".st-labelled-field")) return;
    const labelText = field.getAttribute("placeholder") || field.getAttribute("aria-label") || "";
    if (!labelText) return;

    const label = document.createElement("label");
    label.className = "st-labelled-field";
    const span = document.createElement("span");
    span.textContent = labelText;
    field.parentNode.insertBefore(label, field);
    label.appendChild(span);
    label.appendChild(field);
  });
}

function injectSafetyEmergencySettingsBlock(){
  const container = __wxAbbrFindSettingsContainer();
  if (!container) return;

  const portsBtn = document.getElementById("settingsWeatherTidesCard");
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
            <div class="st-panel-title">Emergency Contacts</div>
            <div class="st-action-row">
              <button type="button" id="seiEcNewBtn" class="btn btn-primary">New Contact</button>
            </div>
            <div id="seiEcList" class="st-list"></div>
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

  applySettingsFieldLabels(block);

  const s = getSafetyInfo();

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

  document.getElementById("seiOverdueHours").value = s.defaults?.overdueHours ?? 2;
  document.getElementById("seiEngineToSlip").value = s.defaults?.engineToSlipMins ?? 7;
  document.getElementById("seiDetailsUrl").value = s.defaults?.detailsPageUrl || "";
  document.getElementById("seiIncludeDetailsUrl").checked = !!s.defaults?.includeDetailsUrlInSms;
  document.getElementById("seiIncludeMarineTraffic").checked = !!s.defaults?.includeMarineTrafficInSms;

		renderEmergencyContactsManager();
		
		const newBtn = document.getElementById("seiEcNewBtn");
		if (newBtn && !newBtn.dataset.bound){
				newBtn.dataset.bound = "1";
				newBtn.addEventListener("click", createEmergencyContactFromSettings);
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

function renderFuelManagementSettings(){
  const resetAtEl = document.getElementById("fuelMgmtResetAt");
  const resetLevelEl = document.getElementById("fuelMgmtResetLevel");
  const statsEl = document.getElementById("fuelMgmtStats");
  if (!resetAtEl || !resetLevelEl || !statsEl) return;

  const stats = computeFuelManagementStats();
  const settings = stats.settings;
  resetAtEl.value = settings.resetAt || localDateTimeInputValue(new Date());
  resetLevelEl.value = formatLitres(settings.resetLevel);

  const remaining = stats.remaining == null ? "Unknown" : `${formatLitres(stats.remaining)}l`;
  const used = stats.fuelUsed ? `${formatLitres(stats.fuelUsed)}l` : "0l";
  const bought = stats.refuelLitres ? `${formatLitres(stats.refuelLitres)}l` : "0l";
  const avg = stats.averageCostPerLitre == null ? "–" : `£${stats.averageCostPerLitre.toFixed(2)}/l`;

  statsEl.innerHTML = `
    <span class="st-metric-chip"><span>Tank Estimate</span><strong>${escapeHtml(remaining)}</strong></span>
    <span class="st-metric-chip"><span>Fuel Used</span><strong>${escapeHtml(used)}</strong></span>
    <span class="st-metric-chip"><span>Fuel Bought</span><strong>${escapeHtml(bought)}</strong></span>
    <span class="st-metric-chip"><span>Avg Cost</span><strong>${escapeHtml(avg)}</strong></span>
  `;
}

function saveFuelManagementFromSettings(fullReset = false){
  const current = loadFuelManagementSettings();
  const resetAt = document.getElementById("fuelMgmtResetAt")?.value || localDateTimeInputValue(new Date());
  const level = fullReset
    ? STEELER_FUEL_TANK_CAPACITY_L
    : (numberOrNull(document.getElementById("fuelMgmtResetLevel")?.value) ?? current.resetLevel);
  saveFuelManagementSettings({
    ...current,
    resetAt,
    resetLevel: level
  });
  renderFuelManagementSettings();
}

function injectFuelManagementSettingsBlock(){
  const container = __wxAbbrFindSettingsContainer();
  if (!container) return;

  const dppBtn = document.getElementById("settingsDppTemplatesCard");
  const dppBlock = __wxAbbrBlockForEl(dppBtn, container);
  if (!dppBlock) return;

  let block = document.getElementById("fuelManagementSettingsBlock");
  if (!block){
    block = document.createElement(dppBlock.tagName.toLowerCase());
    block.id = "fuelManagementSettingsBlock";
    block.className = dppBlock.className || "";
    block.setAttribute("data-settings-card", "");
    block.innerHTML = `
      <div class="settings-block-inner">
        <div class="settings-card-header">
          <div class="settings-card-main">
            <span class="settings-card-icon" aria-hidden="true">FL</span>
            <div>
              <h3>Fuel Management</h3>
              <p>Tank level reset and simple fuel statistics.</p>
            </div>
          </div>
          <button type="button" id="toggleFuelManagementBtn" class="btn btn-secondary btn-small settings-toggle" data-settings-toggle>›</button>
        </div>
        <div id="fuelManagementPanel" class="settings-card-panel st-stack" data-settings-panel hidden>
          <section class="settings-panel-card st-panel st-stack">
            <div class="st-panel-title">Tank Level</div>
            <div id="fuelMgmtStats" class="st-metric-strip"></div>
            <div class="st-form-grid st-form-grid-compact">
              <label class="st-labelled-field">
                <span>Reset from</span>
                <input id="fuelMgmtResetAt" type="datetime-local">
              </label>
              <label class="st-labelled-field">
                <span>Tank level (L)</span>
                <input id="fuelMgmtResetLevel" type="number" inputmode="decimal" min="0" max="${STEELER_FUEL_TANK_CAPACITY_L}" step="0.1">
              </label>
            </div>
            <div class="st-action-row">
              <button type="button" id="fuelMgmtFullBtn" class="btn btn-primary">Reset Tank Full</button>
              <button type="button" id="fuelMgmtSaveBtn" class="btn btn-secondary">Save Tank Level</button>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  if (!block.parentElement) {
    container.insertBefore(block, dppBlock.nextSibling);
  }

  renderFuelManagementSettings();

  const fullBtn = document.getElementById("fuelMgmtFullBtn");
  if (fullBtn && !fullBtn.dataset.bound) {
    fullBtn.dataset.bound = "1";
    fullBtn.addEventListener("click", () => saveFuelManagementFromSettings(true));
  }

  const saveBtn = document.getElementById("fuelMgmtSaveBtn");
  if (saveBtn && !saveBtn.dataset.bound) {
    saveBtn.dataset.bound = "1";
    saveBtn.addEventListener("click", () => saveFuelManagementFromSettings(false));
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
		try { importDppTemplateWaypointsToLibrary(); } catch (e) { console.warn('importDppTemplateWaypointsToLibrary failed', e); }
		try { injectSafetyEmergencySettingsBlock(); } catch (e) { console.warn('injectSafetyEmergencySettingsBlock failed', e); }
		try { injectFuelManagementSettingsBlock(); } catch (e) { console.warn('injectFuelManagementSettingsBlock failed', e); }
		try { setupSettingsCardToggles(); } catch (e) { console.warn('setupSettingsCardToggles failed', e); }
  try { renderLocalSyncStatus(); } catch (e) { console.warn('renderLocalSyncStatus failed', e); }

  refreshHomePassageList();

  if (!currentPassageId && activePassages().length > 0) currentPassageId = getFirstActivePassage().id;

  loadPassageIntoUI();
  setupLogSplitDivider();
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
