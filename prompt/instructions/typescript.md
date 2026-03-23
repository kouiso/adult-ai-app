---
applyTo: "**/*.ts,**/*.tsx"
---

# TypeScript規約

**ルール違反は即時タスク失敗。例外一切認めず。**

## Props型命名規約

- **Props型は必ずコンポーネント名+Propsで命名すること**
  - 例: `type ChatInputProps = { ... }`
  - 例: `type MessageBubbleProps = { ... }`
- `type Props = { ... }` のような汎用名は禁止（既存も発見次第リネーム）

## 型安全性

- **`as const` 推奨**: READONLY型保証、型安全性向上
- **実行時バリデーション**: zodスキーマ推奨

## `any`型の完全禁止

- **対象**: `as any`, `any[]`, `: any`, `<any>`, `Promise<any>`
- **対処法**: 適切な型定義、zodスキーマ、ジェネリクス

```typescript
// ❌ 禁止
const data: any = fetchData();

// ✅ 正解
const data: ChatResponse = fetchData();
```

## 型アサーション（`as`）の完全禁止

- **対象**: `as any`, `as unknown`, `as SomeType`
- **例外**: `as const` は積極推奨
- **対処法**: 型ガード（`is` キーワード）、zodスキーマ（`safeParse`）

```typescript
// ❌ 禁止
const user = response as User;

// ✅ 正解（zodバリデーション）
const result = userSchema.safeParse(response);
if (result.success) {
  const user = result.data;
}
```

## 型ユーティリティの積極活用義務

- ✅ `Omit<T, K>`, `Pick<T, K>`, `Partial<T>`, `Required<T>`
- ✅ `Record<K, T>`, `Readonly<T>`
- ✅ 組み合わせ: `Omit<UserType, 'id'> & { customField: string }`

## アロー関数の原則

- **デフォルト**: アロー関数（`const foo = () => {}`）を使用
- `function` キーワードはホイスティングが明示的に必要な場合のみ

## インターフェース vs 型エイリアス

- `interface`: 拡張・実装の可能性があるオブジェクト形状に使う
- `type`: Union、Intersection、Tuple、Mapped型、ユーティリティ型に使う
- `enum` より string literal union を優先する

## React Props

- 型コールバックを明示的に定義する
- `React.FC` は使用しない

```typescript
interface UserCardProps {
  user: User
  onSelect: (id: string) => void
}

function UserCard({ user, onSelect }: UserCardProps) {
  return <button onClick={() => onSelect(user.id)}>{user.email}</button>
}
```
