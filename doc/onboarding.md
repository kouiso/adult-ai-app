# ONBOARDING

チームにジョインしてアプリを立ち上げるところまで

## prerequisite

- Machine: macOS
- Node.js v22（mise 推奨）

<details>
<summary>miseによるNode.jsバージョン管理</summary>

```bash
brew install mise
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc
source ~/.zshrc
```

`.tool-versions` を置いていない場合は直接インストール:

```bash
mise use node@22
```

</details>

- [pnpm](https://pnpm.io/installation)

```bash
npm install -g pnpm
```

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)（Cloudflare Pages へデプロイ・ローカルエミュレートに使用）

```bash
pnpm add -g wrangler
```

## セットアップ

### ステップ 1: 依存インストール

```bash
pnpm install
```

### ステップ 2: シークレットを `.dev.vars` に設定

Cloudflare Pages Functions はローカル開発時に `.dev.vars` からシークレットを読み込む。

```bash
cp .dev.vars.example .dev.vars
# .dev.vars を開いて各キーを埋める
```

| 変数名               | 説明                                                      |
| -------------------- | --------------------------------------------------------- |
| `OPENROUTER_API_KEY` | [OpenRouter](https://openrouter.ai/) の API キー          |
| `NOVITA_API_KEY`     | [Novita AI](https://novita.ai/) の API キー（画像生成用） |

### ステップ 3: 起動

```bash
# フロントエンドのみ（Worker なし・API 呼び出し不可）
pnpm dev

# フロント + Cloudflare Pages Functions エミュレーション（推奨）
pnpm dev:worker
```

## 主要コマンド

```bash
# 型チェック + ビルド
pnpm build

# lintチェック
pnpm lint

# dist をローカルでプレビュー（Worker付き）
pnpm preview

# Cloudflare Pages へデプロイ
pnpm deploy
```

## シークレット管理（本番）

本番環境のシークレットは `.dev.vars` ではなく Wrangler CLI で設定する:

```bash
wrangler secret put OPENROUTER_API_KEY
wrangler secret put NOVITA_API_KEY
```
