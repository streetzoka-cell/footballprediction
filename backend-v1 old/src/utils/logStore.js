// footballprediction/backend-v1/src/utils/logStore.js

const recentLogs = [];
const MAX_LOGS = 150;

function addLog(message, level = 'info') {
  const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
  recentLogs.push(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
  if (recentLogs.length > MAX_LOGS) recentLogs.shift();
}

function getLogs() {
  return recentLogs;
}

module.exports = { addLog, getLogs };
