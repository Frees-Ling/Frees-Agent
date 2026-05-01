# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development — run from agent-cli/
npm start              # Launch GUI (no command → auto-starts gui)
npm run chat           # Start interactive CLI chat
npm run doctor         # System diagnostics / config check
npm run test           # Run test suite (node --test)
node --test --watch    # Run tests in watch mode

# Builds
npm run build:bundle   # Bundle with esbuild → dist/
npm run build:tauri    # Build Tauri desktop app (requires Rust)

# CLI commands (all via `frees-agent <command>` or `node bin/ai-agent.js <command>`)
chat [workspace] [--message "..."]     # Interactive or single-message chat
edit <workspace> --task "..."          # Agentic code editing loop
complete <workspace> --instruction     # Workspace-contextual code completion
doctor [workspace] [--ping]            # System diagnostics / model connectivity test
gui [--port 7780] [--host 0.0.0.0]    # Start Express/WebSocket server + optional Tauri
config init [--force] | show          # Manage config file (~/.frees-agent/config.json)
memory show|clear|sessions|merge      # Memory store operations
docs [topic]                          # Browse built-in documentation
skills [skill-name]                   # List or show skill files (SKILL.md)
compact --model <name> [--session]    # Compress a session's memory
cost [--model] [--context-window]     # Estimate token costs
files <workspace> [--limit] [--pattern] # List workspace files
tasks list|status|cancel|clear        # Task queue management
permissions                           # System permissions guide
```

## Project Architecture

The codebase lives in `agent-cli/` (the root `package.json` is a stub). This is a zero-dependency Node.js CLI agent with optional Tauri desktop GUI.

### Entry & Command Dispatch

`bin/ai-agent.js` → `src/cli.js` (argument parser) → dispatches to `src/commands/*.js`:
- No args → launches GUI (`src/commands/gui.js`)
- `chat` → interactive or single-message chat (`src/commands/chat.js`)
- `edit` → agentic code editing loop (`src/commands/edit.js`)
- `complete` → workspace-contextual code completion (`src/commands/complete.js`)
- `gui` → start Express/WebSocket server + optional Tauri app

### Core Modules

**`src/model/`** — Provider abstraction layer. `index.js` provides `resolveModelRuntime()` (config loading, API key resolution) and `createModelClient()` (auto-probe providers in priority order). Clients: `anthropic.js`, `ollama.js`, `openai-compatible.js`. All expose `streamText()`, `generateText()`, `generateStream()`.

**`src/agent/`** — Agent loop and tool orchestration:
- `orchestration.js` — Partitions tools into read-only (concurrent) vs write (sequential), manages concurrent execution
- `chat-tool-loop.js` — Long-running multi-turn tool agent for chat mode
- `edit-loop.js` — Task-driven code editing loop
- `tools.js` — `createAgentToolbox()` — registers all tools and routes them. Supports MCP tool delegation
- `reasoning.js` — Planning/reflection with structured plan outputs
- `prompts.js` — System prompts and user prompt construction

**`src/memory/`** — Persistent memory system with three approaches:
- `embeddings.js` + `vector.js` — Text embedding and vector similarity search
- `heuristics.js` — Fast local-pattern matching (keyword, regex, file name)
- `manager.js` — Orchestrates memory: extraction, summarization, compaction, session management
- `store.js` — JSON-file-based session persistence with auto-naming

**`src/tools/`** — Tool implementations:
- `web-search.js` — Tavily search API
- `web-fetch.js` — URL fetching + HTML-to-text
- `media.js` — Image, audio, and video processing via FFmpeg
- `search-replace.js` — String-based code editing
- `git.js` — Git operations (status, diff, commit, log, branch, checkout, add)
- `mcp-client.js` — MCP server client manager (connect, list tools, execute)

**`src/workspace/`** — Workspace indexing and queries:
- `indexer.js` — Recursive file scanning with `.gitignore` awareness, produces file tree
- `queries.js` — Read, write, replace, search, delete operations on indexed files

**`src/shell/`** — Shell execution with safety validation:
- `shell-exec.js` — Validates commands against blocklist, executes with timeout
- `shell-stream.js` — Spawn-based streaming for GUI terminal

**`src/gui/`** — Desktop GUI (Express + WebSocket + vanilla JS):
- `server.js` — HTTP + WebSocket server with CSP, rate limiting, REST API
- `public/index.html` — VSCode-inspired workbench layout (activity bar, sidebar, main, terminal panel, status bar)
- `public/app.js` — All frontend logic: WebSocket client, markdown renderer, file tree, terminal, planner view, code viewer, reasoning level control
- `public/style.css` — Full dark theme, workbench layout, responsive breakpoints
- `file-tree.js` — Server-side file tree builder from index

**`src/skills/`** — Skills system: scans for `SKILL.md` files with YAML frontmatter, selects relevant skills based on user message keywords

**`src/plugins/`** — Plugin system with lifecycle hooks: `onToolCall`, `onMessage`, `onResponse`, `getTools`, `getSystemPromptExtra`. Plugin files are `.plugin.js` placed alongside `SKILL.md` files. Registered in `registry.js`.

**`src/config.js`** — JSON config reader/writer. Default config at `~/.frees-agent/config.json`. Supports multi-provider setup with apiKey/apiKeyEnv resolution.

**`src/tasks/`** — Task tracking via `queue.js` for multi-step agentic work. Commands: `list|status|cancel|clear`.

**`src/ui/`** — Terminal UI components: `banner.js` (startup art), `mascot.js` (ASCII mascot renderer), `progress.js` (progress bars), `status-bar.js` (CLI status line).

**`src/utils/`** — ~35 utility modules: `diff.js` (unified diff), `file-watcher.js` (FS watcher), `system-info.js`, `ripgrep.js`, `hash.js`, `xml.js`, `sanitize.js`, `stream.js`, `treeify.js`, UUID generation, theme colors, abort signals, and more.

**`src/docs/`** — Documentation registry (`registry.js`). Serves 23 markdown files in `docs/` covering LLM concepts, training, model loading, API integration, memory architecture, MCP, and project structure.

**`src/system/`** — `permissions.js` — System permission prompts and security boundary management.

**`src-tauri/`** — Tauri v2 desktop shell (Rust). Provides native window, fs access, dialog, notification, shell capabilities.

### Key Patterns

- All modules use ESM (`import`/`export`). No transpilation step for development.
- Config is loaded once, passed through options objects. `resolveModelRuntime()` is the standard entry point.
- Tool functions return `{ ok: true/false, data: ... }` consistently.
- Memory system loads lazily — vector service initializes on first query.
- GUI server starts instantly (HTTP on port 7780 by default), model init runs in background.
- The WebSocket protocol sends typed messages: `token`, `done`, `error`, `tool_call`, `tool_result`, `diffs`, `memory`, `plan_steps`, `shell_start`, `shell_output`, `shell_done`, `shell_error`, `files_changed`, `pong`.
- Chat handler in `gui.js` guards against `_memoryState` being undefined (fallback to empty state object) to survive background init failures.
