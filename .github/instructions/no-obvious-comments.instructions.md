---
applyTo: "**"
---

# 自明なコメント禁止（No Obvious Comments）

## 原則

**コードを読めばわかることをコメントに書くな。**

コメントは「なぜ（Why）」を説明するために存在する。「何をしている（What）」はコード自体が語るべきであり、コメントで繰り返す必要はない。

---

## 禁止パターン

```typescript
// ❌ 禁止: 見ればわかる
const maxRetries = 3; // 最大リトライ回数
const isLoading = true; // ローディング状態

// ✅ 許可: なぜその値かを説明
const maxRetries = 3; // API側のレート制限が5回/分のため、余裕を持たせて3回
```

```typescript
// ❌ 禁止: 関数名と引数で明らか
// メッセージを送信する
async function sendMessage(text: string) { ... }

// ✅ 許可: 非自明な仕様・制約の説明
// SSE形式でストリーミングされるため、[DONE]シグナルで完了を検知する
async function sendMessage(text: string) { ... }
```

```typescript
// ❌ 禁止: コードそのまま
// ステータスが'active'の場合
if (status === 'active') { ... }

// ✅ 許可: ビジネスロジックの背景（このプロジェクト向け例）
// ストリーミング中はisStreaming=trueのダミーメッセージが存在するため除外
.filter((m) => !m.isStreaming)
```

```typescript
// ❌ 禁止: セクション区切りとして無意味
// --- Imports ---
import { useState } from "react";

// ❌ 禁止: ブロック終わりコメント
if (condition) {
  // 処理
} // if文の終わり
```

## 英語コメント禁止

コード内コメントはすべて**日本語**で書くこと。

```typescript
// ❌ 禁止
// Check if the user is authenticated

// ✅ 正解
// 未認証ユーザーはOpenRouterAPIを直接叩けないため、Workerを経由させている
```
