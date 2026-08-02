// ═══════════════════════════════════════════════════════════════
// FILE: src/utils/dates.js
// SINGLE SOURCE OF TRUTH for all date operations
//
// RULE:
//   • UTC functions  → backend keys (Firestore IDs, fixture files). NEVER change these.
//   • LOCAL functions → display only (day tabs, kickoff clock).
// ═══════════════════════════════════════════════════════════════

// Safely parse a date string as UTC if it lacks timezone info
export function parseDateAsUTC(dateStr) {
  if (!dateStr) return new Date(NaN);
  if (typeof dateStr !== 'string') return new Date(dateStr);
  if (dateStr.endsWith('Z') || dateStr.includes('+') || (dateStr.length > 10 && dateStr.indexOf('-', 10) !== -1)) {
    return new Date(dateStr);
  }
  return new Date(dateStr + 'Z');
}

// ───────────────────────────────────────────────────────────────
// UTC DATE STRINGS  →  backend keys (must match the backend exactly)
// ───────────────────────────────────────────────────────────────
export function getLocalDateStr(offset = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const todayStr = () => getLocalDateStr(0);
export const yesterdayStr = () => getLocalDateStr(-1);
export const tomorrowStr = () => getLocalDateStr(1);
export const getDateStr = getLocalDateStr;

// UTC date string from a UTC timestamp (matches backend fixture files)
export function getLocalDateFromUtc(utcDateStr) {
  if (!utcDateStr) return null;
  try {
    const d = parseDateAsUTC(utcDateStr);
    if (isNaN(d.getTime())) return null;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────────
// LOCAL TIME  →  display only (the user's own timezone, e.g. EAT)
// ───────────────────────────────────────────────────────────────

// The user's LOCAL "today" (not UTC). Use this for visible day tabs.
export function localDateStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset); // LOCAL setters
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Convert a UTC date/timestamp into the user's LOCAL date string (YYYY-MM-DD).
// e.g. "2026-08-02T23:00:00Z" → "2026-08-03" for a UTC+3 (EAT) user.
export function toLocalDateStr(utcInput) {
  if (!utcInput) return null;
  const d = utcInput instanceof Date ? utcInput : parseDateAsUTC(utcInput);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// A single LOCAL day can span two UTC days (depending on timezone offset).
// Return the UTC fixture filenames that could contain matches for this local day.
export function utcFilesForLocalDate(localDate) {
  const base = parseDateAsUTC(`${localDate}T12:00:00Z`);
  const files = new Set();
  for (const off of [-1, 0, 1]) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + off);
    files.add(d.toISOString().split('T')[0]);
  }
  return [...files];
}

// ───────────────────────────────────────────────────────────────
// DISPLAY FORMATTERS (local)
// ───────────────────────────────────────────────────────────────
export function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Kickoff clock in LOCAL time: "20:00"
export function formatTime(dateStr) {
  if (!dateStr) return '--:--';
  try {
    const d = parseDateAsUTC(dateStr);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '--:--';
  }
}

// ───────────────────────────────────────────────────────────────
// COMPARE HELPERS
// ───────────────────────────────────────────────────────────────
export function isToday(dateStr) { return dateStr === getLocalDateStr(0); }
export function isYesterday(dateStr) { return dateStr === getLocalDateStr(-1); }
export function isTomorrow(dateStr) { return dateStr === getLocalDateStr(1); }

export function relativeDateLabel(dateStr) {
  if (isToday(dateStr)) return 'Today';
  if (isYesterday(dateStr)) return 'Yesterday';
  if (isTomorrow(dateStr)) return 'Tomorrow';
  return formatDateShort(dateStr);
}

// ───────────────────────────────────────────────────────────────
// LEADERBOARD PERIODS (local)
// ───────────────────────────────────────────────────────────────
export function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayStr = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayStr}`;
}

export function getMonthStart() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export function getDateRange(days = 7, startOffset = -3) {
  const dates = [];
  const today = getLocalDateStr(0);
  for (let i = startOffset; i < startOffset + days; i++) {
    const dateStr = getLocalDateStr(i);
    const parts = dateStr.split('-');
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    dates.push({
      str: dateStr,
      label: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
      day: d.toLocaleDateString('en-GB', { weekday: 'short' }),
      num: d.getDate(),
      month: d.toLocaleDateString('en-GB', { month: 'short' }),
      isToday: dateStr === today,
    });
  }
  return dates;
}

// Backend rollover window (2:55–3:10 AM UTC)
export function isInRolloverWindow() {
  const now = new Date();
  const h = now.getUTCHours();
  const m = now.getUTCMinutes();
  return (h === 2 && m >= 55) || (h === 3 && m < 10);
}