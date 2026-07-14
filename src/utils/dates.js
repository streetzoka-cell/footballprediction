// ═══════════════════════════════════════════════════════════════
// FILE: src/utils/dates.js
// SINGLE SOURCE OF TRUTH for all date operations
//
// ★ All "today/yesterday/tomorrow" use LOCAL timezone
// ★ getLocalDateFromUtc() parses UTC timestamps to local date
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// CORE: Date string generators (LOCAL timezone)
// ═══════════════════════════════════════════════════════════════

/**
 * Get date string with offset from today
 * @param {number} offset - days from today (0 = today, -1 = yesterday, 1 = tomorrow)
 * @returns {string} YYYY-MM-DD in local timezone
 */
export function getLocalDateStr(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Shorthand: today in local timezone */
export const todayStr = () => getLocalDateStr(0);

/** Shorthand: yesterday in local timezone */
export const yesterdayStr = () => getLocalDateStr(-1);

/** Shorthand: tomorrow in local timezone */
export const tomorrowStr = () => getLocalDateStr(1);

/** Alias for compatibility with some pages */
export const getDateStr = getLocalDateStr;

// ═══════════════════════════════════════════════════════════════
// PARSE: Convert UTC timestamps to local date strings
// ═══════════════════════════════════════════════════════════════

/**
 * Parse a UTC date string to LOCAL date string
 * Used when server sends "2025-01-15T20:00:00+0000"
 * @param {string} utcDateStr - ISO date string
 * @returns {string|null} YYYY-MM-DD in local timezone
 */
export function getLocalDateFromUtc(utcDateStr) {
  if (!utcDateStr) return null;
  const d = new Date(utcDateStr);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ═══════════════════════════════════════════════════════════════
// FORMAT: Display formatting
// ═══════════════════════════════════════════════════════════════

/**
 * Format date string for display: "Tue, 15 Jan"
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string}
 */
export function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * Format time for display: "20:00"
 * @param {string} dateStr - ISO date string with time
 * @returns {string}
 */
export function formatTime(dateStr) {
  if (!dateStr) return '--:--';
  try {
    return new Date(dateStr).toLocaleTimeString('en-GB', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  } catch {
    return '--:--';
  }
}

// ═══════════════════════════════════════════════════════════════
// COMPARE: Date comparison helpers
// ═══════════════════════════════════════════════════════════════

/** Check if dateStr is today */
export function isToday(dateStr) {
  return dateStr === getLocalDateStr(0);
}

/** Check if dateStr is yesterday */
export function isYesterday(dateStr) {
  return dateStr === getLocalDateStr(-1);
}

/** Check if dateStr is tomorrow */
export function isTomorrow(dateStr) {
  return dateStr === getLocalDateStr(1);
}

/** Get human-readable relative label: "Today", "Yesterday", "Tomorrow", or "Tue, 15 Jan" */
export function relativeDateLabel(dateStr) {
  if (isToday(dateStr)) return "Today";
  if (isYesterday(dateStr)) return "Yesterday";
  if (isTomorrow(dateStr)) return "Tomorrow";
  return formatDateShort(dateStr);
}

// ═══════════════════════════════════════════════════════════════
// LEADERBOARD: Period start dates
// ═══════════════════════════════════════════════════════════════

/**
 * Get Monday of current week (for weekly leaderboards)
 * @returns {string} YYYY-MM-DD
 */
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

/**
 * Get first day of current month (for monthly leaderboards)
 * @returns {string} YYYY-MM-DD
 */
export function getMonthStart() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

// ═══════════════════════════════════════════════════════════════
// NAVIGATION: Date range generation for date pickers
// ═══════════════════════════════════════════════════════════════

/**
 * Generate array of date objects for date navigation
 * @param {number} days - number of dates to generate
 * @param {number} startOffset - days offset from today to start
 * @returns {Array<{str: string, label: string, day: string, num: number, month: string, isToday: boolean}>}
 */
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

// ═══════════════════════════════════════════════════════════════
// SYSTEM: Backend sync window
// ═══════════════════════════════════════════════════════════════

/**
 * Check if we're in the daily rollover window (UTC 2:55–3:10)
 * This is when backend updates fixture snapshots
 * @returns {boolean}
 */
export function isInRolloverWindow() {
  const now = new Date();
  const h = now.getUTCHours();
  const m = now.getUTCMinutes();
  return (h === 2 && m >= 55) || (h === 3 && m < 10);
}