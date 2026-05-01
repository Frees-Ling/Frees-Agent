# 如何拓展开发 Frees Agent

这份文档面向后续继续维护和扩展 `Frees Agent` 的开发者。无论你是想添加一个新命令、接入一个新的模型提供商、增加一个自定义工具，还是深入修改记忆系统或 Skill 加载机制，本文都会提供逐步指引和设计原理说明。

---

## 1. 概述与核心理念

Frees Agent 的架构围绕以下核心设计原则展开：

- **关注点分离**：每个模块只负责一件事情。命令层不直接调用模型，模型层不关心 UI 展示。
- **可插拔**：Provider、工具、记忆后端都通过统一的接口注册，新增模块不需要修改核心循环。
- **零外部依赖**：工具函数层（`src/utils/`）仅使用 Node.js 内置模块，降低维护成本。
- **渐进式复杂度**：简单场景一条命令搞定，复杂场景通过 Agent 循环、规划层、反思层逐步叠加能力。

理解这些原则后，后续的扩展方式就变得自然了。

---

## 2. 项目模块架构全景

```
src/
├── cli.js                  # 入口：解析 argv → 路由到命令
├── commands/               # 命令层：每个命令一个文件
│   ├── chat.js             # 终端聊天（核心入口）
│   ├── edit.js             # Agent 式自动代码编辑
│   ├── complete.js         # 代码补全
│   ├── doctor.js           # 系统诊断
│   ├── config.js           # 配置初始化与查看
│   ├── memory.js           # 记忆管理
│   ├── docs.js             # 内置文档查看
│   ├── permissions.js      # 系统权限引导
│   ├── skills.js           # Skill 加载与查看
│   ├── compact.js          # 会话摘要压缩
│   ├── cost.js             # Token 用量统计
│   └── files.js            # 工作区索引文件列表
├── agent/                  # Agent 循环 + 工具系统
│   ├── chat-tool-loop.js   # 聊天模式工具循环
│   ├── edit-loop.js        # 编辑模式 Agent 循环
│   ├── orchestration.js    # 工具编排（读写分区、并发控制）
│   ├── prompts.js          # 系统提示词 + 工具描述
│   ├── tools.js            # 统一工具箱（别名映射、MCP 集成）
│   └── reasoning.js        # 规划层与反思层
├── model/                  # 模型 provider 抽象层
│   ├── index.js            # Provider 注册中心
│   ├── anthropic.js        # Anthropic API 客户端
│   ├── openai-compatible.js # OpenAI 兼容 API 客户端
│   └── ollama.js           # Ollama 客户端
├── workspace/              # 工作区扫描与文件操作
│   ├── indexer.js          # 递归扫描，24MB 预算保护
│   ├── queries.js          # 文件读取（行号标注、智能匹配）
│   └── context.js          # 相关文件上下文组装
├── memory/                 # 记忆系统
│   ├── store.js            # 核心：加载/保存/合并/迁移
│   ├── heuristics.js       # 启发式提取（正则匹配）
│   ├── ingest.js           # 语义提取管线（LLM 调用）
│   ├── vector.js           # 向量化搜索（FNV-1a 嵌入）
│   └── tasks.js            # 任务记忆加载与合并
├── shell/                  # Shell 执行框架
│   └── shell-exec.js       # 安全执行、危险命令拦截
├── skills/                 # Skill 文件加载与匹配
│   ├── loader.js           # Skill 内容加载
│   └── matcher.js          # Skill 匹配与注入
├── ui/                     # 终端展示层
│   ├── banner.js           # 启动横幅
│   ├── mascot.js           # 桌宠与消息格式化
│   ├── status-bar.js       # 状态行与 UI 组件
│   └── progress.js         # 进度指示器
└── utils/                  # 零外部依赖工具函数
    ├── slug.js             # Agent ID 哈希、语义化 slug
    ├── sleep.js            # AbortSignal 感知延迟
    ├── which.js            # 跨平台可执行文件查找
    ├── uuid.js             # UUID 生成与校验
    ├── memoize.js          # 内联缓存
    ├── ripgrep.js          # 正则搜索
    ├── theme.js            # 主题系统
    ├── truncate.js         # ANSI 感知文本截断
    ├── treeify.js          # 树形渲染
    ├── json.js             # JSON 安全解析
    ├── files.js            # 文件类型检测
    ├── git.js              # Git 仓库查询
    └── ultraplan/          # 增强规划
        └── keyword.js      # 关键词检测
```

