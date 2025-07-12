# Renderデプロイ方法 完全ガイド

## 1. 前提条件

- GitHubアカウント
- Renderアカウント (無料で作成可能)
- YouTube Data API v3 キー

## 2. GitHubへのコードアップロード

### 2.1 リポジトリ作成
```bash
# GitHubで新しいリポジトリを作成 (例: continuous-music)
# ローカルでGit初期化
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/continuous-music.git
git push -u origin main
```

### 2.2 必要ファイルの確認
以下のファイルがリポジトリに含まれていることを確認：
- `server.js`
- `package.json`
- `render.yaml`
- `public/` フォルダ（全ファイル）
- `.env` ファイル（**ただし、実際のAPIキーは削除**）

## 3. Renderでのデプロイ設定

### 3.1 Renderアカウント作成・ログイン
1. [Render](https://render.com)にアクセス
2. GitHubアカウントでサインアップ/ログイン

### 3.2 新しいWebサービス作成
1. ダッシュボードで「New +」→「Web Service」
2. GitHubリポジトリを接続
3. リポジトリを選択（continuous-music）

### 3.3 サービス設定
```yaml
Name: continuous-music
Environment: Node
Region: Oregon (US West) # 日本に近い
Branch: main
Build Command: npm install
Start Command: npm start
```

### 3.4 環境変数設定
「Environment」タブで以下を追加：
```
YOUTUBE_API_KEY = [あなたのAPIキー]
NODE_ENV = production
PORT = 10000
```

## 4. YouTube Data API キーの取得

### 4.1 Google Cloud Console設定
1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. 新しいプロジェクト作成または既存プロジェクト選択
3. 「APIとサービス」→「ライブラリ」
4. 「YouTube Data API v3」を検索して有効化

### 4.2 認証情報作成
1. 「APIとサービス」→「認証情報」
2. 「認証情報を作成」→「APIキー」
3. 生成されたAPIキーをコピー
4. 「キーを制限」でセキュリティ設定（推奨）

## 5. デプロイ実行

### 5.1 自動デプロイ
1. Renderで「Deploy」ボタンをクリック
2. ビルドログを確認
3. デプロイ完了まで待機（通常5-10分）

### 5.2 デプロイ状況確認
```
ビルド成功 ✅
サーバー起動 ✅
ヘルスチェック ✅ (/health エンドポイント)
```

## 6. アクセス確認

### 6.1 提供されるURL
```
https://continuous-music-[random].onrender.com
```

### 6.2 動作確認
1. サイトにアクセス
2. 検索機能をテスト
3. 動画追加・再生をテスト

## 7. トラブルシューティング

### 7.1 よくある問題

**ビルドエラー**
```bash
# package.jsonの依存関係を確認
npm install
npm start  # ローカルで動作確認
```

**webpack-cli エラー**
- webpack関連のパッケージをdependenciesに移動済み
- ビルドコマンドを簡素化済み
- 静的ファイルを直接提供する構成

**APIキーエラー**
- Render環境変数で`YOUTUBE_API_KEY`が正しく設定されているか確認
- YouTube Data API v3が有効化されているか確認

**ポートエラー**
- `PORT=10000`が環境変数に設定されているか確認
- server.jsで`process.env.PORT`を使用しているか確認

### 7.2 ログ確認
```
Renderダッシュボード → サービス → Logs タブ
```

### 7.3 再デプロイ
```
Manual Deploy → Deploy latest commit
```

## 8. 継続的デプロイ

### 8.1 自動デプロイ設定
GitHubのmainブランチにプッシュすると自動でデプロイされます。

### 8.2 ブランチ保護
```bash
# 開発用ブランチで作業
git checkout -b feature/new-feature
# 変更後
git push origin feature/new-feature
# プルリクエスト作成 → レビュー → mainにマージ
```

## 9. 本番運用のベストプラクティス

### 9.1 監視
- Renderの監視ダッシュボードを定期確認
- アップタイム監視サービスの利用

### 9.2 セキュリティ
```yaml
# 環境変数でのシークレット管理
API_KEY: [Render Environment Variables]
# HTTPSの強制（Renderは自動）
# CORS設定の確認
```

### 9.3 パフォーマンス
- 無料プランでは30分無アクセスでスリープ
- 有料プランでスリープ無効化可能

## 10. コスト

### 10.1 無料プラン
- 月750時間（31日間）
- 512MB RAM
- スリープ機能あり

### 10.2 有料プラン ($7/月〜)
- スリープなし
- より多いRAM
- カスタムドメイン

---

これでRenderでのデプロイが完了します！何か問題があれば、Renderのログとブラウザの開発者ツールを確認してください。