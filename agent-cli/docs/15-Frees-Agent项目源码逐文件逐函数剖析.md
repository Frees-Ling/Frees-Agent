# Frees Agent 项目源码逐文件逐函数剖析

这份文档面向后续维护者，系统性回答四个核心问题：

1. 这个项目整体架构是什么
2. 每个文件的职责是什么
3. 每个文件中的函数或类方法做什么
4. 当前算法思路是什么，后续还可以怎么优化

本文分析范围是 `agent-cli/` 独立工程。

---

## 0. 分析范围与完整文件清单

### 0.1 可执行入口与项目元数据

- `agent-cli/package.json`
- `agent-cli/bin/ai-agent.js`
- `agent-cli/README.md`

### 0.2 源码文件清单（完整版）

**核心入口：**
- `src/cli.js`

**命令层：**
- `src/commands/chat.js`
- `src/commands/edit.js`
- `src/commands/complete.js`
- `src/commands/doctor.js`
- `src/commands/config.js`
- `src/commands/docs.js`
- `src/commands/memory.js`
- `src/commands/permissions.js`
- `src/commands/skills.js`
- `src/commands/files.js`
- `src/commands/cost.js`
- `src/commands/compact.js`
- `src/commands/tasks.js`
- `src/commands/gui.js`

**模型层：**
- `src/model/index.js`
- `src/model/ollama.js`
- `src/model/openai-compatible.js`
- `src/model/anthropic.js`

**工作区层：**
- `src/workspace/indexer.js`
- `src/workspace/queries.js`

**Agent 层：**
- `src/agent/prompts.js`
- `src/agent/tools.js`
- `src/agent/edit-loop.js`
- `src/agent/chat-tool-loop.js`
- `src/agent/orchestration.js`
- `src/agent/reasoning.js`

**记忆层：**
- `src/memory/prompts.js`
- `src/memory/store.js`
- `src/memory/manager.js`
- `src/memory/heuristics.js`
- `src/memory/vector.js`
- `src/memory/ingest.js`
- `src/memory/tasks.js`

**工具层：**
- `src/tools/git.js`
- `src/tools/search-replace.js`
- `src/tools/mcp-client.js`
- `src/tools/web-fetch.js`
- `src/tools/web-search.js`

**GUI 层：**
- `src/gui/server.js`
- `src/gui/file-tree.js`
- `src/gui/public/app.js`

**技能层：**
- `src/skills/loader.js`

**UI 层：**
- `src/ui/banner.js`
- `src/ui/mascot.js`
- `src/ui/status-bar.js`
- `src/ui/progress.js`

**Shell 层：**
- `src/shell/shell-exec.js`

**系统层：**
- `src/system/permissions.js`

**配置层：**
- `src/config.js`

**插件层：**
- `src/plugins/registry.js`

**任务层：**
- `src/tasks/queue.js`

**文档层：**
- `src/docs/registry.js`

**工具函数层（utils）：**
- `src/utils/abort.js`
- `src/utils/array.js`
- `src/utils/binary-check.js`
- `src/utils/cli-args.js`
- `src/utils/combined-abort.js`
- `src/utils/diff.js`
- `src/utils/file-watcher.js`
- `src/utils/files.js`
- `src/utils/format-time.js`
- `src/utils/format.js`
- `src/utils/git.js`
- `src/utils/hash.js`
- `src/utils/http.js`
- `src/utils/intl.js`
- `src/utils/json.js`
- `src/utils/memoize.js`
- `src/utils/ripgrep.js`
- `src/utils/sanitize.js`
- `src/utils/sequential.js`
- `src/utils/set.js`
- `src/utils/signal.js`
- `src/utils/sleep.js`
- `src/utils/slug.js`
- `src/utils/stream.js`
- `src/utils/string.js`
- `src/utils/system-info.js`
- `src/utils/tagged-id.js`
- `src/utils/tempfile.js`
- `src/utils/theme.js`
- `src/utils/timeouts.js`
- `src/utils/tokens.js`
- `src/utils/treeify.js`
- `src/utils/truncate.js`
- `src/utils/ultraplan/keyword.js`
- `src/utils/uuid.js`
- `src/utils/which.js`
- `src/utils/with-resolvers.js`
- `src/utils/xml.js`

---

## 1. 项目总览

`Frees Agent` 是一个本地优先、可扩展的终端 AI Agent CLI。完整架构由以下层次组成：

- **CLI 命令入口层** — 参数解析和命令路由
- **模型接入层** — 多 provider 抽象（Ollama / OpenAI / Anthropic / MCP）
- **工作区扫描与查询层** — 文件索引和内容检索
- **Agent 循环层** — 工具调用、规划、反思、多轮编辑
- **记忆与会话层** — 画像、长期记忆、向量检索、任务追踪
- **Tool 工具层** — Git、搜索替换、MCP 客户端、网页抓取
- **GUI 桌面层** — Express + WebSocket 实时界面
- **Skill 加载层** — SKILL.md 扫描和匹配
- **展示与权限层** — 横幅、桌宠、状态栏、权限说明
- **插件系统层** — 外部能力扩展注册
- **文档与测试层** — 知识库和回归测试

---

## 2. 运行时主链路

### 2.1 CLI 主链路

1. `bin/ai-agent.js` 作为可执行入口
2. 调用 `src/cli.js` 的 `main()`
3. `main()` 解析命令行参数
4. 根据命令分派到 `src/commands/*`

### 2.2 模型调用链路

1. 命令调用 `createModelClient()`
2. `src/model/index.js` 读取配置并解析 provider
3. 构造具体客户端：`OllamaClient` / `OpenAICompatibleClient` / `AnthropicClient`
4. 客户端统一暴露 `generateText()` 和 `streamText()`

### 2.3 代码 Agent 链路

