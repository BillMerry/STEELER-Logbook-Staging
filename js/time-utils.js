// Pure date/time helpers. No DOM or storage access.

window.STEELER = window.STEELER || {};

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

function localDateTimeInputValue(d = new Date(), timeZone = "") {
  const pad = (n) => String(n).padStart(2, "0");
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).formatToParts(d).reduce((acc, part) => {
        if (part.type !== "literal") acc[part.type] = part.value;
        return acc;
      }, {});
      if (parts.year && parts.month && parts.day && parts.hour && parts.minute) {
        return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
      }
    } catch {}
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localDateInputValue(d = new Date(), timeZone = "") {
  return localDateTimeInputValue(d, timeZone).slice(0, 10);
}

function formatTimeInZone(dateUtc, timeZone = "") {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timeZone || undefined
    }).format(dateUtc);
  } catch {
    return dateUtc.toLocaleTimeString("en-GB", {hour:"2-digit", minute:"2-digit", hour12:false});
  }
}

function getTimeZoneOffsetMinutes(dateUtc, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).formatToParts(dateUtc).reduce((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second || 0)
    );
    return Math.round((asUtc - dateUtc.getTime()) / 60000);
  } catch {
    return 0;
  }
}

function zonedDateTimeToUtc(isoDate, hhmm, timeZone) {
  const d = parseISODate(isoDate);
  const m = String(hhmm || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!d || !m) return null;

  const hour = Math.max(0, Math.min(23, Number(m[1])));
  const minute = Math.max(0, Math.min(59, Number(m[2])));
  let guess = new Date(Date.UTC(d.y, d.mo - 1, d.d, hour, minute, 0));

  for (let i = 0; i < 3; i++) {
    const offset = getTimeZoneOffsetMinutes(guess, timeZone);
    const next = new Date(Date.UTC(d.y, d.mo - 1, d.d, hour, minute, 0) - offset * 60000);
    if (Math.abs(next.getTime() - guess.getTime()) < 1000) return next;
    guess = next;
  }

  return guess;
}

function timeOnlyFromIso(iso) {
  const s = String(iso || "").trim();
  if (!s) return "";
  const m = s.match(/(?:T|\s)?(\d{2}:\d{2})(?::\d{2})?$/);
  return m ? m[1] : s;
}

function normalizeEntryTimeInput(raw, existingValue = "", fallbackDate = "") {
  const s = String(raw || "").trim();
  if (!s) return "";

  let m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?$/);
  if (m) return `${m[1]}T${m[2]}`;

  m = s.match(/^(\d{2}:\d{2})(?::\d{2})?$/);
  if (m) {
    const baseDate = String(existingValue || "").slice(0, 10) || fallbackDate || localDateTimeInputValue().slice(0, 10);
    return `${baseDate}T${m[1]}`;
  }

  return s;
}

window.STEELER.timeUtils = {
  parseISODate: typeof parseISODate !== "undefined" ? parseISODate : undefined,
  dayOfYear: typeof dayOfYear !== "undefined" ? dayOfYear : undefined,
  localDateTimeInputValue: typeof localDateTimeInputValue !== "undefined" ? localDateTimeInputValue : undefined,
  localDateInputValue: typeof localDateInputValue !== "undefined" ? localDateInputValue : undefined,
  formatTimeInZone: typeof formatTimeInZone !== "undefined" ? formatTimeInZone : undefined,
  getTimeZoneOffsetMinutes: typeof getTimeZoneOffsetMinutes !== "undefined" ? getTimeZoneOffsetMinutes : undefined,
  zonedDateTimeToUtc: typeof zonedDateTimeToUtc !== "undefined" ? zonedDateTimeToUtc : undefined,
  timeOnlyFromIso: typeof timeOnlyFromIso !== "undefined" ? timeOnlyFromIso : undefined,
  normalizeEntryTimeInput: typeof normalizeEntryTimeInput !== "undefined" ? normalizeEntryTimeInput : undefined
};
