// ═══════════════════════════════════════════════════════════════
// FILE: src/utils/dates.js
// SINGLE SOURCE OF TRUTH for all date operations
// ★ FIXED: Uses native device local time. No more hardcoded EAT!
// ═══════════════════════════════════════════════════════════════

// Core date string generator (USER'S LOCAL TIMEZONE)
export function getLocalDateStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const todayStr = () => getLocalDateStr(0);
export const yesterdayStr = () => getLocalDateStr(-1);
export const tomorrowStr = () => getLocalDateStr(1);
export const getDateStr = getLocalDateStr;

// Parse UTC timestamps to LOCAL date strings
export function getLocalDateFromUtc(utcDateStr) {
  if (!utcDateStr) return null;
  try {
    const d = new Date(utcDateStr);
    if (isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return null;
  }
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

// Format time for display in LOCAL TIME: "20:00"
export function formatTime(dateStr) {
  if (!dateStr) return '--:--';
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
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

// Leaderboard period start dates (LOCAL)
export function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dayStr = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dayStr}`;
}

export function getMonthStart() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
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