1. `edit` 命令扫描工作区
2. 构造工作区概览和相关文件
3. `runEditAgent()` 进入多轮工具循环
4. 模型返回 JSON 动作
5. 工具箱执行 `list_files` / `read_file` / `replace_in_file` 等工具
6. 输出最终总结

### 2.4 聊天工具循环链路

1. 用户消息进入 `handleChat`（GUI 场景）或 `askModel`（CLI 场景）
2. 检查本地快捷回复
3. 可选联网搜索（Tavily）
4. 规划器分解任务（可选）
5. `runChatToolAgent()` 进入工具循环
6. 并行执行只读工具，串行执行写入工具
7. 工具执行后自动计算 diff
8. 最终输出回复，更新记忆

### 2.5 记忆链路

1. 创建本地记忆存储目录
2. 读取用户画像、长期记忆、会话数据
3. 聊天时把这些信息注入系统上下文
4. 每一轮对话结束后做记忆提取（本地启发式 + 模型驱动）
5. 向量索引同步更新
6. 任务记忆自动推断
7. 长对话摘要压缩
8. 持久化回本地 `.frees-agent/`

### 2.6 GUI 启动链路

1. `gui` 命令调用 `runGuiCommand()`
2. 两阶段启动：先起 Express/WebSocket 服务（4s 内响应）
3. 后台初始化：模型连接、工作区扫描、MCP 连接、记忆加载
4. 前端显示"正在初始化..."直到就绪
5. 尝试启动 Tauri 原生窗口，失败则回退到 Web 模式

### 2.7 Skill 链路

1. 扫描个人目录和项目目录中的 `SKILL.md`
2. 读取 frontmatter 和正文
3. 根据请求内容做轻量关键词匹配
4. 把相关 skill 内容注入聊天 prompt

---

## 3. 目录分层说明

### 根目录层

- `package.json` — 包名、可执行命令、脚本
- `README.md` — 项目入口说明
- `bin/` — 命令行可执行入口
- `src/` — 全部源码
- `docs/` — 文档知识库
- `test/` — 单元测试

### 源码层

```
src/
├── cli.js                      # CLI 总入口
├── config.js                   # 配置管理
├── commands/                   # 命令分发后的具体实现
│   ├── chat.js                 # 交互式聊天
│   ├── edit.js                 # 代码编辑 Agent
│   ├── complete.js             # 代码补全
│   ├── doctor.js               # 环境诊断
│   ├── config.js               # 配置初始化
│   ├── docs.js                 # 文档查看
│   ├── memory.js               # 记忆管理
│   ├── permissions.js          # 权限说明
│   ├── skills.js               # 技能管理
│   ├── files.js                # 文件列表
│   ├── cost.js                 # Token 用量统计
│   ├── compact.js              # 会话压缩
│   ├── tasks.js                # 任务管理
│   └── gui.js                  # GUI 启动
├── model/                      # 模型 provider 层
├── workspace/                  # 工作区扫描和查询
├── agent/                      # Agent 循环和提示词
├── memory/                     # 记忆系统
├── tools/                      # 工具实现
├── gui/                        # GUI 桌面应用
├── skills/                     # skill 扫描和匹配
├── ui/                         # 界面组件
├── shell/                      # Shell 执行
├── system/                     # 权限和系统行为
├── plugins/                    # 插件注册表
├── tasks/                      # 任务队列
├── docs/                       # 文档索引
└── utils/                      # 通用工具函数
```

---

## 4. 根文件逐个分析

### `agent-cli/package.json`

职责：
- 定义包名 `frees-agent-cli`
- 定义命令入口 `frees-agent` / `ai-agent`
- 定义最小运行 Node 版本（>=18）
- 定义常用脚本

关键依赖：express、ws（WebSocket）

### `agent-cli/bin/ai-agent.js`

职责：
- 作为 Node 可执行脚本入口
- 导入 `main()`
- 捕获顶层未处理错误

函数/逻辑：
- 顶层 `main().catch(...)` — 兜底异常处理
- 使用 `process.on('uncaughtException')` 做最终兜底

---

## 5. `src/cli.js` 逐函数分析

职责：
- 统一参数解析
- 路由到各命令处理函数
- 输出帮助文本

函数：

### `printHelp()`
输出 CLI 帮助说明。包含全部命令的帮助信息：chat、edit、complete、doctor、config、memory、docs、permissions、skills、files、cost、compact、tasks、gui。

### `main(argv)`
CLI 总调度函数。

行为：
- 解析第一个 token 作为命令名
- 进入不同分支：chat / edit / complete / doctor / config / memory / docs / permissions / skills / files / cost / compact / tasks / gui
- 使用 Node 原生 `parseArgs`
- 每个命令单独定义参数结构

优化方向：
- 把命令定义抽成 declarative registry
- 自动生成帮助文档
- 支持子命令注册

---

## 6. `src/config.js` 逐函数分析

职责：
- 管理默认配置
- 读取/合并/写入配置
- 决定本地配置目录位置

常量：

### `DEFAULT_CONFIG`
定义默认 provider（ollama）、默认模型、工作区、记忆、长对话、工具、MCP、GUI 等参数。

函数：

### `isObject(value)`
判断值是否是普通对象。给深度合并逻辑做类型判断。

### `deepMerge(base, override)`
把用户配置覆盖到默认配置上。递归合并对象，对标量和数组采用覆盖策略。

### `getDefaultConfig()`
返回默认配置副本。

### `getDefaultConfigPath()`
决定默认配置路径。若设置 `FREES_AGENT_HOME`，则使用该目录；否则使用当前工作目录下的 `.frees-agent/config.json`。

### `getConfigPath(explicitPath)`
在显式传参、环境变量和默认路径之间选择配置路径。

