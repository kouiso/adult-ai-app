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

# context-mode — MANDATORY routing rules

You have context-mode MCP tools available. These rules are NOT optional — they protect your context window from flooding. A single unrouted command can dump 56 KB into context and waste the entire session.

## BLOCKED commands — do NOT attempt these

### curl / wget — BLOCKED
Any Bash command containing `curl` or `wget` is intercepted and replaced with an error message. Do NOT retry.
Instead use:
- `ctx_fetch_and_index(url, source)` to fetch and index web pages
- `ctx_execute(language: "javascript", code: "const r = await fetch(...)")` to run HTTP calls in sandbox

### Inline HTTP — BLOCKED
Any Bash command containing `fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, or `http.request(` is intercepted and replaced with an error message. Do NOT retry with Bash.
Instead use:
- `ctx_execute(language, code)` to run HTTP calls in sandbox — only stdout enters context

### WebFetch — BLOCKED
WebFetch calls are denied entirely. The URL is extracted and you are told to use `ctx_fetch_and_index` instead.
Instead use:
- `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` to query the indexed content

## REDIRECTED tools — use sandbox equivalents

### Bash (>20 lines output)
Bash is ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`, and other short-output commands.
For everything else, use:
- `ctx_batch_execute(commands, queries)` — run multiple commands + search in ONE call
- `ctx_execute(language: "shell", code: "...")` — run in sandbox, only stdout enters context

### Read (for analysis)
If you are reading a file to **Edit** it → Read is correct (Edit needs content in context).
If you are reading to **analyze, explore, or summarize** → use `ctx_execute_file(path, language, code)` instead. Only your printed summary enters context. The raw file content stays in the sandbox.

### Grep (large results)
Grep results can flood context. Use `ctx_execute(language: "shell", code: "grep ...")` to run searches in sandbox. Only your printed summary enters context.

## Tool selection hierarchy

1. **GATHER**: `ctx_batch_execute(commands, queries)` — Primary tool. Runs all commands, auto-indexes output, returns search results. ONE call replaces 30+ individual calls.
2. **FOLLOW-UP**: `ctx_search(queries: ["q1", "q2", ...])` — Query indexed content. Pass ALL questions as array in ONE call.
3. **PROCESSING**: `ctx_execute(language, code)` | `ctx_execute_file(path, language, code)` — Sandbox execution. Only stdout enters context.
4. **WEB**: `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` — Fetch, chunk, index, query. Raw HTML never enters context.
5. **INDEX**: `ctx_index(content, source)` — Store content in FTS5 knowledge base for later search.

## Subagent routing

When spawning subagents (Agent/Task tool), the routing block is automatically injected into their prompt. Bash-type subagents are upgraded to general-purpose so they have access to MCP tools. You do NOT need to manually instruct subagents about context-mode.

## Output constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `ctx_search(source: "label")` later.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call the `ctx_stats` MCP tool and display the full output verbatim |
| `ctx doctor` | Call the `ctx_doctor` MCP tool, run the returned shell command, display as checklist |
| `ctx upgrade` | Call the `ctx_upgrade` MCP tool, run the returned shell command, display as checklist |
