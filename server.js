const express = require('express');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');
require('dotenv').config();

// Node.js 18以降のfetchをimport、それ以前のバージョンではnode-fetchを使用
const fetch = globalThis.fetch || (() => {
  try {
    return require('node-fetch');
  } catch (e) {
    console.error('fetchが利用できません。Node.js 18以降またはnode-fetchが必要です。');
    return null;
  }
})();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// ミドルウェアの設定
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// テスト用シンプルルート
app.get('/test', (req, res) => {
  res.send('Server is working!');
});

// Render用のヘルスチェックエンドポイント
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// YouTube検索APIエンドポイント
app.get('/api/search', async (req, res) => {
  console.log('Search request received:', req.query);
  
  try {
    const { q, maxResults = 10 } = req.query;
    
    if (!q) {
      console.log('No query parameter provided');
      return res.status(400).json({ error: 'クエリパラメータが必要です' });
    }

    if (!YOUTUBE_API_KEY) {
      console.log('YouTube API key not found');
      return res.status(500).json({ error: 'YouTube API キーが設定されていません' });
    }

    if (!fetch) {
      console.log('Fetch function not available');
      return res.status(500).json({ error: 'fetch機能が利用できません' });
    }

    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${maxResults}&q=${encodeURIComponent(q)}&key=${YOUTUBE_API_KEY}`;
    console.log('Making request to YouTube API...');
    
    const response = await fetch(searchUrl);
    console.log('YouTube API response status:', response.status);
    
    const data = await response.json();
    console.log('YouTube API response data:', JSON.stringify(data, null, 2));

    if (!response.ok) {
      console.error('YouTube API error:', data);
      return res.status(response.status).json({ error: data.error?.message || 'YouTube API エラー' });
    }

    const videos = data.items?.map(item => ({
      id: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.medium.url,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt
    })) || [];

    console.log(`Returning ${videos.length} videos`);
    res.json({ videos });
  } catch (error) {
    console.error('検索エラー:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'サーバーエラーが発生しました: ' + error.message });
  }
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);
  });
  
  socket.on('sync-video', (data) => {
    socket.to(data.roomId).emit('video-sync', data);
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});