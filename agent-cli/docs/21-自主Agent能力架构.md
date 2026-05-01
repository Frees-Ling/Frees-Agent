# 自主 Agent 能力架构

本文档详细说明 Frees Agent 的自主能力架构设计，包括多模态处理、自主执行循环、任务分解 DAG、工具选择策略、失败恢复机制、反思自检循环、自我改进机制等核心能力。

---

## 一、核心思路

Frees Agent 的自主能力让 Agent 能够"看、听、操作、自我进化"——从一个简单的问答工具进化为一个可以独立完成复杂任务的智能体。

### 1.1 整体架构

```
用户输入目标
    │
    ▼
┌──────────────────────────────┐
│    意图理解层                │  解析输入 → 识别意图类型
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│    任务分解器 (Decomposer)    │  复杂目标拆为 DAG 子任务
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│    自主执行循环               │  逐子任务：选工具→执行→验证
│    (Autonomous Loop)         │  失败→重试/回退/重规划
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│    工具矩阵 (Tool Matrix)     │  文件/代码/多媒体/联网/MCP
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│    结果验证器 (Verifier)      │  检查输出质量
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│    自检循环 (Critic Loop)     │  自我反思→迭代优化
└──────────────────────────────┘
```

### 1.2 能力层次

| 层次 | 名称 | 能力描述 |
|------|------|----------|
| L1 | 被动响应 | 回答问题、执行单步命令 |
| L2 | 工具使用 | 调用文件/搜索/代码工具 |
| L3 | 任务规划 | 分解复杂目标、按序执行 |
| L4 | 自我反思 | 自检修正、迭代优化 |
| L5 | 自主进化 | 阅读改进计划、自主实现 |

---

## 二、任务分解器 (Task Decomposer)

### 2.1 分解流程

```
用户输入："帮我做一个短视频介绍 Frees-Agent"
    │
    ▼
1. 目标理解
   意图：制作短视频
   主题：Frees-Agent 介绍
   输出格式：MP4 视频
   隐含需求：文案 + 配音 + 字幕
    │
    ▼
2. 子任务生成
   T1: 撰写脚本 (文案生成)
   T2: 收集素材 (搜索/生成图片)
   T3: 语音合成 (TTS 配音)
   T4: 视频合成 (FFmpeg 拼接)
   T5: 添加字幕 (FFmpeg drawtext)
   T6: 导出审核 (检查并输出)
    │
    ▼
3. DAG 依赖关系建立
   T1 ──┐
        ├──▶ T4 ──▶ T5 ──▶ T6
   T2 ──┘         ▲
        T3 ───────┘
   并行：T1, T2, T3 可同时进行
   串行：T4 等待 T1/T2/T3, T5 等待 T4
```

### 2.2 子任务格式

每个子任务是一个标准化的 JSON 结构：

```json
{
  "id": "T1",
  "description": "撰写短视频脚本",
  "type": "llm_generation",
  "params": {
    "prompt": "为 Frees-Agent 介绍视频写 60 秒脚本",
    "outputFile": "/tmp/script.txt"
  },
  "dependencies": [],
  "maxRetries": 3,
  "timeoutMs": 30000
}
```

### 2.3 DAG 执行引擎

```js
class DAGExecutor {
  constructor(tasks) {
    this.tasks = tasks;
    this.dependencies = new Map();
    this.results = new Map();
  }

  async execute() {
    const ready = this.getReadyTasks(); // 无依赖的任务
    const promises = ready.map(task => this.executeTask(task));
    await Promise.all(promises);
  }

  async executeTask(task) {
    const tool = this.selectTool(task);
    const result = await this.runWithRetry(tool, task.params);
    if (!this.verify(result, task)) {
      await this.handleFailure(task, result);
      return;
    }
    this.results.set(task.id, result);
    this.resolveDependencies(task.id);
    await this.execute(); // 递归执行新就绪的任务
  }
}
```

**并行执行**：DAG 中无依赖的子任务可并行执行（如"写脚本"和"收集素材"同时进行）

**串行执行**：有依赖关系的子任务必须按序执行（如"添加字幕"在"视频合成"之后）

---

## 三、自主执行循环 (Autonomous Loop)

### 3.1 循环结构

