# Layer 1: Image Generation Input Redesign

## 問題の本質

現在の `handleGenerateImage` は `lastAssistant.content` のみを画像生成に渡している。
ユーザーの視覚的アクション（「白衣を脱がせる」「押し倒す」）は user message に存在するが、
assistant の感情的リアクション（「んっ…やめて…」）だけが入力される。
結果: 最もエロティックな視覚情報が画像プロンプトに到達しない。

## 現状のデータフロー

```
chat-view.tsx:653 handleGenerateImage
  -> lastAssistant.content.slice(0, 500)          <- ここが問題
  -> parseSystemPrompt(characterSystemPrompt).personality  <- charDesc
  -> generateImage(prompt, charDesc)               <- api.ts:332
  -> POST /api/image                               <- functions/api/[[route]].ts:1037
    -> qwen-2.5-72b で日本語->英語タグ翻訳
    -> novita txt2img (meinahentai_v4)
```

---

## A. Input Construction: 構造化シーン記述

### 変更箇所: `chat-view.tsx` handleGenerateImage

現在:
```typescript
const prompt = lastAssistant.content.slice(0, IMAGE_PROMPT_MAX_LENGTH);
```

提案: user + assistant の直近ペアからシーン記述を構築

```typescript
const lastUser = [...msgs].reverse().find((m) => m.role === "user" && m.content);
const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant" && m.content);
if (!lastAssistant) return;

const phase = detectScenePhase(msgs);

const sceneDescription = [
  lastUser ? `[ユーザーの行動] ${lastUser.content.slice(0, 300)}` : "",
  `[キャラの反応] ${lastAssistant.content.slice(0, 300)}`,
].filter(Boolean).join("\n");

const prompt = sceneDescription.slice(0, IMAGE_PROMPT_MAX_LENGTH);
```

### 変更箇所: `api.ts` generateImage

`phase` パラメータを追加:

```typescript
export async function generateImage(
  prompt: string,
  characterDescription?: string,
  phase?: ScenePhase,
): Promise<{ task_id: string } | { error: string }>
```

body に `phase` を追加して送信。

### 変更箇所: `functions/api/[[route]].ts` imageSchema + /api/image ハンドラ

imageSchema に `phase` を追加:
```typescript
phase: z.enum(["conversation", "intimate", "erotic", "climax"]).optional().default("conversation"),
```

翻訳プロンプトのシステムメッセージをフェーズに応じて分岐（セクションCで詳述）。

---

## B. Scene State Tracker: 衣装・体位の推論

### 採用アプローチ: LLM推論（シンプル版）

明示的な衣装ステートマシンは過剰。翻訳LLMに推論させる。

**方法**: 翻訳プロンプト（qwen-2.5-72b）のシステムメッセージに、会話コンテキストから衣装状態を推論する指示を追加。

現在の翻訳プロンプト入力:
```
Character: {characterDescription}
Scene: {prompt}   <- lastAssistantのみ
```

提案:
```
Character: {characterDescription}
Scene context (infer current clothing/position state from this):
{sceneDescription}   <- user行動 + assistant反応
Current phase: {phase}
```

翻訳システムプロンプトに追加ルール:
```
- Infer the current state of undress from the scene context
  (e.g., if user said "白衣を脱がせる" and character reacted, output: open_clothes, lab_coat_removed)
- Infer body position from context (standing, lying_down, on_knees, etc.)
- Include these inferred state tags in your output
```

**なぜ明示的トラッキングをしないか**:
- DB変更不要、フロント状態管理不要
- 翻訳モデルは日本語理解が十分（qwen-2.5-72b）
- 直近1ペアの文脈で衣装状態は十分推論可能
- 実装コスト: ほぼゼロ（プロンプト変更のみ）

---

## C. Phase-Aware Image Parameters

### 翻訳プロンプトのフェーズ別分岐

`functions/api/[[route]].ts` の翻訳システムプロンプトをフェーズで切り替え:

| Phase | 翻訳指示の追加内容 | CFG | Model |
|-------|-------------------|-----|-------|
| conversation | `clothed, casual pose, safe for work framing` | 7.0 | 変更なし |
| intimate | `partial undress allowed, close-up framing, soft lighting` | 7.5 | 変更なし |
| erotic | `explicit nudity, sexual position, detailed anatomy` | 8.5 | 変更なし (meinahentai_v4) |
| climax | `explicit, orgasm, bodily fluids, intense expression` | 9.0 | 変更なし |

### guidance_scale のフェーズ連動

現在の固定値 `8.5` をフェーズで調整:

```typescript
const cfgByPhase: Record<string, number> = {
  conversation: 7.0,
  intimate: 7.5,
  erotic: 8.5,
  climax: 9.0,
};
const guidance_scale = cfgByPhase[phase] ?? 8.5;
```

### negative_prompt のフェーズ連動

conversation/intimate: `nsfw, nudity` を negative に追加
erotic/climax: negative から `nsfw` を除外（現状通り）

---

## D. Implementation Plan

### 変更ファイル一覧

| # | ファイル | 変更内容 | 複雑度 |
|---|---------|---------|--------|
| 1 | `src/component/chat/chat-view.tsx` | handleGenerateImage: lastUser取得、phase検出、sceneDescription構築 | 低 |
| 2 | `src/lib/api.ts` | generateImage: phase パラメータ追加 | 低 |
| 3 | `functions/api/[[route]].ts` | imageSchema: phase追加。翻訳プロンプト: フェーズ別システムメッセージ。txt2img: CFG/negative連動 | 中 |

### 変更しないもの

- `src/lib/scene-phase.ts` -- そのまま使用（既にクライアント側に存在）
- `src/store/chat-store.ts` -- messages配列に直接アクセスできるため変更不要
- `src/lib/prompt-builder.ts` -- charDescの抽出ロジックは現状で十分
- DB schema -- 一切変更なし

### 実装順序

1. **chat-view.tsx** -- sceneDescription構築 + phase検出（`detectScenePhase` import追加）
2. **api.ts** -- generateImage に phase 引数追加
3. **[[route]].ts** -- imageSchema拡張 -> 翻訳プロンプト分岐 -> CFG/negative連動

### 推定工数

3ファイル、合計差分 ~80行。ビルド・型チェックへの影響: なし（後方互換）。

### リスク

| リスク | 対策 |
|--------|------|
| user message にネタバレ的な行動指示が含まれ、画像が先回りする | slice(0, 300)で切り詰め + 「キャラの反応」を後に配置して翻訳モデルに重み付け |
| 翻訳モデルが構造化入力を正しくパースしない | `[ユーザーの行動]` `[キャラの反応]` のラベルで明示的に区切る |
| conversation フェーズでNSFW画像が生成される | negative_prompt に nsfw, nudity を追加して抑制 |
