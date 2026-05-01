# Frees-Agent

**An intelligent, extensible AI Agent framework for the command line.**

Frees-Agent is a production-ready AI Agent framework built on Node.js. It provides a rich CLI environment where large language models (LLMs) can autonomously reason, use tools, execute shell commands, edit files, search the web, and maintain long-term memory across sessions. The framework is designed to be modular, extensible, and deeply configurable -- suitable for both personal assistants and automated development workflows.

---

## Table of Contents

1. [What is Frees-Agent](#what-is-frees-agent)
2. [Features](#features)
3. [Quick Start](#quick-start)
4. [Architecture Overview](#architecture-overview)
5. [Configuration Guide](#configuration-guide)
6. [Development](#development)
7. [Contributing](#contributing)

---

## What is Frees-Agent

Frees-Agent is not just another CLI chatbot. It is a full-featured **AI Agent framework** that enables LLMs to:

- **Perceive** your filesystem, Git repositories, and workspace context
- **Reason** about complex tasks and break them down into actionable steps
- **Act** by executing shell commands, editing files, and calling external APIs
- **Remember** user preferences, conversation history, and relevant facts across sessions
- **Extend** with any MCP-compatible tool -- from databases to image processors to web browsers

### How it works

```
You (user input)
    │
    ▼
Frees-Agent CLI
    │
    ├──► Memory System (loads past context, user profile, vector memories)
    │
    ├──► Prompt Builder (constructs system prompt + tool descriptions)
    │
    ├──► LLM API Call (Anthropic, OpenAI, or local models)
    │
    ├──► Tool Execution Loop
    │     ├── Read tools (parallel) ──► list_files, read_file, web_fetch, grep
    │     └── Write tools (serial)  ──► write_file, edit, bash, MCP tools
    │
    └──► Memory System (saves new memories, updates vector index)
```

The AI model drives the loop autonomously: it decides which tools to call, in what order, and when the task is complete. You simply describe what you want done.

### Use cases

- **Code assistant**: Navigate, read, and edit large codebases with full context awareness
- **DevOps automation**: Run deployment scripts, check logs, restart services
- **Data analysis**: Query databases, process files, generate reports
- **Personal assistant**: Remember your preferences, manage tasks, search the web
- **Learning tool**: Explore technical documentation, experiment with code, ask questions about your projects

---

## Features

### Intelligent tool orchestration

Frees-Agent's core execution engine intelligently manages tool calls:

- **Read/Write partitioning**: Read-only tools (file reads, searches) execute in parallel for maximum throughput; write tools (file edits, shell commands) execute serially to avoid conflicts
- **Automatic retry**: API calls and tool executions retry on transient failures (up to 3 attempts)
- **Result truncation**: Large tool outputs are automatically truncated to fit within the model's context window
- **Message pruning**: When the conversation history exceeds the context limit, older messages are selectively pruned while preserving key context

### Multi-layered memory system

The memory architecture is designed for both short-term conversation coherence and long-term personalization:

| Layer | Mechanism | Persistence | Purpose |
|-------|-----------|-------------|---------|
| **Conversation** | Message history | Session | Holds the current chat context |
| **User profile** | Structured JSON | Cross-session | Remembers user name, preferences, goals |
| **Key facts** | Extracted by LLM | Cross-session | Important information from conversations |
| **Vector memory** | FNV-1a 256-dim embeddings | Cross-session | Semantic similarity search, CJK-aware |
| **Task memory** | Hierarchical tasks | Cross-session | Tracks ongoing and completed tasks |

Key capabilities:
- **Deduplication**: Similar memories (word overlap >70%) are automatically merged
- **Vector search**: Cosine similarity recall with a low threshold of 0.06
- **Capacity limits**: Global maximum of 200 memories, 60 per category
- **Cross-device sync**: Configure multiple `syncRoots` for automatic state merging
- **Session compression**: Long conversations can be manually or automatically summarized

### MCP (Model Context Protocol) integration

Frees-Agent is a first-class MCP host, meaning it can connect to **any MCP-compatible server** as a plugin:

- **File system servers**: Enhanced file operations, search, batch processing
- **Database servers**: PostgreSQL, SQLite -- run queries, browse schemas
- **Web tools**: Puppeteer (browser automation), Tavily/Brave Search (web search), fetch (content retrieval)
- **Media processors**: FFmpeg (video/audio), Pillow (image manipulation)
- **Version control**: Git repository management
- **Developer tools**: Docker containers, GitHub API
- **Knowledge tools**: Memory/knowledge graph servers

See [22-MCP工具配置模板.md](./22-MCP工具配置模板.md) for complete configuration templates.

### Security-first shell execution

The shell execution subsystem (`src/shell/shell-exec.js`) implements defense-in-depth:

- **7 dangerous command patterns** are statically blocked (rm -rf /, fork bombs, disk formatting, etc.)
- **AbortController timeouts** prevent runaway processes
- **Output caps** at 1MB prevent memory exhaustion
- **Cross-platform shell detection** works on bash, zsh, cmd, and PowerShell

### Rich CLI experience

- **Themable ANSI output** with 4 built-in color schemes (dark/light/ANSI variants)
- **Live status indicators**: Spinners, progress bars, and "thinking" animations
- **Mascot display**: Optional CLI companion with dynamic expressions
- **REPL-style chat loop** with multi-line input support

---

## Quick Start

### Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- An API key for your chosen LLM provider (Anthropic Claude recommended)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/frees-agent.git
cd frees-agent

# Install dependencies
npm install

# Create your configuration file
cp frees-agent.example.yaml frees-agent.yaml
```

### Configuration

Edit `frees-agent.yaml` to set your LLM provider:

```yaml
model:
  provider: anthropic      # Options: anthropic, openai, local
  name: claude-sonnet-4-6  # Model name
  apiKey: "${ANTHROPIC_API_KEY}"  # Use environment variable

memory:
  storeDir: "./memory"
  enabled: true
```

Then set your API key as an environment variable:

```bash
export ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
```

### Run

```bash
# Start an interactive chat session
node src/cli.js chat

# With a specific model
node src/cli.js chat --model claude-sonnet-4-6

# With verbose logging for debugging
node src/cli.js chat --verbose

# View built-in documentation
node src/cli.js docs memory-long-chat
```

Once inside the chat session, try:

```
> What files are in the current directory?
> Read the main configuration file and explain how it's structured.
> Search for any TODO comments in the codebase.
> What time is it in Tokyo right now? (if web search is enabled)
```

### First-time tips

1. **Start simple**: Ask about your project structure. The agent will index your workspace.
2. **Explore memory**: Ask "What do you know about me?" after a few exchanges to see memory extraction in action.
3. **Try MCP tools**: Configure a simple MCP server (e.g., filesystem or git) and ask the agent to use it.
4. **Monitor tokens**: Use `frees-agent cost --model <model-name>` to track API usage.

---

## Architecture Overview

### Project structure

```
frees-agent/
├── src/
│   ├── cli.js                   # CLI entry point and command routing
│   ├── commands/
│   │   ├── chat.js              # Chat mode REPL loop
│   │   └── ...                  # Other commands (docs, cost, compact)
│   ├── agent/
│   │   ├── chat-tool-loop.js    # Core tool-calling loop with retry + pruning
│   │   ├── edit-loop.js         # Specialized loop for file editing tasks
│   │   ├── orchestration.js     # Concurrent read + serial write tool execution
│   │   ├── tools.js             # Unified tool registry with aliases
│   │   ├── prompts.js           # System prompts and tool descriptions
│   │   └── reasoning.js         # Execution planning and answer reflection
│   ├── memory/
│   │   ├── store.js             # Memory core: load, save, merge, session rotation
│   │   ├── heuristics.js        # Regex-based memory extraction (name, preferences)
│   │   ├── vector.js            # FNV-1a vector embeddings, CJK n-gram
│   │   ├── ingest.js            # LLM-based structured memory extraction pipeline
│   │   └── tasks.js             # Hierarchical task management
│   ├── utils/                   # Zero-dependency utility functions
│   │   ├── slug.js, sleep.js, which.js, uuid.js
│   │   ├── memoize.js, ripgrep.js, theme.js
│   │   ├── truncate.js, treeify.js, json.js
│   │   ├── files.js, git.js
│   │   └── ultraplan/           # Advanced planning keyword detection
│   ├── shell/
│   │   └── shell-exec.js        # Secure shell execution with danger detection
│   ├── ui/
│   │   ├── banner.js            # Startup banners
│   │   ├── mascot.js            # CLI companion with expressions
│   │   ├── status-bar.js        # Dynamic status line components
│   │   └── progress.js          # Spinner, progress bar, thinking indicator
│   └── workspace/
│       ├── indexer.js           # Workspace file scanning (24MB budget)
│       ├── queries.js           # File reading with line numbers, smart search
│       └── context.js           # File context assembly
├── docs/                        # Full documentation (Chinese + English)
├── frees-agent.yaml             # User configuration file
└── package.json
```

### Core execution flow

```
Start
  │
  ▼
CLI entry point (cli.js)
  │
  ├── Load configuration (frees-agent.yaml)
  │
  ├── Initialize MCP clients (connect to configured MCP servers)
  │
  ├── Load memory state (sessions, user profile, vector index)
  │
  ▼
Chat loop (chat-tool-loop.js / chat.js)
  │
  ├── Read user input
  │
  ├── Build prompts
  │   ├── System prompt (role + safety + tool descriptions)
  │   ├── Memory context (relevant facts + user profile)
  │   └── User message + conversation history
  │
  ├── Call LLM API
  │
  ├── Parse response
  │   │
  │   ├── Text only? ──────────────► Display response, continue loop
  │   │
  │   ├── Tool calls detected?
  │   │   │
  │   │   ├── Partition: read tools (parallel) vs write tools (serial)
  │   │   │
  │   │   ├── Execute tools
  │   │   │   ├── Validate shell commands (danger detection)
  │   │   │   ├── Truncate large outputs
  │   │   │   └── Handle errors with retry
  │   │   │
  │   │   └── Feed results back to LLM ──────► Continue loop
  │   │
  │   └── Max iterations reached? ──► Stop loop, display message
  │
  ├── Save memory state
  │
  └── Wait for next input
```

### Memory architecture

```
                    ┌──────────────────────┐
                    │    Memory Store       │
                    │  (src/memory/store.js)│
                    └──────────┬───────────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │   Sessions   │  │ User Profile │  │Key Facts/Favs│
    │ (conversation│  │ (structured  │  │ (extracted   │
    │  history)    │  │  JSON data)  │  │  by LLM)     │
    └──────────────┘  └──────────────┘  └──────────────┘
                                               │
                                               ▼
                                      ┌──────────────┐
                                      │ Vector Index  │
                                      │ (256-dim FNV) │
                                      │ (semantic     │
                                      │  search)      │
                                      └──────────────┘
```

Memory is loaded at startup, updated continuously during the conversation, and saved at the end of each turn. The vector index enables semantic retrieval -- when the user asks a question, the system can find related memories even if they use different wording.

### Key design decisions

| Decision | Rationale |
|----------|-----------|
| **Zero-dependency utilities** | `src/utils/` uses only Node.js built-ins. This makes these functions safe to extract and reuse in other projects. |
| **FNV-1a instead of neural embeddings** | No external API calls, deterministic, fast, and privacy-preserving. Works offline. |
| **YAML configuration** | Human-readable, supports comments, widely understood. |
| **MCP over custom plugin API** | Open standard means compatibility with a growing ecosystem of MCP servers. |
| **Read/write tool partitioning** | Maximizes throughput for read operations while preventing race conditions in write operations. |

---

## Configuration Guide

The configuration file `frees-agent.yaml` controls every aspect of Frees-Agent's behavior. Below is a comprehensive reference.

### Model configuration

```yaml
model:
  # Provider selection
  #   anthropic - Claude models via Anthropic API
  #   openai    - GPT models via OpenAI API
  #   local     - Local models via OpenAI-compatible endpoint (LM Studio, Ollama, etc.)
  provider: anthropic

  # Model name/identifier
  name: claude-sonnet-4-6

  # API key (use environment variable reference for security)
  apiKey: "${ANTHROPIC_API_KEY}"

  # Optional: custom API endpoint (useful for proxies or local servers)
  # apiBase: "http://localhost:1234/v1"

  # Generation parameters
  maxTokens: 4096        # Maximum tokens per response
  temperature: 0.7       # Creativity (0.0 = deterministic, 1.0 = creative)
```

**Provider-specific notes:**

| Provider | `name` values | Required env var |
|----------|---------------|------------------|
| `anthropic` | `claude-sonnet-4-6`, `claude-opus-4-6`, `claude-haiku-4-6` | `ANTHROPIC_API_KEY` |
| `openai` | `gpt-4o`, `gpt-4o-mini`, `o3-mini` | `OPENAI_API_KEY` |
| `local` | Any model name exposed by your local endpoint | None |

### Memory configuration

```yaml
memory:
  enabled: true                    # Enable/disable memory system entirely
  storeDir: "./memory"             # Directory for persistent memory storage
  maxMemories: 200                 # Global maximum memory entries
  maxPerCategory: 60               # Maximum entries per memory category

  # Vector memory
  vectorPath: "./memory/vectors"   # Path to vector index
  vectorRecallThreshold: 0.06      # Minimum similarity score for recall (0-1)

  # Cross-device sync
  syncRoots:                       # List of directories for automatic memory merging
    - "/path/to/shared/memory"

  # Session management
  maxSessionTurns: 100             # Turns before session rotation
  autoCompact: true                # Automatically compress long sessions
  compactModel: claude-sonnet-4-6  # Model to use for session compression
```

### MCP server configuration

MCP servers are configured as an object map under `mcpServers`. Each entry defines a server name and its startup command:

```yaml
mcpServers:
  # Simple servers (no extra args besides the package name)
  ffmpeg:
    command: npx
    args:
      - -y
      - "@anthropic/mcp-server-ffmpeg"

  # Servers with arguments
  filesystem:
    command: npx
    args:
      - -y
      - "@modelcontextprotocol/server-filesystem"
      - "/path/to/allowed/directory"  # Restrict to this directory

  # Servers requiring environment variables
  tavily:
    command: npx
    args:
      - -y
      - "@anthropic/mcp-server-tavily"
    env:
      TAVILY_API_KEY: "${TAVILY_API_KEY}"  # Reference system env var
```

### Tool behavior configuration

```yaml
tools:
  webSearch:
    enabled: true           # Enable the built-in web search capability
    maxResults: 5           # Maximum search results per query

  # Shell execution safety
  shell:
    enabled: true           # Allow shell command execution
    dangerDetection: true   # Enable dangerous command pattern blocking
    maxOutputSize: 1048576  # Maximum output size in bytes (1 MB)
    defaultTimeout: 30000   # Default command timeout in ms
```

### Agent behavior

```yaml
agent:
  autonomous:
    enabled: true           # Enable autonomous task execution
    maxSubTasks: 10         # Maximum sub-tasks per autonomous session
    maxIterations: 25       # Maximum tool-calling iterations per turn

  # Edit agent specific
  edit:
    maxSteps: 20            # Maximum steps for edit-mode agent

  # Safety
  safety:
    confirmWrite: true      # Require confirmation before file writes
    confirmShell: true      # Require confirmation before shell commands
    allowedPaths:           # Restrict file access to these paths
      - "/home/user/projects"
```

---

## Development

### Prerequisites for development

- Node.js >= 18.0.0
- npm >= 9.0.0
- Git

### Setup

```bash
git clone https://github.com/your-username/frees-agent.git
cd frees-agent
npm install
```

### Project conventions

- **Language**: JavaScript (Node.js), no TypeScript
- **Style**: Standard JavaScript with JSDoc comments for API documentation
- **Testing**: (Add test framework details here when available)
- **Linting**: Standard ESLint configuration

### Codebase map

| Directory | Purpose | Key files |
|-----------|---------|-----------|
| `src/agent/` | Core AI agent loop, tool orchestration | `chat-tool-loop.js`, `tools.js`, `orchestration.js` |
| `src/memory/` | All memory subsystems | `store.js`, `vector.js`, `ingest.js` |
| `src/utils/` | Zero-dependency utility functions | `slug.js`, `truncate.js`, `git.js` |
| `src/shell/` | Secure shell execution | `shell-exec.js` |
| `src/ui/` | Terminal UI components | `banner.js`, `mascot.js`, `progress.js` |
| `src/workspace/` | File indexing and workspace queries | `indexer.js`, `queries.js` |

### Adding a new utility function

1. Choose or create the appropriate file in `src/utils/`
2. Keep the function pure and dependency-free (use only Node.js built-ins)
3. Export the function via `module.exports`
4. Add JSDoc documentation to the function
5. Update [23-API参考文档.md](./23-API参考文档.md) with the new export

### Adding a new tool

Tools are registered in `src/agent/tools.js`. To add a new tool:

1. Implement the tool function with signature `async (args, context) => result`
2. Register it in `createAgentToolbox()` with name, aliases, and type (read/write)
3. Add the tool description to `TOOL_DESCRIPTIONS` in `src/agent/prompts.js`
4. Test the tool in chat mode

### Testing MCP integrations locally

```bash
# Start a development session with verbose logging
node src/cli.js chat --verbose

# Enable debug output for MCP communication
DEBUG=mcp:* node src/cli.js chat
```

### Building and releasing

```bash
# Check for linting issues
npm run lint

# Run tests
npm test

# Start development chat session
npm start
```

---

## Contributing

### How to contribute

1. **Fork** the repository
2. **Create a feature branch**: `git checkout -b feature/my-feature`
3. **Make your changes** following the project conventions
4. **Commit** with clear, descriptive messages
5. **Push** to your fork: `git push origin feature/my-feature`
6. **Open a Pull Request** against the `main` branch

### What we welcome

- **Bug fixes**: Clear, minimal changes that fix a specific issue
- **New MCP server templates**: Add configuration templates to [22-MCP工具配置模板.md](./22-MCP工具配置模板.md)
- **Memory system improvements**: Better extraction heuristics, smarter deduplication
- **Tool enhancements**: More utility functions, better tool descriptions
- **Documentation**: Corrections, clarifications, translations
- **Performance optimizations**: Faster startup, lower memory usage, fewer API calls

### Guidelines

- **Write clear JSDoc comments** for all public functions
- **Keep utility functions pure** and dependency-free
- **Add tests** for new functionality
- **Update documentation** when changing behavior
- **Follow existing code style** (2-space indentation, consistent naming)
- **Prefer small, focused commits** over large monolithic changes

### Code of conduct

- Be respectful and constructive in discussions
- Focus on what is best for the project and community
- Accept constructive criticism gracefully
- Prioritize clarity and maintainability over cleverness

---

## Documentation index

All detailed documentation is available in the `docs/` directory:

| File | Topic |
|------|-------|
| `01-什么是LLM模型与AI智能体.md` | LLM and AI Agent basics |
| `02-如何训练属于自己的LLM模型.md` | Model training approaches (pre-training, SFT, LoRA, RAG) |
| `06-如何加载模型与接入自己的模型或云端API.md` | Model loading and API integration |
| `07-Frees-Agent记忆与超长对话.md` | Memory and long conversation handling |
| `13-项目架构说明.md` | Project architecture deep dive |
| `15-Frees-Agent项目源码逐文件逐函数剖析.md` | Source code analysis |
| `16-如何接入MCP外部工具.md` | MCP external tool integration |
| `18-agent-memory-architecture.md` | Unified memory architecture |
| `21-自主Agent能力架构.md` | Autonomous agent capabilities |
| `22-MCP工具配置模板.md` | MCP configuration templates |
| `23-API参考文档.md` | Full API reference |

Access documentation from the CLI:

```bash
frees-agent docs
frees-agent docs llm-basics
frees-agent docs memory-long-chat
```

---

## License

[MIT License](../LICENSE)

---

*Frees-Agent: Your intelligent, extensible, command-line AI agent.*