### `loadConfig(explicitPath)`
读取配置文件，解析 JSON，与默认配置做深度合并。

### `writeDefaultConfig(explicitPath, { force })`
在目标路径写出默认配置模板，处理覆盖保护。

优化方向：
- 配置 schema 校验（JSON Schema）
- 配置注释模板生成
- 区分项目配置与全局配置
- 配置热重载

---

## 7. `src/commands/` 逐文件逐函数分析

### `chat.js`

职责：
- 负责交互式聊天和单条消息聊天
- 串接工作区、记忆、长对话、skill、模型

函数：

#### `runChatCommand(options)`
聊天命令主实现。

内部关键阶段：
1. 创建模型客户端
2. 显示 banner
3. 默认把当前目录作为工作区
4. 扫描工作区并加载 skill
5. 创建/加载本地记忆存储
6. 定义内部函数 `askModel()`
7. 进入 readline 循环

内部函数（闭包）：

#### `askModel(message)`
处理单轮聊天请求。
- 先尝试本地快捷回答
- 挑选相关文件
- 挑选相关 skill
- 构造用户 prompt 与系统 prompt
- 发起模型调用
- 更新记忆
- 触发长对话压缩

支持的聊天命令：`/reload` `/memory` `/profile` `/summary` `/skills`

优化方向：
- 增加流式输出（已部分实现）
- 增加 retry 与 provider fallback
- 增加对话级 token 预算

### `edit.js`

#### `runEditCommand(options)`
执行代码 Agent 主命令。
- 校验参数
- 扫描工作区
- 构造概览和相关文件
- 调用 `runEditAgent()`
- 输出最终总结、变更文件、备注

### `complete.js`

#### `runCompleteCommand(options)`
执行上下文感知代码补全。
- 扫描工作区
- 找相关文件
- 可选读取目标文件
- 拼接补全 prompt
- 请求模型返回结果

### `config.js`

#### `runConfigCommand(options)`
处理配置初始化与查看。

### `docs.js`

#### `runDocsCommand(options)`
列出文档主题，输出某一篇文档内容。

### `doctor.js`

#### `runDoctorCommand(options)`
输出 Frees Agent 当前环境诊断。
- 当前配置路径
- 存储根目录
- provider / model / baseUrl
- 记忆和长对话配置
- 工作区扫描结果
- 可选 ping 测试

### `memory.js`

#### `runMemoryCommand(options)`
查看记忆、清理记忆、列出 session 文件、合并跨设备记忆。

### `permissions.js`

#### `runPermissionsCommand()`
打印当前平台的权限引导文案。

### `skills.js`

#### `runSkillsCommand(options)`
列出工作区和个人 skills，输出指定 skill 的内容。

### `files.js`

#### `runFilesCommand(options)`
列出工作区已索引的文件。

### `cost.js`

#### `runCostCommand(options)`
统计会话 token 用量。

### `compact.js`

#### `runCompactCommand(options)`
手动触发会话摘要压缩。

### `tasks.js`

#### `runTasksCommand(options)`
管理任务记忆（查看/清理）。

### `gui.js`

#### `runGuiCommand(options)`
构建和启动 Frees-Agent 桌面 GUI。

行为：
1. 调用 `buildServer()` 启动 Express + WebSocket 服务
2. 尝试启动 Tauri 原生桌面应用
3. 如果 Tauri 不可用，回退到 Web UI 模式
4. 后台初始化模型、工作区、MCP、记忆

内部函数：

#### `buildServer(options)`
两阶段服务构建。

阶段一（即时响应）：
- 创建 minimal runtime
- 调用 `createGuiServer()` 立即启动 HTTP/WebSocket 服务
- 使用 fallback client 直到真正初始化完成

阶段二（后台初始化）：
- 连接模型 provider（失败时使用 fallback）
- 扫描工作区索引
- 加载 skills
- 连接 MCP 服务器
- 加载记忆状态
- 启动文件变更监视器（`createWorkspaceWatcher`）
- 收集工具列表和会话列表

`handleChat()` 闭包是 WebSocket 消息处理的核心函数：
- 检查本地快捷回复
- 附加语义记忆
- 可选联网搜索
- 规划器分解任务
- 工具循环（`runChatToolAgent`）或纯文本流式回复
- 每轮对话后更新记忆
- 写入操作自动计算并推送 diff

`createFallbackClient()` — 当无可用模型时返回错误提示客户端。

`formatSkillContext()` — 格式化 skills 为 prompt 注入文本。

`tryRunTauri()` — 尝试启动 Tauri 原生二进制。

---

## 8. `src/model/` 逐文件逐函数分析

### `model/index.js`

职责：
- provider 抽象层入口
- 统一构造模型客户端

函数：

#### `getApiKey({ apiKey, apiKeyEnv, configKeyEnv })`
根据命令行、环境变量和配置项选取 API Key。

#### `resolveModelRuntime(options)`
把配置、provider、model、baseUrl、apiKey 解析成运行时对象。

#### `createModelClient(options)`
根据 providerName 实例化具体客户端。支持 ollama / openai-compatible / anthropic / mcp。

#### `createRoleModelClient(options, role)`
为指定角色（planner/critic）创建独立的模型客户端，支持角色级 provider 覆盖。

### `model/openai-compatible.js`

类：

#### `OpenAICompatibleClient`
- `constructor({ baseUrl, apiKey, model })` — 保存运行时参数
- `generateText(...)` — 发送 Chat Completions 请求
- `streamText(...)` — 流式版，逐 token 回调

### `model/ollama.js`

类：

#### `OllamaClient`
- `constructor({ baseUrl, model })` — 保存 Ollama 地址与模型名
- `generateText(...)` — 调用 Ollama `/api/chat`
- `streamText(...)` — 流式版

### `model/anthropic.js`

类：

