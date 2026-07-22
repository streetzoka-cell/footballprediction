// ═══════════════════════════════════════════════════════════════
// FILE: src/utils/dates.js
// SINGLE SOURCE OF TRUTH for all date operations
// ★ 100% LOCKED TO EAT (UTC+3) TO MATCH BACKEND PERFECTLY
// ═══════════════════════════════════════════════════════════════

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3 for Kenya

// Helper to get EAT date string for fetching backend snapshots
export function getEatDateStr(offset) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  const eat = new Date(d.getTime() + EAT_OFFSET_MS);
  const y = eat.getUTCFullYear();
  const m = String(eat.getUTCMonth() + 1).padStart(2, "0");
  const day = String(eat.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Core date string generator (EAT TIMEZONE)
export function getLocalDateStr(offset) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  const eat = new Date(d.getTime() + EAT_OFFSET_MS);
  const y = eat.getUTCFullYear();
  const m = String(eat.getUTCMonth() + 1).padStart(2, "0");
  const day = String(eat.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const todayStr = () => getLocalDateStr(0);
export const yesterdayStr = () => getLocalDateStr(-1);
export const tomorrowStr = () => getLocalDateStr(1);
export const getDateStr = getLocalDateStr;

// Parse UTC timestamps to EAT date strings
export function getLocalDateFromUtc(utcDateStr) {
  if (!utcDateStr) return null;
  const d = new Date(utcDateStr);
  if (isNaN(d.getTime())) return null;
  const eat = new Date(d.getTime() + EAT_OFFSET_MS);
  const y = eat.getUTCFullYear();
  const m = String(eat.getUTCMonth() + 1).padStart(2, "0");
  const day = String(eat.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Format date string for display: "Tue, 15 Jan"
export function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

// Format time for display in EAT: "20:00"
export function formatTime(dateStr) {
  if (!dateStr) return '--:--';
  try {
    const d = new Date(dateStr);
    const eat = new Date(d.getTime() + EAT_OFFSET_MS);
    return eat.toUTCString().split(' ')[4].substring(0, 5);
  } catch {
    return '--:--';
  }
}

// Compare helpers
export function isToday(dateStr) { return dateStr === getLocalDateStr(0); }
export function isYesterday(dateStr) { return dateStr === getLocalDateStr(-1); }
export function isTomorrow(dateStr) { return dateStr === getLocalDateStr(1); }

export function relativeDateLabel(dateStr) {
  if (isToday(dateStr)) return "Today";
  if (isYesterday(dateStr)) return "Yesterday";
  if (isTomorrow(dateStr)) return "Tomorrow";
  return formatDateShort(dateStr);
}

// Leaderboard period start dates (EAT)
export function getWeekStart() {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setUTCDate(diff);
  const eat = new Date(d.getTime() + EAT_OFFSET_MS);
  const y = eat.getUTCFullYear();
  const m = String(eat.getUTCMonth() + 1).padStart(2, "0");
  const dayStr = String(eat.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dayStr}`;
}

export function getMonthStart() {
  const d = new Date();
  const eat = new Date(d.getTime() + EAT_OFFSET_MS);
  const y = eat.getUTCFullYear();
  const m = String(eat.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

// Date range for pickers
export function getDateRange(days = 7, startOffset = -3) {
  const dates = [];
  const today = getLocalDateStr(0);
  for (let i = startOffset; i < startOffset + days; i++) {
    const dateStr = getLocalDateStr(i);
    const parts = dateStr.split("-");
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

// Backend sync window (2:55 AM - 3:10 AM UTC)
export function isInRolloverWindow() {
  const now = new Date();
  const h = now.getUTCHours();
  const m = now.getUTCMinutes();
  return (h === 2 && m >= 55) || (h === 3 && m < 10);
}