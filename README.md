# Continuous Music

YouTube動画のリピート再生とプレイリスト機能を提供するWebアプリケーション

## 機能

- 🎵 YouTube動画のリピート再生
- 📝 プレイリスト作成・管理
- 🔄 リピートモード（1曲リピート、全曲リピート）
- 🔀 シャッフル再生
- 💾 プレイリスト保存機能
- 📱 レスポンシブデザイン

## 技術スタック

- **Frontend**: HTML, CSS, JavaScript, YouTube IFrame API
- **Backend**: Node.js, Express, Socket.IO
- **Database**: SQLite3
- **Infrastructure**: Docker, Nginx

## 開発環境セットアップ

### 必要な要件

- Node.js 18+
- Docker & Docker Compose
- YouTube Data API Key

### インストール

1. リポジトリをクローン
```bash
git clone https://github.com/Seiryu1996/continuous-music.git
cd continuous-music
```

2. 依存関係をインストール
```bash
npm install
```

3. 環境変数を設定
```bash
cp .env.example .env
# .envファイルを編集してYouTube API Keyを設定
```

4. 開発サーバーを起動
```bash
npm run dev
```

## Docker環境での起動

```bash
# 開発環境
docker-compose up -d

# 本番環境
docker-compose -f docker-compose.yml up -d
```

## デプロイ

GitHub Actionsを使用した自動デプロイに対応

### 必要なシークレット設定

- `DOCKERHUB_USERNAME`: DockerHubユーザー名
- `DOCKERHUB_TOKEN`: DockerHubアクセストークン
- `HOST`: デプロイ先サーバーのホスト
- `USERNAME`: SSHユーザー名
- `SSH_KEY`: SSH秘密鍵

## 使用方法

1. YouTube URLを入力して動画を追加
2. プレイリストを作成・管理
3. リピートモードやシャッフル機能を使用
4. プレイリストを保存して後で再利用

## API エンドポイント

- `GET /api/playlists` - プレイリスト一覧取得
- `POST /api/playlists` - プレイリスト作成
- `DELETE /api/playlists/:id` - プレイリスト削除

## ライセンス

MIT License