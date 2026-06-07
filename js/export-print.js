// External output helpers for CSV, HTML, and print/PDF export.

window.STEELER = window.STEELER || {};

function quote(value) {
  if (value == null) return '""';
  const s = String(value).replace(/"/g, '""');
  return `"${s}"`;
}

function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildVesselDetailsHtml(){
  const s = getSafetyInfo();
  const v = s.vessel || {};
  const a = s.appearanceSafety || {};
  const o = s.owner || {};

  function row(label, value){
    const val = String(value || "").trim();
    if (!val) return "";
    return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(val).replace(/\n/g, "<br>")}</td></tr>`;
  }

  const generatedAt = new Date().toLocaleString("en-GB");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(v.boatName || "Vessel")} – Safety / Emergency Details</title>
<style>
  body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #f5f5f5; color: #111; }
  main { max-width: 900px; margin: 0 auto; padding: 24px; }
  header { background: #111827; color: white; padding: 22px 24px; border-radius: 16px; margin-bottom: 18px; }
  h1 { margin: 0; font-size: 1.6rem; }
  h2 { margin-top: 28px; border-bottom: 2px solid #ddd; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; background: white; border-radius: 14px; overflow: hidden; }
  th, td { text-align: left; vertical-align: top; padding: 10px 12px; border-bottom: 1px solid #eee; }
  th { width: 34%; background: #fafafa; }
  .note { margin-top: 18px; font-size: 0.95rem; color: #444; }
</style>
</head>
<body>
<main>
<header>
  <h1>${escapeHtml(v.boatName || "Vessel")} – Safety / Emergency Details</h1>
  <div>Generated: ${escapeHtml(generatedAt)}</div>
</header>

<h2>Vessel</h2>
<table>
${row("Boat Name", v.boatName)}
${row("Boat Type", v.boatType)}
${row("Callsign", v.callsign)}
${row("MMSI", v.mmsi)}
${row("UK SSR", v.ukSsr)}
${row("Boat Model", v.boatModel)}
${row("Length (m)", v.length)}
${row("Beam (m)", v.beam)}
${row("Draft (m)", v.draft)}
${row("Home Port", v.homePort)}
</table>

<h2>Appearance</h2>
<table>
${row("Hull Colour (topsides)", a.topsides)}
${row("Hull Colour (lower)", a.hull)}
${row("Superstructure Colour", a.superstructure)}
</table>

<h2>Safety Equipment</h2>
<table>
${row("Liferaft Details", a.liferaft)}
${row("Dinghy Details", a.dinghy)}
${row("Lifejacket Details", a.lifejackets)}
${row("EPIRB Details", a.epirb)}
${row("Other Safety Equipment", a.safetyEquip)}
${row("Radio / Navigation Equipment", a.rnEquip)}
</table>

<h2>Owner / Emergency Reference</h2>
<table>
${row("Owner Names", o.names)}
${row("Owner Tel", o.tel)}
${row("Owner Email", o.email)}
</table>

<p class="note">
This page is a reference copy of vessel safety information exported from the STEELER Logbook app.
In an emergency, pass this information to HM Coastguard.
</p>
</main>
</body>
</html>`;
}

function exportVesselDetailsHtml(){
  const s = getSafetyInfo();
  const boat = (s.vessel?.boatName || "STEELER").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  const html = buildVesselDetailsHtml();
  const blob = new Blob([html], { type: "text/html" });
  downloadBlob(blob, `${boat || "vessel"}-safety-emergency-details.html`);
}

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
  lines.push(`Time zone,${quote(getPassageTimeZoneLabel(p))}`);
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
  lines.push(["Time","Lat","Lon","COG/Heading","SOG (kn)","RPM","Eng T/P","WLog (NM)","GLog (NM)","Fuel used","Notes"].map(quote).join(","));

  (p.entries || []).filter(e => e && e.deleted !== true).slice().sort((a, b) => (a.time > b.time ? 1 : -1)).forEach(e => {
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
  downloadBlob(new Blob([csvContent], { type: "text/csv;charset=utf-8;" }), filename);
}

function exportCurrentPassageToPdf() {
  const p = getCurrentPassage();
  if (!p) return alert("No passage selected.");

  try { updatePlanSummaryPanel(); } catch(e) {}
  try { renderLogEntries(); } catch(e) {}

  const date = p.plan.date || p.createdAt.slice(0, 10);
  const from = p.plan.from || "UnknownFrom";
  const to = p.plan.to || "UnknownTo";
  const title = `${date} — ${from} → ${to}`;

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

  const planHtml = `
    <section class="print-plan">
      ${planSummaryPanel ? planSummaryPanel.innerHTML : ""}
    </section>
  `;

  const colgroupHtml = `
    <colgroup>
      <col style="width:5.5ch">
      <col style="width:3.5ch">
      <col style="width:4.5ch">
      <col style="width:4.5ch">
      <col style="width:7.5ch">
      <col style="width:6.5ch">
      <col style="width:6.5ch">
      <col style="width:6.5ch">
      <col style="width:auto">
    </colgroup>
  `;
  const theadHtml = `
      <thead>
        <tr>
          <th>TIME</th>
          <th>COG</th>
          <th>SOG</th>
          <th>RPM</th>
          <th>ENG&nbsp;T/P</th>
          <th>LOG&nbsp;W</th>
          <th>LOG&nbsp;G</th>
          <th>FUEL</th>
          <th>NOTES / ACTIONS</th>
        </tr>
      </thead>`;

  const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const entries = (p.entries || []).filter(e => e && e.deleted !== true).slice().sort((a,b) => (a.time > b.time ? 1 : -1));
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
  window.print();
  setTimeout(() => { printArea.innerHTML = ""; }, 500);
}

window.STEELER.exportPrint = {
  quote,
  downloadBlob,
  buildVesselDetailsHtml,
  exportVesselDetailsHtml,
  exportCurrentPassageToCsv,
  exportCurrentPassageToPdf
};
