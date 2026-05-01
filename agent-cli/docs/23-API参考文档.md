# Frees-Agent API 参考文档

本文档提供 Frees-Agent 所有模块的完整 API 参考，供二次开发和集成使用。涵盖模块导出函数、类、配置系统和会话管理。

---

## 目录

1. [CLI 入口](#cli-入口-srcclijs)
2. [命令系统](#命令系统-srccommands)
3. [Agent 系统](#agent-系统-srcagent)
4. [记忆系统](#记忆系统-srcmemory)
5. [工具函数](#工具函数-srcutils)
6. [Shell 执行](#shell-执行-srcshell)
7. [UI 系统](#ui-系统-srcui)
8. [工作区系统](#工作区系统-srcworkspace)
9. [配置文件 API](#配置文件-api)
10. [会话管理](#会话管理)
11. [WebSocket 事件](#websocket-事件)
12. [事件系统](#事件系统)

---

## CLI 入口 (src/cli.js)

```js
const { main } = require('./src/cli');
```

### main(argv)

Frees-Agent 的 CLI 入口函数。解析命令行参数并路由到对应命令。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `argv` | `string[]` | 是 | 命令行参数数组（通常为 `process.argv.slice(2)`） |

**返回值：** `Promise<void>`，进程退出码通过 `process.exitCode` 设置。

**支持的子命令：**

| 命令 | 功能 |
|------|------|
| `chat` | 启动交互式聊天模式 |
| `docs <topic>` | 查看文档 |
| `files <path>` | 索引工作区文件 |
| `cost <options>` | 统计会话 token 用量 |
| `compact <options>` | 手动触发会话摘要压缩 |
| `permissions` | 查看权限配置 |
| `skills` | 查看可用技能 |

**使用示例：**

```js
// 直接在代码中调用
await main(['chat', '--model', 'claude-sonnet-4-6']);
await main(['docs', 'memory-long-chat']);
await main(['cost', '--model', 'claude-sonnet-4-6']);
```

---

## 命令系统 (src/commands/)

### chat.js

```js
const { runChatCommand } = require('./src/commands/chat');
```

#### runChatCommand(options)

启动聊天模式，包含 REPL (Read-Eval-Print Loop) 循环和工具调用引擎。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `options` | `object` | 是 | 配置选项对象 |
| `options.model` | `string` | 否 | 指定模型名称（如 `"claude-sonnet-4-6"`） |
| `options.maxTokens` | `number` | 否 | 每次响应的最大 token 数 |
| `options.verbose` | `boolean` | 否 | 启用详细日志输出 |

**行为说明：**
1. 加载配置文件和记忆状态
2. 初始化 MCP 客户端（连接所有配置的 MCP 服务器）
3. 读取用户输入
4. 构建提示词（系统提示 + 用户输入 + 历史上下文）
5. 调用 AI 模型 API
6. 如果响应包含工具调用，执行工具并继续循环
7. 输出最终响应到控制台
8. 保存记忆状态

---

## Agent 系统 (src/agent/)

Agent 系统是 Frees-Agent 的核心，负责 AI 模型的交互循环、工具调用编排和提示词管理。

### tools.js

```js
const { createAgentToolbox } = require('./src/agent/tools');
```

#### createAgentToolbox(index, options)

创建统一的工具调用工具箱，包含别名映射、MCP 工具集成和读写工具分类。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `index` | `number` | 是 | Agent 索引号，用于在并发场景中区分不同实例 |
| `options` | `object` | 是 | 配置选项 |
| `options.mcpClients` | `Map` | 否 | MCP 客户端映射表，用于集成 MCP 工具 |
| `options.allowedTools` | `string[]` | 否 | 允许启用的工具白名单 |

**返回值：** `object`
- `{ toolUseFn, toolNames }` 
- `toolUseFn`：工具调用函数
- `toolNames`：已注册的工具名称列表

**工具注册列表：**

| 工具名 | 别名 | 分类 | 说明 |
|--------|------|------|------|
| `list_files` / `glob` | — | 只读 | 列出目录文件，支持 glob 模式 |
| `search_text` / `grep` | — | 只读 | 在文件中搜索文本内容 |
| `read_file` / `read` | — | 只读 | 读取文件内容 |
| `web_fetch` / `fetch` | — | 只读 | 获取网页内容 |
| `write_file` / `write` | — | 写入 | 写入文件内容 |
| `replace_in_file` / `edit` | — | 写入 | 替换文件中的文本 |
| `bash` / `shell` / `execute_command` | — | 写入 | 执行 Shell 命令 |
| `mcp__*` | — | 动态 | MCP 服务器动态注册的工具 |

**读写工具分离机制：**
- **只读工具**（read）：可以并行执行，不修改外部状态
- **写入工具**（write）：必须串行执行，避免竞态条件

---

### prompts.js

```js
const {
  CHAT_SYSTEM_PROMPT,
  EDIT_AGENT_SYSTEM_PROMPT,
  TOOL_DESCRIPTIONS,
  buildChatUserPrompt,
  buildEditUserPrompt
} = require('./src/agent/prompts');
```

#### CHAT_SYSTEM_PROMPT

- **类型：** `string`
- **说明：** 聊天模式的系统提示词。定义 AI 助手的角色、行为规范和可用工具。
- **内容涵盖：**
  - 角色定义
  - 工具使用规范
  - 输出格式要求
  - 安全约束
  - MCP 工具指引

#### EDIT_AGENT_SYSTEM_PROMPT

- **类型：** `string`
- **说明：** 编辑模式的系统提示词。专注于文件编辑和代码修改任务。

#### TOOL_DESCRIPTIONS

- **类型：** `object`
- **说明：** 工具描述字典，包含每个工具的名称、参数说明、行为描述和返回值格式。用于在提示词中向模型描述可用工具。

**结构：**

```js
{
  "list_files": {
    name: "list_files",
    description: "列出指定目录中的文件和子目录",
    parameters: {
      path: "string - 要列出的目录路径"
    }
  },
  // ... 更多工具
}
```

#### buildChatUserPrompt({...})

构建聊天模式的用户提示词。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `options.userMessage` | `string` | 是 | 用户输入的消息 |
| `options.systemPrompt` | `string` | 否 | 可选的额外系统指令 |
| `options.context` | `string` | 否 | 额外的上下文信息 |

**返回值：** `string` - 构建完成的用户提示词

#### buildEditUserPrompt({...})

构建编辑模式的用户提示词。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `options.userMessage` | `string` | 是 | 用户输入的消息 |
| `options.files` | `string[]` | 否 | 相关文件列表 |

**返回值：** `string` - 构建完成的用户提示词

---

### chat-tool-loop.js

```js
const { runChatToolAgent } = require('./src/agent/chat-tool-loop');
```

#### runChatToolAgent({...})

运行聊天工具循环，是 Frees-Agent 聊天模式的核心执行引擎。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `options.messages` | `object[]` | 是 | 消息历史数组 |
| `options.toolUseFn` | `function` | 是 | 工具调用函数 |
| `options.toolNames` | `string[]` | 是 | 可用工具名称列表 |
| `options.systemPrompt` | `string` | 是 | 系统提示词 |
| `options.model` | `string` | 否 | 模型名称 |
| `options.maxTokens` | `number` | 否 | 最大 token 数 |

**返回值：** `Promise<object>`
- `{ messages, content }`
- `messages`：更新后的消息数组（包含工具调用和响应）
- `content`：最终文本响应内容

**核心特性：**
1. **重试逻辑**：API 调用失败时自动重试，最多 3 次
2. **消息裁剪**：超出上下文窗口时自动裁剪历史消息
3. **结果截断**：工具返回结果超过限制时自动截断
4. **循环终止**：支持最大迭代次数防止无限循环

**执行流程：**

```
用户输入 → 构建消息 → API 调用 → 检查响应
                                  ├── 包含工具调用 → 执行工具 → 继续循环
                                  └── 纯文本响应 → 返回结果
```

---

### edit-loop.js

```js
const { runEditAgent } = require('./src/agent/edit-loop');
```

#### runEditAgent({...})

运行编辑 Agent 循环，专注于文件编辑任务。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `options.messages` | `object[]` | 是 | 消息历史数组 |
| `options.toolUseFn` | `function` | 是 | 工具调用函数 |
| `options.toolNames` | `string[]` | 是 | 可用工具名称列表 |
| `options.maxSteps` | `number` | 否 | 最大执行步数（默认值：20） |

**返回值：** `Promise<object>`
- `{ messages, success }`
- `messages`：更新后的消息数组
- `success`：编辑任务是否成功完成

---

### reasoning.js

```js
const { buildExecutionPlan, reflectAndRevise } = require('./src/agent/reasoning');
```

#### buildExecutionPlan({...})

生成执行计划，支持多步任务分解。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `options.task` | `string` | 是 | 任务描述 |
| `options.context` | `string` | 否 | 上下文信息 |
| `options.availableTools` | `string[]` | 否 | 可用工具列表 |

**返回值：** `object`
- `{ steps, reasoning }`
- `steps`：分解后的执行步骤数组
- `reasoning`：分解思路说明

#### reflectAndRevise({...})

对 AI 回答进行质量检查和修正。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `options.question` | `string` | 是 | 原始问题 |
| `options.answer` | `string` | 是 | AI 生成的回答 |
| `options.evidence` | `string[]` | 否 | 参考资料 |

**返回值：** `object`
- `{ revised, changes }`
- `revised`：修正后的回答
- `changes`：所做的修改说明

---

### orchestration.js

```js
const { partitionTools, executeToolBatch, formatToolResults } = require('./src/agent/orchestration');
```

#### partitionTools(toolUses)

将工具调用分为只读（可并发执行）和写入（需串行执行）两组。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `toolUses` | `object[]` | 是 | 工具调用数组 |

**返回值：** `{ readTools: object[], writeTools: object[] }`

#### executeToolBatch(toolUses, runToolFn, options)

并发执行一组只读工具调用。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `toolUses` | `object[]` | 是 | 工具调用数组 |
| `runToolFn` | `function` | 是 | 执行单个工具的函数 |
| `options.concurrency` | `number` | 否 | 最大并发数（默认值：5） |

**返回值：** `Promise<object[]>` - 工具执行结果数组

#### formatToolResults(results)

将工具执行结果格式化为模型可读的文本格式。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `results` | `object[]` | 是 | 工具执行结果数组 |

**返回值：** `string` - 格式化的文本结果

---

## 记忆系统 (src/memory/)

记忆系统是 Frees-Agent 的核心架构之一，实现多层记忆管理：长期记忆、短期记忆、向量记忆和任务记忆。

### store.js

```js
const {
  createMemoryStore,
  loadMemoryState,
  saveMemoryState,
  mergeMemoryExtraction,
  appendTurnToSession,
  getRecentMessagesForModel,
  clearMemoryState
} = require('./src/memory/store');
```

#### createMemoryStore({...})

创建记忆存储实例，管理所有类型的记忆。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `options.storeDir` | `string` | 是 | 记忆存储目录路径 |
| `options.config` | `object` | 否 | 配置选项 |

**返回值：** `object` - 记忆存储实例

#### loadMemoryState(store, config)

从磁盘加载所有记忆状态。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `store` | `object` | 是 | 记忆存储实例 |
| `config` | `object` | 是 | 配置对象 |

**返回值：** `Promise<object>` - 记忆状态对象

#### saveMemoryState(state)

将所有记忆状态持久化到磁盘。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `state` | `object` | 是 | 记忆状态对象 |

**返回值：** `Promise<void>`

#### mergeMemoryExtraction(state, extraction, config)

将 AI 提取的结构化记忆合并到当前记忆中。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `state` | `object` | 是 | 当前记忆状态 |
| `extraction` | `object` | 是 | 提取的记忆数据 |
| `config` | `object` | 是 | 合并配置 |

**返回值：** `object` - 更新后的记忆状态

#### appendTurnToSession(state, userMessage, assistantMessage)

将一轮对话追加到当前会话中。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `state` | `object` | 是 | 记忆状态 |
| `userMessage` | `object` | 是 | 用户消息对象 |
| `assistantMessage` | `object` | 是 | 助手消息对象 |

**返回值：** `void`

#### getRecentMessagesForModel(state)

获取发送给模型的最新消息（经过裁剪和排序）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `state` | `object` | 是 | 记忆状态 |

**返回值：** `object[]` - 消息数组

#### clearMemoryState(state, options)

清除记忆状态，支持选择性清除。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `state` | `object` | 是 | 记忆状态 |
| `options` | `object` | 否 | 清除选项 |
| `options.clearAll` | `boolean` | 否 | 是否清除全部 |
| `options.clearSessions` | `boolean` | 否 | 是否清除会话历史 |

**返回值：** `void`

---

### heuristics.js

```js
const {
  isLikelyValidName,
  sanitizeProfilePatch,
  inferLocalMemory,
  resolveLocalChatShortcut
} = require('./src/memory/heuristics');
```

#### isLikelyValidName(value)

校验字符串是否为合法姓名。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `string` | 是 | 待校验的字符串 |

**返回值：** `boolean`

**校验规则：**
- 长度在 2-30 个字符之间
- 包含汉字或英文字母
- 不全是标点符号或数字
- 支持中英文姓名格式

#### sanitizeProfilePatch(profile)

清洗和校验用户画像字段，移除不安全或无效数据。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `profile` | `object` | 是 | 用户画像对象 |

**返回值：** `object` - 清洗后的画像

#### inferLocalMemory(userMessage)

从用户消息中推断本地记忆信息（如地点、偏好、上下文）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `userMessage` | `string` | 是 | 用户消息文本 |

**返回值：** `object|null` - 提取的记忆信息，无可提取内容时返回 null

#### resolveLocalChatShortcut(message, state)

处理本地快捷回复（如缩写、惯用语、模板回复）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | `string` | 是 | 用户消息 |
| `state` | `object` | 是 | 当前记忆状态 |

**返回值：** `string` - 解析后的完整消息

---

### vector.js

```js
const { embedText, loadVectorIndex, upsertDurableMemoriesToVectorIndex, queryVectorMemories } = require('./src/memory/vector');
```

向量记忆系统使用 FNV-1a 哈希生成 256 维嵌入向量，配合 CJK 感知的 n-gram 分词实现跨语言相似度搜索。

#### embedText(text)

将文本转换为 256 维向量（基于 FNV-1a 哈希算法）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | `string` | 是 | 输入文本 |

**返回值：** `number[]` - 256 维浮点数向量

**算法特点：**
- 零外部依赖：无需调用第三方 embedding API
- CJK 感知：对中日韩文进行 n-gram (2-4) 分词
- 确定性：相同输入始终产生相同向量
- 轻量级：计算速度快，适合本地运行

#### loadVectorIndex(vectorPath)

从磁盘加载向量索引。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `vectorPath` | `string` | 是 | 向量索引文件路径 |

**返回值：** `Promise<object>` - 向量索引对象

#### upsertDurableMemoriesToVectorIndex(vectorPath, memories)

将持久化记忆更新到向量索引中（插入或更新）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `vectorPath` | `string` | 是 | 向量索引文件路径 |
| `memories` | `object[]` | 是 | 记忆数组 |

**返回值：** `Promise<void>`

#### queryVectorMemories(vectorPath, query, topK)

查询与输入最相似的记忆。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `vectorPath` | `string` | 是 | 向量索引文件路径 |
| `query` | `string` | 是 | 查询文本 |
| `topK` | `number` | 是 | 返回最相似的 topK 条结果 |

**返回值：** `Promise<object[]>`
- 每个结果包含 `{ memory, score }`
- `score` 为余弦相似度，范围 [0, 1]
- 默认召回阈值低至 0.06

---

### tasks.js

```js
const { loadTasks } = require('./src/memory/tasks');
```

#### loadTasks(store, config)

加载全局和本地任务记忆，进行层级合并。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `store` | `object` | 是 | 记忆存储实例 |
| `config` | `object` | 是 | 配置对象 |

**返回值：** `Promise<object[]>` - 合并后的任务列表

---

### ingest.js

```js
const { ingestMemory } = require('./src/memory/ingest');
```

#### ingestMemory(messages, config)

语义提取管线：使用 AI 模型从对话中提取结构化记忆，同时使用正则方式提取直接信息。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `messages` | `object[]` | 是 | 对话消息数组 |
| `config` | `object` | 是 | 配置对象 |

**返回值：** `Promise<object>`
- 包含提取的用户画像、关键事实、偏好、任务等结构化记忆

---

## 工具函数 (src/utils/)

工具函数模块是纯函数集合，零外部依赖，仅使用 Node.js 内置模块。适用于在 Frees-Agent 外部直接引用。

### slug.js

```js
const { shortHash, slugify, generateWordSlug, generateShortWordSlug } = require('./src/utils/slug');
```

| 函数 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `shortHash(text)` | `text: string` | `string` | 对文本进行哈希，生成短 ID（前 8 位 hex） |
| `slugify(text, fallback)` | `text: string, fallback?: string` | `string` | 将文本转为 URL 友好的 slug |
| `generateWordSlug()` | 无 | `string` | 生成语义化 slug（形容词-动词-名词组合） |
| `generateShortWordSlug()` | 无 | `string` | 生成短版语义化 slug |

### sleep.js

```js
const { sleep, createAbortController } = require('./src/utils/sleep');
```

| 函数 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `sleep(ms, signal)` | `ms: number, signal?: AbortSignal` | `Promise<void>` | 延迟指定毫秒数，支持 AbortSignal 取消 |
| `createAbortController(timeoutMs)` | `timeoutMs: number` | `AbortController` | 创建带超时的 AbortController |

### which.js

```js
const { which, whichSync } = require('./src/utils/which');
```

| 函数 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `which(name)` | `name: string` | `Promise<string|null>` | 在 PATH 中查找可执行文件，返回完整路径 |
| `whichSync(name)` | `name: string` | `string|null` | which 的同步版本 |

**跨平台行为：**
- macOS/Linux：搜索 PATH 目录
- Windows：额外搜索 PATHEXT 中定义的扩展名（.exe, .bat, .cmd 等）

### uuid.js

```js
const { generateAgentId, isValidUUID } = require('./src/utils/uuid');
```

| 函数 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `generateAgentId()` | 无 | `string` | 生成唯一 Agent ID（UUID v4 格式） |
| `isValidUUID(value)` | `value: string` | `boolean` | 校验字符串是否为有效 UUID |

### memoize.js

```js
const { memoize } = require('./src/utils/memoize');
```

| 函数 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `memoize(fn, options)` | `fn: Function, options?: { ttl?: number }` | `Function` | 创建带缓存的结果缓存函数，支持过期时间 |

**使用示例：**

```js
const cachedFn = memoize(expensiveOperation, { ttl: 60000 }); // 60 秒缓存
cachedFn('arg1'); // 首次调用，执行原始函数
cachedFn('arg1'); // 命中缓存，直接返回
```

### ripgrep.js

```js
const { detectRipgrep, searchWithRipgrep } = require('./src/utils/ripgrep');
```

| 函数 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `detectRipgrep()` | 无 | `Promise<boolean>` | 检测系统是否安装了 ripgrep |
| `searchWithRipgrep(pattern, options)` | `pattern: string, options: object` | `Promise<object[]>` | 使用 ripgrep 执行正则搜索 |

**searchWithRipgrep 选项：**

| 选项 | 类型 | 说明 |
|------|------|------|
| `options.cwd` | `string` | 搜索目录 |
| `options.maxResults` | `number` | 最大结果数 |
| `options.glob` | `string[]` | 文件 glob 模式过滤 |
| `options.encoding` | `string` | 文件编码 |

### theme.js

```js
const { getTheme, applyTheme } = require('./src/utils/theme');
```

| 函数 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `getTheme(name)` | `name: string` | `object` | 获取主题定义（color scheme） |
| `applyTheme(text, key, theme)` | `text: string, key: string, theme: object` | `string` | 对文本应用主题样式，返回 ANSI 转义序列包裹的字符串 |

**可用主题：** `dark`, `light`, `dark-ansi`, `light-ansi`

### truncate.js

```js
const { stringWidth, truncateToWidth, truncate } = require('./src/utils/truncate');
```

| 函数 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `stringWidth(str)` | `str: string` | `number` | 计算字符串的显示宽度（CJK 字符按 2 宽度计算） |
| `truncateToWidth(text, width)` | `text: string, width: number` | `string` | 按显示宽度截断文本 |
| `truncate(str, maxWidth, singleLine)` | `str: string, maxWidth: number, singleLine?: boolean` | `string` | 通用截断函数，支持单行模式 |

### treeify.js

```js
const { treeify } = require('./src/utils/treeify');
```

| 函数 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `treeify(items, options)` | `items: object[], options: object` | `string` | 将层级数据渲染为 Unicode 树形结构，支持循环引用检测 |

### json.js

```js
const { extractFirstJsonObject, truncateForModel } = require('./src/utils/json');
```

| 函数 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `extractFirstJsonObject(text)` | `text: string` | `object|null` | 从文本中安全提取首个 JSON 对象（容错解析） |
| `truncateForModel(text, maxLength)` | `text: string, maxLength: number` | `string` | 按模型 token 限制截断文本 |

### files.js

```js
const { isProbablyTextFile, formatBytes } = require('./src/utils/files');
```

| 函数 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `isProbablyTextFile(filePath)` | `filePath: string` | `Promise<boolean>` | 通过内容嗅探判断文件是否为文本文件 |
| `formatBytes(bytes)` | `bytes: number` | `string` | 将字节数格式化为可读字符串（如 "1.5 MB"） |

### git.js

```js
const { findGitRoot, getBranch, getGitState } = require('./src/utils/git');
```

| 函数 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `findGitRoot(cwd)` | `cwd: string` | `Promise<string|null>` | 从当前目录向上查找 Git 根目录 |
| `getBranch(cwd)` | `cwd: string` | `Promise<string>` | 获取当前 Git 分支名 |
| `getGitState(cwd)` | `cwd: string` | `Promise<object>` | 获取完整 Git 仓库状态（根目录、分支、远程、变更文件、提交状态） |

---

## Shell 执行 (src/shell/)

### shell-exec.js

```js
const { validateShellCommand, execShell, detectShell } = require('./src/shell/shell-exec');
```

#### validateShellCommand(command)

验证 Shell 命令的安全性，拦截危险操作。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `command` | `string` | 是 | 待验证的 Shell 命令 |

**返回值：** `{ valid: boolean, reason?: string }`
- `valid: true` 表示命令安全
- `valid: false` 表示检测到危险模式，`reason` 说明原因

**拦截的危险命令模式（7 种）：**
1. `rm -rf /` - 删除根目录
2. `mkfs` / `format` - 格式化磁盘
3. `dd if=/dev/zero` - 覆写磁盘
4. `:(){ :\|:& };:` - fork 炸弹
5. `chmod -R 000 /` - 移除所有文件权限
6. `> /dev/[sh]da` - 直接写入块设备
7. `wget ... \| bash` - 远程下载并执行

#### execShell(command, options)

安全执行 Shell 命令并返回结果。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `command` | `string` | 是 | 要执行的命令 |
| `options` | `object` | 否 | 执行选项 |
| `options.timeout` | `number` | 否 | 超时时间（毫秒） |
| `options.cwd` | `string` | 否 | 工作目录 |
| `options.signal` | `AbortSignal` | 否 | 取消信号 |

**返回值：** `Promise<object>`
- `{ stdout, stderr, exitCode }`
- 输出自动截断（1MB 上限）

#### detectShell()

检测当前系统的默认 Shell。

**返回值：** `object`
- `{ shell: string, platform: string }`
- 自动检测 bash/zsh/cmd/powershell

---

## UI 系统 (src/ui/)

### banner.js

```js
const { printFreesAgentBanner, printMiniBanner } = require('./src/ui/banner');
```

| 函数 | 参数 | 说明 |
|------|------|------|
| `printFreesAgentBanner(runtime, options)` | `runtime: object, options?: object` | 打印 Frees-Agent 启动横幅（ASCII art + 版本信息） |
| `printMiniBanner(text, options)` | `text: string, options?: object` | 打印小型横幅 |

### mascot.js

```js
const { Mascot, formatUserMessage, formatAssistantMessage, formatError, formatSuccess } = require('./src/ui/mascot');
```

| 导出 | 类型 | 说明 |
|------|------|------|
| `Mascot` | 类 | 桌宠组件，用于在命令行中显示动态表情 |
| `formatUserMessage()` | 函数 | 格式化用户消息的显示样式 |
| `formatAssistantMessage()` | 函数 | 格式化 AI 助手消息的显示样式 |
| `formatError()` | 函数 | 格式化错误消息（红色高亮） |
| `formatSuccess()` | 函数 | 格式化成功消息（绿色高亮） |

### status-bar.js

```js
const { StatusLine, divider, panel } = require('./src/ui/status-bar');
```

| 导出 | 类型 | 说明 |
|------|------|------|
| `StatusLine` | 类 | 动态状态行组件，显示实时信息（模型、token 用量等） |
| `divider()` | 函数 | 打印分隔线 |
| `panel()` | 函数 | 打印面板组件 |

### progress.js

```js
const { Spinner, ThinkingIndicator, ProgressBar } = require('./src/ui/progress');
```

| 导出 | 类型 | 说明 |
|------|------|------|
| `Spinner` | 类 | 旋转加载动画 |
| `ThinkingIndicator` | 类 | "思考中" 指示器 |
| `ProgressBar` | 类 | 进度条组件 |

---

## 工作区系统 (src/workspace/)

### indexer.js

```js
const { indexWorkspace } = require('./src/workspace/indexer');
```

#### indexWorkspace(rootPath, options)

递归扫描工作区文件索引。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `rootPath` | `string` | 是 | 工作区根目录 |
| `options` | `object` | 否 | 配置选项 |
| `options.maxSize` | `number` | 否 | 最大扫描预算（字节），默认 24MB |
| `options.ignorePatterns` | `string[]` | 否 | 忽略的文件 glob 模式 |

**返回值：** `Promise<object[]>` - 文件索引数组

### queries.js

```js
const { readFileWithLineNumbers, smartStringMatch } = require('./src/workspace/queries');
```

#### readFileWithLineNumbers(filePath)

读取文件并添加行号标注。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `filePath` | `string` | 是 | 文件路径 |

**返回值：** `Promise<string>` - 带行号的文件内容

#### smartStringMatch(pattern, content, options)

智能字符串匹配，支持引号归一化和邻近行提示。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `pattern` | `string` | 是 | 搜索模式 |
| `content` | `string` | 是 | 搜索内容 |
| `options` | `object` | 否 | 配置选项 |

**匹配策略：**
1. 精确匹配
2. 引号归一化匹配（弯引号 → 直引号）
3. 邻近行 hint 反馈

**返回值：** `Promise<object[]>` - 匹配结果数组

### context.js

```js
const { buildFileContext } = require('./src/workspace/context');
```

#### buildFileContext(files, options)

将一组相关文件组装为上下文文本。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `files` | `string[]` | 是 | 文件路径列表 |
| `options` | `object` | 否 | 配置选项 |

**返回值：** `Promise<string>` - 组装好的上下文文本

---

## 配置文件 API

Frees-Agent 的配置文件为 `frees-agent.yaml`，位于项目根目录或用户主目录的 `.config/frees-agent/` 下。

### 配置结构

```yaml
# 顶层配置字段
mcpServers:          # MCP 服务器配置（对象）
  <server-name>:     # 自定义服务器名
    command: string  # 启动命令
    args: string[]   # 命令行参数
    env: object      # 环境变量（可选）

tools:               # 工具行为配置
  webSearch:         # 网络搜索配置
    enabled: boolean
    maxResults: number

agent:               # Agent 行为配置
  autonomous:        # 自主模式配置
    enabled: boolean
    maxSubTasks: number

memory:              # 记忆系统配置
  storeDir: string   # 记忆存储目录
  maxMemories: number # 最大记忆条数
  vectorPath: string # 向量索引路径
  syncRoots: string[] # 跨设备同步根目录列表

model:               # 模型配置
  provider: string   # 模型提供商（anthropic, openai, local）
  name: string       # 模型名称
  maxTokens: number  # 最大 token 数
  temperature: number # 温度参数
```

### 程序化配置加载

```js
const { loadConfig } = require('./src/config/loader');  // 假设的路径

// 加载配置
const config = await loadConfig('frees-agent.yaml');
console.log(config.mcpServers);
console.log(config.tools);
```

---

## 会话管理

Frees-Agent 的会话管理由记忆系统自动处理，无需手动操作。

### 会话生命周期

```
启动 → 加载记忆 → 创建/恢复会话 → 对话循环 → 保存记忆 → 退出
                                                   ↓
                                              周期性自动保存
```

### 手动操作命令

```bash
# 统计会话 token 用量
frees-agent cost --model claude-sonnet-4-6

# 手动触发压缩
frees-agent compact --model claude-sonnet-4-6
```

### 会话数据存储位置

会话数据存储在配置的 `memory.storeDir` 目录中，通常位于：

- `~/.frees-agent/memory/sessions/`
- 或自定义的 `syncRoots` 目录

---

## WebSocket 事件

> **注意**：Frees-Agent 当前的 WebSocket 事件系统为预留架构，对标准 CLI 模式下的使用非必需。以下为事件架构说明，供 GUI 模式或远程控制模式开发参考。

### 事件类型

| 事件名 | 方向 | 说明 |
|--------|------|------|
| `agent:thinking` | 服务器 → 客户端 | AI 模型正在思考/生成 |
| `agent:tool_call` | 服务器 → 客户端 | AI 模型发起工具调用 |
| `agent:tool_result` | 服务器 → 客户端 | 工具调用返回结果 |
| `agent:response` | 服务器 → 客户端 | AI 模型生成最终响应 |
| `agent:error` | 服务器 → 客户端 | 发生错误 |
| `session:create` | 服务器 → 客户端 | 新会话创建 |
| `session:update` | 服务器 → 客户端 | 会话状态更新 |
| `memory:save` | 服务器 → 客户端 | 记忆保存完成 |
| `memory:load` | 服务器 → 客户端 | 记忆加载完成 |

### 事件数据格式

```json
{
  "event": "agent:tool_call",
  "data": {
    "tool": "read_file",
    "arguments": { "path": "/path/to/file" },
    "timestamp": 1700000000000
  }
}
```

---

## 事件系统

Frees-Agent 内置了一个轻量级事件发射器，用于内部模块间通信。

### 核心事件

| 事件 | 触发时机 | 数据 |
|------|----------|------|
| `beforeToolCall` | 工具执行前 | `{ toolName, args }` |
| `afterToolCall` | 工具执行后 | `{ toolName, result, duration }` |
| `modelRequest` | AI 模型请求前 | `{ messages, model }` |
| `modelResponse` | AI 模型响应后 | `{ content, usage }` |
| `memoryUpdated` | 记忆更新后 | `{ memoryType, count }` |
| `sessionRotated` | 会话轮转时 | `{ oldSessionId, newSessionId }` |
| `error` | 发生可恢复错误时 | `{ error, context }` |

### 事件监听

```js
const emitter = getEventEmitter(); // 获取全局事件发射器

emitter.on('beforeToolCall', ({ toolName, args }) => {
  console.log(`准备执行工具: ${toolName}`);
});

emitter.on('modelRequest', ({ messages, model }) => {
  console.log(`发送请求到 ${model}，消息数: ${messages.length}`);
});
```