```
          ┌─────────────────────┐
          │    子任务开始         │
          └────────┬────────────┘
                   │
                   ▼
          ┌─────────────────────┐
          │  1. 选择工具          │
          │     Agent 分析任务   │
          │     选择最合适工具   │
          └────────┬────────────┘
                   │
                   ▼
          ┌─────────────────────┐
          │  2. 构造参数          │
          │     LLM 生成参数     │
          │     JSON 格式        │
          └────────┬────────────┘
                   │
                   ▼
          ┌─────────────────────┐
          │  3. 执行工具          │
          │     调用工具函数     │
          │     同步/异步       │
          └────────┬────────────┘
                   │
                   ▼
          ┌─────────────────────┐
          │  4. 检查结果          │
          │  成功 → 下一步       │
          │  失败 → 重试/回退     │
          └────────┬────────────┘
                   │
                   ▼
          ┌─────────────────────┐
          │  5. 记录日志          │
          │     写入 task memory │
          │     供后续参考       │
          └────────┬────────────┘
                   │
                   ▼
          ┌─────────────────────┐
          │    子任务结束         │
          └─────────────────────┘
```

### 3.2 工具选择策略

Agent 通过 LLM 推理 + 工具注册表协同选择工具：

```js
function selectTool(task, availableTools) {
  const toolDescriptions = availableTools.map(t => ({
    name: t.name,
    description: t.description,
    capabilities: t.capabilities,
    inputSchema: t.inputSchema
  }));

  const selection = llm.call({
    prompt: `任务：${task.description}
可用工具：${JSON.stringify(toolDescriptions)}
请选择最合适的工具并构造参数。`,
    outputFormat: 'json'
  });

  return { tool: findTool(selection.toolName), params: selection.parameters };
}
```

**工具匹配原则**：
- 文本生成类 → LLM 直接生成（无需工具）
- 文件操作类 → read_file / write_file / replace_in_file
- 代码执行类 → bash / shell
- 搜索类 → web_search / web_fetch
- 多媒体 → image_* / video_* / audio_* / MCP ffmpeg / pillow

### 3.3 失败处理

```
工具调用失败
    │
    ▼
第一次重试：微调参数（路径、格式、超时）
    │
    ▼ 再次失败
第二次重试：换替代工具（从工具矩阵中找相似工具）
    │
    ▼ 连续失败
回退到重新规划（Refine Plan）
    │
    ▼ 完全无法执行
向用户报告失败原因和建议，跳过该子任务
```

**重试策略参数**：

```json
{
  "agent": {
    "autonomous": {
      "maxSubTasks": 10,
      "maxRetriesPerTask": 3,
      "taskTimeoutMs": 300000
    }
  }
}
```

**实现**：

```js
async function executeWithRetry(task, toolBox, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const args = attempt === 0 ? task.args : adjustArgs(task, attempt);
      return await toolBox.runTool(task.tool, args);
    } catch (err) {
      if (attempt === maxRetries) {
        return fallbackStrategy(task, err, toolBox);
      }
      await sleep(1000 * attempt);
    }
  }
}
```

---

## 四、反思自检循环 (Critic / Reflection)

### 4.1 两级反思架构

```
第一级：执行后反思（每个子任务完成后）
  Agent 完成子任务 → Critic 检查：
  ├── 结果是否完整？
  ├── 是否有错误？
  ├── 是否符合任务要求？
  └── 质量是否达标？
      ├── 通过 → 继续
      └── 不通过 → 修正后重试

第二级：全局反思（所有子任务完成后）
  Critic 全面检查：
  ├── 整体是否达到用户目标？
  ├── 是否有遗漏的功能？
  ├── 各子任务是否协作良好？
  └── 用户体验是否流畅？
      ├── 通过 → 输出
      └── 不通过 → 迭代优化
```

### 4.2 Critic Prompt 设计

```
你是一个严格的审查者（Critic）。请检查以下 Agent 输出：

任务描述: {description}
Agent 输出: {output}

审查维度：
1. 正确性：是否有事实错误？
2. 完整性：是否覆盖所有要求？
3. 质量：代码是否可运行？文案是否通顺？
4. 效率：是否有更好的实现方案？

审查结果格式：
{
  "passed": boolean,
  "issues": ["问题1"],
  "suggestions": ["建议1"],
  "severity": "critical" | "minor" | "cosmetic"
}
```

### 4.3 迭代优化循环

```
Agent 输出 → Critic 发现问题
    → Agent 根据建议修正
    → Critic 重新检查
    → 通过则完成 (最多 3 次迭代)
```

**迭代上限**：每个子任务反思迭代上限为 3 次，防止无限循环。

---

## 五、工具矩阵 (Tool Matrix)

### 5.1 工具全貌

```
┌──────────────────────────────────────────────────────┐
│                    工具矩阵                            │
├──────────┬──────────┬──────────┬──────────────────────┤
│ 文件操作  │ 代码执行  │ 网络搜索  │      多媒体          │
├──────────┼──────────┼──────────┼──────────────────────┤
│ read_file│ bash     │ web_search│ screenshot           │
│ write_file│ python   │ web_fetch│ image_* (6+ 操作)    │
│ edit     │ node     │          │ video_* (6+ 操作)    │
│ mkdir    │          │          │ audio_* (6+ 操作)    │
│ delete   │          │          │ MCP ffmpeg/pillow    │
└──────────┴──────────┴──────────┴──────────────────────┘
```

