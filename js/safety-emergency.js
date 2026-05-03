// --- Safety / Emergency Info (v0.7.16) ----------------------------

const SAFETY_INFO_KEY = "steeler_safety_emergency_info_v1";

function loadSafetyInfo(){
  return loadLocalStorageJsonItem(
    SAFETY_INFO_KEY,
    "Safety / Emergency Info",
    null,
    value => value && typeof value === "object" && !Array.isArray(value)
  );
}

function saveSafetyInfo(obj){
  saveLocalStorageItem(SAFETY_INFO_KEY, JSON.stringify(obj), "Safety / Emergency Info");
}

function getSafetyInfo(){
  let s = loadSafetyInfo();
  if (!s){
    s = {
						vessel: {
								boatName: "STEELER",
								boatType: "Motor Yacht",
								boatModel: "",
								callsign: "",
								mmsi: "",
								ukSsr: "",
								marineTrafficShipId: "",
								homePort: "",
        length: "",
        beam: "",
        draft: ""
      },
      appearanceSafety: {
        topsides: "",
        hull: "",
        superstructure: "",
        liferaft: "",
        dinghy: "",
        lifejackets: "",
        epirb: "",
        safetyEquip: "",
        rnEquip: ""
      },
      owner: {
        names: "",
        tel: "",
        email: "",
        address: ""
      },
      emergencyContacts: [
        {
          id: "ec_default",
          name: "Emergency Contact",
          tel: "07715005323",
          email: "",
          notes: "",
          isDefault: true
        }
      ],
      defaults: {
        overdueHours: 2,
        engineToSlipMins: 7,
        detailsPageUrl: "",
        includeDetailsUrlInSms: true,
        includeMarineTrafficInSms: true
      }
    };
    saveSafetyInfo(s);
  }
  return s;
}

// --- Emergency Contact Settings (CL-085) ----------------------------

const EC_SETTINGS_KEY = "steeler_ec_settings_v1";

function loadEcSettings(){
  return loadLocalStorageJsonItem(
    EC_SETTINGS_KEY,
    "legacy emergency contact settings",
    null,
    value => value && typeof value === "object" && !Array.isArray(value)
  );
}

function saveEcSettings(obj){
  saveLocalStorageItem(EC_SETTINGS_KEY, JSON.stringify(obj), "emergency contact settings");
}

function getEcSettings(){
  let s = loadEcSettings();
  if (!s){
    s = {
      emergencyContact: {
        name:"Emergency Contact",
        tel:"07715005323",
        email:"",
        overdueHours:2
      },
      vesselProfile: {
        boatName:"STEELER",
        boatType:"Motor Yacht",
        callsign:"",
        mmsi:"",
        detailsUrl:""
      },
      passageDefaults: {
        engineToSlipMins:7
      }
    };
    saveEcSettings(s);
  }
  return s;
}

// --- Safety Info helpers ------------------------------------------

function getDefaultEmergencyContact(){
  const s = getSafetyInfo();
  const list = s.emergencyContacts || [];
  if (!list.length) return null;

  const def = list.find(c => c.isDefault);
  return def || list[0];
}

function getEmergencyContacts(){
  const s = getSafetyInfo();

  if (!Array.isArray(s.emergencyContacts)) s.emergencyContacts = [];

  s.emergencyContacts = s.emergencyContacts
    .filter(c => c && typeof c === "object")
    .map((c, idx) => ({
      id: c.id || ("ec_" + Date.now() + "_" + idx),
      name: String(c.name || "").trim(),
      tel: String(c.tel || "").trim(),
      email: String(c.email || "").trim(),
      notes: String(c.notes || "").trim(),
      isDefault: !!c.isDefault
    }));

  if (!s.emergencyContacts.length){
    s.emergencyContacts = [{
      id: "ec_" + Date.now(),
      name: "Emergency Contact",
      tel: "",
      email: "",
      notes: "",
      isDefault: true
    }];
  }

  let defaultSeen = false;
  s.emergencyContacts.forEach(c => {
    if (c.isDefault && !defaultSeen) {
      defaultSeen = true;
    } else {
      c.isDefault = false;
    }
  });

  if (!defaultSeen && s.emergencyContacts.length) {
    s.emergencyContacts[0].isDefault = true;
  }

  saveSafetyInfo(s);
  return s.emergencyContacts;
}

