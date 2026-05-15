# BoardArena 🎲

オンラインボードゲーム対戦プラットフォーム。チェス・将棋・トランプ（ババ抜き・大富豪・神経衰弱）の 5 種を、CPU 10 段階のソロ／レート近接者と自動マッチするオンライン対戦で遊べます。

## 主な機能

- 🔐 アカウント作成・ログイン（Supabase Auth, Email + Password）
- 👤 プロフィール（アバター画像 / 名前 / 一言）
- 🤖 ソロ戦：CPU レベル 1〜10
- 🌐 オンライン戦：レート近接マッチング（自動拡大）＋リアルタイム同期
- 📈 ゲームごとに独立した Elo レーティング（初期値 1000）
- 🏆 ランキング（Top100 + 自分の順位）

## 技術スタック

- **Next.js 14 (App Router) + TypeScript**
- **Tailwind CSS**
- **Supabase**: Postgres / Auth / Realtime / Storage
- ゲームエンジン: `chess.js`（チェス）、自前 9x9 将棋エンジン、自作カードロジック

## ローカル開発

```bash
# 1. 依存関係インストール
npm install

# 2. 環境変数設定
cp .env.example .env.local
#  .env.local を編集：
#    NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
#    NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
#    SUPABASE_SERVICE_ROLE_KEY=eyJ...   ← サーバ用（漏洩注意）

# 3. Supabase スキーマ適用
#   Supabase Dashboard → SQL Editor で
#   supabase/migrations/0001_init.sql を実行

# 4. 開発サーバ起動
npm run dev
# http://localhost:3000
```

### Supabase セットアップ詳細

1. [supabase.com](https://supabase.com/) で新規プロジェクト作成（無料枠）
2. **Project Settings → API** から URL と anon key, service role key を取得
3. **SQL Editor** で `supabase/migrations/0001_init.sql` 全文をペースト→ Run
4. **Storage** → `avatars` バケットが作成されていることを確認（マイグレーションで自動作成）
5. **Authentication → Providers** で Email を有効化（デフォルト ON）

## デプロイ手順（GitHub + Vercel）

### 1. GitHub リポジトリ作成

```bash
git init
git add .
git commit -m "Initial commit: BoardArena online board game platform"
git branch -M main
git remote add origin https://github.com/<YOUR-NAME>/board-arena.git
git push -u origin main
```

### 2. Vercel デプロイ

1. [vercel.com](https://vercel.com/) → **New Project** → GitHub リポジトリを Import
2. Framework Preset: **Next.js**（自動検出）
3. **Environment Variables** に以下を追加：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. **Deploy** → 数分で URL 発行
5. Supabase Dashboard → **Authentication → URL Configuration** に Vercel の本番 URL を「Site URL」「Redirect URLs」へ追加

## ディレクトリ構成

```
app/
  (auth)/login, signup           ログイン・新規登録
  (main)/
    page.tsx                     ホーム（ゲーム選択）
    profile/[id]/                プロフィール表示・編集
    play/[game]/solo/            ソロ対戦（CPU レベル選択）
    play/[game]/match/           オンラインマッチング待機
    play/[game]/room/[roomId]/   オンライン対局
    ranking/[game]/              ランキング
  api/
    match/                       マッチング API
    result/online/               オンライン結果送信
    result/solo/                 ソロ結果送信（Elo は更新しない）
components/
  ui/                            ベース UI（Button, Card, Input, Label）
  board/                         ChessBoard, ShogiBoard
  games/                         ChessSolo, ShogiSolo, BabanukiSolo, ...
  online/                        OnlineChess, OnlineShogi
  common/                        Header, LevelPicker
lib/
  supabase/                      Supabase SSR ヘルパー
  rating/elo.ts                  Elo 計算
  games/                         各ゲームのロジック・AI
supabase/migrations/             SQL マイグレーション
types/database.ts                DB 型定義
```

## レーティング仕様

| レート | K 係数 |
|---|---|
| < 1500 | 32 |
| < 2000 | 24 |
| 2000+ | 16 |

- 期待勝率 `1 / (1 + 10^((R_B - R_A)/400))`
- 低レート → 高レート勝利時の獲得値は大きく、逆は小さい
- 多人数（大富豪等）は順位ベース：各プレイヤー vs 他者平均レート × 順位スコアで逐次更新

## テスト

```bash
npm test         # Vitest（Elo 単体テスト）
```

## ライセンス

MIT
