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

    const videoIds = data.items?.map(item => item.id.videoId).filter(Boolean) || [];
    
    // 動画の詳細情報と埋め込み制限をチェック
    const videosData = await checkVideosEmbeddable(videoIds, YOUTUBE_API_KEY);
    
    const videos = data.items?.map(item => {
      const videoData = videosData.find(v => v.id === item.id.videoId);
      return {
        id: item.id.videoId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.medium.url,
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
        embeddable: videoData?.embeddable || false,
        restrictionReason: videoData?.restrictionReason || null
      };
    }).filter(video => video.embeddable) || []; // 埋め込み可能な動画のみ返す

    console.log(`Returning ${videos.length} videos`);
    res.json({ videos });
  } catch (error) {
    console.error('検索エラー:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'サーバーエラーが発生しました: ' + error.message });
  }
});

// 単一動画の情報と埋め込み可能性をチェックするAPIエンドポイント
app.get('/api/video/:videoId', async (req, res) => {
  console.log('Video check request:', req.params.videoId);
  
  try {
    const { videoId } = req.params;
    
    if (!YOUTUBE_API_KEY) {
      return res.status(500).json({ error: 'YouTube API キーが設定されていません' });
    }

    if (!fetch) {
      return res.status(500).json({ error: 'fetch機能が利用できません' });
    }

    const videoUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,status,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(videoUrl);
    const data = await response.json();

    if (!response.ok) {
      console.error('Video API error:', data);
      return res.status(response.status).json({ error: data.error?.message || 'YouTube API エラー' });
    }

    if (!data.items || data.items.length === 0) {
      return res.status(404).json({ error: '動画が見つかりません' });
    }

    const video = data.items[0];
    const embeddable = video.status?.embeddable !== false && 
                      !video.contentDetails?.regionRestriction?.blocked?.includes('JP');

    res.json({
      id: video.id,
      title: video.snippet.title,
      thumbnail: video.snippet.thumbnails.medium?.url || video.snippet.thumbnails.default?.url,
      channelTitle: video.snippet.channelTitle,
      duration: formatDuration(video.contentDetails.duration),
      embeddable: embeddable,
      restrictionReason: embeddable ? null : getRestrictionReason(video)
    });
  } catch (error) {
    console.error('動画チェックエラー:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました: ' + error.message });
  }
});

function formatDuration(isoDuration) {
  if (!isoDuration) return '00:00';
  const match = isoDuration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  const hours = (match[1] || '').replace('H', '');
  const minutes = (match[2] || '').replace('M', '');
  const seconds = (match[3] || '').replace('S', '');
  
  if (hours) {
    return `${hours}:${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}`;
  }
  return `${minutes || '0'}:${seconds.padStart(2, '0')}`;
}

// 動画の埋め込み可能性をチェックする関数
async function checkVideosEmbeddable(videoIds, apiKey) {
  if (!videoIds.length) return [];
  
  try {
    const videoUrl = `https://www.googleapis.com/youtube/v3/videos?part=status,contentDetails&id=${videoIds.join(',')}&key=${apiKey}`;
    const response = await fetch(videoUrl);
    const data = await response.json();
    
    if (!response.ok) {
      console.error('Videos API error:', data);
      return [];
    }
    
    return data.items?.map(item => ({
      id: item.id,
      embeddable: item.status?.embeddable !== false && 
                 !item.contentDetails?.regionRestriction?.blocked?.includes('JP'),
      restrictionReason: getRestrictionReason(item)
    })) || [];
  } catch (error) {
    console.error('Error checking video embeddability:', error);
    return [];
  }
}

function getRestrictionReason(videoItem) {
  if (videoItem.status?.embeddable === false) {
    return '埋め込み無効';
  }
  if (videoItem.contentDetails?.regionRestriction?.blocked?.includes('JP')) {
    return '地域制限';
  }
  return null;
}

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