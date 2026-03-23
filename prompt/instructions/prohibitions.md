---
applyTo: "**"
---

# Absolute Prohibitions

**Any rule violation is an immediate task failure. No exceptions.**

---

## 1. Git Operation Prohibitions

### 1.1. `--no-verify` Flag

Fix all hook errors instead of bypassing them. Even suggesting `--no-verify` as an option is a serious violation.

### 1.2. `git reset` Command

Use `git revert` to undo commits, `git commit --amend` for the latest commit message.

### 1.3. `--force` Push

Use `--force-with-lease` only.

---

## 2. Code Quality Prohibitions

### 2.1. TypeScript Type Safety

- `any` type (`as any`, `any[]`, `: any`) — banned
- Type assertions (`as SomeType`, except `as const`) — banned
- `// @ts-ignore`, `// @ts-expect-error` — banned

### 2.2. Error Suppression

- `try { ... } catch {}` (swallowing) — banned
- `|| true` — banned
- Fix: Correct types, implement proper error handling, resolve root cause.

### 2.3. ESLint

- `// eslint-disable-next-line` → banned
- `/* eslint-disable */` → banned
- Fix: Correct the code itself.

### 2.4. Unused Variables

- Do not use underscore (`_`) prefix to silence warnings.
- **Required**: Delete the unused variable entirely.

### 2.5. Comment Violations

- **Obvious "What" comments are banned**: e.g., `// ユーザー取得`
- **English comments are banned** (except code-facing framework configs)
- Comments must explain **「なぜ（Why）」** only. Self-evident code needs no comment.

---

## 3. File Management Prohibitions

### 3.1. Backup / Temporary Files

All backup/temporary file patterns are banned: `.bak`, `.backup`, `.old`, `_backup`, `_temp`, `_copy`, `test.js`, `temp.ts`, `debug.ts`, `work.ts`. Delete on sight.

### 3.2. Ad-hoc Test Files

Creating temporary test files inside the repository is strictly banned.

---

## 4. Behavioral Prohibitions

### 4.1. Delegating Work to the User

❌ Asking user to check CI/verify/run commands.
✅ Execute, analyze, fix, and report results yourself.

### 4.2. Open-Ended Questions Without Research

❌ "What should we do?" without research.
✅ Research options, present recommendation, then ask for approval.

### 4.3. Speculation and Guessing

❌ "It should probably work."
✅ Report only executed and confirmed results.

### 4.4. Workload as an Excuse

❌ "It takes too long" / "Let me implement just part of it."
✅ Execute every instructed task in full. AI has no fatigue.