#### `AnthropicClient`
- `constructor({ baseUrl, apiKey, model })` — 保存 Anthropic 连接参数
- `generateText(...)` — 调用 `/v1/messages`
- `streamText(...)` — 流式版

---

## 9. `src/workspace/` 逐文件逐函数分析

### `workspace/indexer.js`

常量：

#### `DEFAULT_IGNORE_NAMES`
默认忽略目录集合（.git, node_modules, dist 等）。

函数：

#### `scanWorkspace(workspaceRoot, config)`
递归遍历工作区文件，跳过忽略目录和二进制文件，按大小阈值加载文本文件内容到索引。

#### `buildWorkspaceOverview(index, { maxFiles })`
把索引压缩成 prompt 友好的概要文本。

#### `findRelevantFiles(index, task, limit)`
通过简单加权匹配选出相关文件。路径命中分更高，内容命中分较低，最终排序取前 N 项。

### `workspace/queries.js`

函数：

#### `globToRegExp(pattern)`
把简化 glob 转成正则。

#### `listFiles(index, opts)`
按前缀和 glob 列文件。

#### `searchText(index, opts)`
在已加载文本文件中逐行搜索，支持简单文本或 `/regex/flags`。

#### `readIndexedFile(index, relativePath, opts)`
读取文件片段并加上行号。

#### `writeWorkspaceFile(index, relativePath, content)`
写文件并刷新索引。

#### `replaceInWorkspaceFile(index, relativePath, oldText, newText, replaceAll)`
在内存内容中做替换并落盘。

#### `createWorkspaceDirectory(index, relativePath)`
创建目录。

#### `deleteWorkspaceFile(index, relativePath)`
删除文件并更新索引。

#### `refreshFile(index, relativePath)`
单文件重载到索引。

---

## 10. `src/agent/` 逐文件逐函数分析

### `agent/prompts.js`

常量：

- `EDIT_AGENT_SYSTEM_PROMPT` — 约束编辑代理输出 JSON
- `CHAT_SYSTEM_PROMPT` — 约束聊天风格
- `CHAT_TOOL_SYSTEM_PROMPT` — 约束聊天工具循环 JSON
- `COMPLETE_SYSTEM_PROMPT` — 约束补全结果
- `TOOL_DESCRIPTIONS` — 10 种工具的描述字典

函数：

- `formatRelevantFiles(files, opts)` — 压缩文件为 prompt 片段
- `buildEditUserPrompt(...)` — 生成代码编辑任务 prompt
- `buildChatUserPrompt(...)` — 生成聊天任务 prompt，插入 skill/规划/联网上下文
- `buildChatToolUserPrompt(...)` — 生成聊天工具循环 prompt
- `buildCompletionPrompt(...)` — 生成代码补全 prompt

### `agent/tools.js`

#### `createAgentToolbox(index, { dryRun, readOnly, config })`
创建统一工具箱，包含别名映射、MCP 工具集成、安全校验。

内部工具映射：
- `list_files` / `glob`
- `search_text` / `grep`
- `read_file` / `read`
- `web_fetch` / `fetch`
- `write_file` / `write`
- `replace_in_file` / `edit`
- `bash` / `shell` / `execute_command`
- `mcp__*` — 动态加载的 MCP 工具
- `search_and_replace` — 上下文感知搜索替换
- `git_status` / `git_diff` / `git_commit` / `git_log` / `git_branch` / `git_checkout` / `git_add`

### `agent/edit-loop.js`

#### `isToolAction(action)`
判断是否是工具调用 JSON。

#### `isFinalAction(action)`
判断是否是最终输出 JSON。

#### `runEditAgent(opts)`
核心编辑代理循环。最多迭代 `maxSteps`，每轮调用模型、解析 JSON、执行工具或结束、非法 JSON 回灌纠错提示。

### `agent/chat-tool-loop.js`

#### `runChatToolAgent({ client, toolbox, message, ... })`
聊天工具循环。支持：
- 多步迭代（maxSteps）
- 并发执行只读工具 + 串行执行写入工具
- 自动重试（最多 2 次）
- 消息历史裁剪
- 连续 JSON 解析失败保护（3 次阈值）

#### `extractMultipleJsonObjects(text)`
从模型回复中提取多个 JSON 对象。先尝试解析为 JSON 数组，再通过正则提取对象。

#### `executeWithRetry(toolbox, toolName, args, maxRetries)`
带重试的工具执行。对瞬时错误（EAGAIN、超时、429 等）自动重试。

#### `isTransientError(error)`
判断是否为可重试的瞬时错误。

#### `trimMessageHistory(messages)`
消息历史裁剪，保留首条和最近 N 条。

### `agent/orchestration.js`

#### `partitionTools(toolUses)`
将工具分为只读（并发）和写入（串行）两组。只读工具包括 list_files、search_text、read_file、web_search、web_fetch、mcp__*。

#### `executeToolBatch(toolUses, runToolFn, { concurrency })`
并发执行工具批，默认并发数 5。

#### `executeToolsSequential(toolUses, runToolFn)`
串行执行写入工具。

#### `formatToolResults(results)`
格式化工具执行结果为 prompt 可读文本。

### `agent/reasoning.js`

#### `buildStructuredPlan({ plannerClient, message, workspaceOverview, enabled })`
构建结构化执行计划。支持普通模式和增强模式（ultraplan 关键词触发 DAG 分解）。

返回 `{ steps, complexity, dependencies, risks, estimatedEffort, toolsNeeded }`。

#### `buildExecutionPlan({ plannerClient, message, workspaceOverview, enabled })`
构建执行计划提示文本，供注入 chat prompt。

#### `reflectAndRevise({ criticClient, userMessage, draftReply, enabled })`
回答质检与修正。使用专门的 critic 模型检查是否存在遗漏、逻辑错误，需要时生成改进版回复。

