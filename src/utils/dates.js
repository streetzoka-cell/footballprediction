// src/utils/dates.js
export function parseDateAsUTC(s) {
  if (!s) return new Date(NaN);
  if (typeof s !== 'string') return new Date(s);
  if (s.endsWith('Z') || s.includes('+') || (s.length > 10 && s.indexOf('-', 10) !== -1)) return new Date(s);
  return new Date(s + 'Z');
}

export function getLocalDateStr(offset = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export const todayStr = () => getLocalDateStr(0);
export const yesterdayStr = () => getLocalDateStr(-1);
export const tomorrowStr = () => getLocalDateStr(1);
export const getDateStr = getLocalDateStr;

export function getLocalDateFromUtc(utcStr) {
  if (!utcStr) return null;
  try {
    const d = parseDateAsUTC(utcStr);
    if (isNaN(d.getTime())) return null; 
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  } catch (e) { return null; }
}

export function localDateStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function toLocalDateStr(input) {
  if (!input) return null;
  const d = input instanceof Date ? input : parseDateAsUTC(input);
  if (isNaN(d.getTime())) return null; 
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function utcFilesForLocalDate(localDate) {
  const base = parseDateAsUTC(`${localDate}T12:00:00Z`);
  const set = new Set();
  for (const off of [-1, 0, 1]) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + off);
    set.add(d.toISOString().split('T')[0]);
  }
  return [...set];
}

export function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3) return dateStr;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatTime(dateStr) {
  if (!dateStr) return '--:--';
  try { 
    return parseDateAsUTC(dateStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }); 
  } catch (e) { 
    return '--:--'; 
  }
}

export function isToday(s) { return s === getLocalDateStr(0); }
export function isYesterday(s) { return s === getLocalDateStr(-1); }
export function isTomorrow(s) { return s === getLocalDateStr(1); }

export function relativeDateLabel(s) {
  if (isToday(s)) return 'Today';
  if (isYesterday(s)) return 'Yesterday';
  if (isTomorrow(s)) return 'Tomorrow';
  return formatDateShort(s);
}

export function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getMonthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function getDateRange(days = 7, startOffset = -3) {
  const today = getLocalDateStr(0);
  const dates = [];
  for (let i = startOffset; i < startOffset + days; i++) {
    const str = getLocalDateStr(i);
    const parts = str.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    dates.push({ 
      str, 
      label: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), 
      day: d.toLocaleDateString('en-GB', { weekday: 'short' }), 
      num: d.getDate(), 
      month: d.toLocaleDateString('en-GB', { month: 'short' }), 
      isToday: str === today 
    });
  }
  return dates;
}

export function isInRolloverWindow() {
  const now = new Date();
  const h = now.getUTCHours(), m = now.getUTCMinutes();
  return (h === 2 && m >= 55) || (h === 3 && m < 10);
}

export function formatTimeAgo(date) {
  if (!date) return 'Never';
  let ts;
  if (typeof date === 'number') ts = date < 1e12 ? date * 1000 : date;
  else if (typeof date === 'string') { 
    ts = Date.parse(date); 
    if (isNaN(ts)) return 'Unknown'; 
  }
  else if (date && date.seconds != null) ts = date.seconds * 1000;
  else if (date && date.getTime) ts = date.getTime();
  else return 'Unknown';
  
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return 'Just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}