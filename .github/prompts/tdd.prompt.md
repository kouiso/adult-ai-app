---
description: テスト駆動開発フロー。RED → GREEN → REFACTORサイクルで実装し、80%以上のテストカバレッジを確保する。
---

# TDD (Test-Driven Development)

**Trigger**: `/tdd` command

Execute Test-Driven Development flow. Implement with RED → GREEN → REFACTOR cycle and ensure 80%+ test coverage.

## Usage

```
/tdd [feature description]
```

## Workflow

### 1. RED Phase (Create Failing Test)

- Clarify requirements
- Design test cases
  - Normal cases
  - Edge cases
  - Error cases
- Create failing test
- Run test → Confirm RED

### 2. GREEN Phase (Minimal Implementation)

- Minimal implementation to pass test
- Run test → Confirm GREEN
- Confirm all tests pass

### 3. REFACTOR Phase (Improvement)

- Improve code quality
  - Remove duplicates
  - Improve naming
  - Reduce complexity
- Rerun tests → Confirm GREEN maintained
- Confirm coverage ≥ 80%

### Completion Criteria

✅ All tests GREEN  
✅ Coverage ≥ 80%  
✅ Code quality: No warnings  
✅ Build successful

## Example Flow

```markdown
[RED Phase]
Creating tests for calculateTotal...
✅ Test created: should sum all item prices
✅ Test created: should return 0 for empty array
✅ Test created: should throw error for invalid input
❌ Tests failing (expected) - RED confirmed

[GREEN Phase]
Implementing minimal solution...
✅ Implementation complete
✅ All tests passing - GREEN confirmed

[REFACTOR Phase]
Improving code quality...
✅ Added type safety
✅ Added error handling
✅ All tests still passing
📊 Coverage: 85% (target: 80%+)

✅ TDD cycle complete
```

## このプロジェクトのテスト方針

- Unit tests: `src/lib/`, `src/stores/` の関数・ストア
- E2E tests: Playwright MCP（`/e2e` コマンド参照）
- Test framework: Vitest（`pnpm add -D vitest` で追加）
