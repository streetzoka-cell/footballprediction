/*
 * compare.js
 * Object comparison utilities.
 *
 * Used by:
 *   - FinishedFixturesProcessor (football)
 *   - BasketballFinishedFixturesProcessor (basketball)
 *
 * Both use getChangedFields for diffing finished fixtures
 * before writing (to avoid unnecessary Firestore writes for
 * unchanged FT results).
 */

/**
 * Deep equality comparison.
 *
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
function deepEqual(a, b) {
  if (a === b) return true;

  if (a == null || b == null) return a === b;

  if (typeof a !== typeof b) return false;

  if (typeof a !== "object") return false;

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }

    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }

  return true;
}

/**
 * Returns only fields that changed between existing and incoming.
 *
 * @param {Object|null} existing - Current doc from Firestore (null if new)
 * @param {Object} incoming - Normalized incoming doc
 * @returns {Object|null} Changed fields with `_isNew: true` if new, null if no changes
 */
function getChangedFields(existing, incoming) {
  if (!existing) {
    return { ...incoming, _isNew: true };
  }

  const changes = {};

  for (const key of Object.keys(incoming)) {
    if (!deepEqual(existing[key], incoming[key])) {
      changes[key] = incoming[key];
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

module.exports = {
  deepEqual,
  getChangedFields,
};