### 5.2 多模态能力矩阵

#### 图片处理

| 能力 | 实现方式 | 依赖 |
|------|----------|------|
| 图片读取分析 | MCP Vision / Anthropic Vision | 多模态模型 |
| 图片编辑 | MCP pillow 或 Python Pillow | Python + Pillow |
| 截图分析 | screenshot 工具 + Vision | 系统截图命令 |
| 格式转换 | image_convert / ImageMagick | ImageMagick |
| OCR 文字识别 | image_ocr / Tesseract | Tesseract |
| 缩放/裁剪 | image_resize / image_crop | 内置 |

#### 视频处理

| 能力 | 实现方式 | 依赖 |
|------|----------|------|
| 信息读取 | video_info / ffprobe | FFmpeg |
| 剪辑/合并 | video_trim / video_concat | FFmpeg |
| 帧提取 | video_extract_frames | FFmpeg |
| 字幕处理 | video_extract_subtitles | FFmpeg |
| 格式转换 | video_convert | FFmpeg |
| 压缩 | video_compress | FFmpeg |

#### 音频处理

| 能力 | 实现方式 | 依赖 |
|------|----------|------|
| 语音转文字 | MCP Whisper / whisper-cpp | whisper 模型 |
| 音频剪辑 | audio_trim / ffmpeg | FFmpeg |
| 文字转语音 | MCP TTS API | 云端/本地 TTS |
| 格式转换 | audio_convert | FFmpeg |
| 音量调整 | audio_volume | FFmpeg |

### 5.3 多模态工具注册示例

```js
case 'image_info': {
  const { path } = args;
  const data = await getImageInfo(path);
  return { ok: true, data };
}
case 'video_trim': {
  const { input, start, end, output } = args;
  await execFFmpeg(`-i "${input}" -ss ${start} -to ${end} -c copy "${output}"`);
  return { ok: true, data: { output } };
}
case 'audio_transcribe': {
  const { path } = args;
  const text = await transcribeAudio(path);
  return { ok: true, data: { text } };
}
```

### 5.4 MCP 推荐工具

| MCP 服务 | 能力 | 安装 |
|----------|------|------|
| `@tavily/mcp` | 联网搜索 | `npx @tavily/mcp` |
| `@anthropic/mcp-server-ffmpeg` | 音视频处理 | `npx @anthropic/mcp-server-ffmpeg` |
| `@anthropic/mcp-server-pillow` | 图片处理 | `npx @anthropic/mcp-server-pillow` |
| `@anthropic/mcp-server-fs` | 文件系统 | `npx @anthropic/mcp-server-fs /dir` |
| `@anthropic/mcp-server-puppeteer` | 网页截图 | `npx @anthropic/mcp-server-puppeteer` |

### 5.5 工具调用标准接口

```js
const toolRegistry = {
  "read_file": {
    name: "read_file",
    description: "读取指定文件内容",
    capabilities: ["file", "read"],
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "文件路径" }
      },
      required: ["path"]
    },
    handler: async (params) => { /* 执行逻辑 */ }
  }
};
```

---

## 六、自主迭代机制 (Self-Improvement)

Frees Agent 可以阅读自身的改进计划文档并自主实现改进。

### 6.1 改进计划文档

改进计划存储在 `docs/20-不足之处与改进计划.md`，使用 Markdown 格式：

```markdown
# 不足之处与改进计划

## 记忆系统
- [x] 实现基础向量检索
- [ ] 支持记忆衰减机制
- [ ] 增加记忆导出功能

## 工具系统
- [ ] 实现 screenshot 工具
- [ ] python_exec 沙箱隔离
```

### 6.2 自我改进循环

```
┌─────────────────────────────────────┐
│           自我改进循环                │
│                                      │
│  ┌────────┐  ┌────────┐  ┌────────┐ │
│  │ 读取    │→│ 理解    │→│ 实现    │ │
│  │ 改进计划│  │ 需求    │  │ 改进    │ │
│  └────────┘  └────────┘  └────────┘ │
│     │           │           │        │
│     ▼           ▼           ▼        │
│  ┌────────┐  ┌────────┐  ┌────────┐ │
│  │ 运行    │←│ 验证    │←│ 更新    │ │
│  │ 测试    │  │ 修改    │  │ 文档    │ │
│  └────────┘  └────────┘  └────────┘ │
│     │                                │
│     ▼                                │
│  继续下一个改进项                     │
└─────────────────────────────────────┘
```

### 6.3 实现

