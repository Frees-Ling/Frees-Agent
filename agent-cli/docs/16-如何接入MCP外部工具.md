# 如何接入 MCP 外部工具

本文档系统性地介绍如何将外部 MCP（Model Context Protocol）工具与 `Frees Agent` 集成，涵盖协议规范、配置方法、实现原理、错误处理和安全考虑。

---

## 1. MCP 协议概述

### 1.1 什么是 MCP

MCP（Model Context Protocol）是一种开放协议，用于在 AI 模型和外部工具/数据源之间建立标准化的通信管道。它定义了一套 JSON-RPC 2.0 消息格式，使模型能够动态发现和调用外部工具。

### 1.2 核心概念

- **MCP Server** — 提供特定能力的独立进程，通过 stdio 或 HTTP 与 Client 通信
- **MCP Client** — 集成于 Frees Agent 中，负责发现和调用 MCP 服务器的工具
- **Tool** — MCP Server 暴露的功能单元，有名称、参数 schema 和实现逻辑
- **Resource** — MCP Server 暴露的数据资源
- **Transport** — 通信方式，当前支持 stdio 传输

### 1.3 JSON-RPC 2.0 消息格式

MCP 使用 JSON-RPC 2.0 作为消息协议。每条消息是一个 JSON 对象，每行一条（newline-delimited JSON）。

