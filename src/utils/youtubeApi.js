// FILE: src/utils/youtubeApi.js

const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;
const CACHE_KEY = 'yt_highlights_cache';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour cache

// Official Football Channel IDs
const CHANNEL_IDS = [
  'UCQegQgeF8GAF7OQCKCVg8vg', // Premier League
  'UCV5V6EofqA1b9nqY0d0wJZg', // La Liga
  'UCaP9fSgK6dWqBkArh3J8ZJg', // UEFA
  'UCqZQxjU5wZ6i0WwF9vW5mZQ'  // Bundesliga
];

export const fetchHighlights = async () => {
  // 1. Check Local Cache First
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Date.now() - data.timestamp < CACHE_TTL && data.videos?.length > 0) {
        return { videos: data.videos, fromCache: true };
      }
    }
  } catch (e) {}

  if (!API_KEY) {
    return { videos: [], error: 'NO_KEY' };
  }

  try {
    // 2. Fetch from YouTube API
    const query = encodeURIComponent('(match highlights OR goals OR extended highlights)');
    const channelQuery = CHANNEL_IDS.map(id => `channelId=${id}`).join('&');
    
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&${channelQuery}&type=video&q=${query}&order=date&maxResults=15&key=${API_KEY}`;
    
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 403) return { videos: [], error: 'QUOTA_EXCEEDED' };
      throw new Error(`API ${res.status}`);
    }
    
    const data = await res.json();
    
    const videos = data.items
      .filter(item => item.id?.videoId)
      .map(item => ({
        id: item.id.videoId,
        title: item.snippet.title.replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
        channel: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
      }));

    // 3. Save to Cache
    localStorage.setItem(CACHE_KEY, JSON.stringify({ videos, timestamp: Date.now() }));
    
    return { videos, fromCache: false };
  } catch (err) {
    console.error('[YT-API] Fetch failed:', err.message);
    return { videos: [], error: 'NETWORK' };
  }
};