---

## 3. 如何增加一个新命令

### 3.1 基本步骤

**第一步**：在 `src/commands/` 下新增文件，导出一个 `runXxxCommand` 函数：

```js
// src/commands/analyze.js
export async function runAnalyzeCommand(options) {
  const { workspace, verbose } = options;
  // 你的业务逻辑
  const results = await performAnalysis(workspace);
  // 使用 ui 模块输出
  console.log(`Analysis complete: ${results.summary}`);
}
```

**第二步**：在 `src/cli.js` 中注册路由：

```js
import { runAnalyzeCommand } from './commands/analyze.js';

// 在命令路由映射中添加：
'analyze': {
  run: runAnalyzeCommand,
  description: '分析工作区代码质量指标',
},
```

**第三步**：在 `README` 和 `docs/` 里补充使用说明。

### 3.2 命令层的职责边界

命令层应该做的事情：
- 解析和验证命令行参数
- 调用下层服务模块
- 格式化并输出结果

命令层不应该做的事情：
- 直接调用模型 API（应该通过 `src/model/`）
- 实现复杂的业务逻辑（应该下沉到独立模块）
- 修改其他模块的内部状态

### 3.3 参数解析模式

Frees Agent 使用 Commander.js 或自定义参数解析。推荐模式：

```js
export async function runAnalyzeCommand(options) {
  const {
    workspace = '.',
    verbose = false,
    output = 'text',   // text | json | silent
  } = options;

  // 校验
  if (!fs.existsSync(workspace)) {
    console.error(`Workspace not found: ${workspace}`);
    process.exit(1);
  }
}
```

---

## 4. 如何增加一个新工具

工具箱（toolbox）实现在 `src/agent/tools.js`，统一管理所有工具的注册、描述、执行和别名。

### 4.1 三步注册法

**第一步**：在 `runTool` 函数中添加工具逻辑

```js
// src/agent/tools.js
async function runTool(toolName, args, context) {
  switch (toolName) {
    // ... 已有工具 ...

    case 'my_new_tool': {
      const param = String(args.param || '').trim();
      if (!param) {
        throw new ToolError('my_new_tool 需要 param 参数');
      }
      const data = await doSomethingUseful(param);
      return { ok: true, data };
    }
  }
}
```

**第二步**：在 `getToolList` 函数中添加工具描述

```js
function getToolList() {
  return [
    // ... 已有工具 ...
    {
      name: 'my_new_tool',
      description: '执行某项自定义操作，需要 param 参数指定目标',
      parameters: {
        type: 'object',
        properties: {
          param: {
            type: 'string',
            description: '操作目标的标识符',
          },
        },
        required: ['param'],
      },
    },
  ];
}
```

**第三步**：在 `src/agent/prompts.js` 的 `TOOL_DESCRIPTIONS` 或 `CHAT_TOOL_SYSTEM_PROMPT` 中添加用法说明，让模型知道工具的存在。

```js
// src/agent/prompts.js
TOOL_DESCRIPTIONS.my_new_tool = `
## my_new_tool
执行某项自定义操作。当你需要处理 X 场景时使用。

参数:
- param (必需): 操作目标的标识符

示例:
- 处理特定目标: <invoke name="my_new_tool"><parameter name="param">target_id</parameter></invoke>
`;
```

### 4.2 工具分类与执行策略

工具按读写性质分为两类，这对执行策略很重要：

| 分类 | 特点 | 执行策略 | 示例 |
|------|------|----------|------|
| 只读工具 | 不修改系统状态 | 可并发执行 | `list_files`, `read_file`, `search_text`, `web_fetch` |
| 写入工具 | 会修改系统状态 | 串行执行 | `write_file`, `replace_in_file`, `bash` |

这个分类在 `src/agent/orchestration.js` 的 `partitionTools` 函数中实现：

```js
export function partitionTools(toolUses) {
  const readTools = new Set(['list_files', 'search_text', 'read_file', 'glob', 'grep', 'read', 'web_fetch', 'fetch']);
  const readOnly = [];
  const write = [];
  for (const use of toolUses) {
    if (readTools.has(use.name)) {
      readOnly.push(use);
    } else {
      write.push(use);
    }
  }
  return { readOnly, write };
}
```

