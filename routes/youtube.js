// routes/youtube.js
const express = require('express');
const axios = require('axios');
const router = express.Router();

const API_KEY = process.env.YT_API_KEY;
const CHANNEL_ID = process.env.YT_CHANNEL_ID;

router.get('/videos', async (req, res) => {
  try {
    if (!API_KEY || !CHANNEL_ID) {
      console.error('❌ Missing YouTube API credentials');
      return res.status(500).json({ error: 'YouTube API not configured' });
    }

    // ✅ Fixed: Removed trailing spaces in URLs
    const channelRes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
      params: {
        part: 'contentDetails',
        id: CHANNEL_ID,
        key: API_KEY
      }
    });

    if (!channelRes.data.items || channelRes.data.items.length === 0) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const uploadsPlaylistId = channelRes.data.items[0].contentDetails.relatedPlaylists.uploads;

    const videosRes = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
      params: {
        part: 'snippet',
        playlistId: uploadsPlaylistId,
        maxResults: 50,
        key: API_KEY
      }
    });

    const videos = videosRes.data.items.map(item => {
      const snippet = item.snippet;
      return {
        id: snippet.resourceId.videoId,
        title: snippet.title,
        thumbnail: snippet.thumbnails.high.url,
        publishedAt: snippet.publishedAt,
        description: snippet.description,
      };
    });

    res.json(videos);
  } catch (error) {
    console.error('❌ YouTube API Error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch YouTube videos',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;