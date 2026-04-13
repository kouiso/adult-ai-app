# Phase 1 調査結果: テスト経路 vs 実機経路のギャップ

## 核心の発見

テストスクリプト (`script/test-xml-quality.mjs`) と実機ブラウザ (`chat-view.tsx` → `api.ts`) で **AIに送信するメッセージ配列が5箇所異なる**。

## ギャップ一覧

| # | 処理 | 実機 (chat-view.tsx) | テストスクリプト | 影響 |
|---|------|---------------------|-----------------|------|
| 1 | persona reminder | 3ユーザーターンごとに `buildPersonaReminder` を system role で挿入 (L341-353) | **なし** | キャラドリフト防止が効かない |
| 2 | LANG_REMINDER | 最後のuserメッセージ直前に system で注入 (L357-362) | **なし** | 英語混入防止が弱い |
| 3 | 一人称抽出 | `extractFirstPerson` で systemPrompt から「一人称は「X」」パターン抽出 (L33-35) | シナリオ定義にハードコード | テストでは問題ないが実機では一人称未指定キャラで穴 |
| 4 | streaming/system除外 | `isStreaming` と `role=system` をフィルタ (L334-337) | フィルタなし（手動配列） | テストでは問題なし |
| 5 | リトライメッセージ | api.ts L299-306: messages配列に失敗応答+書き直し指示を追加するが **アダプター未経由** | 独自のリトライ組立 (L317-324) | リトライ時にpersona/LANG注入が欠落 |

## サーバーサイド注入（両経路で共通）

`functions/api/[[route]].ts` がリクエスト受信後に追加する処理:
- **PLATFORM_BASE**: scene用 (L847-863) vs conversation用 (L870-884) を phase で分岐
- **SCENE_RESPONSE_STRUCTURE** (L888-911) or **CONVERSATION_XML_HINT** (L915-922)
- **sanitizeCharacterPromptForConversation**: 会話フェーズでarc_intimate/erotic/climaxを除去 (L935-958)
- **sceneContext + emotionalArc + characterVoice**: 最後のuserメッセージ直前に注入 (L986-1000)

→ これらはサーバーで注入されるためテスト・実機とも共通。ギャップの原因はクライアントサイドのみ。

## 一人称未指定キャラの穴

`extractFirstPerson` は `一人称は「X」` パターンのみ検出。systemPromptにこのパターンがないキャラは:
- quality-guard の `wrong-first-person` チェックが無効化される（wrongFirstPersons が空配列）
- persona reminder の一人称ルールも空文字列になる

→ Phase 4 でシードデータ40キャラをスキャンして穴を特定する必要あり。

## wrapConversationPlainAsXml 救済パッチの限界

api.ts L314-321: conversation フェーズで XML 未出力時にプレーン応答を `<response><dialogue>` でラップ。
- **no-english は防げない**: ラップ前に英語混入していれば品質チェックでそのまま検出される
- XML欠落のみ救済し、内容品質は救済しない → 設計として正しい

## Phase 2-3 実装完了

- `src/lib/chat-message-adapter.ts` 新規作成（buildMessagesForApi, buildRetryMessages, extractFirstPerson）
- `chat-view.tsx` → アダプターに委譲
- `api.ts` → リトライもアダプター経由
- `script/test-xml-quality.ts` 新規作成（.mjs を TypeScript 化、全モジュール直接 import）
- build + lint 通過確認済み

## Phase 5 モデル評価結果（アダプター経由テスト）

| モデル | Scenario A | B | C | 合計 | 備考 |
|---|---|---|---|---|---|
| **Magnum v4 72B Run1** | 8/8 ✓ (0 retry) | 8/8 ✓ (0 retry) | 8/8 ✓ (0 retry) | **24/24** | 全ターンリトライなし |
| **Magnum v4 72B Run2** | 8/8 ✓ (1 retry T1) | 8/8 ✓ (1 retry T2) | N/A (wrangler crash) | **16/16** | wrangler SSEクラッシュで C 未完 |
| Euryale v3 70B | 1/8 ✗ | — | — | **1/8** | intimate/climax で完全崩壊（ゴミ出力） |

### 結論

**Magnum v4 が圧倒的に安定**。2ラン合計 40/40 PASS（C Run2 はwranglerクラッシュで実行不可、モデル側の問題ではない）。

Euryale v3 はアダプター経由（実機と同一パイプライン）では conversation フェーズですら不安定。intimate/climax では完全に崩壊する。

### 推奨アクション

1. DEFAULT_MODEL を `anthracite-org/magnum-v4-72b` に確定
2. Phase 6: 実機ブラウザ検証に進む（Playwright で10往復×3セッション）
