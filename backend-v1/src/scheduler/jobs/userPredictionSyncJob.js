// backend-v1/src/scheduler/jobs/userPredictionSyncJob.js

const UserPredictionStore = require('../../services/UserPredictionStore');

async function execute(force = false) {
  return UserPredictionStore.processPendingSync(force);
}

module.exports = {
  execute,
};