```js
async function selfImprove() {
  const plan = await readFile('docs/20-不足之处与改进计划.md');
  const todos = parseTodos(plan); // 提取所有 [ ] 项

  for (const todo of todos) {
    console.log(`[Self-Improvement] Working on: ${todo.description}`);
    try {
      const context = await searchRelevantCode(todo);
      const result = await implementChange(todo, context);
      if (result.success) {
        await markTodoCompleted(todo);
      }
    } catch (err) {
      console.error(`[Self-Improvement] Failed: ${todo.description}`, err.message);
    }
  }
}
```

### 6.4 安全约束

1. **单文件修改**：每次只改一个文件，避免大规模破坏
2. **测试验证**：修改前/后运行测试，确保无回归
3. **失败跳过**：无法解决的问题记录原因并跳过
4. **可回滚**：所有修改通过 git 管理

---

## 七、使用场景示例

### 场景一：代码项目生成

```
用户："帮我创建一个 Express + TypeScript 项目骨架"
    │
    ▼
Planner 分解：
T1: package.json + tsconfig.json
T2: 目录结构 (src/, tests/)
T3: 入口文件 (src/index.ts)
T4: Express 路由配置
T5: ESLint + Prettier
T6: 验证编译
    │
    ▼
自主执行 → Critic 检查 → 输出完整项目骨架
```

### 场景二：数据分析

```
用户："分析服务器日志，找出 500 错误最多的 API"
    │
    ▼
Planner 分解：
T1: 读取日志文件
T2: 解析日志格式
T3: 过滤 500 错误
T4: 按 API 分组统计
T5: 生成图表
T6: 撰写分析报告
    │
    ▼
自主执行 → Critic 检查 → 输出排名+图表+建议
```

### 场景三：视频内容创作

```
用户："帮我把代码录像做成 3 分钟快进教程"
    │
    ▼
Planner 分解：
T1: 读取视频信息 (ffprobe)
T2: 提取关键帧
T3: 加速播放 (ffmpeg setpts)
T4: 语音转文字 (Whisper)
T5: 生成字幕
T6: 合成输出
    │
    ▼
Critic 检查 → 输出教程视频
```

---

## 八、配置示例

```json
{
  "agent": {
    "autonomous": {
      "enabled": true,
      "maxSubTasks": 10,
      "maxRetriesPerTask": 3,
      "taskTimeoutMs": 300000
    }
  },
  "tools": {
    "mcpServers": {
      "ffmpeg": {
        "command": "npx",
        "args": ["@anthropic/mcp-server-ffmpeg"]
      },
      "pillow": {
        "command": "npx",
        "args": ["@anthropic/mcp-server-pillow"]
      }
    },
    "webSearch": { "enabled": true }
  },
  "conversation": {
    "planningEnabled": true,
    "reflectionEnabled": true
  }
}
```

---

## 九、架构特性总结

| 特性 | 说明 | 实现位置 |
|------|------|----------|
| DAG 任务分解 | 复杂目标拆为可并行子任务 | `agent/reasoning.js` |
| 工具矩阵 | 统一注册和发现 | `agent/tools.js` |
| 读写分区 | 只读并发，写入串行 | `agent/orchestration.js` |
| 自动重试 | 临时错误参数微调后重试 | `agent/chat-tool-loop.js` |
| 回退策略 | 连续失败重新规划 | `agent/chat-tool-loop.js` |
| 结果验证 | 反思层检查输出质量 | `agent/reasoning.js` |
| 自检迭代 | 自主发现并实现改进 | 框架层 |
| 多模态处理 | 图片/视频/音频统一接口 | `tools/` |
| MCP 扩展 | 外部服务接入 | `tools/mcp-client.js` |

### 性能调优参数

| 参数 | 影响 | 建议 |
|------|------|------|
| `maxSubTasks` | 任务越多次数越长 | 简单 5，复杂 15 |
| `maxRetriesPerTask` | 重试影响容错性 | 稳定 2，不稳定 3 |
| `taskTimeoutMs` | 超时阻塞其他任务 | 文件 30s，视频 300s |
| `planningEnabled` | 增加一次 LLM 调用 | 简单问题可关闭 |
| `reflectionEnabled` | 增加一次 LLM 调用 | 高精度要求时开启 |

### 与 Claude Code 对比

| 特性 | Frees Agent | Claude Code |
|------|-------------|-------------|
| 任务分解 | DAG 有向无环图 | 线性步骤 |
| 并行执行 | 并发执行无依赖任务 | 串行执行 |
| 多模态工具 | 图片/视频/音频 (6+ 操作) | 基础文件操作 |
| 失败恢复 | 参数微调+替代工具+重规划 | 基本重试 |
| 自检迭代 | 自动读取改进计划并实施 | 无 |
| 工具扩展 | MCP + 本地工具 | MCP |
| 规划器独立模型 | 支持独立 provider | 不支持 |
