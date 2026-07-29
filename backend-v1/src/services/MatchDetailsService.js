const ProviderManager = require('../providers/ProviderManager');
const repo = require('../repositories/MatchDetailsRepository');
const { isExpired } = require('../config/firebase');
const { publishJSON } = require('./StaticFilePublisher');

async function getLineups(fixtureId) {
  let data = await repo.getLineups(fixtureId);
  if (data && !isExpired(data)) return data;
  
  const { data: fresh } = await ProviderManager.getLineups(fixtureId);
  await repo.upsertLineups(fixtureId, fresh);
  await publishJSON(`lineups/${fixtureId}.json`, { data: fresh }); // 0-read frontend
  return fresh;
}

async function getStatistics(fixtureId) {
  let data = await repo.getStatistics(fixtureId);
  if (data && !isExpired(data)) return data;
  
  const { data: fresh } = await ProviderManager.getStatistics(fixtureId);
  await repo.upsertStatistics(fixtureId, fresh);
  await publishJSON(`statistics/${fixtureId}.json`, { data: fresh });
  return fresh;
}

async function getPredictions(fixtureId) {
  let data = await repo.getPredictions(fixtureId);
  if (data && !isExpired(data)) return data;
  
  const { data: fresh } = await ProviderManager.getPredictions(fixtureId);
  await repo.upsertPredictions(fixtureId, fresh);
  await publishJSON(`predictions/${fixtureId}.json`, { data: fresh });
  return fresh;
}

async function getOdds(fixtureId) {
  let data = await repo.getOdds(fixtureId);
  if (data && !isExpired(data)) return data;
  
  const { data: fresh } = await ProviderManager.getOdds(fixtureId);
  await repo.upsertOdds(fixtureId, fresh);
  await publishJSON(`odds/${fixtureId}.json`, { data: fresh });
  return fresh;
}

async function getH2H(team1Id, team2Id) {
  const key = `${team1Id}_${team2Id}`;
  let data = await repo.getH2H(key);
  if (data) return data;
  
  const { data: fresh } = await ProviderManager.getHeadToHead(team1Id, team2Id);
  await repo.upsertH2H(key, fresh);
  await publishJSON(`h2h/${key}.json`, { data: fresh });
  return fresh;
}

module.exports = { getLineups, getStatistics, getPredictions, getOdds, getH2H };