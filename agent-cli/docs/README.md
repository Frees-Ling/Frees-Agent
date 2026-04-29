# Frees Agent 文档区

这里是 `Frees Agent` 的中文文档区，用来集中存放 AI 智能体、LLM 模型、训练、微调、模型加载、API 接入、记忆系统与超长对话等相关说明。

## 文档索引

- `01-什么是LLM模型与AI智能体.md`
  什么是 LLM，什么是 AI Agent，它们之间的关系是什么。
- `02-如何训练属于自己的LLM模型.md`
  从零预训练、继续预训练、SFT、LoRA/QLoRA、RAG 等路线说明。
- `03-LM-Studio模型二次训练.md`
  如何看待 LM Studio 下载模型的再训练问题，什么能训，什么不能直接训。
- `04-如何把模型训练到尽量稳定好用.md`
  训练策略、数据质量、评测与上线策略。
- `05-训练模型常见问题与解决方案.md`
  欠拟合、过拟合、灾难性遗忘、显存不足、格式问题等。
- `06-如何加载模型与接入自己的模型或云端API.md`
  如何在 `Frees Agent` 里配置本地模型、OpenAI 兼容 API、Anthropic API，以及如何在代码里增加新的 provider。
- `07-Frees-Agent记忆与超长对话.md`
  `Frees Agent` 的长期记忆、用户画像、会话持久化和超长对话摘要压缩机制。
- `08-数据集构建清洗标注与评测.md`
  如何做数据集、清洗、标注和评测。
- `09-模型应用产品化与落地路线图.md`
  如何从模型走向产品和系统工程。
- `10-系统权限电脑控制与安全边界.md`
  电脑控制、系统权限、辅助功能、PowerShell 策略等说明。
- `11-手把手把模型加载到Frees-Agent.md`
  这是第一次上手最推荐看的文档，按步骤教你把模型接到 Frees Agent。
- `12-如何拓展开发Frees-Agent.md`
  面向后续开发者的扩展指南。
- `13-项目架构说明.md`
  项目目录和分层说明。
- `14-Skill文件支持与编写说明.md`
  Skill 文件支持、目录约定和编写方式。
- `15-Frees-Agent项目源码逐文件逐函数剖析.md`
  项目级源码分析、逐文件职责、逐函数职责、算法和优化方向。
- `16-如何接入MCP外部工具.md`
  如何将外部 MCP 工具与 `Frees Agent` 结合使用，并在配置中完成集成。
- `17-快速项目式改造执行指南.md`
  提供"先读 README、再做项目改造"的可复用高质量提示词模板。
- `18-agent-memory-architecture.md`
  统一长期记忆、向量记忆、任务记忆、跨设备合并与上下文压缩的架构说明。
- `19-自动联网与新功能配置指南.md`
  自动联网、模型自动回退、跨端 memory/sessions 合并、token 压缩等能力的配置说明。

## 推荐阅读顺序

1. 先读 LLM 与 Agent 基础
2. 再读训练与微调路线
3. 然后看模型加载与 API 接入
4. 最后看 `Frees Agent` 的记忆与长对话实现

## 在 CLI 中查看文档

你可以直接在终端里执行：

```bash
frees-agent docs
frees-agent docs llm-basics
frees-agent docs load-models
frees-agent docs memory-long-chat
frees-agent docs load-model-step-by-step
frees-agent docs datasets
frees-agent docs permissions
frees-agent docs 12-如何拓展开发Frees-Agent
frees-agent docs skills
frees-agent docs source-analysis
frees-agent permissions
frees-agent skills
```

## 新命令速查

```bash
# 查看工作区已索引的文件
frees-agent files ./my-project

# 统计会话 token 用量
frees-agent cost --model claude-sonnet-4-6

# 手动触发会话摘要压缩（需指定模型）
frees-agent compact --model claude-sonnet-4-6
```

## 工具层总览

所有工具函数位于 `src/utils/`，零外部依赖，仅使用 Node.js 内置模块。

