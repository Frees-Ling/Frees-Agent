# 自主 Agent 能力架构

让 Frees Agent 具备真正的自主能力 — 能看、能听、能操作、能自我进化。

## 一、核心思路

```
用户输入目标
    │
    ▼
┌─────────────────────┐
│  任务分解器          │  将复杂目标拆为可执行子任务
│  (Task Decomposer)   │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  自主执行循环        │  逐个子任务：选工具 → 执行 → 验证
│  (Autonomous Loop)   │  失败则重试/回退/重新规划
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  工具矩阵            │  文件/代码/图片/视频/AI训练/联网
│  (Tool Matrix)       │  通过 MCP + 本地工具统一调用
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  结果验证            │  检查输出质量，决定继续/终止
│  (Result Verifier)   │
└─────────────────────┘
```

## 二、多模态能力

### 2.1 图片处理
| 能力 | 实现方式 | 依赖 |
|------|----------|------|
| 图片读取分析 | MCP Vision API / Anthropic Vision | 模型需支持多模态 |
| 图片编辑 | MCP `mcp-server-pillow` 或 shell 调用 Pillow | Python + Pillow |
| 截图分析 | `screenshot` 工具 + Vision API | 系统截图命令 |
| 格式转换 | shell 调用 ImageMagick/magick | ImageMagick |

### 2.2 视频处理
| 能力 | 实现方式 | 依赖 |
|------|----------|------|
| 视频信息读取 | shell 调用 ffprobe | FFmpeg |
| 视频剪辑/合并 | shell 调用 ffmpeg | FFmpeg |
| 视频帧提取 | ffmpeg 截图 + Vision 分析 | FFmpeg |
| 字幕处理 | ffmpeg 提取字幕流 | FFmpeg |

### 2.3 音频处理
| 能力 | 实现方式 | 依赖 |
|------|----------|------|
| 语音转文字 | MCP Whisper / shell whisper-cpp | whisper 模型 |
| 音频剪辑 | shell ffmpeg | FFmpeg |
| 文字转语音 | MCP TTS API | 云端或本地 TTS |

## 三、自主执行循环

### 3.1 任务分解
将用户一句话目标拆解为 DAG 子任务：

```
"帮我做一个短视频"
→ 1. 收集素材（搜索/生成图片）
→ 2. 撰写脚本（LLM 生成文案）
→ 3. 语音合成（TTS）
→ 4. 视频剪辑（FFmpeg 合成）
→ 5. 添加字幕（FFmpeg drawtext）
→ 6. 导出审核
```

### 3.2 工具调用模式
```
每个子任务执行时：
1. Agent 选择工具（从工具矩阵中）
2. 构造参数（LLM 生成参数 JSON）
3. 执行工具（同步/异步）
4. 检查结果（成功 → 下一步，失败 → 重试/调整参数）
5. 记录日志（供后续子任务参考）
```

### 3.3 失败处理
- 工具调用失败 → 自动重试 2 次（参数微调）
- 连续失败 → 回退到重新规划子任务
- 完全无法执行 → 向用户报告原因和建议

## 四、工具矩阵扩展

### 4.1 MCP 工具推荐
| MCP 服务 | 能力 | 安装方式 |
|----------|------|----------|
| `mcp-server-ffmpeg` | 视频/音频处理 | `npx @anthropic/mcp-server-ffmpeg` |
| `mcp-server-pillow` | 图片处理 | `npx @anthropic/mcp-server-pillow` |
| `mcp-server-tavily` | 联网搜索 | 内置支持 |
| `mcp-server-fs` | 文件系统增强 | `npx @anthropic/mcp-server-fs` |
| `mcp-server-puppeteer` | 网页截图/操作 | `npx @anthropic/mcp-server-puppeteer` |

### 4.2 本地工具扩展
| 工具名 | 能力 | 状态 |
|--------|------|------|
| `bash` / `shell` | 任意 shell 命令 | ✅ 已有 |
| `web_fetch` | 网页抓取 | ✅ 已有 |
| `read_file` | 读取文件 | ✅ 已有 |
| `write_file` | 写入文件 | ✅ 已有 |
| `replace_in_file` | 编辑文件 | ✅ 已有 |
| `screenshot` | 屏幕截图 | ⏳ 待实现 |
| `ffmpeg` | 视频处理封装 | ⏳ 待实现 |
| `python_exec` | Python 代码执行 | ⏳ 待实现 |

## 五、自主迭代机制

### 5.1 自检循环
Agent 定期读取 `docs/20-不足之处与改进计划.md`，识别标记为 `[ ]` 的待办项，尝试自主实现：

1. 读取改进计划 → 找到优先级最高的未完成项
2. 理解需求 → 搜索相关代码
3. 实现改进 → 使用 edit 工具修改代码
4. 验证 → 运行测试
5. 更新文档 → 将 `[ ]` 改为 `[x]`
6. 继续下一项

### 5.2 约束
- 每次自检只改一个文件，避免大规模破坏
- 修改前运行测试，修改后再次运行测试
- 遇到无法解决的问题，记录原因并跳过

## 六、配置示例

在 `frees-agent.yaml` 中启用自主模式：

```yaml
agent:
  autonomous:
    enabled: true
    maxSubTasks: 10
    maxRetriesPerTask: 3
    taskTimeoutMs: 300000

tools:
  mcpServers:
    ffmpeg:
      command: npx
      args: ["@anthropic/mcp-server-ffmpeg"]
    pillow:
      command: npx
      args: ["@anthropic/mcp-server-pillow"]
  webSearch:
    enabled: true
```
