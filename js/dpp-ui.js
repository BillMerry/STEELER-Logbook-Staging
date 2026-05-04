// Detailed Passage Plan rendering, GPX import UI, and form readback.
// Calculations remain in js/dpp-calculations.js; app.js remains the coordinator.

let dppGpxFileInput = null;

function getDetailedPassagePlanMount(){
  let mount = document.getElementById("detailedPassagePlanSection");
  if (mount) return mount;

  mount = document.createElement("div");
  mount.id = "detailedPassagePlanSection";
  mount.className = "card";

  const anchor = addDailySummaryBtn;
  if (anchor && anchor.parentNode) {
    anchor.parentNode.insertBefore(mount, anchor.nextSibling);
  } else if (dailySummariesContainer && dailySummariesContainer.parentNode) {
    dailySummariesContainer.parentNode.appendChild(mount);
  } else if (planForm) {
    planForm.appendChild(mount);
  }

  return mount;
}

function renderDetailedPassagePlan(p){
  if (!p) return;
  ensureDetailedPassagePlans(p);
  const legIdx = getSelectedDetailedPlanLegIndex(p);
  recalcDetailedPassagePlan(p, legIdx);

  const mount = getDetailedPassagePlanMount();
  const detailed = getDetailedPassagePlanForLeg(p, legIdx);
  const wps = detailed.waypoints;
  const dppTotals = calcDetailedPassagePlanTotals(wps);
  const dppRunningTotals = calcDetailedPassagePlanRunningTotals(wps);
  const legCount = getLegCount(p);
  const routeLeg = getRouteLegNames(p, legIdx);
  const routeLabel = routeLeg.origin && routeLeg.destination
    ? `${routeLeg.origin} → ${routeLeg.destination}`
    : `Leg ${legIdx + 1}`;
  const dppTemplates = typeof getDppTemplates === "function" ? getDppTemplates() : [];
  const dppTemplateOptions = dppTemplates.length
    ? dppTemplates.map((tpl) => `<option value="${escapeHtml(tpl.id)}">${escapeHtml(tpl.name)}</option>`).join("")
    : '<option value="">No saved DPPs</option>';
  const dppTemplateControlsHtml = `
    <div style="margin-top:0.75rem; display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
      <input type="text" id="dppTemplateName" value="${escapeHtml(routeLabel)}" placeholder="DPP template name" style="min-width:220px; flex:1 1 220px;">
      <button type="button" class="btn btn-secondary btn-small" id="dppSaveTemplateBtn">Save DPP Template</button>
      <select id="dppTemplateSelect" style="min-width:220px; flex:1 1 220px;" ${dppTemplates.length ? "" : "disabled"}>
        ${dppTemplateOptions}
      </select>
      <button type="button" class="btn btn-secondary btn-small" id="dppUseTemplateBtn" ${dppTemplates.length ? "" : "disabled"}>Use Template</button>
      <button type="button" class="btn btn-secondary btn-small" id="dppDeleteTemplateBtn" ${dppTemplates.length ? "" : "disabled"}>Delete Template</button>
    </div>
  `;
  const legTabsHtml = legCount > 1
    ? `<div class="dpp-leg-tabs">${Array.from({ length: legCount }, (_, i) => {
        const leg = getRouteLegNames(p, i);
        const label = leg.origin && leg.destination ? `${leg.origin} → ${leg.destination}` : `Leg ${i + 1}`;
        return `<button type="button" class="btn btn-secondary btn-small dpp-leg-tab${i === legIdx ? " active" : ""}" data-dpp-leg="${i}">Leg ${i + 1}: ${escapeHtml(label)}</button>`;
      }).join("")}</div>`
    : "";

  mount.innerHTML = `
    <h3>Detailed Passage Plan${legCount > 1 ? ` - Leg ${legIdx + 1}: ${escapeHtml(routeLabel)}` : ""}</h3>
    ${legTabsHtml}
    <div style="overflow-x:auto;">
      <table class="log-table dpp-table-compact" style="min-width:1120px;">
        <thead>
          <tr>
            <th>Time</th>
            <th>Waypoint</th>
            <th>WP Lat/Lon</th>
            <th>Dist<br>NM</th>
												<th>COG<br>°T</th>
												<th>Plan<br>kt</th>
												<th>Time<br>Next</th>
												<th>Fuel<br>L</th>
												<th>Total<br>NM</th>
												<th>Total<br>Time</th>
												<th>Total<br>L</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${wps.map((wp, idx) => `
            <tr data-dpp-row="${idx}">
              <td><input type="text" class="dpp-time" value="${escapeHtml(wp.time || "")}" placeholder="HH:MM" style="width:72px"></td>
              <td><input type="text" class="dpp-name" value="${escapeHtml(wp.name || "")}" placeholder="Waypoint"></td>
              <td><input type="text" class="dpp-coords" value="${escapeHtml(wp.coordsText || formatDetailedWaypointCoords(wp.lat, wp.lon))}" placeholder="50º45.123'N, 001º18.456'W or 50.752, -1.308" style="min-width:220px"></td>
              <td>${wp.distToNext !== "" ? escapeHtml(String(wp.distToNext)) : "–"}</td>
              <td>${wp.cogToNext ? escapeHtml(wp.cogToNext) : "–"}</td>
              <td><input type="number" step="0.1" inputmode="decimal" class="dpp-speed" value="${escapeHtml(wp.plannedSpeed || "")}" placeholder="kt" style="width:56px"></td>
              <td>${wp.timeToNext ? escapeHtml(wp.timeToNext) : "–"}</td>
              <td>${wp.fuelToNext !== "" && wp.fuelToNext != null ? escapeHtml(String(wp.fuelToNext)) : "–"}</td>
              <td>${escapeHtml(String(dppRunningTotals[idx]?.totalNm ?? 0))}</td>
              <td>${escapeHtml(dppRunningTotals[idx]?.totalTime || "00:00")}</td>
              <td>${escapeHtml(String(dppRunningTotals[idx]?.totalFuel ?? 0))}</td>
              <td style="white-space:nowrap;">
                <button type="button" class="btn btn-secondary btn-small dpp-up">↑</button>
                <button type="button" class="btn btn-secondary btn-small dpp-down">↓</button>
                <button type="button" class="btn btn-secondary btn-small dpp-del">✕</button>
              </td>
            </tr>
          `).join("")}
          <tr class="dpp-totals-row">
            <td colspan="3" style="text-align:right; font-weight:700;">TOTAL</td>
            <td style="font-weight:700;">${escapeHtml(String(dppTotals.totalNm || 0))}</td>
            <td></td>
            <td></td>
            <td style="font-weight:700;">${escapeHtml(dppTotals.totalDuration || "00:00")}</td>
            <td style="font-weight:700;">${escapeHtml(String(dppTotals.totalFuel || 0))}</td>
            <td style="font-weight:700;">${escapeHtml(String(dppTotals.totalNm || 0))}</td>
            <td style="font-weight:700;">${escapeHtml(dppTotals.totalDuration || "00:00")}</td>
            <td style="font-weight:700;">${escapeHtml(String(dppTotals.totalFuel || 0))}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div style="margin-top:0.6rem; display:flex; gap:0.5rem; flex-wrap:wrap;">
      <button type="button" class="btn btn-secondary btn-small" id="dppAddWaypointBtn">+ Add Waypoint</button>
	      <button type="button" class="btn btn-secondary btn-small" id="dppRecalcBtn">Recalculate Passage Plan</button>
	      <button type="button" class="btn btn-secondary btn-small" id="dppImportGpxBtn">Import GPX</button>
	      <button type="button" class="btn btn-secondary btn-small" id="dppReverseBtn">Reverse Route</button>
	      ${legIdx > 0 ? '<button type="button" class="btn btn-secondary btn-small" id="dppReversePreviousBtn">Reverse Previous Passage Plan</button>' : ''}
	    </div>
    ${dppTemplateControlsHtml}

    <div style="margin-top:0.85rem;">
      <label>
        Hazards (this leg)
        <textarea id="dppHazards" rows="2">${escapeHtml(detailed.hazards || "")}</textarea>
      </label>
    </div>

    <div style="margin-top:0.6rem;">
      <label>
        Ports of Refuge (this leg)
        <textarea id="dppPortsOfRefuge" rows="2">${escapeHtml(detailed.portsOfRefuge || "")}</textarea>
      </label>
    </div>

    <div style="margin-top:0.6rem;">
      <label>
        Crew Welfare (this leg)
        <textarea id="dppCrewWelfare" rows="2">${escapeHtml(detailed.crewWelfare || "")}</textarea>
      </label>
    </div>
  `;

  mount.querySelectorAll(".dpp-leg-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      readDetailedPassagePlanFromForm();
      setSelectedDetailedPlanLegIndex(p, Number(btn.dataset.dppLeg));
      savePassages();
      renderDetailedPassagePlan(p);
      updatePlanSummaryPanel();
    });
  });

  mount.querySelector("#dppSaveTemplateBtn")?.addEventListener("click", () => {
    try {
      const activeDetailed = readDetailedPassagePlanFromForm();
      const templateNameEl = mount.querySelector("#dppTemplateName");
      const templateName = (templateNameEl?.value || routeLabel || `Leg ${legIdx + 1}`).trim();

      saveDppTemplate(templateName, activeDetailed);
      savePassages();
      renderDetailedPassagePlan(p);
      updatePlanSummaryPanel();
    } catch (err) {
      console.error(err);
      alert(err?.message || "Could not save that DPP template.");
    }
  });

  mount.querySelector("#dppUseTemplateBtn")?.addEventListener("click", () => {
    try {
      const selectedId = mount.querySelector("#dppTemplateSelect")?.value || "";
      const template = getDppTemplateById(selectedId);
      if (!template) return;
      if (!confirm(`Replace this leg's Detailed Passage Plan with "${template.name}"?`)) return;

      const replacement = cloneDetailedPassagePlan(template.detailed, { regenerateIds: true });
      setDetailedPassagePlanForLeg(p, legIdx, replacement);
      recalcDetailedPassagePlan(p, legIdx);
      savePassages();
      renderDetailedPassagePlan(p);
      updatePlanSummaryPanel();
    } catch (err) {
      console.error(err);
      alert(err?.message || "Could not use that DPP template.");
    }
  });

  mount.querySelector("#dppDeleteTemplateBtn")?.addEventListener("click", () => {
    try {
      const selectedId = mount.querySelector("#dppTemplateSelect")?.value || "";
      const template = getDppTemplateById(selectedId);
      if (!template) return;
      if (!confirm(`Delete DPP template "${template.name}"?`)) return;

      deleteDppTemplate(selectedId);
      renderDetailedPassagePlan(p);
      updatePlanSummaryPanel();
    } catch (err) {
      console.error(err);
      alert(err?.message || "Could not delete that DPP template.");
    }
  });

  mount.querySelector("#dppAddWaypointBtn")?.addEventListener("click", () => {
    const activeDetailed = readDetailedPassagePlanFromForm();

    activeDetailed.waypoints.push({
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

    savePassages();
    renderDetailedPassagePlan(p);
    updatePlanSummaryPanel();
  });

  mount.querySelector("#dppRecalcBtn")?.addEventListener("click", () => {
    readDetailedPassagePlanFromForm();
    recalcDetailedPassagePlan(p, legIdx);
    savePassages();
    renderDetailedPassagePlan(p);
    updatePlanSummaryPanel();
  });

  mount.querySelector("#dppImportGpxBtn")?.addEventListener("click", () => {
    importDetailedPassagePlanGpx(p);
  });

  mount.querySelector("#dppReverseBtn")?.addEventListener("click", () => {
    const activeDetailed = readDetailedPassagePlanFromForm();

    const arr = activeDetailed.waypoints || [];
    if (arr.length < 2) return;

    const firstTime = arr[0]?.time || "";
    arr.reverse();

    if (arr.length) arr[0].time = firstTime;
    for (let i = 1; i < arr.length; i++) {
      arr[i].time = "";
    }

    recalcDetailedPassagePlan(p, legIdx);
    savePassages();
    renderDetailedPassagePlan(p);
    updatePlanSummaryPanel();
  });

  mount.querySelector("#dppReversePreviousBtn")?.addEventListener("click", () => {
    readDetailedPassagePlanFromForm();
    const prev = getDetailedPassagePlanForLeg(p, legIdx - 1);
    if (!prev || !Array.isArray(prev.waypoints) || prev.waypoints.length < 2) {
      alert("The previous leg does not have enough waypoints to reverse.");
      return;
    }
    if (!confirm("Replace this leg's Detailed Passage Plan with a reversed copy of the previous leg?")) return;

    const replacement = reverseDetailedPassagePlanFromPrevious(prev);
    setDetailedPassagePlanForLeg(p, legIdx, replacement);
    recalcDetailedPassagePlan(p, legIdx);
    savePassages();
    renderDetailedPassagePlan(p);
    updatePlanSummaryPanel();
  });

  mount.querySelectorAll("[data-dpp-row]").forEach(row => {
    const idx = parseInt(row.dataset.dppRow, 10);
    const wp = detailed.waypoints[idx];
    if (!wp) return;

    const dppTimeEl = row.querySelector(".dpp-time");
    dppTimeEl?.addEventListener("input", () => {
      wp.time = dppTimeEl.value || "";
      savePassages();
    });

    row.querySelector(".dpp-name")?.addEventListener("input", (e) => {
      wp.name = e.target.value.trim();
      savePassages();
      updatePlanSummaryPanel();
    });

    const dppCoordsEl = row.querySelector(".dpp-coords");
    dppCoordsEl?.addEventListener("input", () => {
      const raw = dppCoordsEl.value || "";
      const parsed = parseDetailedWaypointCoords(raw);

      if (parsed) {
        wp.lat = parsed.lat;
        wp.lon = parsed.lon;
        wp.coordsText = formatDetailedWaypointCoords(parsed.lat, parsed.lon);
      } else if (!String(raw).trim()) {
        wp.lat = null;
        wp.lon = null;
        wp.coordsText = "";
      } else {
        wp.coordsText = raw;
      }

      savePassages();
    });

    const dppSpeedEl = row.querySelector(".dpp-speed");
    dppSpeedEl?.addEventListener("input", () => {
      wp.plannedSpeed = (dppSpeedEl.value || "").trim();
      savePassages();
    });

    row.querySelector(".dpp-up")?.addEventListener("click", () => {
      const activeDetailed = readDetailedPassagePlanFromForm();

      if (idx <= 0) return;
      const arr = activeDetailed.waypoints;
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      recalcDetailedPassagePlan(p, legIdx);
      savePassages();
      renderDetailedPassagePlan(p);
      updatePlanSummaryPanel();
    });

    row.querySelector(".dpp-down")?.addEventListener("click", () => {
      const activeDetailed = readDetailedPassagePlanFromForm();

      const arr = activeDetailed.waypoints;
      if (idx >= arr.length - 1) return;
      [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      recalcDetailedPassagePlan(p, legIdx);
      savePassages();
      renderDetailedPassagePlan(p);
      updatePlanSummaryPanel();
    });

    row.querySelector(".dpp-del")?.addEventListener("click", () => {
      const activeDetailed = readDetailedPassagePlanFromForm();

      activeDetailed.waypoints.splice(idx, 1);
      recalcDetailedPassagePlan(p, legIdx);
      savePassages();
      renderDetailedPassagePlan(p);
      updatePlanSummaryPanel();
    });
  });

  mount.querySelector("#dppHazards")?.addEventListener("input", (e) => {
    detailed.hazards = e.target.value;
    savePassages();
    updatePlanSummaryPanel();
  });

  mount.querySelector("#dppPortsOfRefuge")?.addEventListener("input", (e) => {
    detailed.portsOfRefuge = e.target.value;
    savePassages();
    updatePlanSummaryPanel();
  });

  mount.querySelector("#dppCrewWelfare")?.addEventListener("input", (e) => {
    detailed.crewWelfare = e.target.value;
    savePassages();
    updatePlanSummaryPanel();
  });
}
function readDetailedPassagePlanFromForm(){
  const p = getCurrentPassage();
  if (p) ensureDetailedPassagePlans(p);
  const legIdx = p ? getSelectedDetailedPlanLegIndex(p) : 0;
  const fallback = p ? getDetailedPassagePlanForLeg(p, legIdx) : { waypoints: [], hazards: "", portsOfRefuge: "", crewWelfare: "" };
  const mount = document.getElementById("detailedPassagePlanSection");
  if (!mount) return fallback;

  const rows = mount.querySelectorAll("[data-dpp-row]");
  const waypoints = [];
  rows.forEach((row, idx) => {
    const time = normalisePassagePlanTimeInput(row.querySelector(".dpp-time")?.value || "");
    const name = (row.querySelector(".dpp-name")?.value || "").trim();
    const coordsRaw = row.querySelector(".dpp-coords")?.value || "";
    const parsed = parseDetailedWaypointCoords(coordsRaw);

    waypoints.push({
      id: fallback.waypoints[idx]?.id || ("wp_" + Date.now() + "_" + Math.random().toString(36).slice(2)),
      time,
      name,
      coordsText: parsed ? formatDetailedWaypointCoords(parsed.lat, parsed.lon) : coordsRaw,
      lat: parsed ? parsed.lat : null,
      lon: parsed ? parsed.lon : null,
      distToNext: "",
      cogToNext: "",
      plannedSpeed: (row.querySelector(".dpp-speed")?.value || "").trim(),
      timeToNext: "",
      fuelToNext: ""
    });
  });

  const detailed = {
    waypoints,
    hazards: mount.querySelector("#dppHazards")?.value || "",
    portsOfRefuge: mount.querySelector("#dppPortsOfRefuge")?.value || "",
    crewWelfare: mount.querySelector("#dppCrewWelfare")?.value || ""
  };

  recalcDetailedPassagePlan(detailed);
  if (p) setDetailedPassagePlanForLeg(p, legIdx, detailed);
  return detailed;
}

function ensureDppGpxFileInput(){
  if (dppGpxFileInput) return dppGpxFileInput;

  const input = document.createElement("input");
  input.type = "file";
  // Leave accept unset so iPad Files doesn't grey out valid GPX files
  input.style.display = "none";
  document.body.appendChild(input);
  dppGpxFileInput = input;
  return input;
}

function parseDppGpxText(xmlText){
  const parser = new DOMParser();
  const xml = parser.parseFromString(String(xmlText || ""), "application/xml");

  const parserErr = xml.querySelector("parsererror");
  if (parserErr) {
    throw new Error("That GPX file could not be parsed.");
  }

  const pickName = (node, fallback) => {
    const nm = node.querySelector("name");
    const txt = (nm?.textContent || "").trim();
    return txt || fallback;
  };

  const points = [];

  // Priority 1: route points
  const rtepts = Array.from(xml.getElementsByTagName("rtept"));
  if (rtepts.length) {
    rtepts.forEach((pt, idx) => {
      const lat = parseFloat(pt.getAttribute("lat"));
      const lon = parseFloat(pt.getAttribute("lon"));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      points.push({
        name: pickName(pt, `WP${idx + 1}`),
        lat,
        lon
      });
    });
    return points;
  }

  // Priority 2: standalone waypoints
  const wpts = Array.from(xml.getElementsByTagName("wpt"));
  if (wpts.length) {
    wpts.forEach((pt, idx) => {
      const lat = parseFloat(pt.getAttribute("lat"));
      const lon = parseFloat(pt.getAttribute("lon"));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      points.push({
        name: pickName(pt, `WP${idx + 1}`),
        lat,
        lon
      });
    });
    return points;
  }

  // Ignore tracks for now
  return [];
}

function importDetailedPassagePlanGpx(p){
  if (!p) return;

  const input = ensureDppGpxFileInput();
  input.value = "";

  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;

    const lowerName = String(file.name || "").toLowerCase();
    const declaredType = String(file.type || "").toLowerCase();
    const looksLikeXml =
      lowerName.endsWith(".gpx") ||
      lowerName.endsWith(".xml") ||
      declaredType.includes("xml") ||
      declaredType.includes("gpx") ||
      declaredType === "";

    if (!looksLikeXml) {
      alert("Please choose a GPX/XML file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        // First sync current form state so we don't lose unsaved edits
        const activeDetailed = readDetailedPassagePlanFromForm();
        const legIdx = getSelectedDetailedPlanLegIndex(p);

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

        if (mode === "replace") {
          activeDetailed.waypoints = imported;
        } else {
          activeDetailed.waypoints = [
            ...(activeDetailed.waypoints || []),
            ...imported
          ];
        }

        setDetailedPassagePlanForLeg(p, legIdx, activeDetailed);
        recalcDetailedPassagePlan(p, legIdx);
        savePassages();
        renderDetailedPassagePlan(p);
        updatePlanSummaryPanel();
      } catch (err) {
        console.error(err);
        alert(err?.message || "Could not import that GPX file.");
      }
    };

    reader.readAsText(file);
  };

  input.click();
}

function bindDppCommitEvents(inputEl, commitFn){
  if (!inputEl) return;
  inputEl.addEventListener("blur", commitFn);
  inputEl.addEventListener("change", commitFn);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitFn();
      inputEl.blur();
    }
  });
}

window.STEELER = window.STEELER || {};
window.STEELER.dppUi = {
  getDetailedPassagePlanMount,
  renderDetailedPassagePlan,
  readDetailedPassagePlanFromForm,
  ensureDppGpxFileInput,
  parseDppGpxText,
  importDetailedPassagePlanGpx,
  bindDppCommitEvents
};
