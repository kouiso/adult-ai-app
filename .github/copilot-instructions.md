# AI Coding Instructions — adult-ai-app

## 命名規則

- **ファイル名・ディレクトリ名**: 英語小文字単数形ケバブケース（例: `chat-input.tsx`, `settings-panel/`）
- **コンポーネント**: PascalCase（例: `ChatInput`, `SettingsPanel`）
- **変数・関数**: camelCase（例: `sendMessage`, `chatStore`）
- **型名**: PascalCase + 具体的な名前（例: `ChatInputProps`, `MessageBubbleProps`）
- **定数**: UPPER_SNAKE_CASE（例: `MAX_RETRY_COUNT`）

## 言語ルール

- **コード内コメントは日本語で書くこと**（「なぜ」のみ記述。自明なコメント禁止）
- **コミットメッセージは英語**（Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`）
- **ドキュメント（README, docs/）は日本語**
- AIっぽい丁寧語（「承知いたしました」「〜させていただきます」）は使わない

## Critical Checklist（必須遵守）

1. **[作業委任禁止]** ユーザーに「確認してください」「実行してください」と言わない。自分で検証・実行し、確認済みの結果のみ報告する。
2. **[推測禁止]** 「おそらく動くはずです」は禁止。事実を検証してから発言する。
3. **[エラー隠蔽禁止]** `// @ts-ignore`, `as any`, 空の `catch {}` で誤魔化さない。根本原因を修正する。
4. **[部分作業禁止]** 指定ファイルだけ修正して終わりにしない。類似ファイルも検索して全箇所を修正する。
5. **[Git違反禁止]** `--no-verify`, `--force`（`--force-with-lease` のみ可）, `git reset` 禁止。

## TypeScript 型安全ルール

### 絶対禁止
- `any` 型（`as any`, `any[]`, `: any`）→ 型定義・zodスキーマ・ジェネリクスで解決
- `as SomeType` 型アサーション（`as const` は許可）→ 型ガード・zodバリデーションで解決
- `// @ts-ignore`, `// @ts-expect-error` → 型定義を修正する
- `// eslint-disable` → ルールに従ってコードを修正する

### 推奨
- 型ユーティリティ活用: `Omit<T, K>`, `Pick<T, K>`, `Partial<T>`, `Required<T>`, `Record<K, T>`, `Readonly<T>`
- Props 型は具体的な名前にする（`Props` → `ChatInputProps` など）
- zod スキーマからの型推論を活用する

## 実装品質

- **pnpm** をパッケージマネージャーとして使用（npm, yarn 禁止）
- `pnpm build` (`tsc -b && vite build`) が通ること
- `pnpm lint` が通ること
- 新機能にはテストを追加する
- バックアップファイル（`.bak`, `_backup`, `_temp`, `_copy`）を作成しない

## Git ルール

- **ブランチ戦略**: `main` がデフォルトブランチ
- **コミット**: Conventional Commits 形式
- **禁止操作**: `--no-verify`, `git reset`, `--force`（`--force-with-lease` のみ可）
- **PR/Issue**: 許可なく PR・Issue・コメントを投稿しない

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フロントエンド | React 19, TypeScript, Vite 8 |
| スタイリング | Tailwind CSS v4, shadcn/ui |
| 状態管理 | Zustand |
| ローカルDB | Dexie (IndexedDB) |
| AI SDK | Vercel AI SDK, OpenRouter |
| バックエンド | Hono (Cloudflare Pages Functions) |
| デプロイ | Cloudflare Pages |
| パッケージマネージャー | pnpm |

## 禁止事項一覧

| カテゴリ | 禁止 | 代替 |
|---------|------|------|
| Git | `--no-verify`, `git reset`, `--force` | hookエラーを修正, `--force-with-lease` |
| 型安全 | `any`, `as`, `@ts-ignore`, `eslint-disable` | 型定義, 型ガード, zod |
| ファイル | `.bak`, `_backup`, `_temp` ファイル | 不要 |
| コメント | 自明なコメント, 英語コメント | 「なぜ」のみ日本語で |
| 行動 | ユーザーへの作業委任, 推測ベースの発言 | 自律実行, 事実の検証 |