function createBlankEmergencyContact(){
  return {
    id: "ec_" + Date.now() + "_" + Math.random().toString(36).slice(2,8),
    name: "",
    tel: "",
    email: "",
    notes: "",
    isDefault: false
  };
}

function setDefaultEmergencyContact(contactId){
  const s = getSafetyInfo();
  const list = Array.isArray(s.emergencyContacts) ? s.emergencyContacts : [];
  list.forEach(c => { c.isDefault = String(c.id) === String(contactId); });
  saveSafetyInfo(s);
}

function deleteEmergencyContact(contactId){
  const s = getSafetyInfo();
  let list = Array.isArray(s.emergencyContacts) ? s.emergencyContacts : [];
  list = list.filter(c => String(c.id) !== String(contactId));

  if (!list.length){
    list = [createBlankEmergencyContact()];
    list[0].name = "Emergency Contact";
    list[0].isDefault = true;
  } else if (!list.some(c => c.isDefault)) {
    list[0].isDefault = true;
  }

  s.emergencyContacts = list;
  saveSafetyInfo(s);
}

// --- Legacy EC migration ------------------------------------------

function migrateLegacyEcSettingsIntoSafetyInfo(){
  const legacy = loadEcSettings();
  const safety = getSafetyInfo();

  let changed = false;

  if (legacy?.vesselProfile){
    const vp = legacy.vesselProfile;
    if (!safety.vessel.boatName && vp.boatName) { safety.vessel.boatName = vp.boatName; changed = true; }
    if (!safety.vessel.boatType && vp.boatType) { safety.vessel.boatType = vp.boatType; changed = true; }
    if (!safety.vessel.callsign && vp.callsign) { safety.vessel.callsign = vp.callsign; changed = true; }
    if (!safety.vessel.mmsi && vp.mmsi) { safety.vessel.mmsi = vp.mmsi; changed = true; }
    if (!safety.defaults.detailsPageUrl && vp.detailsUrl) { safety.defaults.detailsPageUrl = vp.detailsUrl; changed = true; }
  }

  if (legacy?.passageDefaults){
    if ((!safety.defaults.engineToSlipMins || safety.defaults.engineToSlipMins === 7) && legacy.passageDefaults.engineToSlipMins != null) {
      safety.defaults.engineToSlipMins = Number(legacy.passageDefaults.engineToSlipMins || 7);
      changed = true;
    }
    if ((!safety.defaults.overdueHours || safety.defaults.overdueHours === 2) && legacy.emergencyContact?.overdueHours != null) {
      safety.defaults.overdueHours = Number(legacy.emergencyContact.overdueHours || 2);
      changed = true;
    }
  }

  if (legacy?.emergencyContact){
    const ec0 = (safety.emergencyContacts && safety.emergencyContacts[0]) ? safety.emergencyContacts[0] : null;
    if (ec0){
      if (!ec0.name && legacy.emergencyContact.name) { ec0.name = legacy.emergencyContact.name; changed = true; }
      if (!ec0.tel && legacy.emergencyContact.tel) { ec0.tel = legacy.emergencyContact.tel; changed = true; }
      if (!ec0.email && legacy.emergencyContact.email) { ec0.email = legacy.emergencyContact.email; changed = true; }
    }
  }

  if (changed) saveSafetyInfo(safety);
}

window.STEELER = window.STEELER || {};
window.STEELER.safetyEmergency = {
  SAFETY_INFO_KEY,
  EC_SETTINGS_KEY,
  loadSafetyInfo,
  saveSafetyInfo,
  getSafetyInfo,
  loadEcSettings,
  saveEcSettings,
  getEcSettings,
  getDefaultEmergencyContact,
  getEmergencyContacts,
  createBlankEmergencyContact,
  setDefaultEmergencyContact,
  deleteEmergencyContact,
  migrateLegacyEcSettingsIntoSafetyInfo
};
