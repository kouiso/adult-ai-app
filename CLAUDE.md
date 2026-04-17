# adult-ai-app

AI chat application with character personas, speech synthesis, and local-first storage.

## Tech Stack

| Category | Technology |
|----------|-----------|
| Frontend | React 19, TypeScript, Vite 8 |
| Styling | Tailwind CSS v4, shadcn/ui |
| State | Zustand |
| Local DB | Dexie (IndexedDB) |
| AI SDK | Vercel AI SDK, OpenRouter |
| Backend | Hono (Cloudflare Pages Functions) |
| DB | Cloudflare D1 (Drizzle ORM) |
| Deploy | Cloudflare Pages |
| Package Manager | pnpm |

## Commands

```bash
pnpm dev           # Start dev server (Vite)
pnpm build         # tsc -b && vite build
pnpm lint          # ESLint
pnpm dev:worker    # Cloudflare Pages local dev
task setup         # Full project setup (Taskfile)
task ci            # CI check (lint + build)
```

## Architecture

All AI assets are single-sourced in `prompt/` and delivered via symlinks.

| Source (single truth) | Claude Code | GitHub Copilot |
|---|---|---|
| `prompt/instructions/*.md` | `.claude/rules/*.md` | `.github/instructions/*.instructions.md` |
| `prompt/commands/*.md` | `.claude/commands/*.md` | `.github/prompts/*.prompt.md` |
| `prompt/agents/*.md` | `.claude/agents/*.md` | `.github/agents/*.agent.md` |

## Instruction System

| File | Description |
|------|-------------|
| [core.md](prompt/instructions/core.md) | Core mission, naming conventions, critical checklist |
| [persona.md](prompt/instructions/persona.md) | Uchida Yuki persona, Kansai dialect |
| [autonomous-execution.md](prompt/instructions/autonomous-execution.md) | Self-verification, zero user burden |
| [prohibitions.md](prompt/instructions/prohibitions.md) | Comprehensive prohibition rules |
| [typescript.md](prompt/instructions/typescript.md) | TypeScript type safety rules |
| [no-obvious-comments.md](prompt/instructions/no-obvious-comments.md) | Comment quality standards |
| [trial-and-error.md](prompt/instructions/trial-and-error.md) | Iterative problem-solving approach |

## Commands

| Command | Description |
|---------|-------------|
| `/bad` | Register bad behavior as prohibition |
| `/good` | Register good behavior as rule |
| `/plan` | Planning with dual proposal |
| `/debug` | Debug workflow |
| `/e2e` | E2E test execution |
| `/tdd` | Test-driven development |
| `/review-pr` | PR review |
| `/refactor-clean` | Refactoring workflow |
| `/security-check` | Security audit |

## Agents

| Agent | Description |
|-------|-------------|
| code-reviewer | Code review specialist |
| e2e-runner | E2E test runner |
| planner | Planning specialist |
| security-reviewer | Security review specialist |

## Project Structure

```
src/
  app.tsx              # Main app component
  main.tsx             # Entry point
  component/
    ui/                # shadcn/ui components
    chat/              # Chat UI (chat-view, message-bubble, chat-input)
    settings/          # Settings panel
  schema/              # Zod schemas (character, message, conversation, user)
  lib/                 # Utilities (api, db, tts-constants, utils)
  hook/                # Custom hooks (use-speech-synthesis)
  store/               # Zustand stores (chat-store, settings-store)
functions/             # Cloudflare Pages Functions (Hono)
drizzle/               # D1 migrations
```

## Conventions

- File/dir names: kebab-case singular (e.g., `chat-input.tsx`)
- Components: PascalCase (e.g., `ChatInput`)
- Variables/functions: camelCase
- Types: PascalCase with specific names (e.g., `ChatInputProps`)
- Constants: UPPER_SNAKE_CASE
- Code comments: Japanese only ("why" only, no obvious comments)
- Commit messages: English, Conventional Commits
- Docs: Japanese
