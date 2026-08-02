const ProviderManager = require('../../providers/ProviderManager');
const videoRepo = require('../../repositories/VideoRepository');
const { publishJSON } = require('../../services/StaticFilePublisher');

async function execute() {
  const result = await ProviderManager.getVideos();

  const videos = result?.data || [];

  await videoRepo.replaceVideos(videos);

  await publishJSON('videos.json', {
    data: videos,
    count: videos.length,
  });

  return {
    count: videos.length,
  };
}

module.exports = {
  execute,
};