---

## 11. `src/memory/` 逐文件逐函数分析

### `memory/prompts.js`

常量：
- `MEMORY_EXTRACT_SYSTEM_PROMPT` — 模型记忆提取系统提示
- `SUMMARY_SYSTEM_PROMPT` — 对话摘要系统提示

函数：
- `buildMemoryExtractionPrompt(...)` — 构造记忆提取 prompt
- `buildSummaryPrompt(...)` — 构造对话摘要 prompt
- `buildMemoryContext(...)` — 把画像、长期记忆、会话摘要拼成聊天上下文

### `memory/store.js`

函数：
- `createMemoryStore(...)` — 创建记忆存储路径对象
- `loadMemoryState(store, config)` — 加载完整记忆状态
- `saveMemoryState(state)` — 落盘写回
- `mergeMemoryExtraction(state, extraction, config)` — 合并提取结果
- `appendTurnToSession(state, userMessage, assistantMessage)` — 追加对话轮次
- `getRecentMessagesForModel(state)` — 获取近期消息
- `clearMemoryState(state, options)` — 按粒度清除
- `listSessions(storeRoot)` — 列出会话文件
- `clearAllSessionFiles(storeRoot)` — 清空全部会话
- `createSession(...)` — 创建新会话
- `renameSession(...)` — 重命名会话
- `deleteSession(...)` — 删除会话
- `loadSessionIndex(...)` — 加载会话索引

### `memory/manager.js`

函数：
- `buildChatSystemPrompt({ baseSystemPrompt, state, config })` — 拼接记忆上下文到系统提示词
- `updateMemoryAfterTurn(...)` — 单轮对话后更新记忆（先 append turn -> 本地启发式 -> 模型提取 -> 落盘）
- `compactConversationIfNeeded(...)` — 超过阈值时压缩旧消息（保留最近 N 条，旧的做摘要）
- `describeMemoryState(state)` — 记忆状态描述
- `attachSemanticMemoriesToState(...)` — 附加语义相关记忆

### `memory/heuristics.js`

函数：
- `inferLocalMemory(userMessage)` — 用本地规则生成 profilePatch 和 durableMemories
- `resolveLocalChatShortcut(message, state)` — 对简单问答做本地快捷响应（打招呼、问名字等）
- `isLikelyValidName(value)` — 校验是否为合法姓名
- `sanitizeProfilePatch(profile)` — 清洗用户画像

### `memory/vector.js`

#### `embedText(text)`
将文本转为 256 维向量。使用 FNV-1a 哈希，CJK 感知分词，n-gram 增强部分匹配。

#### `loadVectorIndex(vectorPath)`
从文件加载向量索引。

#### `upsertDurableMemoriesToVectorIndex(vectorPath, durableMemories)`
将持久化记忆同步到向量索引，上限 500 条。

#### `queryVectorMemories(vectorPath, query, topK)`
查询相似记忆，余弦相似度排序，过滤 score <= 0.06 的低质量结果。

### `memory/ingest.js`

函数：
- `extractProfileFromText(text)` — 从用户文本中提取画像字段（技能、技术栈、目标、偏好等）
- `normalizeProfilePatch(profilePatch)` — 标准化用户画像
- `routeMemoryExtraction(extraction)` — 路由记忆提取结果到对应的画像字段或持久化记忆
- `mergeMemoryExtractions(...extractions)` — 合并多次提取结果
- `normalizeDurableMemories(memories)` — 去重和标准化持久记忆

### `memory/tasks.js`

函数：
- `loadTaskMemory(taskPath)` — 加载任务记忆
- `saveTaskMemory(taskPath, tasks)` — 保存任务记忆
- `inferTasksFromMessage(text)` — 从用户消息中推断任务
- `mergeTasks(existingTasks, inferredTasks)` — 合并现有任务和新推断的任务

---

## 12. `src/tools/` 逐文件逐函数分析

### `tools/git.js`

函数：

#### `execGit(args, cwd)`
内部函数，使用 spawnSync 执行 git 命令，避免 shell 转义问题。

#### `gitStatus({ cwd })`
查看 git 工作区状态。返回分支名、已暂存/已修改/未跟踪/冲突文件列表。

#### `gitDiff({ staged, path, contextLines, cwd })`
查看文件差异。支持 `--staged` 查看已暂存 diff，解析统计信息（新增行、删除行、变更文件数）。

#### `gitCommit({ message, cwd })`
提交暂存变更，解析返回 commit hash。

#### `gitLog({ maxCount, path, branch, cwd })`
查看提交历史，返回结构化条目（hash、作者、日期、主题）。

#### `gitBranch({ cwd })`
列出所有本地和远程分支。

#### `gitCheckout({ branch, target, cwd })`
切换分支或恢复文件。

#### `gitAdd({ files, cwd })`
暂存指定文件，默认暂存全部。

#### `getGitToolList()`
返回工具列表供 tools.js 注册。

### `tools/search-replace.js`

函数：

#### `normalizeText(text)`
规范化文本中的引号（弯引号转直引号）、空格、换行。

#### `exactSearch(content, oldText)`
精确搜索 — 直接 indexOf。

#### `normalizedSearch(content, oldText)`
规范化搜索 — 先规范化再匹配。

#### `contextSearch(content, oldText, contextLines)`
上下文感知搜索 — 用前后文行辅助定位，解决格式化后精确匹配失败的问题。

#### `lineSearch(content, oldText, startLine)`
行级别搜索 — 按行号精确匹配。

#### `searchAndReplace({ filePath, oldText, newText, contextLines, startLine, regex, replaceAll })`
主函数。支持 4 种策略：exact -> context -> line -> normalized，自动降级。支持正则模式和全量替换。

