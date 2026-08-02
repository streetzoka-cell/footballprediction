// footballprediction/src/utils/format.js

/**
 * Standard URL slug generator.
 * @param {string} text 
 * @returns {string}
 */
export const slugify = (text) => {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .substring(0, 60);
};

/**
 * Formats a Firestore timestamp or JS date into a relative time string.
 * @param {object|number|string} date 
 * @returns {string}
 */
export const formatTimeAgo = (date) => {
  if (!date) return 'Never';
  let ts;
  if (typeof date === 'number') ts = date < 1e12 ? date * 1000 : date;
  else if (typeof date === 'string') { ts = Date.parse(date); if (isNaN(ts)) return 'Unknown'; }
  else if (date.seconds != null) ts = date.seconds * 1000;
  else if (date?.getTime) ts = date.getTime();
  else return 'Unknown';

  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return 'Just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};
