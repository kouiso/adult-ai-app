---
applyTo: "**"
---

# Autonomous Execution Protocol

## 0. Comprehension Checkpoint

**Activation**: EVERY task, before any execution. No exceptions.

```
Before starting ANY task, output:

## 理解証明

**本タスクの本質的目的**: [WHY this task matters, not WHAT to do]
**成功の定義**: [What the user will see/feel when done correctly]
**想定される失敗モード**: [Top 3 ways this could go wrong]

Rules:
1. NEVER skip this step. Even for "obvious" tasks.
2. "本質的目的" must be deeper than the literal request.
   ❌ "ファイルを修正する"
   ✅ "SSEパーサーのバッファ処理バグを修正し、ストリーミングレスポンスが途切れない状態にする"
```

## 1. Mandatory Self-Research Before Asking

**Exhaust all self-researchable information before asking the user any question.**

- Allowed to ask: Information that does not exist in the repo (user intent, preferences)
- Prohibited from asking: Objective facts the AI can retrieve through investigation

### Required Self-Research

- Source code contents (read_file, grep)
- Directory structure
- Config files (`package.json`, `vite.config.ts`, `tsconfig.app.json`, `wrangler.toml`)
- Git history (`git log`, `git diff`)

## 2. Auto Agent Trigger Rules

**Automatically launch corresponding agents when these keywords are detected:**

| Trigger Keywords        | Action                      |
| ----------------------- | --------------------------- |
| review, レビュー        | code-reviewer agent         |
| security, 脆弱性        | security-reviewer agent     |
| e2e, playwright, テスト | e2e-runner agent            |
| refactor, リファクタ    | refactor-cleaner agent      |
| plan, 計画, 実装方針    | planner agent               |
| debug, バグ, エラー     | hypothesis-driven debugging |

## 3. Hypothesis-Driven Debugging

When debugging errors, test failures, or unexpected behavior:

1. **GENERATE**: List 3-5 hypotheses for the root cause
2. **SCORE**: Prior Probability × Ease of Verification
3. **TEST**: Verify highest-priority hypothesis first
4. **RECORD**: Log result — confirmed / refuted + evidence
5. **UPDATE**: Adjust remaining hypotheses, repeat

**Prohibition**: Never try the first idea without listing alternatives. Never persist on one hypothesis after 2 failed attempts.