### `tools/mcp-client.js`

类：

#### `McpConnection`
单个 MCP 服务器连接。

方法：
- `connect()` — 通过 stdio 传输连接，发送 initialize 请求
- `disconnect()` — 断开连接，清理 pending 请求
- `listTools()` — 获取工具列表（带缓存）
- `callTool(toolName, args)` — 调用工具
- `isConnected()` — 检查连接状态

内部方法：
- `_connectStdio()` — 启动子进程，建立 stdio 通信
- `_handleData(chunk)` — 处理 JSON-RPC 响应行
- `_sendRaw(request, timeoutMs)` — 发送 JSON-RPC 请求

#### `McpManager`
多 MCP 服务器管理器。

方法：
- `getOrConnect(name)` — 获取或创建连接（自动重连）
- `listAllTools()` — 列出所有 MCP 服务器的工具
- `callTool(serverName, toolName, args)` — 调用指定服务器的工具
- `disconnectAll()` — 断开所有连接

#### `buildMcpToolHandlers(mcpManager)`
构建 MCP 工具处理器。
- `refreshTools()` — 刷新工具缓存
- `tryHandleMcpTool(name, args)` — 尝试处理 MCP 工具调用
- `getToolNames()` — 获取工具名列表
- `getToolSchemas()` — 获取工具 schema

### `tools/web-fetch.js`

#### `fetchUrl(url, options)`
获取 URL 内容。支持 HTTP/HTTPS，超时控制（15s），大小限制（512KB），自动检测内容类型。

#### `htmlToBasicText(html)`
HTML 转纯文本。提取标题、移除脚本/样式、保留链接、解码实体。

### `tools/web-search.js`

#### `searchWebWithTavily(query, config, { maxResults })`
通过 Tavily API 执行联网搜索。返回摘要和结果列表。

#### `shouldUseWebSearch(message)`
判断是否需要联网搜索。覆盖中英文生活查询句式。

---

## 13. `src/gui/` 逐文件逐函数分析

### `gui/server.js`

### `createGuiServer({ runtime, messageHandler })`
创建 Express + WebSocket GUI 服务器。

**安全机制：**
- 速率限制（rateLimit）— 默认 60 请求/分钟/IP
- CSP 标头（nonce 注入）
- 安全 HTTP 标头（X-Content-Type-Options、X-Frame-Options 等）

**REST API 端点：**

| 端点 | 方法 | 说明 |
|------|------|------|
| `/` | GET | 提供 index.html |
| `/api/health` | GET | 健康检查 |
| `/api/status` | GET | 基本状态 |
| `/api/config` | GET | 安全配置（API Key 脱敏） |
| `/api/config` | PATCH | 更新配置 |
| `/api/chat` | POST | REST 聊天回退 |
| `/api/system` | GET | 系统信息 |
| `/api/skills` | GET | 技能列表 |
| `/api/tools` | GET | 工具列表 |
| `/api/sessions` | GET | 会话列表 |
| `/api/sessions/:id` | GET | 会话消息 |
| `/api/files` | GET | 文件树 |
| `/api/sessions` | POST | 创建会话 |
| `/api/sessions/:id` | PATCH | 重命名会话 |
| `/api/sessions/:id` | DELETE | 删除会话 |
| `/api/memory` | GET | 记忆条目 |
| `/api/mcp/servers` | GET | MCP 服务器列表 |
| `/api/mcp/servers` | POST | 添加 MCP 服务器 |
| `/api/mcp/servers/:name` | DELETE | 删除 MCP 服务器 |

**WebSocket 协议：**

客户端发送：
- `{ type: 'chat', message, files }` — 发送聊天消息（含附件）
- `{ type: 'stop' }` — 停止生成
- `{ type: 'ping' }` — 心跳

服务端推送：
- `{ type: 'token', data }` — 流式 token
- `{ type: 'done', data }` — 完成回复
- `{ type: 'error', message }` — 错误
- `{ type: 'tool_call', name, args }` — 工具调用通知
- `{ type: 'tool_result', name, message }` — 工具结果
- `{ type: 'diffs', diffs }` — 文件变更 diff
- `{ type: 'memory', memoryCount }` — 记忆更新
- `{ type: 'files_changed' }` — 文件变更通知
- `{ type: 'pong' }` — 心跳回复

内部函数：
- `rateLimit(ip, maxRequests, windowMs)` — 速率限制器
- `generateNonce()` — CSP nonce 生成
- `formatBytes(bytes)` — 字节格式化
- `buildChatMessageWithFiles(data)` — 文件附件嵌入消息

### `gui/file-tree.js`

#### `buildFileTree(files, rootDir)`
从扁平文件列表构建嵌套树结构。排序规则：目录优先，然后按字母序。

### `gui/public/app.js`

前端 JavaScript，同时支持 Tauri（原生）和浏览器模式。主要功能：
- WebSocket 连接管理（自动重连）
- Markdown 渲染（标题、代码块、表格、列表、链接）
- 消息操作（复制、重新生成、删除）
- 文件附件上传（base64 编码 + 拖放支持）
- 桌宠系统（6 个物种、空闲动画、情绪反应）
- 文件树浏览器（展开/折叠、点击插入路径）
- 记忆浏览器
- Diff 查看器（统一 diff 格式，颜色编码）
- 会话管理（创建/切换/重命名/删除）
- 搜索（Ctrl+F，消息内容搜索）
- 设置面板（Provider、Model、Temperature、Stream、Planner）
- 系统信息面板（CPU、内存、主机信息）
- MCP 服务器管理（查看/添加/删除）
- 键盘快捷键（Ctrl+L 新对话、Ctrl+, 设置、Ctrl+Shift+D diff 等）

---

## 14. `src/skills/loader.js` 逐函数分析