添加新工具时，需要在 `readTools` 集合中注册分类。

### 4.3 MCP 工具集成

如果你的工具需要外部服务，考虑封装为 MCP 服务器，通过 `mcpServers` 配置注入。`tools.js` 中的 MCP 处理逻辑会自动把 MCP 工具合并到工具箱中。

```json
{
  "mcpServers": {
    "my-service": {
      "command": "npx",
      "args": ["@my-org/mcp-server"],
      "env": {
        "MY_API_KEY": "your-key-here"
      }
    }
  }
}
```

MCP 工具会自动以 `mcp__<tool_name>` 的命名空间注册，模型可以通过这个别名调用。

### 4.4 工具开发最佳实践

1. **错误处理**：工具应该抛出有意义的错误信息，不要吞异常
2. **参数校验**：在工具函数入口校验所有必需参数
3. **结果截断**：工具返回的结果应该控制大小（参考 `truncateForModel`），防止撑爆上下文窗口
4. **幂等性**：只读工具应该是幂等的，多次调用返回相同结果
5. **日志记录**：重要操作添加日志，便于调试

---

## 5. 如何增加一个新的模型 Provider

模型层设计为抽象工厂模式，新增 provider 不需要修改 Agent 循环。

### 5.1 三步接入法

**第一步**：在 `src/model/` 下新增客户端文件

```js
// src/model/my-provider.js
export async function createMyProviderClient(config) {
  const { baseUrl, apiKey, model } = config;

  return {
    // 必需接口：发送消息并获取流式响应
    async *streamChat(messages, options = {}) {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          max_tokens: options.maxTokens,
          temperature: options.temperature ?? 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`Provider error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        // 解析 SSE 格式
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) yield content;
            } catch { /* skip parse errors */ }
          }
        }
      }
    },

    // 可选接口：非流式请求
    async chat(messages, options = {}) {
      // ...
    },

    // 可选接口：模型列表查询
    async listModels() {
      // ...
    },
  };
}
```

**第二步**：在 `src/model/index.js` 注册 provider

```js
// src/model/index.js
import { createMyProviderClient } from './my-provider.js';

const PROVIDER_REGISTRY = {
  anthropic: createAnthropicClient,
  'openai-compatible': createOpenAICompatibleClient,
  ollama: createOllamaClient,
  'my-provider': createMyProviderClient,  // 新增
};
```

**第三步**：在配置文件中增加 provider 配置项

```json
{
  "defaultProvider": "my-provider",
  "providers": {
    "my-provider": {
      "baseUrl": "https://api.my-provider.com/v1",
      "apiKeyEnv": "MY_PROVIDER_API_KEY",
      "model": "my-model-name"
    }
  }
}
```

### 5.2 Provider 接口规范

每个 provider 客户端必须实现以下接口：

```
streamChat(messages, options)
  → AsyncGenerator<string, void, void>
  - messages: Array<{role, content}>
  - options.maxTokens: number
  - options.temperature: number
  - options.signal: AbortSignal（中断信号）
  - yield: 文本片段（string）

chat(messages, options) (推荐实现)
  → Promise<string>
  - 返回完整回复文本
```

### 5.3 Provider 自动回退机制

当 `conversation.autoProviderFallback = true` 时，系统会按可用性自动探活并回退 provider。默认优先顺序：

1. `ollama`（本地最快）
2. `openai-compatible`（LM Studio / vLLM 等）
3. `mcp`（MCP 配置的模型）
4. `anthropic`（云端）

实现逻辑在 `chat.js` 中，核心思路是：如果当前 provider 连接失败，自动尝试列表中的下一个。

---

## 6. 如何扩展记忆系统

记忆系统是 Frees Agent 最复杂的子系统之一，分为多层架构。

### 6.1 当前架构分层

```
用户输入
    │
    ▼
启发式提取 (heuristics.js)  ← 即时正则匹配姓名/目标/偏好
    │
    ▼
语义提取 (ingest.js)        ← LLM 调用进行结构化抽取
    │
    ▼
向量索引 (vector.js)         ← 256 维 FNV-1a 哈希嵌入
    │
    ▼
