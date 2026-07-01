// --- EC SMS Builders (CL-085) -------------------------------------
// Message builders and launch helpers only. Settings UI/data storage stays in app.js.

function roundHHMMToNearest5(hhmm){
  const mins = hhmmToMinutes(String(hhmm || "").trim());
  if (!Number.isFinite(mins)) return String(hhmm || "").trim();
  return minutesToHHMM(Math.round(mins / 5) * 5);
}

function formatSmsWpCoord(wp){
  const la = Number(wp?.lat);
  const lo = Number(wp?.lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return "";
  return formatDMM(la, lo);
}

function buildSmsRouteList(p, detailedPlan = null){
  const wps = detailedPlan?.waypoints || p?.plan?.detailed?.waypoints || [];
  if (wps.length <= 2) return "Direct / no intermediate waypoints set.";

  const out = [];

  const included = wps
    .slice(1, -1)
    .filter((wp) => wp?.includeInEcSms !== false)
    .slice(0, 9);

  for (let i = 0; i < included.length; i++){
    const wp = included[i];
    const coord = formatSmsWpCoord(wp);
    if (!coord) continue;

    const name = String(wp?.name || `WP${i + 2}`).trim();

    out.push(`${name}\n${coord}`);
  }

  const remainingIncluded = wps.slice(1, -1).filter((wp) => wp?.includeInEcSms !== false).length;
  if (remainingIncluded > included.length) out.push("… + more");

  return out.length ? out.join("\n") : "Direct / no intermediate waypoints set.";
}

function buildPorList(p, detailedPlan = null){
  return String(detailedPlan?.portsOfRefuge ?? p?.plan?.detailed?.portsOfRefuge ?? "").trim();
}

function getMarineTrafficLink(vessel){
  const boatName = String(vessel?.boatName || "STEELER").trim();
  const m = String(vessel?.mmsi || "").trim();
  const shipId = String(vessel?.marineTrafficShipId || "").trim();
  if (shipId) return `https://www.marinetraffic.com/en/ais/details/ships/shipid:${encodeURIComponent(shipId)}`;
  if (m) return `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${encodeURIComponent(m)}`;
  return `https://www.marinetraffic.com/en/ais/home/centerx:0/centery:0/zoom:3?search=${encodeURIComponent(boatName)}`;
}

function getSmsTimeZoneLabel(timeZone, utcDate = null){
  const tz = normalisePassageTimeZone(timeZone);
  if (tz === "UTC") return "GMT";
  if (tz === "Europe/Paris") return "CET";
  if (utcDate instanceof Date && !isNaN(utcDate)) {
    const offset = getTimeZoneOffsetMinutes(utcDate, "Europe/London");
    return offset === 60 ? "BST" : "GMT";
  }
  return "BST";
}

function formatSmsPassageTime(p, hhmm, isoDate = ""){
  const raw = String(hhmm || "").trim();
  if (!raw) return "";
  const date = String(isoDate || p?.plan?.date || "").trim();
  const planZone = getPassageTimeZone(p);
  const utcDate = date ? zonedDateTimeToUtc(date, raw, planZone) : null;
  const planLabel = getSmsTimeZoneLabel(planZone, utcDate);
  const planText = `${raw} ${planLabel}`;

  if (planZone !== "Europe/Paris" || !utcDate) return planText;

  const ukTime = formatTimeInZone(utcDate, "Europe/London");
  const ukLabel = getSmsTimeZoneLabel("Europe/London", utcDate);
  return `${planText} (${ukTime} ${ukLabel})`;
}

function getPassageEtaInfo(p, detailedPlan = null){
  const wps = detailedPlan?.waypoints || p?.plan?.detailed?.waypoints || [];
  if (!wps.length) return { etaText: "", overdueText: "" };

  const last = wps[wps.length - 1];
  const etaRaw = String(last?.time || "").trim();
  if (!etaRaw) return { etaText: "", overdueText: "" };

  const rawEtaMinutes = hhmmToMinutes(etaRaw);
  const bufferedEtaMinutes = Number.isFinite(rawEtaMinutes) ? rawEtaMinutes + 20 : NaN;
  const eta = Number.isFinite(bufferedEtaMinutes)
    ? roundHHMMToNearest5(minutesToHHMM(bufferedEtaMinutes))
    : roundHHMMToNearest5(etaRaw);

  const planDate = String(p?.plan?.date || "").trim();
  let etaDateText = planDate;

  try {
    const totalMinutes = durationHHMMToMinutes(calcDetailedPassagePlanTotals(wps).totalDuration || "00:00");
    const startMins = hhmmToMinutes(String(wps[0]?.time || "").trim());
    const endMins = hhmmToMinutes(String(last?.time || "").trim());

    let dayOffset = 0;
    if (Number.isFinite(totalMinutes) && totalMinutes >= 1440) {
      dayOffset = Math.floor(totalMinutes / 1440);
    } else if (Number.isFinite(startMins) && Number.isFinite(endMins) && endMins < startMins) {
      dayOffset = 1;
    }

    if (Number.isFinite(rawEtaMinutes) && rawEtaMinutes + 20 >= 1440) {
      dayOffset += 1;
    }

    if (planDate && dayOffset > 0) {
      const d = new Date(planDate + "T12:00:00");
      if (!isNaN(d.getTime())) {
        d.setDate(d.getDate() + dayOffset);
        etaDateText = d.toISOString().slice(0,10);
      }
    }
  } catch(e) {}

  const etaTimeText = formatSmsPassageTime(p, eta, etaDateText);
  const etaText = etaDateText ? `${etaTimeText} on ${etaDateText}` : etaTimeText;

  const overdueHours = Number(getSafetyInfo()?.defaults?.overdueHours || 2);
  const base = hhmmToMinutes(eta);
  const overdue = Number.isFinite(base) ? roundHHMMToNearest5(minutesToHHMM(base + overdueHours * 60)) : "";
  let overdueDateText = etaDateText;
  if (overdue && etaDateText && Number.isFinite(base) && base + overdueHours * 60 >= 1440) {
    try {
      const d = new Date(etaDateText + "T12:00:00");
      if (!isNaN(d.getTime())) {
        d.setDate(d.getDate() + Math.floor((base + overdueHours * 60) / 1440));
        overdueDateText = d.toISOString().slice(0, 10);
      }
    } catch {}
  }
  const overdueTimeText = overdue ? formatSmsPassageTime(p, overdue, overdueDateText) : "";

  const overdueText = overdue
    ? `If you have not heard from us by around ${overdueTimeText}, please try to contact us. If you cannot reach us, call 999 or 112 and ask for the Coastguard.`
    : "";

  return { etaText, overdueText };
}

function getSmsMultiLegContext(p, activeLeg){
  const legCount = typeof getLegCount === "function" ? getLegCount(p) : 1;
  if (legCount <= 1) return null;

  const names = typeof getRouteNames === "function" ? getRouteNames(p) : [];
  const transitPorts = names.slice(1, -1).filter(Boolean);
  const routeLeg = getRouteLegNames(p, activeLeg);
  const origin = String(routeLeg.origin || "").trim();
  const destination = String(routeLeg.destination || "").trim();

  return {
    legCount,
    transitText: transitPorts.join(", "),
    legText: `This message covers leg ${activeLeg + 1} of ${legCount}: ${origin || "origin"} to ${destination || "destination"}.`
  };
}

function buildEcStartSms(p, legIdx = null){
  const sOld = getEcSettings(); // fallback
  const sNew = getSafetyInfo();

  const vessel = sNew.vessel || sOld.vesselProfile || {};
  const activeLeg = Number.isFinite(Number(legIdx)) ? Number(legIdx) : getCurrentLegIndex(p);
  const routeLeg = getRouteLegNames(p, activeLeg);
  const origin = String(routeLeg.origin || p?.plan?.from || "").trim();
  const destination = String(routeLeg.destination || p?.plan?.to || "").trim();
  const detailedPlan = getDetailedPassagePlanForLeg(p, activeLeg);
  const wps = detailedPlan?.waypoints || [];

  const firstWp = wps[0] || null;
  const lastWp = wps.length ? wps[wps.length - 1] : null;

  const originCoord = formatSmsWpCoord(firstWp);
  const destCoord = formatSmsWpCoord(lastWp);

  const mmsi = String(vessel.mmsi || "").trim();
  const mtLink = getMarineTrafficLink(vessel);
  const por = buildPorList(p, detailedPlan);
  const etaInfo = getPassageEtaInfo(p, detailedPlan);
  const pob = p.pob || "?";
  const multiLegContext = getSmsMultiLegContext(p, activeLeg);
  const fullOrigin = String(p?.plan?.from || origin || "").trim();
  const fullDestination = String(p?.plan?.to || destination || "").trim();

  const intro = multiLegContext
    ? `LOOKOUT REQUEST

Thanks for agreeing to look out for us during ${vessel.boatName || "our vessel"}'s passage from ${fullOrigin || "our origin"} to ${fullDestination || "our destination"} today, with a stop off at ${multiLegContext.transitText || "our transit port"}. ${multiLegContext.legText} ${etaInfo.etaText ? `We expect to arrive around ${etaInfo.etaText}. ` : ""}We'll message you once we've completed this leg of the passage to confirm our arrival.`
    : `LOOKOUT REQUEST

Thanks for agreeing to look out for us during ${vessel.boatName || "our vessel"}'s passage from ${origin || "our origin"} to ${destination || "our destination"} today. ${etaInfo.etaText ? `We expect to arrive around ${etaInfo.etaText}. ` : ""}We'll message you once we've completed the passage to confirm our arrival.`;

  const vesselBlock = `VESSEL
Persons on Board: ${pob}
Boat Name: ${vessel.boatName || ""}
Boat Type: ${vessel.boatType || ""}
Callsign: ${vessel.callsign || ""}
MMSI: ${mmsi}`;

		const passageLines = [
				`Origin: ${origin || ""}`,
				originCoord,

				"",

				`Destination: ${destination || ""}`,
				destCoord,

				"",

				etaInfo.etaText ? `ETA: ${etaInfo.etaText}` : "",

				"",

					`Intended Routing:\n${buildSmsRouteList(p, detailedPlan)}`,

				"",

				por ? `Possible Ports of Refuge:\n${por}` : ""
		].filter(v => v !== undefined && v !== null);

  const includeMt = sNew.defaults?.includeMarineTrafficInSms !== false;
  const includeDetails = sNew.defaults?.includeDetailsUrlInSms !== false;

  const detailsUrl = String(
    sNew.defaults?.detailsPageUrl ||
    `${window.location.origin}${window.location.pathname.replace(/\/[^\/]*$/, "/")}STEELER-safety-emergency-details.html`
  ).trim();

  const sections = [
    intro,
    (mtLink && includeMt) ? `AIS position link (when in range): ${mtLink}\n\nNote: If your phone opens this in a MarineTraffic or VesselFinder app and STEELER is not shown, please open the same link in a web browser instead.` : "",
    etaInfo.overdueText,
    "The following information may be of interest and should also be passed on to the Coastguard in case of emergency.",
    vesselBlock,
    `PASSAGE DETAILS\n${passageLines.join("\n")}`,
    (includeDetails && detailsUrl) ? `FULL VESSEL DETAILS:\n${detailsUrl}` : ""
  ];

  return sections.filter(Boolean).join("\n\n").trim();
}

function buildEcEndSms(p, legIdx = null){
  const activeLeg = Number.isFinite(Number(legIdx)) ? Number(legIdx) : getCurrentLegIndex(p);
  const legCount = typeof getLegCount === "function" ? getLegCount(p) : 1;
  const routeLeg = getRouteLegNames(p, activeLeg);
  const destination = String(routeLeg.destination || p?.plan?.to || "").trim();

  if (legCount > 1 && activeLeg < legCount - 1) {
    return destination
      ? `Thanks for looking out for us during our passage to ${destination} today. We've arrived safely and our passage plan is now ended. We will message you when we start the next leg of the passage.`
      : `Thanks for looking out for us during this leg of our passage today. We've arrived safely and our passage plan is now ended. We will message you when we start the next leg of the passage.`;
  }

  return destination
    ? `Thanks for looking out for us during our passage to ${destination} today. We've arrived safely and our passage plan is now ended.`
    : `Thanks for looking out for us during our passage today. We've arrived safely and our passage plan is now ended.`;
}

function launchSms(number, message){
  if (!number){
    alert("No Emergency Contact number set.");
    return;
  }
  window.location.href = `sms:${number}?body=${encodeURIComponent(message)}`;
}

function getPassageLookoutSmsContact(p){
  const contact = p?.ecSms?.lookoutContact;
  if (!contact || typeof contact !== "object") return null;
  const tel = String(contact.tel || "").trim();
  const contactId = String(contact.contactId || "").trim();
  if (!tel && !contactId) return null;
  return {
    contactId,
    name: String(contact.name || "").trim(),
    tel,
    oneOff: contact.oneOff === true
  };
}

function rememberPassageLookoutSmsContact(p, contact){
  if (!p || !contact) return;
  const tel = String(contact.tel || "").trim();
  const contactId = String(contact.contactId || "").trim();
  if (!tel && !contactId) return;
  p.ecSms = p.ecSms && typeof p.ecSms === "object" ? p.ecSms : {};
  p.ecSms.lookoutContact = {
    contactId,
    name: String(contact.name || "").trim(),
    tel,
    oneOff: contact.oneOff === true
  };
  try {
    if (typeof markPassageDirty === "function") markPassageDirty(p, new Date().toISOString(), "ec-sms-contact");
    if (typeof savePassages === "function") savePassages();
  } catch(e) {}
}

function chooseEmergencyContactAndSend(message, sendOptions = {}){
  const contacts = getEmergencyContacts();
  const usableContacts = contacts.filter(c => String(c.tel || "").trim());
  const passageContact = sendOptions.usePassageLookoutContact
    ? getPassageLookoutSmsContact(sendOptions.passage)
    : null;
  const preferredContactId = String(sendOptions.preferredContactId || passageContact?.contactId || "").trim();
  const preferredTel = String(sendOptions.preferredTel || passageContact?.tel || "").trim();
  const preferredSavedContact = preferredContactId
    ? usableContacts.find(c => String(c.id) === preferredContactId)
    : preferredTel ? usableContacts.find(c => String(c.tel || "").trim() === preferredTel) : null;
  const defaultContact = preferredSavedContact || usableContacts.find(c => c.isDefault) || usableContacts[0] || null;
  const oneOffName = preferredSavedContact ? "" : String(sendOptions.preferredName || passageContact?.name || "").trim();
  const oneOffTelValue = preferredSavedContact ? "" : preferredTel;

  const selectOptions = usableContacts.map(c => `
    <option value="${escapeHtml(c.id)}"${defaultContact && String(c.id) === String(defaultContact.id) ? " selected" : ""}>
      ${escapeHtml(c.name || "(unnamed contact)")} — ${escapeHtml(c.tel || "")}${c.isDefault ? " [default]" : ""}
    </option>
  `).join("");

  showModal({
    title: "Notify Emergency Contact",
    okText: "Send SMS",
    cancelText: "Cancel",
    bodyHtml: `
      <div style="display:grid; gap:12px;">
        <div>
          <label>
            Saved Emergency Contact
            <select id="notifyEcSelect" style="width:100%; padding:8px; border-radius:10px;">
              ${selectOptions || `<option value="">No saved contacts with telephone numbers</option>`}
            </select>
          </label>
        </div>

        <div style="border-top:1px solid var(--line); padding-top:10px;">
          <div style="font-weight:600; margin-bottom:6px;">Or use a one-off contact</div>
          <input id="notifyEcOneOffName" placeholder="One-off EC name" value="${escapeHtml(oneOffName)}" style="width:100%; margin-bottom:6px;">
          <input id="notifyEcOneOffTel" placeholder="One-off EC telephone" value="${escapeHtml(oneOffTelValue)}" style="width:100%;">
          <div style="font-size:0.9em; opacity:0.75; margin-top:6px;">
            One-off details are used for this message only and are not saved.
          </div>
        </div>
      </div>
    `,
    onOk: () => {
      const oneOffTel = (document.getElementById("notifyEcOneOffTel")?.value || "").trim();
      if (oneOffTel){
        if (sendOptions.rememberAsPassageLookoutContact) {
          rememberPassageLookoutSmsContact(sendOptions.passage, {
            contactId: "",
            name: (document.getElementById("notifyEcOneOffName")?.value || "").trim(),
            tel: oneOffTel,
            oneOff: true
          });
        }
        launchSms(oneOffTel, message);
        return true;
      }

      const selectedId = (document.getElementById("notifyEcSelect")?.value || "").trim();
      const selected = usableContacts.find(c => String(c.id) === String(selectedId));

      if (!selected || !selected.tel){
        alert("Please choose a saved EC with a telephone number, or enter a one-off telephone number.");
        return false;
      }

      if (sendOptions.rememberAsPassageLookoutContact) {
        rememberPassageLookoutSmsContact(sendOptions.passage, {
          contactId: selected.id,
          name: selected.name,
          tel: selected.tel,
          oneOff: false
        });
      }
      launchSms(selected.tel, message);
      return true;
    }
  });
}

window.STEELER = window.STEELER || {};
window.STEELER.ecSms = {
  roundHHMMToNearest5,
  formatSmsWpCoord,
  buildSmsRouteList,
  buildPorList,
  getMarineTrafficLink,
  getPassageEtaInfo,
  getSmsMultiLegContext,
  buildEcStartSms,
  buildEcEndSms,
  launchSms,
  getPassageLookoutSmsContact,
  rememberPassageLookoutSmsContact,
  chooseEmergencyContactAndSend
};
