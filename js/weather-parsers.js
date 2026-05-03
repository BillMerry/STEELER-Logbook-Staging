// Weather parsing and formatting helpers. Uses DOMParser for fetched HTML only;
// no app DOM, storage, or network access.

window.STEELER = window.STEELER || {};

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

window.STEELER.weatherParsers = {
  splitIntoSentences: typeof splitIntoSentences !== "undefined" ? splitIntoSentences : undefined,
  parseMetOfficeParagraph: typeof parseMetOfficeParagraph !== "undefined" ? parseMetOfficeParagraph : undefined,
  extractIssuedLine: typeof extractIssuedLine !== "undefined" ? extractIssuedLine : undefined,
  formatMetOfficeShorthand: typeof formatMetOfficeShorthand !== "undefined" ? formatMetOfficeShorthand : undefined,
  formatMFIssuedShort: typeof formatMFIssuedShort !== "undefined" ? formatMFIssuedShort : undefined,
  normalizeMeteoFranceLabels: typeof normalizeMeteoFranceLabels !== "undefined" ? normalizeMeteoFranceLabels : undefined,
  abbreviateMeteoFranceLine: typeof abbreviateMeteoFranceLine !== "undefined" ? abbreviateMeteoFranceLine : undefined,
  formatMeteoFranceShorthand: typeof formatMeteoFranceShorthand !== "undefined" ? formatMeteoFranceShorthand : undefined,
  parseMetOfficeInshore: typeof parseMetOfficeInshore !== "undefined" ? parseMetOfficeInshore : undefined,
  parseMeteoFranceMarine: typeof parseMeteoFranceMarine !== "undefined" ? parseMeteoFranceMarine : undefined,
  formatMeteoFranceSummary: typeof formatMeteoFranceSummary !== "undefined" ? formatMeteoFranceSummary : undefined,
  shortMetOfficeIssued: typeof shortMetOfficeIssued !== "undefined" ? shortMetOfficeIssued : undefined,
  shortMFIssued: typeof shortMFIssued !== "undefined" ? shortMFIssued : undefined,
  shortMFPeriodId: typeof shortMFPeriodId !== "undefined" ? shortMFPeriodId : undefined,
  formatMetOfficeFromWorker: typeof formatMetOfficeFromWorker !== "undefined" ? formatMetOfficeFromWorker : undefined,
  formatMeteoFranceFromWorker: typeof formatMeteoFranceFromWorker !== "undefined" ? formatMeteoFranceFromWorker : undefined
};