持久化存储 (store.js)       ← JSON 文件 + 跨设备同步
```

### 6.2 可扩展的方向

**更强的用户画像字段**：
在 `heuristics.js` 中增加新的正则模式：

```js
export function inferLocalMemory(userMessage) {
  const patterns = {
    // 已有
    name: /(?:我叫|我是|I'm|I am|my name is)\s*([^\s，。,]+)/i,
    // 新增：检测时区偏好
    timezone: /(?:时区|timezone|UTC)[+ -]?\d{1,2}/i,
    // 新增：检测编程语言偏好
    language: /(?:主要用|primarily use|prefer)\s*(\w+)\s*(?:开发|编程|program|dev)/i,
  };
  // ...
}
```

**项目级记忆和全局记忆分层**：
在 `store.js` 中可以增加命名空间机制：

```js
const memoryNamespaces = {
  global: {},       // 所有项目共享
  project: {},      // 当前项目特有
  session: {},      // 当前会话临时
};
```

**向量检索强化**：
当前的 `vector.js` 使用 FNV-1a 哈希嵌入（轻量但精度有限），可以替换为真实嵌入模型：

```js
// 替换方案 1：使用本地嵌入模型
import { pipeline } from '@xenova/transformers';
const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

// 替换方案 2：使用云端嵌入 API
async function embedText(text) {
  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  const data = await resp.json();
  return data.data[0].embedding;
}
```

**RAG 召回**：
可以集成文档检索管道，从工作区文档中召回相关内容：

```js
// 新增 src/memory/rag.js
export async function retrieveRelevantDocs(query, workspace) {
  // 1. 将工作区文档分块并向量化
  // 2. 用查询向量检索最相关的块
  // 3. 将召回内容注入 prompt
}
```

**记忆重要度评分**：
为每条记忆添加重要性分数，低分记忆在上下文不足时优先丢弃：

```js
export function scoreMemory(memory) {
  let score = 0;
  if (memory.recency < 24 * 60 * 60 * 1000) score += 10;  // 24小时内
  if (memory.mentionCount > 3) score += 5;                  // 多次提及
  if (memory.userExplicit) score += 20;                     // 用户明确表达
  return score;
}
```

### 6.3 关键文件一览

| 文件 | 职责 | 扩展点 |
|------|------|--------|
| `src/memory/store.js` | 加载/保存/合并/迁移 | 增加新记忆类型、修改同步策略 |
| `src/memory/manager.js` | 记忆生命周期管理 | 增加记忆优先级、过期策略 |
| `src/memory/heuristics.js` | 启发式提取 | 增加新的正则模式 |
| `src/memory/ingest.js` | 语义提取 | 修改抽取 prompt、增加新字段 |
| `src/memory/vector.js` | 向量化检索 | 替换嵌入算法、修改相似度函数 |
| `src/memory/tasks.js` | 任务记忆 | 增加任务状态机、依赖管理 |

---

## 7. 如何扩展 Skill 支持

### 7.1 当前支持的目录约定

```
.claude/skills/<skill-name>/SKILL.md    # 工作区级
.frees-agent/skills/<skill-name>/SKILL.md # 项目私有
~/.claude/skills/<skill-name>/SKILL.md   # 用户级
```

### 7.2 可扩展的方向

**Frontmatter 解析增强**：
当前只解析 `name`、`description`、`allowed-tools`。可以扩展支持更多字段：

```yaml
---
name: Code Review
description: Review source code for bugs, structure, and missing tests.
allowed-tools: Read, Grep, Glob
priority: high              # 新增：匹配优先级
depends-on:                 # 新增：依赖其他 skill
  - eslint-rules
triggers:                   # 新增：自动触发条件
  - pattern: "*.js"
  - event: "pre-commit"
auto-load-refs: true        # 新增：自动加载引用文件
---
```

**Allowed-tools 真正生效**：
目前 `allowed-tools` 只是描述性字段。可以在 `tools.js` 中添加校验：

```js
function enforceToolPermissions(requestedTool, activeSkills) {
  for (const skill of activeSkills) {
    if (skill.allowedTools && !skill.allowedTools.includes(requestedTool)) {
      throw new Error(`Skill "${skill.name}" 不允许使用工具 "${requestedTool}"`);
    }
  }
}
```

**Skill 自动触发**：
在 `matcher.js` 中实现基于关键词的自动匹配：

```js
export function matchSkills(userMessage, availableSkills) {
  return availableSkills.filter(skill => {
    if (!skill.keywords) return false;
    return skill.keywords.some(kw => userMessage.includes(kw));
  });
}
```

### 7.3 关键文件

| 文件 | 职责 |
|------|------|
| `src/skills/loader.js` | Skill 文件读取和解析 |
| `src/commands/skills.js` | `frees-agent skills` 命令实现 |

---

## 8. MCP 工具集成深度指南

MCP（Model Context Protocol）是 Frees Agent 集成的标准外部工具协议。

### 8.1 配置方式

```json
{
  "mcpServers": {
    "tavily": {
      "command": "npx",
      "args": ["@tavily/mcp"],
      "env": { "TAVILY_API_KEY": "your-key" }
    },
    "filesystem": {
      "command": "npx",
      "args": ["@anthropic/mcp-server-fs", "/allowed/path"]
    }
  }
}
```

### 8.2 MCP 工具的自动发现

在 `tools.js` 中，MCP 工具会自动：

1. 启动 MCP 服务器进程
2. 通过 JSON-RPC 获取工具列表
3. 以 `mcp__<server>__<tool>` 命名注册
4. 将工具描述注入到模型提示词中

### 8.3 编写自定义 MCP 服务器

```js
// my-mcp-server/index.js
import { Server } from '@anthropic/mcp-sdk/server';

const server = new Server({ name: 'my-custom-server', version: '1.0.0' });

server.tool('analyze_log', {
  logPath: { type: 'string', description: '日志文件路径' },
  pattern: { type: 'string', description: '搜索模式' },
}, async (args) => {
  // 工具实现
  const results = await analyzeLogFile(args.logPath, args.pattern);
  return { content: [{ type: 'text', text: JSON.stringify(results) }] };
});

server.start();
```

---

## 9. 测试策略

### 9.1 单元测试

每个模块应有对应测试：

```bash
tests/
├── unit/
│   ├── tools.test.js
│   ├── memory.test.js
│   ├── prompts.test.js
│   └── ...
```

### 9.2 集成测试

```bash
tests/
├── integration/
│   ├── chat-loop.test.js
│   ├── tool-orchestration.test.js
│   └── ...
```

### 9.3 测试原则

- 工具函数（`src/utils/`）应该 100% 覆盖
- 记忆系统需要测试：加载/保存/合并/去重/向量检索
- Agent 循环需要测试：工具调用流程、重试逻辑、消息裁剪
- 每个新工具需要有冒烟测试

---

## 10. 维护建议与开发规范

### 10.1 文件职责边界

| 层 | 应该做的事 | 不应该做的事 |
|----|-----------|-------------|
| 命令层 | 参数解析、调用服务、输出结果 | 直接调用模型 API、实现复杂业务逻辑 |
| Agent 循环 | 管理对话流程、调用工具 | 直接操作文件系统、直接访问记忆存储 |
| 模型层 | 封装 API 通信、处理流式响应 | 包含业务逻辑、修改 UI |
| 工具层 | 纯函数、通用工具 | 包含项目特定逻辑 |

### 10.2 代码规范

1. **一个文件只做一件事** — 如果一个文件超过 300 行，考虑拆分
2. **函数保持纯函数** — 尽量减少副作用
3. **异步优先** — 使用 `async/await` 而非回调
4. **错误处理** — 每个异步操作都需要 try/catch
5. **日志一致性** — 使用统一的日志格式

### 10.3 提交规范

```bash
# 提交信息格式
<type>(<scope>): <description>

# 类型
feat: 新功能
fix: 修复
docs: 文档
refactor: 重构
test: 测试
chore: 构建/工具

# 示例
feat(tools): 添加 analyze_log MCP 工具集成
fix(memory): 修复跨设备合并时的重复记忆问题
docs(skills): 更新 Skill 编写文档
```

### 10.4 新增功能检查清单

- [ ] 功能是否在正确的层实现？
- [ ] 是否有对应的测试？
- [ ] 是否有文档更新？
- [ ] 是否兼容现有配置格式？
- [ ] 是否需要更新 Provider 注册表？
- [ ] 是否需要更新工具列表？
- [ ] 是否需要更新提示词中的工具描述？
- [ ] 是否考虑了错误处理和边界情况？
- [ ] 是否处理了 AbortSignal 中断？