**请求格式：**
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}
```

**响应格式：**
```json
{"jsonrpc": "2.0", "id": 1, "result": {"tools": [...]}}
```

**错误格式：**
```json
{"jsonrpc": "2.0", "id": 1, "error": {"code": -32603, "message": "Internal error"}}
```

**通知格式（无 ID）：**
```json
{"jsonrpc": "2.0", "method": "notifications/initialized"}
```

---

## 2. MCP 协议规范

### 2.1 生命周期

MCP 连接的生命周期分为三个阶段：

1. **初始化（Initialize）**：
   - Client 发送 `initialize` 请求，包含协议版本和客户端信息
   - Server 回复支持的协议版本和 capabilities
   - Client 发送 `notifications/initialized` 通知确认初始化完成

2. **操作（Operation）**：
   - `tools/list` — 获取工具列表
   - `tools/call` — 调用指定工具
   - `resources/list` — 获取资源列表（可选）
   - `resources/read` — 读取资源（可选）

3. **关闭（Shutdown）**：
   - 关闭子进程 stdin
   - 等待进程退出
   - 清理 pending 请求

### 2.2 工具 Schema 定义

每个工具通过 JSON Schema 定义其参数：

```json
{
  "name": "tool_name",
  "description": "工具功能描述",
  "inputSchema": {
    "type": "object",
    "properties": {
      "param1": {
        "type": "string",
        "description": "参数说明"
      },
      "param2": {
        "type": "number",
        "description": "参数说明"
      }
    },
    "required": ["param1"]
  }
}
```

### 2.3 Frees Agent 中的实现

MCP 客户端实现在 `src/tools/mcp-client.js` 中，核心类为 `McpConnection` 和 `McpManager`。

**McpConnection** — 单个 MCP 服务器连接：
- 通过 `child_process.spawn` 启动 MCP 服务器进程
- 通过 stdio 管道进行 JSON-RPC 2.0 通信
- 支持 30 秒超时控制
- 工具列表缓存

**McpManager** — 多服务器管理器：
- 管理多个 `McpConnection` 实例
- 自动重连（断开后重新连接）
- `listAllTools()` 聚合所有服务器的工具
- `callTool(serverName, toolName, args)` 路由到指定服务器

**buildMcpToolHandlers()** — 构建 MCP 工具处理器：
- `refreshTools()` — 刷新所有服务器的工具缓存
- `tryHandleMcpTool(name, args)` — 尝试处理 MCP 工具调用
- `getToolNames()` / `getToolSchemas()` — 工具信息查询

---

## 3. 传输方式详解

### 3.1 Stdio 传输（当前实现）

MCP 服务器作为子进程运行，通过 stdin/stdout 进行 JSON-RPC 通信。

**优势：**
- 简单直接，无需网络配置
- 进程隔离，安全边界清晰
- 本地执行，延迟低

**实现要点：**
```javascript
const child = spawn(command, args, {
  env,
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: needsShell  // Windows 或脚本命令需要
});
```

**Shell 判断逻辑：**
- Windows 平台：始终使用 shell
- Unix 平台：如果命令不包含路径分隔符且不以 `.` 开头，使用 shell
- 否则直接 spawn（更安全）

### 3.2 HTTP 传输（占位）

当前 Frees Agent 的 MCP 实现专注于 stdio 传输。HTTP 传输可扩展支持：
- 远程 MCP 服务器
- 负载均衡
- 连接池复用

HTTP 传输时，MCP Server 暴露 HTTP 端点，Client 通过 POST 请求发送 JSON-RPC 消息。

### 3.3 传输选择建议

| 场景 | 推荐传输 | 原因 |
|------|----------|------|
| 本地工具 | Stdio | 低延迟、进程隔离 |
| 远程服务 | HTTP | 跨网络通信 |
| Docker 容器 | Stdio + Pipe | 容器内进程管理 |
| 集群部署 | HTTP | 负载均衡 |

---

## 4. MCP 服务器配置

### 4.1 配置文件结构

在项目目录下的 `.frees-agent/config.json` 中配置：

```json
{
  "mcpServers": {
    "tavily": {
      "command": "npx",
      "args": ["@tavily/mcp"],
      "env": {
        "TAVILY_API_KEY": "your-api-key"
      }
    },
    "ffmpeg": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-ffmpeg"],
      "timeoutMs": 60000
    }
  }
}
```

### 4.2 配置字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `command` | string | 是 | 可执行命令（npx、node、python 等） |
| `args` | string[] | 否 | 命令行参数 |
| `env` | object | 否 | 环境变量 |
| `transport` | string | 否 | 传输方式，默认 `stdio` |
| `timeoutMs` | number | 否 | 工具调用超时，默认 30000 |

### 4.3 环境变量配置

敏感信息（API Key、密钥等）推荐通过环境变量注入：

```json
{
  "mcpServers": {
    "tavily": {
      "command": "npx",
      "args": ["@tavily/mcp"],
      "env": {
        "TAVILY_API_KEY": "${TAVILY_API_KEY}"
      }
    }
  }
}
```

Frees Agent 会自动使用 `process.env` 中的 `${VAR_NAME}` 替换。

---

## 5. 工具命名与发现

### 5.1 命名空间隔离

MCP 工具注册到 Frees Agent 时使用命名空间格式，避免与其他工具冲突：

```
mcp__<serverName>__<toolName>
```

例如：
- `mcp__tavily__web_search`
- `mcp__ffmpeg__cut_video`
- `mcp__pillow__resize_image`

### 5.2 自动发现流程

1. Frees Agent 启动时，读取 `config.mcpServers` 中的所有服务器配置
2. 对每个服务器，调用 `McpManager.getOrConnect()` 建立连接
3. 发送 `initialize` 请求完成协议握手
4. 发送 `tools/list` 获取工具列表
5. 工具列表缓存到 `McpConnection._toolsCache`
6. 工具通过 `buildMcpToolHandlers()` 生成处理器
7. `tools.js` 中的 `createAgentToolbox()` 动态注册 `mcp__*` 工具

### 5.3 热加载

修改 MCP 配置后，无需重启 Frees Agent：
- 通过 GUI 设置面板添加/删除 MCP 服务器
- 修改通过 `PATCH /api/config` 或 `POST /api/mcp/servers` API 实时生效

---

## 6. 错误处理

### 6.1 连接错误

| 错误类型 | 原因 | 处理方式 |
|----------|------|----------|
| 进程启动失败 | command 不存在或无法执行 | 向用户报告错误信息 |
| 进程退出 | 服务器崩溃或异常退出 | 自动重连（getOrConnect） |
| 连接超时 | 30 秒内未收到 initialize 响应 | 断开连接，清理资源 |
| 协议版本不匹配 | Client/Server 版本不一致 | 报告兼容性错误 |

### 6.2 工具调用错误

| 错误类型 | 原因 | 处理方式 |
|----------|------|----------|
| 工具不存在 | 调用了未注册的工具 | 返回 `null`，tools.js 尝试其他工具 |
| 参数校验失败 | 参数格式不符合 schema | 返回错误信息，模型自动调整参数重试 |
| 执行超时 | 工具执行超过 timeoutMs | 返回超时错误，模型可决定重试 |
| 运行时错误 | 工具内部异常 | 返回错误堆栈，模型尝试简化操作 |

### 6.3 超时控制

每个 MCP 工具调用都有独立的超时控制：

```javascript
_sendRaw(request, timeoutMs = MCP_RESPONSE_TIMEOUT_MS) {
  // 默认 30 秒，可通过 config.mcpServers.<name>.timeoutMs 覆盖
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      this.pending.delete(request.id);
      reject(new Error(`MCP 请求超时: ${request.method}`));
    }, timeoutMs);
    // ...
  });
}
```

### 6.4 重连策略

McpManager 的 `getOrConnect()` 实现了自动重连：

1. 检查是否已有连接
2. 如果有连接但已断开，尝试 `connect()`
3. 如果重连失败，删除旧连接，创建新连接
4. 所有 pending 请求在断开时被 reject

---

## 7. 安全考虑

### 7.1 进程隔离

- MCP 服务器在独立子进程中运行
- 通过 stdio 通信，不共享内存空间
- 子进程使用 `windowsHide: true` 避免闪窗

### 7.2 命令安全

- 使用 `spawn` 而非 `exec`，避免 shell 注入
- 仅在必要时使用 shell（Windows 或脚本命令）
- `args` 作为数组传递，不拼接字符串

### 7.3 环境变量安全

- API Key 和密钥存储在 `env` 中，不暴露给模型
- GUI API 返回配置时自动脱敏（`apiKey` -> `••••••`）
- 推荐使用 `${VAR_NAME}` 引用系统环境变量

### 7.4 资源限制

- 默认超时 30 秒，防止长时间占用
- 输出大小限制（工具结果截断至 8000 字符）
- 进程异常退出自动清理资源

### 7.5 审计日志

- MCP 工具调用通过 WebSocket 实时推送（`tool_call` / `tool_result` 事件）
- GUI 展示工具调用状态（成功/失败/进行中）

---

## 8. 多服务器编排

### 8.1 并行调用

当模型同时需要多个 MCP 工具时，Frees Agent 的编排层（`agent/orchestration.js`）会自动优化：

- MCP 工具的 `mcp__*` 前缀被识别为只读工具
- 只读工具可以并行执行（默认并发 5）
- 写入工具串行执行，保持操作顺序

### 8.2 服务器间依赖

如果 MCP 工具之间存在逻辑依赖（如先搜索再处理结果），模型应：
1. 先调用搜索工具
2. 分析搜索结果
3. 再调用处理工具

Frees Agent 的工具循环天然支持这种多步交互。

### 8.3 路由策略

工具调用根据名称自动路由：
- `mcp__tavily__*` -> Tavily MCP 服务器
- `mcp__ffmpeg__*` -> FFmpeg MCP 服务器
- `mcp__pillow__*` -> Pillow MCP 服务器

---

## 9. CLI 使用示例

### 9.1 通过命令行使用 MCP provider

```bash
# 使用 MCP provider
frees-agent chat . --provider mcp --base-url http://127.0.0.1:1234/v1 --model qwen/qwen3.5-9b