函数：
- `walk(dirPath, files)` — 递归收集 SKILL.md
- `parseFrontmatter(raw)` — 解析 Markdown frontmatter
- `loadSkills(workspaceRoot)` — 从三个来源加载 skills：`~/.claude/skills`、`<workspace>/.claude/skills`、`<workspace>/.frees-agent/skills`
- `selectRelevantSkills(skills, request, limit)` — 关键词匹配请求与 skill

---

## 15. `src/ui/` 逐文件逐函数分析

### `banner.js`
- `printFreesAgentBanner(runtime, options)` — 品牌横幅
- `printMiniBanner(text, options)` — 迷你横幅

### `mascot.js`
- `Mascot` 类 — 桌宠系统
- `formatUserMessage()` / `formatAssistantMessage()` / `formatError()` / `formatSuccess()` — 消息格式化

### `status-bar.js`
- `StatusLine` 类 — 状态行
- `divider()` / `panel()` — UI 组件

### `progress.js`
- `Spinner` — 旋转指示器
- `ThinkingIndicator` — 思考状态
- `ProgressBar` — 进度条

---

## 16. `src/shell/shell-exec.js` 逐函数分析

函数：
- `validateShellCommand(command)` — 验证命令安全性（7 种危险命令模式拦截）
- `execShell(command, options)` — 执行 shell 命令
- `detectShell()` — 检测系统 shell（bash/zsh/cmd/powershell）

安全特性：
- 自动检测 shell
- 危险命令模式静态拦截
- AbortController 超时控制
- 输出自动截断（1MB 上限）
- Windows 兼容

---

## 17. `src/utils/` 全部工具函数分析

### `utils/abort.js`
- `createAbortController(timeoutMs)` — 创建带超时的 AbortController

### `utils/array.js`
- `ensureArray(value)` — 确保值为数组
- `dedupeArray(arr)` — 数组去重

### `utils/binary-check.js`
- `hasBinaryByte(buffer)` — 检查 buffer 是否含二进制字节

### `utils/cli-args.js`
- `parseCliArgs(argv, spec)` — 解析 CLI 参数

### `utils/combined-abort.js`
- `combineAbortSignals(...signals)` — 合并多个 AbortSignal

### `utils/diff.js`
核心 diff 引擎。无外部依赖，基于 LCS 算法。

#### `unifiedDiff(oldText, newText, oldName, newName, contextLines)`
计算统一 diff。返回 `{ diff, hasChanges, added, removed }`。

算法：
1. 使用 LCS（最长公共子序列）比较行级差异
2. 将操作分组成 hunk（带上下文行）
3. 生成标准 unified diff 格式

### `utils/file-watcher.js`
#### `createWorkspaceWatcher(index, opts)`
创建文件变更监视器。使用 `fs.watch` 递归模式（macOS/Linux）或轮询回退。去抖 300ms 合并快速事件。

### `utils/files.js`
- `isProbablyTextFile(filePath, buffer)` — 判断文本文件
- `detectLanguage(filePath)` — 后缀轻量语言识别
- `readTextIfPossible(filePath)` — 尝试读取文本文件
- `ensureDir(dirPath)` — 保证目录存在
- `walkDirectory(rootDir, callback)` — 遍历目录
- `normalizeRelativePath(filePath)` — 路径统一 `/`
- `resolveInsideWorkspace(workspaceRoot, targetPath)` — 越界保护
- `formatBytes(size)` — 友好显示文件大小

### `utils/format-time.js`
- `formatRelativeTime(date)` — 相对时间
- `formatTimestamp(date)` — 时间戳格式化

### `utils/format.js`
- `truncate(str, maxLen)` — 截断字符串
- `indent(text, level)` — 缩进文本

### `utils/git.js`
- `findGitRoot(cwd)` — 查找 git 仓库根目录
- `getBranch(cwd)` — 获取当前分支名
- `getGitState(cwd)` — 综合 git 状态

### `utils/hash.js`
- `hashString(str)` — 字符串哈希

### `utils/http.js`
- `postJson(url, { headers, body })` — 统一 POST JSON 请求

### `utils/intl.js`
- `formatNumber(n)` — 数字格式化
- `formatList(items)` — 列表格式化

### `utils/json.js`
- `extractFirstJsonObject(text)` — 从混合文本中提取首个 JSON
- `truncateForModel(text, maxLength)` — 截断长文本

### `utils/memoize.js`
- `memoize(fn, options)` — 内联缓存

### `utils/ripgrep.js`
- `detectRipgrep()` — 检测系统 rg
- `searchWithRipgrep(pattern, options)` — 正则搜索

### `utils/sanitize.js`
- `sanitizePath(input)` — 路径安全处理
- `sanitizeCommand(input)` — 命令安全处理

### `utils/sequential.js`
- `runSequentially(tasks)` — 顺序执行异步任务

### `utils/set.js`
- `setDifference(a, b)` — 集合差集
- `setIntersection(a, b)` — 集合交集

### `utils/signal.js`
- `createSignal()` — 创建信号量

### `utils/sleep.js`
- `sleep(ms, signal)` — AbortSignal 感知的延迟

### `utils/slug.js`
- `slugify(value, fallback)` — 路径友好 slug
- `shortHash(value)` — 短哈希
- `generateWordSlug()` — 语义化 slug（形容词-动词-名词）
- `generateShortWordSlug()` — 短语义化 slug

### `utils/stream.js`
- `createTransformStream(transform)` — 转换流
- `collectStream(stream)` — 收集流内容

### `utils/string.js`
- `capitalize(str)` — 首字母大写
- `camelCase(str)` — 驼峰命名
- `kebabCase(str)` — 连字符命名

### `utils/system-info.js`
- `getSystemInfo()` — 获取系统信息

