// footballprediction/backend-v1/src/scheduler/jobs/videosJob.js

const ProviderManager = require('../../providers/ProviderManager');
const videoRepo = require('../../repositories/VideoRepository');
const { publishJSON } = require('../../services/StaticFilePublisher');

async function execute() {
  const { data: videos } = await ProviderManager.getVideos();
  await videoRepo.replaceVideos(videos);
  await publishJSON('videos.json', { data: videos, count: videos.length });
  return { count: videos.length };
}

module.exports = { execute };
