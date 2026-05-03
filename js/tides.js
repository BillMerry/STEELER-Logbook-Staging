// Pure tide parsing helpers. No DOM or storage access.

window.STEELER = window.STEELER || {};

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
      const re = new RegExp(`(?:^|\\n).*\\b${day2}\\s+(?:${monShort}|${monLong})\\s+${yr}\\b[\\s\\S]*?(?=\\n\\s*\\w+\\,\\s*\\d{2}\\s+(?:${monShort}|${monLong})\\s+\\d{4}\\b|$)`, "i");
      const m = raw.match(re);
      if (m && m[0]) block = m[0];
    }
  }

  const stationName = raw.split("\n")
    .map(s => s.trim())
    .find(s => s
      && !/^\w+\s*,\s*\d{1,2}\s+[A-Za-z]+\s+\d{4}$/i.test(s)
      && !/^(BST|UTC|GMT)$/i.test(s)
      && !/^[▲▼]/.test(s)
      && !/^Coef\b/i.test(s)
      && !/^\(?\d+(?:[\.,]\d+)?m\)?$/i.test(s)
      && !/[0-9]+°.*[0-9]+[’'′]/.test(s)
    ) || "";

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

  let coeff = "";
  const cm = block.match(/\bCoef\s+([0-9]{1,3}(?:\s*,\s*[0-9]{1,3})*)/i);
  if (cm && cm[1]) coeff = cm[1].replace(/\s+/g," ").trim();

  events.sort((a,b) => (a.time > b.time ? 1 : (a.time < b.time ? -1 : 0)));

  const hwEv = events.filter(e => e.type==="HW").slice(0,2);
  const lwEv = events.filter(e => e.type==="LW").slice(0,2);
  const hw = hwEv.map(e => e.time);
  const lw = lwEv.map(e => e.time);
  const hwH = hwEv.map(e => (typeof e.height === "number" ? String(e.height) : ""));
  const lwH = lwEv.map(e => (typeof e.height === "number" ? String(e.height) : ""));

  return { ok:true, events, hw, lw, hwH, lwH, coeff, stationName, source:"imray", raw };
}

window.STEELER.tides = {
  parseTidePaste: typeof parseTidePaste !== "undefined" ? parseTidePaste : undefined
};
