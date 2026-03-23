---
description: 詳細な作業計画を提示して合意を得てから実行する。
---

# /plan - 詳細作業計画提示

作業計画を明確・詳細に説明し、相違点を確認する。合意後に実行を進行する。

**重要: planは作成して終わりではない。以下の「Plan実行標準フロー」に従って最後までやり切ること。**

## 実行手順

-2. **Intent Confirmation（最優先・必須）**

計画フェーズに入る前に、ユーザーの真の意図を言語化して確認する。以下の形式で出力し、承認を得るまで計画に進まない：

```
**Surface request**: [ユーザーが文字通り言ったこと]
**Underlying goal**: [なぜそれが必要なのか — 言葉の裏にある本当の目的]
**Proposed next action**: [確認後にAIが行うこと]
```

- ユーザーが「合ってる」→ 次のステップへ
- ユーザーが「違う」→ ギャップを狙った質問をして再確認（推測で進めない）

-1. **Pre-Plan: /healing**

情報ギャップを解消する。

- 情報ギャップがある → AskUserQuestion で質問し、回答後に計画フェーズへ
- 情報が完全に揃っている → そのまま計画フェーズへ（質問なしでOK）

0. **OpenSpec確認（最優先）**: `openspec/specs/`に対象機能の仕様があれば全て読み、現状を「正」として計画を組み立てる。仕様変更が必要な場合は`/openspec:proposal`をplanの最初のステップに含める。

1. ユーザーの指示を分析し、タスクを分解
2. 潜在リスクを特定
3. 具体的な実行計画を箇条書きで提示
4. ユーザーの承認を得てから実行開始

## フォーマット

```markdown
## 作業計画

### 目的

[タスクの目的]

### 実行ステップ

1. [ステップ1]
2. [ステップ2]
3. [ステップ3]

### 影響範囲

- [影響を受けるファイル/機能]

### リスク

- [潜在的なリスク]

### 確認事項

- [ユーザーに確認したい事項]
```

---

## Plan実行標準フロー (Plan Execution Standard Flow)

### 核心思想

**planファイルを作成したら、CI通過・CodeRabbitレビュー完了・worktreeクリーンアップまで全て完遂すること。途中で止めるな。**

### Phase 1: Plan作成時のチェックリスト

planファイル作成前に以下を必ず確認：

| チェック項目                       | 確認方法                                       | 対応                             |
| ---------------------------------- | ---------------------------------------------- | -------------------------------- |
| ユーザーが本体リポジトリで作業中か | 「サーバー起動中」「動作確認中」等のキーワード | git worktree使用を計画に含める   |
| 複数リポジトリにまたがるか         | Issue内容から判断                              | 各リポジトリのworktree作成を計画 |
| 既存の類似実装があるか             | Grep/Globで検索                                | パターン踏襲を計画に明記         |
| テストコードが必要か               | 既存テストの有無確認                           | テスト追加を計画に含める         |
| PRはDraftで作成するか              | ユーザー指示確認                               | Draft/Ready状態を計画に明記      |

### Phase 2: Plan実行中の必須事項

#### 2.1. git worktree使用時

```bash
# 作成
git worktree add /path/to/worktree-dir -b feature/xxx

# envファイルコピー（忘れがち！）
cp .env .env.test .env.keys /path/to/worktree-dir/
```

#### 2.2. 実装時

- **既存パターン完全踏襲** → 類似機能のコード構造・命名規則を100%模倣
- **if-else構造の罠を避ける** → 複数条件分岐は連続if文で
- **テストコード追加** → 正常系・異常系・境界値

#### 2.3. コミット・プッシュ時

- **lint/format/test全通過を確認してからコミット**
- **`--no-verify`絶対禁止**
- **コミットメッセージは日本語で意図を明確に**

### Phase 3: PR作成〜レビュー完了

#### 3.1. PR作成

```bash
# Draft PRで作成（指示がない限りDraft推奨）
gh pr create --draft --title "feat: ○○機能追加" --body "..."
```

#### 3.2. CI/CD確認

```bash
# CI状況確認（全通過するまで監視）
gh pr checks <PR番号>

# 失敗時はログ確認→修正→再プッシュ
gh run view <run_id> --log
```

#### 3.3. CodeRabbitレビュー

```bash
# レビュー依頼
gh pr comment <PR番号> --body "@coderabbitai review"

# 指摘確認
gh api repos/{owner}/{repo}/pulls/<PR番号>/comments --jq '.[] | select(.user.login == "coderabbitai[bot]")'
```

**指摘対応フロー:**

1. 指摘内容を確認
2. 修正実施
3. **該当スレッドに返信**（コミットハッシュ明記）
4. CodeRabbitの納得返信を待つ
5. 納得返信が来たらresolve

#### 3.4. セルフレビュー（subagent活用）

```
Task tool（subagent_type=Explore）で以下を並列実行：
- コード品質レビュー
- セキュリティレビュー
- パフォーマンスレビュー
```

### Phase 4: 完了処理

#### 4.1. 最終状態確認

| 確認項目   | 期待状態                 |
| ---------- | ------------------------ |
| CI/CD      | 全通過                   |
| CodeRabbit | 全指摘対応済み・resolved |
| PR状態     | Draft（指示がない限り）  |
| テスト     | 全パス                   |

#### 4.2. worktreeクリーンアップ

```bash
# 本体リポジトリに移動してworktree削除
cd /path/to/main-repo
git worktree remove /path/to/worktree-dir

# 変更が残っている場合
git worktree remove /path/to/worktree-dir --force
```

#### 4.3. 完了報告

ユーザーに以下を報告：

- **PR URL**（必須）
- **CI/CD状態**
- **CodeRabbitレビュー結果**
- **実装内容サマリ**

### チェックリスト（plan完了時に全て✅であること）

```markdown
## Plan完了チェックリスト

### 実装

- [ ] 既存パターンを踏襲した
- [ ] テストコードを追加した
- [ ] lint/format/test全通過

### PR

- [ ] PRを作成した（URL: ）
- [ ] CI/CD全通過
- [ ] CodeRabbitレビュー完了
- [ ] 全指摘に対応・resolved

### クリーンアップ

- [ ] worktreeを削除した
- [ ] PR状態を確認した（Draft/Ready）

### 報告

- [ ] PR URLを共有した
- [ ] 実装内容サマリを報告した
```

### 心得

- **planは作って終わりじゃない** → 最後までやり切れ
- **途中で止めるな** → CI待ち、レビュー待ちも含めて完遂
- **クリーンアップを忘れるな** → worktree、Draft状態
- **報告を忘れるな** → PR URLは必ず共有
