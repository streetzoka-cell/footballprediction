// footballprediction/backend-v1/src/utils/compare.js
function getChangedFields(existing, incoming) {
  const changes = {};
  let hasChanges = false;

  for (const key in incoming) {
    if (key === 'lastUpdated' || key === 'expiresAt' || key === 'version') continue;

    const oldVal = existing[key];
    const newVal = incoming[key];

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes[key] = newVal;
      hasChanges = true;
    }
  }

  return hasChanges ? changes : null;
}

module.exports = { getChangedFields };
