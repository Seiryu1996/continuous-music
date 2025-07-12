class ContinuousMusic {
    constructor() {
        this.player = null;
        this.currentPlaylist = [];
        this.currentIndex = 0;
        this.repeatMode = 'off'; // 'off', 'one', 'all'
        this.shuffleMode = false;
        this.socket = io();
        this.isPlaying = false;
        this.duration = 0;
        this.currentTime = 0;
        this.isDragging = false;
        this.currentPlaylistName = null;
        this.isEditingPlaylist = false;
        this.backgroundMode = false;
        this.wakeLock = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadCurrentPlaylist();
        this.loadSavedPlaylists();
        this.setupYouTubePlayer();
        this.setupBackgroundPlayback();
        this.registerServiceWorker();
        this.createSearchResultsContainer();
    }

    setupEventListeners() {
        document.getElementById('add-video').addEventListener('click', () => this.addVideo());
        document.getElementById('search-video').addEventListener('click', () => this.searchVideo());
        document.getElementById('video-search').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.searchVideo();
        });
        document.getElementById('youtube-url').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addVideo();
        });
        
        document.getElementById('prev-btn').addEventListener('click', () => this.playPrevious());
        document.getElementById('play-pause-btn').addEventListener('click', () => this.togglePlayPause());
        document.getElementById('next-btn').addEventListener('click', () => this.playNext());
        document.getElementById('repeat-btn').addEventListener('click', () => this.toggleRepeat());
        document.getElementById('shuffle-btn').addEventListener('click', () => this.toggleShuffle());
        document.getElementById('background-btn').addEventListener('click', () => this.toggleBackgroundMode());
        
        document.getElementById('save-playlist').addEventListener('click', () => this.savePlaylist());
        document.getElementById('save-current-playlist').addEventListener('click', () => this.saveCurrentPlaylist());
        document.getElementById('export-playlist').addEventListener('click', () => this.saveToDevice());
        document.getElementById('import-playlist-btn').addEventListener('click', () => this.loadFromDevice());
        document.getElementById('import-playlist').addEventListener('change', (e) => this.handleFileImport(e));
        
        // プレイリスト選択の変更イベント
        document.getElementById('target-playlist').addEventListener('change', (e) => this.onTargetPlaylistChange(e));
        
        // 既存プレイリストをセレクトボックスに追加
        this.updatePlaylistSelector();
        
        // プログレスバーのイベントリスナー
        const progressBar = document.getElementById('progress-bar');
        progressBar.addEventListener('click', (e) => this.seekTo(e));
        progressBar.addEventListener('mousedown', (e) => this.startDragging(e));
        document.addEventListener('mousemove', (e) => this.onDrag(e));
        document.addEventListener('mouseup', () => this.stopDragging());
    }

    setupYouTubePlayer() {
        window.onYouTubeIframeAPIReady = () => {
            this.player = new YT.Player('youtube-player', {
                height: '300',
                width: '100%',
                videoId: '',
                playerVars: {
                    'playsinline': 1,
                    'rel': 0,
                    'showinfo': 0,
                    'controls': 0,
                    'autoplay': 1
                },
                events: {
                    'onReady': () => this.onPlayerReady(),
                    'onStateChange': (event) => this.onPlayerStateChange(event)
                }
            });
        };
    }

    onPlayerReady() {
        console.log('YouTube Player Ready');
        this.startProgressUpdate();
    }

    onPlayerStateChange(event) {
        if (event.data === YT.PlayerState.ENDED) {
            this.handleVideoEnd();
        } else if (event.data === YT.PlayerState.PLAYING) {
            this.isPlaying = true;
            this.updatePlayPauseButton();
            this.updateMediaSession();
            
            // 動画の長さ情報を更新
            const currentVideo = this.currentPlaylist[this.currentIndex];
            if (currentVideo && currentVideo.duration === '00:00') {
                this.updateVideoDuration(currentVideo.id);
            }
        } else if (event.data === YT.PlayerState.PAUSED) {
            this.isPlaying = false;
            this.updatePlayPauseButton();
            this.updateMediaSession();
        }
    }

    extractVideoId(url) {
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    async addVideo() {
        const url = document.getElementById('youtube-url').value.trim();
        if (!url) return;

        const videoId = this.extractVideoId(url);
        if (!videoId) {
            alert('有効なYouTube URLを入力してください');
            return;
        }

        const targetPlaylist = document.getElementById('target-playlist').value;
        
        try {
            // 動画の埋め込み可能性をチェック
            const videoInfo = await this.checkVideoEmbeddable(videoId);
            
            if (!videoInfo.embeddable) {
                alert(`この動画は追加できません。理由: ${videoInfo.restrictionReason || '再生制限'}`);
                return;
            }
            
            const video = {
                id: videoId,
                title: videoInfo.title,
                thumbnail: videoInfo.thumbnail,
                duration: videoInfo.duration
            };
            
            if (targetPlaylist === 'new') {
                const newPlaylistName = document.getElementById('new-playlist-name').value.trim();
                if (!newPlaylistName) {
                    alert('新規プレイリスト名を入力してください');
                    return;
                }
                this.addToNewPlaylist(newPlaylistName, video);
            } else if (targetPlaylist === 'current') {
                this.currentPlaylist.push(video);
                this.updateVideoList();
                this.autoSaveCurrentPlaylist();
                if (this.currentPlaylist.length === 1) {
                    this.playVideo(0);
                }
            } else {
                this.addToExistingPlaylist(targetPlaylist, video);
            }
            
            document.getElementById('youtube-url').value = '';
            document.getElementById('new-playlist-name').value = '';
            this.showNotification(`「${video.title}」を追加しました`);
        } catch (error) {
            console.error('動画追加エラー:', error);
            alert('動画の情報取得に失敗しました。再度お試しください。');
        }
    }

    async fetchVideoInfo(videoId) {
        try {
            const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=YOUR_API_KEY`);
            const data = await response.json();
            
            if (data.items && data.items.length > 0) {
                const video = data.items[0];
                return {
                    title: video.snippet.title,
                    thumbnail: video.snippet.thumbnails.medium.url,
                    duration: this.formatDuration(video.contentDetails.duration)
                };
            }
        } catch (error) {
            console.error('Error fetching video info:', error);
        }
        
        return {
            title: `Video ${videoId}`,
            thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
            duration: '00:00' // 初期値、再生時に更新される
        };
    }

    formatDuration(isoDuration) {
        const match = isoDuration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
        const hours = (match[1] || '').replace('H', '');
        const minutes = (match[2] || '').replace('M', '');
        const seconds = (match[3] || '').replace('S', '');
        
        if (hours) {
            return `${hours}:${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}`;
        }
        return `${minutes || '0'}:${seconds.padStart(2, '0')}`;
    }

    playVideo(index) {
        if (index < 0 || index >= this.currentPlaylist.length) return;
        
        this.currentIndex = index;
        const video = this.currentPlaylist[index];
        
        if (this.player && this.player.loadVideoById) {
            this.player.loadVideoById(video.id);
        }
        
        this.updateVideoList();
    }

    updateVideoDuration(videoId) {
        if (!this.player || !this.player.getDuration) return;
        
        const duration = this.player.getDuration();
        if (duration > 0) {
            // 現在のプレイリストの該当動画の長さを更新
            const videoIndex = this.currentPlaylist.findIndex(v => v.id === videoId);
            if (videoIndex !== -1) {
                this.currentPlaylist[videoIndex].duration = this.formatTime(duration);
                this.updateVideoList();
            }
        }
    }

    playPrevious() {
        if (this.shuffleMode) {
            this.currentIndex = Math.floor(Math.random() * this.currentPlaylist.length);
        } else {
            this.currentIndex = (this.currentIndex - 1 + this.currentPlaylist.length) % this.currentPlaylist.length;
        }
        this.playVideo(this.currentIndex);
    }

    playNext() {
        if (this.shuffleMode) {
            this.currentIndex = Math.floor(Math.random() * this.currentPlaylist.length);
        } else {
            this.currentIndex = (this.currentIndex + 1) % this.currentPlaylist.length;
        }
        this.playVideo(this.currentIndex);
    }

    togglePlayPause() {
        if (!this.player) return;
        
        if (this.isPlaying) {
            this.player.pauseVideo();
        } else {
            this.player.playVideo();
        }
    }

    updatePlayPauseButton() {
        const btn = document.getElementById('play-pause-btn');
        btn.textContent = this.isPlaying ? '⏸️' : '▶️';
    }

    toggleRepeat() {
        const modes = ['off', 'one', 'all'];
        const currentModeIndex = modes.indexOf(this.repeatMode);
        this.repeatMode = modes[(currentModeIndex + 1) % modes.length];
        
        const btn = document.getElementById('repeat-btn');
        btn.className = `repeat-${this.repeatMode}`;
        
        const icons = { off: '🔄', one: '🔂', all: '🔁' };
        btn.textContent = icons[this.repeatMode];
    }

    toggleShuffle() {
        this.shuffleMode = !this.shuffleMode;
        const btn = document.getElementById('shuffle-btn');
        btn.style.opacity = this.shuffleMode ? '1' : '0.5';
    }

    handleVideoEnd() {
        if (this.repeatMode === 'one') {
            this.playVideo(this.currentIndex);
        } else if (this.repeatMode === 'all' || this.currentIndex < this.currentPlaylist.length - 1) {
            this.playNext();
        }
    }

    updateVideoList() {
        const list = document.getElementById('video-list');
        list.innerHTML = '';
        
        this.currentPlaylist.forEach((video, index) => {
            const li = document.createElement('li');
            li.className = `video-item ${index === this.currentIndex ? 'active' : ''}`;
            li.innerHTML = `
                <img src="${video.thumbnail}" alt="thumbnail" class="video-thumbnail">
                <div class="video-info">
                    <div class="video-title">${video.title}</div>
                    <div class="video-duration">${video.duration}</div>
                </div>
                <div class="video-actions">
                    <button class="move-up" onclick="app.moveVideo(${index}, -1)">↑</button>
                    <button class="move-down" onclick="app.moveVideo(${index}, 1)">↓</button>
                    <button class="remove" onclick="app.removeVideo(${index})">削除</button>
                </div>
            `;
            
            li.addEventListener('click', () => this.playVideo(index));
            list.appendChild(li);
        });
    }

    removeVideo(index) {
        this.currentPlaylist.splice(index, 1);
        if (this.currentIndex >= index) {
            this.currentIndex = Math.max(0, this.currentIndex - 1);
        }
        this.updateVideoList();
        this.autoSaveCurrentPlaylist();
        this.updateEditingPlaylist();
    }

    moveVideo(index, direction) {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= this.currentPlaylist.length) return;
        
        // 配列内の要素を交換
        [this.currentPlaylist[index], this.currentPlaylist[newIndex]] = 
        [this.currentPlaylist[newIndex], this.currentPlaylist[index]];
        
        // 現在再生中の曲のインデックスを更新
        if (this.currentIndex === index) {
            this.currentIndex = newIndex;
        } else if (this.currentIndex === newIndex) {
            this.currentIndex = index;
        }
        
        this.updateVideoList();
        this.autoSaveCurrentPlaylist();
        this.updateEditingPlaylist();
    }

    savePlaylist() {
        const name = document.getElementById('playlist-name').value.trim();
        if (!name || this.currentPlaylist.length === 0) {
            alert('プレイリスト名を入力し、動画を追加してください');
            return;
        }

        try {
            const playlists = this.getPlaylistsFromStorage();
            const newPlaylist = {
                name: name,
                videos: this.currentPlaylist.map(v => ({ id: v.id, title: v.title }))
            };
            
            playlists.push(newPlaylist);
            localStorage.setItem('continuous-music-playlists', JSON.stringify(playlists));
            
            document.getElementById('playlist-name').value = '';
            this.loadSavedPlaylists();
            alert('プレイリストを保存しました');
        } catch (error) {
            console.error('Error saving playlist:', error);
            alert('プレイリストの保存に失敗しました');
        }
    }

    loadSavedPlaylists() {
        try {
            const playlists = this.getPlaylistsFromStorage();
            const list = document.getElementById('saved-playlists');
            list.innerHTML = '';
            
            playlists.forEach(playlist => {
                const li = document.createElement('li');
                li.className = 'playlist-item';
                li.innerHTML = `
                    <div>
                        <div class="playlist-name">${playlist.name}</div>
                        <div class="playlist-count">${playlist.videos.length} videos</div>
                    </div>
                    <div class="playlist-actions">
                        <button onclick="app.loadPlaylistByName('${playlist.name}')">読込</button>
                        <button onclick="app.deletePlaylist('${playlist.name}')">削除</button>
                    </div>
                `;
                list.appendChild(li);
            });
        } catch (error) {
            console.error('Error loading playlists:', error);
        }
    }

    loadPlaylistByName(playlistName) {
        try {
            const playlists = this.getPlaylistsFromStorage();
            const playlist = playlists.find(p => p.name === playlistName);
            
            if (playlist) {
                this.currentPlaylist = playlist.videos.map(v => ({
                    id: v.id,
                    title: v.title,
                    thumbnail: `https://img.youtube.com/vi/${v.id}/mqdefault.jpg`,
                    duration: '00:00'
                }));
                this.currentIndex = 0;
                this.currentPlaylistName = playlistName;
                this.isEditingPlaylist = true;
                
                this.updateVideoList();
                this.updatePlaylistTitle();
                this.autoSaveCurrentPlaylist();
                
                if (this.currentPlaylist.length > 0) {
                    this.playVideo(0);
                }
            }
        } catch (error) {
            console.error('Error loading playlist:', error);
        }
    }

    deletePlaylist(playlistName) {
        if (!confirm('このプレイリストを削除しますか？')) return;
        
        try {
            const playlists = this.getPlaylistsFromStorage();
            const filteredPlaylists = playlists.filter(p => p.name !== playlistName);
            localStorage.setItem('continuous-music-playlists', JSON.stringify(filteredPlaylists));
            
            // 削除されたプレイリストが現在編集中の場合、編集状態をリセット
            if (this.isEditingPlaylist && this.currentPlaylistName === playlistName) {
                // 動画再生を停止
                this.stopPlayback();
                
                this.currentPlaylistName = null;
                this.isEditingPlaylist = false;
                this.currentPlaylist = [];
                this.currentIndex = 0;
                this.updateVideoList();
                this.updatePlaylistTitle();
                this.autoSaveCurrentPlaylist();
            }
            
            this.loadSavedPlaylists();
            this.updatePlaylistSelector();
        } catch (error) {
            console.error('Error deleting playlist:', error);
        }
    }

    getPlaylistsFromStorage() {
        try {
            const stored = localStorage.getItem('continuous-music-playlists');
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('Error reading playlists from storage:', error);
            return [];
        }
    }

    async searchVideo() {
        const query = document.getElementById('video-search').value.trim();
        if (!query) return;
        
        this.showSearchLoading(true);
        
        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&maxResults=10`);
            
            console.log('Response status:', response.status);
            console.log('Response headers:', Object.fromEntries(response.headers.entries()));
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Error response:', errorText);
                throw new Error(`検索に失敗しました (${response.status}): ${errorText}`);
            }
            
            const data = await response.json();
            console.log('Search data:', data);
            
            this.displaySearchResults(data.videos);
        } catch (error) {
            console.error('検索エラー:', error);
            console.error('Error stack:', error.stack);
            alert(error.message || '検索中にエラーが発生しました');
        } finally {
            this.showSearchLoading(false);
        }
    }

    // プログレスバー関連のメソッド
    startProgressUpdate() {
        if (this.progressUpdateInterval) {
            clearInterval(this.progressUpdateInterval);
        }
        
        this.progressUpdateInterval = setInterval(() => {
            if (this.player && this.player.getCurrentTime && !this.isDragging) {
                this.currentTime = this.player.getCurrentTime();
                this.duration = this.player.getDuration();
                this.updateProgressBar();
                
                // 動画の長さ情報を更新（初回のみ）
                const currentVideo = this.currentPlaylist[this.currentIndex];
                if (currentVideo && currentVideo.duration === '00:00' && this.duration > 0) {
                    this.updateVideoDuration(currentVideo.id);
                }
            }
        }, 100);
    }

    updateProgressBar() {
        if (this.duration > 0) {
            const progress = (this.currentTime / this.duration) * 100;
            document.getElementById('progress-filled').style.width = progress + '%';
            
            // バッファリング状況も更新
            if (this.player && this.player.getVideoLoadedFraction) {
                const buffered = this.player.getVideoLoadedFraction() * 100;
                document.getElementById('progress-buffered').style.width = buffered + '%';
            }
        }
        
        // 時間表示を更新
        document.getElementById('current-time').textContent = this.formatTime(this.currentTime);
        document.getElementById('duration').textContent = this.formatTime(this.duration);
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    seekTo(event) {
        if (!this.player || !this.duration) return;
        
        const progressBar = document.getElementById('progress-bar');
        const rect = progressBar.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const percentage = clickX / rect.width;
        const seekTime = this.duration * percentage;
        
        this.player.seekTo(seekTime, true);
        this.currentTime = seekTime;
        this.updateProgressBar();
    }

    startDragging(event) {
        this.isDragging = true;
        this.seekTo(event);
    }

    onDrag(event) {
        if (!this.isDragging) return;
        this.seekTo(event);
    }

    stopDragging() {
        this.isDragging = false;
    }

    saveToDevice() {
        try {
            const playlists = this.getPlaylistsFromStorage();
            
            if (playlists.length === 0) {
                alert('保存するプレイリストがありません');
                return;
            }
            
            // シンプルなテキスト形式に変換
            let exportText = `# Continuous Music プレイリスト\n`;
            exportText += `# 保存日: ${new Date().toLocaleDateString()}\n`;
            exportText += `# 使い方: プレイリスト名の後に動画URLまたはIDを1行ずつ記述\n`;
            exportText += `# 空行でプレイリストを分割\n\n`;
            
            playlists.forEach(playlist => {
                exportText += `## ${playlist.name}\n`;
                playlist.videos.forEach(video => {
                    exportText += `https://www.youtube.com/watch?v=${video.id} # ${video.title}\n`;
                });
                exportText += `\n`;
            });
            
            const dataBlob = new Blob([exportText], { type: 'text/plain; charset=utf-8' });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = `continuous-music-playlists-${new Date().toISOString().split('T')[0]}.txt`;
            link.click();
            
            URL.revokeObjectURL(link.href);
            
            alert(`${playlists.length}個のプレイリストを端末に保存しました`);
        } catch (error) {
            console.error('Error saving playlists to device:', error);
            alert('端末への保存に失敗しました');
        }
    }

    loadFromDevice() {
        document.getElementById('import-playlist').click();
    }

    handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                
                // ファイル拡張子で判断
                if (file.name.toLowerCase().endsWith('.txt')) {
                    this.importFromTextFile(content);
                } else {
                    this.importFromJsonFile(content);
                }
            } catch (error) {
                console.error('Error importing playlists:', error);
                alert('ファイルの読み込みに失敗しました。');
            }
        };
        
        reader.readAsText(file);
        event.target.value = '';
    }

    importFromTextFile(content) {
        try {
            const lines = content.split('\n').map(line => line.trim());
            const playlistsToImport = [];
            let currentPlaylist = null;
            
            console.log('Processing lines:', lines); // デバッグ用
            
            lines.forEach((line, index) => {
                console.log(`Line ${index}: "${line}"`); // デバッグ用
                
                // 空行をスキップ
                if (line === '') {
                    return;
                }
                
                // コメント行をスキップ（但し、##は除く）
                if (line.startsWith('#') && !line.startsWith('##')) {
                    return;
                }
                
                // プレイリスト名の行（## で始まる）
                if (line.startsWith('##')) {
                    if (currentPlaylist && currentPlaylist.videos.length > 0) {
                        playlistsToImport.push(currentPlaylist);
                    }
                    currentPlaylist = {
                        name: line.substring(2).trim(),
                        videos: []
                    };
                    console.log('New playlist:', currentPlaylist.name); // デバッグ用
                    return;
                }
                
                // 動画URLまたはIDの行
                if (currentPlaylist) {
                    const videoId = this.extractVideoIdFromLine(line);
                    console.log(`Extracted video ID: ${videoId} from line: ${line}`); // デバッグ用
                    
                    if (videoId) {
                        // タイトルを抽出（# の後ろ）
                        const titleMatch = line.match(/#\s*(.+)$/);
                        const title = titleMatch ? titleMatch[1].trim() : `Video ${videoId}`;
                        
                        currentPlaylist.videos.push({
                            id: videoId,
                            title: title
                        });
                        console.log('Added video:', { id: videoId, title }); // デバッグ用
                    } else {
                        console.log('Could not extract video ID from:', line); // デバッグ用
                    }
                }
            });
            
            // 最後のプレイリストを追加
            if (currentPlaylist && currentPlaylist.videos.length > 0) {
                playlistsToImport.push(currentPlaylist);
            }
            
            console.log('Final playlists to import:', playlistsToImport); // デバッグ用
            
            if (playlistsToImport.length === 0) {
                alert('有効なプレイリストが見つかりませんでした。\n\n形式例:\n## プレイリスト名\nhttps://www.youtube.com/watch?v=VIDEO_ID # タイトル');
                return;
            }
            
            this.addImportedPlaylists(playlistsToImport);
            
        } catch (error) {
            console.error('Error parsing text file:', error);
            alert('テキストファイルの読み込みに失敗しました。');
        }
    }

    importFromJsonFile(content) {
        try {
            const importedData = JSON.parse(content);
            let playlistsToImport = [];

            // 新形式のチェック
            if (importedData._format === "Continuous Music Playlists" && importedData.playlists) {
                playlistsToImport = importedData.playlists.map(playlist => ({
                    name: playlist.name,
                    videos: playlist.videos.map(video => ({
                        id: this.extractVideoIdFromVariousFormats(video),
                        title: video.title || `Video ${this.extractVideoIdFromVariousFormats(video)}`
                    }))
                }));
            } 
            // 旧形式のチェック
            else if (Array.isArray(importedData)) {
                playlistsToImport = importedData;
            }
            // 単一プレイリストのチェック
            else if (importedData.name && importedData.videos) {
                playlistsToImport = [importedData];
            }
            else {
                alert('無効なJSONファイル形式です。');
                return;
            }

            this.addImportedPlaylists(playlistsToImport);
            
        } catch (error) {
            console.error('Error parsing JSON file:', error);
            alert('JSONファイルの読み込みに失敗しました。');
        }
    }

    extractVideoIdFromLine(line) {
        // コメント部分を除去
        const cleanLine = line.split('#')[0].trim();
        
        // URLの場合
        if (cleanLine.includes('youtube.com') || cleanLine.includes('youtu.be')) {
            return this.extractVideoId(cleanLine);
        }
        
        // 11文字のIDの場合
        if (cleanLine.length === 11 && /^[a-zA-Z0-9_-]+$/.test(cleanLine)) {
            return cleanLine;
        }
        
        return null;
    }

    addImportedPlaylists(playlistsToImport) {
        const existingPlaylists = this.getPlaylistsFromStorage();
        const allPlaylists = [...existingPlaylists];
        
        playlistsToImport.forEach(playlist => {
            // "(インポート)" が既に含まれている場合は追加しない
            const playlistName = playlist.name.includes('(インポート)') 
                ? playlist.name 
                : playlist.name + ' (インポート)';
                
            const newPlaylist = {
                name: playlistName,
                videos: playlist.videos.filter(v => v.id && v.id.length === 11) // 有効なYouTube IDのみ
            };
            
            console.log('Adding playlist:', newPlaylist); // デバッグ用
            allPlaylists.push(newPlaylist);
        });

        localStorage.setItem('continuous-music-playlists', JSON.stringify(allPlaylists));
        this.loadSavedPlaylists();
        this.updatePlaylistSelector();
        
        const totalVideos = playlistsToImport.reduce((sum, p) => sum + p.videos.length, 0);
        alert(`${playlistsToImport.length}個のプレイリスト（${totalVideos}曲）を端末から読み込みました`);
    }

    extractVideoIdFromVariousFormats(video) {
        // youtube_id フィールドがある場合
        if (video.youtube_id) {
            return video.youtube_id;
        }
        
        // youtube_url フィールドがある場合
        if (video.youtube_url) {
            return this.extractVideoId(video.youtube_url);
        }
        
        // id フィールドがある場合（旧形式）
        if (video.id) {
            return video.id;
        }
        
        // url フィールドがある場合
        if (video.url) {
            return this.extractVideoId(video.url);
        }
        
        // 文字列として直接URLやIDが入っている場合
        if (typeof video === 'string') {
            // URLの場合
            if (video.includes('youtube.com') || video.includes('youtu.be')) {
                return this.extractVideoId(video);
            }
            // IDの場合（11文字）
            if (video.length === 11) {
                return video;
            }
        }
        
        return null;
    }

    // 自動保存機能
    autoSaveCurrentPlaylist() {
        try {
            localStorage.setItem('continuous-music-current', JSON.stringify(this.currentPlaylist));
        } catch (error) {
            console.error('Error auto-saving current playlist:', error);
        }
    }

    loadCurrentPlaylist() {
        try {
            const stored = localStorage.getItem('continuous-music-current');
            if (stored) {
                this.currentPlaylist = JSON.parse(stored);
                this.updateVideoList();
            }
        } catch (error) {
            console.error('Error loading current playlist:', error);
        }
    }

    // 新しいメソッド群
    onTargetPlaylistChange(event) {
        const newPlaylistInput = document.getElementById('new-playlist-name');
        if (event.target.value === 'new') {
            newPlaylistInput.style.display = 'block';
        } else {
            newPlaylistInput.style.display = 'none';
        }
    }

    updatePlaylistSelector() {
        const selector = document.getElementById('target-playlist');
        const playlists = this.getPlaylistsFromStorage();
        
        // 既存のオプションを削除（最初の2つは残す）
        while (selector.children.length > 2) {
            selector.removeChild(selector.lastChild);
        }
        
        // 既存プレイリストを追加
        playlists.forEach(playlist => {
            const option = document.createElement('option');
            option.value = playlist.name;
            option.textContent = playlist.name;
            selector.appendChild(option);
        });
    }

    addToNewPlaylist(playlistName, video) {
        const playlists = this.getPlaylistsFromStorage();
        const newPlaylist = {
            name: playlistName,
            videos: [{ id: video.id, title: video.title }]
        };
        
        playlists.push(newPlaylist);
        localStorage.setItem('continuous-music-playlists', JSON.stringify(playlists));
        this.loadSavedPlaylists();
        this.updatePlaylistSelector();
        
        // セレクターを新しく作成したプレイリストに変更
        document.getElementById('target-playlist').value = playlistName;
        document.getElementById('new-playlist-name').style.display = 'none';
        
        alert(`新しいプレイリスト「${playlistName}」を作成しました`);
    }

    addToExistingPlaylist(playlistName, video) {
        const playlists = this.getPlaylistsFromStorage();
        const playlist = playlists.find(p => p.name === playlistName);
        
        if (playlist) {
            playlist.videos.push({ id: video.id, title: video.title });
            localStorage.setItem('continuous-music-playlists', JSON.stringify(playlists));
            this.loadSavedPlaylists();
            alert(`「${playlistName}」に追加しました`);
        }
    }

    updatePlaylistTitle() {
        const titleElement = document.getElementById('current-playlist-title');
        const saveButton = document.getElementById('save-current-playlist');
        
        if (this.isEditingPlaylist && this.currentPlaylistName) {
            titleElement.textContent = `編集中: ${this.currentPlaylistName}`;
            saveButton.style.display = 'inline-block';
        } else {
            titleElement.textContent = '現在のプレイリスト';
            saveButton.style.display = 'none';
        }
    }

    saveCurrentPlaylist() {
        if (!this.currentPlaylistName || !this.isEditingPlaylist) return;
        
        const playlists = this.getPlaylistsFromStorage();
        const playlist = playlists.find(p => p.name === this.currentPlaylistName);
        
        if (playlist) {
            playlist.videos = this.currentPlaylist.map(v => ({ id: v.id, title: v.title }));
            localStorage.setItem('continuous-music-playlists', JSON.stringify(playlists));
            this.loadSavedPlaylists();
            alert(`「${this.currentPlaylistName}」を保存しました`);
        }
    }

    updateEditingPlaylist() {
        if (this.isEditingPlaylist && this.currentPlaylistName) {
            // 編集中のプレイリストが存在するかチェック
            const playlists = this.getPlaylistsFromStorage();
            const exists = playlists.some(p => p.name === this.currentPlaylistName);
            
            if (exists) {
                // 編集中のプレイリストを即座に更新
                this.saveCurrentPlaylist();
            } else {
                // プレイリストが削除されている場合、編集状態をリセット
                this.stopPlayback();
                this.currentPlaylistName = null;
                this.isEditingPlaylist = false;
                this.currentPlaylist = [];
                this.currentIndex = 0;
                this.updateVideoList();
                this.updatePlaylistTitle();
                this.autoSaveCurrentPlaylist();
            }
        }
    }

    stopPlayback() {
        // 動画再生を停止
        if (this.player && this.player.pauseVideo) {
            this.player.pauseVideo();
        }
        
        // プログレス更新を停止
        if (this.progressUpdateInterval) {
            clearInterval(this.progressUpdateInterval);
            this.progressUpdateInterval = null;
        }
        
        // 再生状態をリセット
        this.isPlaying = false;
        this.currentTime = 0;
        this.duration = 0;
        
        // UI更新
        this.updatePlayPauseButton();
        this.updateProgressBar();
    }

    // バックグラウンド再生機能
    setupBackgroundPlayback() {
        // Page Visibility API
        document.addEventListener('visibilitychange', () => {
            if (this.backgroundMode && document.hidden && this.isPlaying) {
                // バックグラウンドで音声のみ継続
                this.keepAudioAlive();
            }
        });

        // ページを離れる前の処理
        window.addEventListener('beforeunload', () => {
            if (this.backgroundMode && this.isPlaying) {
                // Wake Lockを解除
                this.releaseWakeLock();
            }
        });
    }

    async toggleBackgroundMode() {
        this.backgroundMode = !this.backgroundMode;
        const btn = document.getElementById('background-btn');
        
        if (this.backgroundMode) {
            btn.className = 'background-on';
            btn.title = 'バックグラウンド再生: ON';
            await this.requestWakeLock();
            this.showNotification('バックグラウンド再生が有効になりました');
        } else {
            btn.className = 'background-off';
            btn.title = 'バックグラウンド再生: OFF';
            this.releaseWakeLock();
            this.showNotification('バックグラウンド再生が無効になりました');
        }
    }

    async requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                this.wakeLock = await navigator.wakeLock.request('screen');
                console.log('Wake Lock acquired');
            }
        } catch (err) {
            console.error('Wake Lock request failed:', err);
        }
    }

    releaseWakeLock() {
        if (this.wakeLock) {
            this.wakeLock.release();
            this.wakeLock = null;
            console.log('Wake Lock released');
        }
    }

    keepAudioAlive() {
        // YouTube IFrame APIは音声のみの再生をサポートしていないため、
        // ここではページタイトルを変更して音楽が再生中であることを示す
        if (this.currentPlaylist[this.currentIndex]) {
            const originalTitle = document.title;
            const currentVideo = this.currentPlaylist[this.currentIndex];
            document.title = `♪ ${currentVideo.title} - Continuous Music`;
            
            // ページが再び表示されたときに元のタイトルに戻す
            const restoreTitle = () => {
                if (!document.hidden) {
                    document.title = originalTitle;
                    document.removeEventListener('visibilitychange', restoreTitle);
                }
            };
            document.addEventListener('visibilitychange', restoreTitle);
        }
    }

    updateMediaSession() {
        if ('mediaSession' in navigator && this.currentPlaylist[this.currentIndex]) {
            const currentVideo = this.currentPlaylist[this.currentIndex];
            
            navigator.mediaSession.metadata = new MediaMetadata({
                title: currentVideo.title,
                artist: 'Continuous Music',
                album: this.currentPlaylistName || '現在のプレイリスト',
                artwork: [
                    {
                        src: currentVideo.thumbnail,
                        sizes: '320x180',
                        type: 'image/jpeg'
                    }
                ]
            });

            // Media Session Actions
            navigator.mediaSession.setActionHandler('play', () => {
                this.player.playVideo();
            });

            navigator.mediaSession.setActionHandler('pause', () => {
                this.player.pauseVideo();
            });

            navigator.mediaSession.setActionHandler('previoustrack', () => {
                this.playPrevious();
            });

            navigator.mediaSession.setActionHandler('nexttrack', () => {
                this.playNext();
            });

            // Position State
            if (this.duration > 0) {
                navigator.mediaSession.setPositionState({
                    duration: this.duration,
                    playbackRate: 1.0,
                    position: this.currentTime
                });
            }
        }
    }

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                console.log('Service Worker registered:', registration);
            } catch (error) {
                console.log('Service Worker registration failed:', error);
            }
        }
    }

    showNotification(message) {
        // 簡単な通知表示
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #667eea;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // フェードイン
        setTimeout(() => {
            notification.style.opacity = '1';
        }, 100);
        
        // 3秒後にフェードアウト
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    async checkVideoEmbeddable(videoId) {
        try {
            const response = await fetch(`/api/video/${videoId}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || '動画情報の取得に失敗しました');
            }
            return await response.json();
        } catch (error) {
            console.error('動画チェックエラー:', error);
            throw error;
        }
    }

    createSearchResultsContainer() {
        const searchSection = document.querySelector('.search-section');
        const resultsContainer = document.createElement('div');
        resultsContainer.id = 'search-results';
        resultsContainer.className = 'search-results';
        resultsContainer.style.display = 'none';
        searchSection.appendChild(resultsContainer);
    }

    showSearchLoading(show) {
        const btn = document.getElementById('search-video');
        if (show) {
            btn.textContent = '検索中...';
            btn.disabled = true;
        } else {
            btn.textContent = '検索';
            btn.disabled = false;
        }
    }

    displaySearchResults(videos) {
        const container = document.getElementById('search-results');
        
        if (videos.length === 0) {
            container.innerHTML = '<p class="no-results">検索結果が見つかりませんでした。</p>';
            container.style.display = 'block';
            return;
        }
        
        container.innerHTML = `
            <div class="search-results-header">
                <h4>検索結果 (${videos.length}件)</h4>
                <button class="close-results" onclick="app.closeSearchResults()">×</button>
            </div>
            <div class="search-results-list">
                ${videos.map(video => `
                    <div class="search-result-item" onclick="app.addVideoFromSearch('${video.id}', '${this.escapeHtml(video.title)}')">
                        <img src="${video.thumbnail}" alt="thumbnail" class="result-thumbnail">
                        <div class="result-info">
                            <div class="result-title">${video.title}</div>
                            <div class="result-channel">${video.channelTitle}</div>
                        </div>
                        <button class="add-video-btn" onclick="event.stopPropagation(); app.addVideoFromSearch('${video.id}', '${this.escapeHtml(video.title)}')">追加</button>
                    </div>
                `).join('')}
            </div>
        `;
        
        container.style.display = 'block';
    }

    closeSearchResults() {
        const container = document.getElementById('search-results');
        container.style.display = 'none';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/'/g, '&#39;');
    }

    async addVideoFromSearch(videoId, title) {
        const targetPlaylist = document.getElementById('target-playlist').value;
        
        try {
            // 動画の埋め込み可能性を再チェック（検索結果では既にフィルタリング済みだが念のため）
            const videoInfo = await this.checkVideoEmbeddable(videoId);
            
            if (!videoInfo.embeddable) {
                alert(`この動画は追加できません。理由: ${videoInfo.restrictionReason || '再生制限'}`);
                return;
            }
            
            const video = {
                id: videoId,
                title: videoInfo.title,
                thumbnail: videoInfo.thumbnail,
                duration: videoInfo.duration
            };
            
            if (targetPlaylist === 'new') {
                const newPlaylistName = document.getElementById('new-playlist-name').value.trim();
                if (!newPlaylistName) {
                    alert('新規プレイリスト名を入力してください');
                    return;
                }
                this.addToNewPlaylist(newPlaylistName, video);
            } else if (targetPlaylist === 'current') {
                this.currentPlaylist.push(video);
                this.updateVideoList();
                this.autoSaveCurrentPlaylist();
                if (this.currentPlaylist.length === 1) {
                    this.playVideo(0);
                }
            } else {
                this.addToExistingPlaylist(targetPlaylist, video);
            }
            
            this.showNotification(`「${video.title}」を追加しました`);
        } catch (error) {
            console.error('動画追加エラー:', error);
            alert('動画の追加に失敗しました。');
        }
    }
}

// アプリケーションの初期化
const app = new ContinuousMusic();