### `utils/tagged-id.js`
- `generateTaggedId(tag)` — 生成带标签的 ID

### `utils/tempfile.js`
- `createTempFile(ext)` — 创建临时文件
- `createTempDir()` — 创建临时目录

### `utils/theme.js`
- `getTheme(name)` — 获取主题
- `applyTheme(text, key, theme)` — 应用主题
- 4 主题系统：dark/light/dark-ansi/light-ansi

### `utils/timeouts.js`
- `withTimeout(promise, ms)` — 带超时的 Promise
- `TimeoutError` — 超时错误类

### `utils/tokens.js`
- `estimateTokens(text)` — 估算 token 数

### `utils/treeify.js`
- `treeify(items, options)` — Unicode 树形渲染

### `utils/truncate.js`
- `stringWidth(str)` — ANSI 感知字符串宽度
- `truncateToWidth(text, width)` — 按宽度截断
- `truncate(str, maxWidth, singleLine)` — 通用截断

### `utils/ultraplan/keyword.js`
- `hasUltraplanKeyword(text)` — 检查是否包含增强规划关键词

### `utils/uuid.js`
- `generateAgentId()` — 生成 Agent ID
- `isValidUUID(value)` — UUID 校验

### `utils/which.js`
- `which(name)` — 异步可执行文件查找
- `whichSync(name)` — 同步版

### `utils/with-resolvers.js`
- `withResolvers()` — Promise withResolvers polyfill

### `utils/xml.js`
- `parseXml(text)` — 简易 XML 解析
- `escapeXml(text)` — XML 转义

---

## 18. 插件与任务系统

### `plugins/registry.js`
插件注册表，支持外部能力的扩展注册。

### `tasks/queue.js`
任务队列实现，支持异步任务调度。

---

## 19. 文档层

### `docs/registry.js`

常量：
- `DOCS` — 文档的 slug / title / filename 映射表

函数：
- `getDocsRoot()` — 返回文档目录绝对路径
- `resolveDocPath(doc)` — 路径解析
- `findDoc(topic)` — 模糊查找文档

---

## 20. 当前核心算法剖析

### 20.1 文件相关性算法
`workspace/indexer.js -> findRelevantFiles`
- 用户请求分词 -> 路径命中高分 -> 内容命中低分 -> 排序取前 N
- 优点：快、无外部依赖
- 缺点：语义能力弱

### 20.2 长对话压缩算法
`memory/manager.js -> compactConversationIfNeeded`
- 保留最近 N 条 -> 更早消息做摘要 -> 失败 fallback 为文本拼接
- 优点：成本低、容错强
- 缺点：摘要质量依赖模型

### 20.3 记忆提取算法
`memory/heuristics.js + memory/manager.js`
- 本地规则优先 -> 模型提取补充
- 优点：可确定信息更稳定
- 缺点：规则还比较少

### 20.4 Skill 匹配算法
`skills/loader.js -> selectRelevantSkills`
- skill 名/slug/description/body 的关键词匹配
- 优点：简单透明
- 缺点：没有语义检索

### 20.5 向量嵌入算法
`memory/vector.js -> embedText`
- CJK 感知分词 + n-gram -> FNV-1a 哈希 -> 256 维向量 -> L2 归一化
- 优点：无外部依赖、速度快
- 缺点：无语义理解、碰撞率高

### 20.6 Diff 算法
`utils/diff.js -> unifiedDiff`
- LCS（最长公共子序列）行级比较 -> hunk 分组 -> unified diff 格式
- 优点：无外部依赖、结果标准

### 20.7 上下文感知搜索替换
`tools/search-replace.js -> searchAndReplace`
- 4 策略降级：exact -> context -> line -> normalized
- 优点：健壮、解决格式化破坏匹配

### 20.8 工具编排算法
`agent/orchestration.js -> partitionTools`
- 只读工具并行执行（并发 5）+ 写入工具串行执行
- 优点：效率高、保持写入顺序

---

## 21. 当前架构优点

- 本地优先，配置和记忆落盘清晰
- 模块边界清晰
- provider 抽象简单直接
- 支持工作区、记忆、skills 三种上下文源
- 工具循环支持并行只读 + 串行写入
- GUI 两阶段启动（即时响应 + 后台初始化）
- 原生 Git 工具绕过 bash 安全限制
- 上下文感知搜索替换解决格式化问题
- 测试覆盖关键中枢能力
- 文档体系已经形成

---

## 22. 当前主要不足

- `src/cli.js` 仍然偏长
- `chat.js` 依然承担太多编排职责
- 工作区相关性检索仍然是关键词级
- 向量检索无语义理解
- 没有统一日志与调试层
- 没有端到端命令测试
- GUI 功能不全（文件树已实现，diff 已实现，但附件后端已连接、设置面板仍有限）
- 无多模态输入（图片分析等）
- 无交互式终端
- Tauri CSP 禁用

---

## 23. 后续优化方向

### 第一优先级
- 命令注册抽成统一 registry
- provider 增加更完善的流式输出
- 增加更详细的连通性诊断

### 第二优先级
- 引入语义检索或 embedding 检索
- 增强记忆重要度评分与过期策略
- skill 增加强约束和更多元数据

### 第三优先级
- 引入 RAG
- 引入多 Agent 协作
- 引入 IDE 集成
- 补丁预览与交互确认

### 第四优先级
- 真正电脑控制层
- 权限模型和审计日志
- 插件化 provider / skill / tool 系统
- 多媒体处理（图片/视频/音频）
- 多模态模型支持

---

## 24. 一句总结

`Frees Agent` 当前已经是一个具有 CLI 命令层、模型层、工作区层、记忆层、技能层、工具层、GUI 层、文档层的完整工程。下一阶段重点是把功能继续模块化、把算法继续做强、把项目继续做成长期可维护的产品工程。