| 文件 | 功能 |
|------|------|
| `slug.js` | Agent ID 哈希、语义化 slug 生成（形容词-动词-名词 组合） |
| `sleep.js` | AbortSignal 感知的延迟与超时 |
| `which.js` | 跨平台可执行文件查找（PATH 搜索 + Windows PATHEXT） |
| `uuid.js` | Agent ID 生成与 UUID 校验 |
| `memoize.js` | 内联 Map 缓存，支持过期时间 |
| `ripgrep.js` | 系统 rg 检测、正则搜索、流式结果、EAGAIN 重试 |
| `theme.js` | 4 主题系统（dark/light/dark-ansi/light-ansi），ANSI 转换 |
| `truncate.js` | ANSI 感知文本截断，CJK 安全（中文字符按 2 宽度计算） |
| `treeify.js` | Unicode 树形渲染，循环引用检测 |
| `json.js` | JSON 安全解析，首个 JSON 对象提取 |
| `files.js` | 文件类型检测（二进制/文本嗅探），格式化字节数 |
| `git.js` | Git 仓库状态查询（根目录、分支、远程、变更文件、提交状态） |
| `ultraplan/keyword.js` | 增强规划关键词检测 |

## Shell 执行模块

`src/shell/shell-exec.js` 提供安全的 shell 命令执行：

- 自动检测 shell（bash/zsh/cmd/powershell）
- 7 种危险命令模式静态拦截
- AbortController 超时控制
- 输出自动截断（1MB 上限）
- Windows 兼容

## Agent 循环

`src/agent/` 包含 Agent 的运行循环和工具系统：

| 组件 | 功能 |
|------|------|
| `chat-tool-loop.js` | 聊天模式工具循环：工具调用 → 结果截断 → 重试逻辑 → 消息历史裁剪 |
| `edit-loop.js` | 编辑模式 Agent 循环：最大步数控制、JSON 动作解析 |
| `orchestration.js` | 读写工具分区并行执行，并发控制 |
| `prompts.js` | 系统提示词 + 10 种工具描述（参数、行为、返回值） |
| `tools.js` | 统一工具箱：别名映射、MCP 工具集成、读写工具安全校验 |

支持的工具（通过 `tools.js` 统一注册）：

| 工具名 | 别名 | 分类 |
|--------|------|------|
| `list_files` / `glob` | — | 只读 |
| `search_text` / `grep` | — | 只读 |
| `read_file` / `read` | — | 只读 |
| `web_fetch` / `fetch` | — | 只读 |
| `write_file` / `write` | — | 写入 |
| `replace_in_file` / `edit` | — | 写入 |
| `bash` / `shell` / `execute_command` | — | 写入 |
| `mcp__*` | — | 动态加载 |

## 记忆系统

`src/memory/` 实现分层记忆架构：

| 组件 | 功能 |
|------|------|
| `store.js` | 记忆核心：加载/保存/合并/迁移，跨设备同步，每类记忆上限 60 条 |
| `heuristics.js` | 启发式提取：姓名、目标、偏好正则匹配，中文/英文双模式 |
| `vector.js` | 向量化搜索：256 维 FNV-1a 嵌入，CJK 感知 n-gram 分词，余弦相似度召回 |
| `ingest.js` | 语义提取管线：大模型结构化抽取 + 直接正则提取 |
| `tasks.js` | 任务记忆：加载全局和本地任务，层级合并 |

关键特性：
- **去重压缩**：`compactSimilarMemories` 基于词重叠率（>70% 判定重复）
- **向量召回**：`queryVectorMemories` 低阈值 0.06，top-K 排序
- **限幅保护**：全局最大 200 条，每类最多 60 条
- **跨设备合并**：`syncRoots` 配置多个存储根自动合并

## 工作区能力

`src/workspace/` 提供代码库索引和文件操作：

| 组件 | 功能 |
|------|------|
| `indexer.js` | 工作区文件递归扫描，24MB 预算保护 |
| `queries.js` | 文件读取含行号标注、智能字符串匹配（引号归一化+邻近行提示） |
| `context.js` | 相关文件上下文组装 |

智能匹配（`queries.js`）：
1. 精确匹配
2. 引号归一化匹配（弯引号 → 直引号）
3. 邻近行 hint 反馈
