# 開発ガイド

## コマンド使い分け

`package.json` の `scripts` はすべて `pnpm` 経由で実行する（`npm run` 禁止）。

| コマンド          | 用途                                               |
| ----------------- | -------------------------------------------------- |
| `pnpm dev`        | Vite のみ起動（API なし）                          |
| `pnpm dev:worker` | Vite + Cloudflare Pages Functions エミュレーション |
| `pnpm build`      | `tsc -b && vite build`（型チェック込み）           |
| `pnpm lint`       | ESLint 全体チェック                                |
| `pnpm preview`    | `dist` を Worker 付きでローカルプレビュー          |
| `pnpm deploy`     | Cloudflare Pages へデプロイ                        |

## コーディング規約

### ディレクトリ・ファイル

- ファイル名・ディレクトリ名はすべてケバブケース単数形
  - 例: `chat-input.tsx`, `settings-store.ts`, `component/chat/`

### TypeScript 型安全

- `any` 型・`as SomeType` による型アサーション禁止（`as const` は可）
- `// @ts-ignore`, `// @ts-expect-error` 禁止 → 型定義を直す
- `// eslint-disable` 禁止 → ルールに違反しないコードに直す
- 型ユーティリティ（`Omit`, `Pick`, `Partial` 等）を積極的に使う
- zod スキーマからの型推論を優先する

### コメント

- コメントは「なぜ（Why）」だけを日本語で書く
- コードを読めばわかることは書かない

### API

- 一覧取得は `POST /search` 形式を優先
  - クエリパラメータだと複雑な検索条件を組み立てられないため
  - URL に個人情報が入らずよりセキュアになるため

### Git

- コミットメッセージは Conventional Commits（`feat:`, `fix:`, `chore:` 等）
- `--no-verify` 禁止（hook エラーはコードを直して解消する）
- `git reset` 禁止（`git revert` を使う）
- `--force` 禁止（`--force-with-lease` のみ可）

## アーキテクチャ

```
src/
  app.tsx              # ルートコンポーネント
  main.tsx             # エントリーポイント
  component/
    chat/              # チャット UI
    settings/          # 設定パネル
    ui/                # shadcn/ui コンポーネント
  lib/
    api.ts             # OpenRouter / Novita への fetch ラッパー
    db.ts              # Dexie (IndexedDB) スキーマ定義
    utils.ts           # 汎用ユーティリティ
  store/
    chat-store.ts      # Zustand チャット状態
    settings-store.ts  # Zustand 設定状態

functions/
  api/[[route]].ts     # Hono ルーター（Cloudflare Pages Functions）
```

## Knowledge

### Cloudflare Pages Functions と SSE

Worker は `new Response(ReadableStream)` でSSEストリーミングをサポートしている。
Hono のストリームヘルパーはバッファリングされる場合があるため、SSE は素の `ReadableStream` を使うこと。

詳細は [doc/infra-claims-verification.md](./infra-claims-verification.md) を参照。

### Dexie (IndexedDB)

チャット履歴はすべてブラウザのIndexedDBに保存する。`src/lib/db.ts` でスキーマを管理する。
Zustand の `persist` ミドルウェアではなく Dexie を直接使用している（リレーショナルなクエリが必要なため）。

### Zustand store

- store は `src/store/` 以下にファイルを作る
- `immer` ミドルウェアは不使用。Object spread で更新する
- `persist` ミドルウェアは設定（`settings-store`）のみに使用する

### OpenRouter モデル切り替え

`settings-store` の `model` フィールドで制御する。
フロント → `functions/api/[[route]].ts` → OpenRouter の流れでリクエストが渡る。
APIキーはフロントに露出させず、必ず Worker 経由でプロキシする。