# 诊断检查
frees-agent doctor . --provider mcp --ping
```

### 9.2 GUI 中管理 MCP 服务器

1. 启动 GUI：`frees-agent gui`
2. 打开设置面板（Ctrl+,）
3. 在 MCP 管理区域查看/添加/删除服务器
4. 添加后实时生效

### 9.3 查看已注册的 MCP 工具

GUI 侧边栏的"工具"面板会列出所有已注册的 MCP 工具（`mcp__*` 格式）。

---

## 10. 常见问题排查

### 10.1 MCP 服务器无法启动

**检查项：**
- `command` 是否在 PATH 中
- 依赖包是否已安装（`npm install -g @tavily/mcp`）
- 环境变量是否配置正确
- 端口是否被占用

**诊断命令：**
```bash
# 手动启动 MCP 服务器测试
npx @tavily/mcp

# 使用 doctor 检查连接
frees-agent doctor . --provider mcp --base-url http://127.0.0.1:1234/v1 --model test --ping
```

### 10.2 工具调用超时

**可能原因：**
- 工具执行时间过长（如视频处理）
- MCP 服务器负载过高
- 网络延迟（HTTP 传输场景）

**解决方案：**
- 增大 `timeoutMs` 配置
- 减小任务规模
- 检查服务器负载

### 10.3 工具未找到

**可能原因：**
- MCP 服务器配置未生效
- 工具命名空间错误
- 服务器连接已断开

**解决方案：**
- 检查 `mcpServers` 配置
- 重启 MCP 服务器
- 检查 GUI 工具面板中的工具列表
