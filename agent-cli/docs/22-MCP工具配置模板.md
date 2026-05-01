# MCP 工具配置模板

本文档全面介绍 Frees-Agent 中 MCP (Model Context Protocol) 工具的配置方法。无论你是第一次接入 MCP 工具，还是需要排查连接问题，本文档都能提供帮助。

---

## 目录

1. [什么是 MCP](#什么是-mcp)
2. [MCP 的工作原理](#mcp-的工作原理)
3. [JSON-RPC 协议基础](#json-rpc-协议基础)
4. [stdio 传输机制](#stdio-传输机制)
5. [Frees-Agent 中的 MCP 配置格式](#frees-agent-中的-mcp-配置格式)
6. [工具配置模板](#工具配置模板)
   - [文件系统增强](#文件系统增强)
   - [Git 版本控制](#git-版本控制)
   - [视频处理 FFmpeg](#视频处理-ffmpeg)
   - [图片处理 Pillow](#图片处理-pillow)
   - [网页截图 Puppeteer](#网页截图-puppeteer)
   - [联网搜索 Tavily](#联网搜索-tavily)
   - [联网搜索 Brave Search](#联网搜索-brave-search)
   - [数据库 PostgreSQL](#数据库-postgresql)
   - [数据库 SQLite](#数据库-sqlite)
   - [Docker 容器管理](#docker-容器管理)
   - [GitHub API](#github-api)
   - [Web 内容获取](#web-内容获取)
   - [记忆与知识图谱](#记忆与知识图谱)
7. [完整配置示例](#完整配置示例)
8. [环境变量管理](#环境变量管理)
9. [故障排查](#故障排查)
10. [安全注意事项](#安全注意事项)

---

## 什么是 MCP

**MCP (Model Context Protocol)** 是由 Anthropic 提出并开源的开放协议，全称 **Model Context Protocol**。它的核心目标是**标准化 AI 应用与外部工具、数据源之间的通信方式**。

打个比方：如果说 USB-C 是硬件设备的通用接口标准，那么 MCP 就是 AI 应用的通用接口标准。通过 MCP，任何兼容的 AI 应用（如 Frees-Agent）都可以像"即插即用"一样连接各种外部工具。

MCP 协议的出现解决了以下痛点：

| 问题 | 传统方案 | MCP 方案 |
|------|----------|----------|
| 工具集成方式 | 每种工具写一套专用代码 | 统一接口，即插即用 |
| 协议标准化 | 自定义 HTTP API、参数格式各异 | JSON-RPC 2.0 统一协议 |
| 跨语言支持 | 通常绑定特定语言 SDK | 语言无关，仅需 JSON 通信 |
| 安全隔离 | 需自行实现 | stdio 进程天然隔离 |

---

## MCP 的工作原理

MCP 采用 **客户端-服务器 (Client-Server)** 架构：

```
┌─────────────────────────┐
│     AI 应用 (Host)       │  ← Frees-Agent 是 Host
│  ┌─────────────────────┐│
│  │  MCP Client          ││  ← 内置的 MCP 客户端
│  └────────┬────────────┘│
└───────────┼─────────────┘
            │ JSON-RPC over stdio
     ┌──────┴──────┐
     │  MCP Server  │  ← 独立的子进程
     │  (工具实现)   │
     └─────────────┘
```

**工作流程：**

1. **启动阶段**：Frees-Agent 读取 `frees-agent.yaml` 中的 `mcpServers` 配置，为每个配置项启动一个子进程（MCP Server）。
2. **初始化阶段**：MCP Client 通过 stdin/stdout 与 MCP Server 完成握手（`initialize` 请求），获取服务器提供的工具列表、资源列表和能力声明。
3. **运行阶段**：当 AI 模型决定调用某个 MCP 工具时，Frees-Agent 通过 stdio 向对应的 MCP Server 发送 `tools/call` 请求，服务器执行操作并返回结果。
4. **终止阶段**：当 Frees-Agent 退出时，所有 MCP Server 子进程自动终止。

**关键概念：**

- **Tools（工具）**：MCP Server 暴露的可调用函数，有名称、参数和返回值。AI 模型可以自主决定何时调用。
- **Resources（资源）**：MCP Server 暴露的数据源（如文件、数据库记录），可以被读取但不可调用。
- **Prompts（提示词模板）**：预定义的提示词模板，可在特定场景下复用。

---

## JSON-RPC 协议基础

MCP 使用 **JSON-RPC 2.0** 作为底层通信协议。JSON-RPC 是一种轻量级的远程过程调用协议，具有以下特点：

### 请求格式

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "read_file",
    "arguments": {
      "path": "/home/user/example.txt"
    }
  }
}
```

| 字段 | 说明 |
|------|------|
| `jsonrpc` | 固定为 `"2.0"`，标识协议版本 |
| `id` | 请求标识符，响应中会原样返回。用于匹配请求和响应 |
| `method` | 要调用的方法名。MCP 标准方法包括 `initialize`、`tools/list`、`tools/call`、`resources/list` 等 |
| `params` | 方法参数，可以是对象或数组 |

### 响应格式

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "文件内容..."
      }
    ]
  }
}
```

### 错误响应

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Internal error",
    "data": "Cannot read file: Permission denied"
  }
}
```

**标准错误码：**

| 错误码 | 含义 |
|--------|------|
| `-32700` | 解析错误（无效 JSON） |
| `-32600` | 无效请求 |
| `-32601` | 方法不存在 |
| `-32602` | 无效参数 |
| `-32603` | 内部错误 |

### 通知

通知是一种无响应的请求，`id` 字段为 `null` 或省略。MCP 中的通知用于日志、进度更新等场景。

---

## stdio 传输机制

MCP 支持多种传输方式，其中 **stdio** 是最常用、最推荐的方案。

### 工作原理

```
Frees-Agent (MCP Client)                  MCP Server (子进程)
         │                                       │
         │────── 启动子进程 ──────────────────────→│
         │                                       │
         │────── stdin: {"jsonrpc":"2.0",...} ───→│
         │                                       │
         │←───── stdout: {"jsonrpc":"2.0",...} ───│
         │                                       │
         │────── stdin: {"jsonrpc":"2.0",...} ───→│
         │                                       │
         │←───── stdout: {"jsonrpc":"2.0",...} ───│
```

### stdio 的优势

1. **零网络开销**：通信在同一进程内完成，无需 HTTP 连接
2. **天然安全隔离**：MCP Server 运行在独立的子进程中，崩溃不会影响主进程
3. **自动生命周期管理**：主进程退出时子进程自动终止
4. **跨平台兼容**：所有操作系统都支持 stdin/stdout
5. **无需端口管理**：不存在端口冲突问题

### 其他传输方式

虽然 stdio 是最常用的方式，MCP 也支持其他传输：

| 传输方式 | 适用场景 | 配置方式 |
|----------|----------|----------|
| stdio | 本地工具、CLI 集成 | `command` + `args` |
| WebSocket | 远程服务器 | 通过 WebSocket URL 连接 |
| SSE (Server-Sent Events) | 服务端推送场景 | HTTP 端点配置 |

---

## Frees-Agent 中的 MCP 配置格式

在 Frees-Agent 中，MCP 服务器的配置位于 `frees-agent.yaml` 文件的 `mcpServers` 字段下：

```yaml
mcpServers:
  <server-name>:
    command: <可执行文件路径或命令名>
    args:
      - <参数1>
      - <参数2>
    env:
      <环境变量名>: <值>
```

| 配置项 | 必填 | 说明 |
|--------|------|------|
| `command` | 是 | 启动 MCP Server 的可执行文件路径或命令名（如 `npx`、`node`、`uvx`、`docker` 等） |
| `args` | 是 | 传递给命令的参数列表（通常包括包名和服务器特有参数） |
| `env` | 否 | 需要设置的环境变量字典。Frees-Agent 会自动注入这些变量 |
| `server-name` | - | 自定义名称，用于标识这个 MCP 服务器。同时也是工具前缀（如 `mcp__filesystem__read_file`） |

> **重要**：Frees-Agent 不支持每个服务配置独立的 `disabled` 字段。要临时禁用某个 MCP 工具，只需从配置中移除或注释掉对应条目。

### 工具命名规则

MCP 工具在 Frees-Agent 中注册时，会自动添加 `mcp__<server-name>__` 前缀：

```
MCP 服务器名: filesystem
工具名: read_file
在 Frees-Agent 中调用: mcp__filesystem__read_file
```

---

## 工具配置模板

以下配置模板可以直接复制到你的 `frees-agent.yaml` 中使用。每个模板都包含完整的配置和说明。

---

### 文件系统增强

通过 `@modelcontextprotocol/server-filesystem` 提供超越内置工具的高级文件操作能力。

```yaml
mcpServers:
  filesystem:
    command: npx
    args:
      - -y
      - "@modelcontextprotocol/server-filesystem"
      - "/path/to/allowed/directory"
```

**参数说明：**
- `-y`：自动确认 npx 安装包，避免交互式提示
- 最后一个参数是**允许访问的目录路径**，MCP Server 只能操作该目录及其子目录中的文件

**提供的工具：**
- 文件搜索（支持通配符和递归）
- 批量文件操作（复制、移动、重命名）
- 文件权限管理

**能力：** 文件搜索、内容搜索、批量操作

---

### Git 版本控制

通过 `@anthropic/mcp-server-git` 为 AI 提供 Git 仓库操作能力。

```yaml
mcpServers:
  git:
    command: npx
    args:
      - -y
      - "@anthropic/mcp-server-git"
```

**提供的工具：**
- `git_status`：查看工作区状态
- `git_diff`：查看文件差异
- `git_commit`：创建提交
- `git_log`：查看提交历史
- `git_branch`：分支管理
- `git_push/pull`：远程操作

**能力：** 仓库状态查询、变更查看、提交管理、分支操作

---

### 视频处理 FFmpeg

通过 `@anthropic/mcp-server-ffmpeg` 提供视频/音频处理能力。

```yaml
mcpServers:
  ffmpeg:
    command: npx
    args:
      - -y
      - "@anthropic/mcp-server-ffmpeg"
```

**前置条件：** 系统需要安装 FFmpeg。验证方法：

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# 验证安装
ffmpeg -version
```

**提供的操作：**
- 视频剪辑（指定起止时间裁剪）
- 视频合并（拼接多个视频文件）
- 格式转换（MP4、AVI、MKV、WebM 等）
- 添加字幕（SRT、ASS 字幕文件嵌入）
- 提取音频（从视频中提取 MP3、WAV 等）
- 截取帧（从指定时间点截取图片）

**能力：** 视频剪辑、合并、转码、加字幕、提取音频、截取帧

---

### 图片处理 Pillow

通过 `@anthropic/mcp-server-pillow` 提供图片处理能力。

```yaml
mcpServers:
  pillow:
    command: npx
    args:
      - -y
      - "@anthropic/mcp-server-pillow"
```

**前置条件：** 系统需要安装 Python 3 和 Pillow 库。

```bash
pip install Pillow
```

**提供的操作：**
- 图片裁剪（指定区域截取）
- 缩放调整（按比例或指定尺寸）
- 滤镜效果（模糊、锐化、边缘检测等）
- 格式转换（PNG、JPEG、WebP、BMP 等）
- 绘图操作（画线、矩形、文字叠加）
- 颜色调整（亮度、对比度、饱和度）

**能力：** 图片裁剪、缩放、滤镜、格式转换、绘图

---

### 网页截图 Puppeteer

通过 `@modelcontextprotocol/server-puppeteer` 提供浏览器自动化能力。

```yaml
mcpServers:
  puppeteer:
    command: npx
    args:
      - -y
      - "@modelcontextprotocol/server-puppeteer"
```

**前置条件：** 系统需要安装 Chromium/Chrome。如果 `npx` 首次运行，会自动下载 Chromium（约 300MB）。

**提供的操作：**
- 网页截图（完整页面或视口截图）
- PDF 导出（将网页渲染为 PDF）
- 点击操作（模拟用户点击）
- 表单填写（自动填入表单字段）
- 页面导航（跳转、刷新、返回）
- DOM 内容提取

**能力：** 网页截图、PDF 导出、点击操作、表单填写

---

### 联网搜索 Tavily

通过 `@anthropic/mcp-server-tavily` 提供实时联网搜索能力。

```yaml
mcpServers:
  tavily:
    command: npx
    args:
      - -y
      - "@anthropic/mcp-server-tavily"
    env:
      TAVILY_API_KEY: "your-api-key-here"
```

**获取 API Key：**
1. 访问 [Tavily 官网](https://tavily.com) 注册账号
2. 在 Dashboard 中创建 API Key
3. 免费层每月提供 1000 次搜索额度

**备用配置方式（环境变量）：**

```yaml
mcpServers:
  tavily:
    command: npx
    args:
      - -y
      - "@anthropic/mcp-server-tavily"
    env:
      TAVILY_API_KEY: "${TAVILY_API_KEY}"  # 从系统环境变量读取
```

或直接设置系统环境变量：

```bash
# macOS/Linux
export TAVILY_API_KEY=your-api-key-here

# Windows (CMD)
set TAVILY_API_KEY=your-api-key-here

# Windows (PowerShell)
$env:TAVILY_API_KEY="your-api-key-here"
```

**可选的 Frees-Agent 配置：**

```yaml
tools:
  webSearch:
    enabled: true
    maxResults: 5
```

**能力：** 实时联网搜索、新闻查询、信息检索、内容摘要

---

### 联网搜索 Brave Search

通过 `@anthropic/mcp-server-brave-search` 提供基于 Brave Search 引擎的搜索能力。

```yaml
mcpServers:
  brave-search:
    command: npx
    args:
      - -y
      - "@anthropic/mcp-server-brave-search"
    env:
      BRAVE_API_KEY: "${BRAVE_API_KEY}"
```

**获取 API Key：**
1. 访问 [Brave Search API](https://brave.com/search/api/) 注册
2. 免费层每月提供 2000 次搜索
3. 无需信用卡即可注册

**与 Tavily 对比：**

| 特性 | Tavily | Brave Search |
|------|--------|-------------|
| 免费额度 | 1000 次/月 | 2000 次/月 |
| AI 优化 | 是（结果经过 AI 摘要） | 否（原始搜索结果） |
| 新闻搜索 | 支持 | 支持 |
| 图片搜索 | 不支持 | 支持 |
| 地域定制 | 支持 | 支持 |

**能力：** 实时搜索、新闻查询、图片搜索

---

### 数据库 PostgreSQL

通过 `@anthropic/mcp-server-postgres` 提供 PostgreSQL 数据库操作能力。

```yaml
mcpServers:
  postgres:
    command: npx
    args:
      - -y
      - "@anthropic/mcp-server-postgres"
      - "postgresql://user:password@localhost:5432/dbname"
```

**连接字符串格式：**

```
postgresql://<用户名>:<密码>@<主机>:<端口>/<数据库名>
```

各参数说明：

| 部分 | 说明 | 默认值 |
|------|------|--------|
| `用户名` | 数据库用户 | `postgres` |
| `密码` | 用户密码 | 无 |
| `主机` | 数据库服务器地址 | `localhost` |
| `端口` | 连接端口 | `5432` |
| `数据库名` | 目标数据库 | 与用户名相同 |

**提供的操作：**
- 执行 SQL 查询（SELECT、INSERT、UPDATE、DELETE）
- 查看表结构（列出表、字段、索引、外键）
- 数据导出（查询结果输出）

**安全提示：**
- 不要将包含密码的连接字符串提交到版本控制
- 使用只读账号进行查询操作
- 对生产数据库使用连接池限制

**能力：** SQL 查询、表结构查看、数据导出

---

### 数据库 SQLite

通过 MCP 提供本地 SQLite 数据库操作能力。

```yaml
mcpServers:
  sqlite:
    command: uvx
    args:
      - "mcp-server-sqlite"
      - "--db-path"
      - "/path/to/your/database.db"
```

> **注意**：`uvx` 是基于 Python 的工具管理器，需要先安装 `uv`：`pip install uv`。

**提供的操作：**
- CREATE/ALTER TABLE 等 DDL 操作
- SELECT/INSERT/UPDATE/DELETE 等 DML 操作
- 数据库 schema 浏览
- 事务管理

**能力：** SQL 查询、数据库管理、Schema 浏览

---

### Docker 容器管理

提供 Docker 容器和镜像操作能力。

```yaml
mcpServers:
  docker:
    command: npx
    args:
      - -y
      - "@anthropic/mcp-server-docker"
```

**前置条件：**
- Docker 已安装并运行
- 当前用户有 Docker 执行权限（或在 root 下运行）

```bash
# 验证 Docker 安装
docker --version
docker ps
```

**提供的操作：**
- 容器列表查看（运行中、全部）
- 容器日志查看
- 容器启停管理
- 镜像列表查看
- 容器内命令执行

**能力：** 容器管理、镜像管理、日志查看

---

### GitHub API

通过 MCP 提供 GitHub API 操作能力。

```yaml
mcpServers:
  github:
    command: npx
    args:
      - -y
      - "@anthropic/mcp-server-github"
    env:
      GITHUB_TOKEN: "${GITHUB_TOKEN}"
```

**获取 GitHub Token：**
1. 进入 GitHub Settings → Developer settings → Personal access tokens
2. 选择 Fine-grained tokens 或 Tokens (classic)
3. 选择需要的权限（至少 `repo` 权限以操作仓库）
4. 生成并复制 Token

**提供的操作：**
- 仓库管理（创建、查看、搜索）
- Issue 管理（创建、查看、评论、关闭）
- PR 管理（创建、审查、合并）
- 文件操作（读取、写入、创建 PR）
- 用户信息查询

**能力：** 仓库操作、Issue/PR 管理、代码浏览

---

### Web 内容获取

多个 MCP 服务器提供网页内容获取能力。除了内置的 `web_fetch` 工具外，以下 MCP 服务器提供更强大的网页内容获取能力：

```yaml
mcpServers:
  fetch:
    command: npx
    args:
      - -y
      - "@anthropic/mcp-server-fetch"
    env:
      # 可选：配置代理
      HTTP_PROXY: ""
      HTTPS_PROXY: ""
```

**提供的操作：**
- 网页内容抓取（支持 JS 渲染）
- Markdown 格式转换
- 文件下载
- 自定义 User-Agent

**能力：** 网页抓取、内容提取、格式转换

---

### 知识图谱记忆

提供持久化记忆和知识图谱能力。

```yaml
mcpServers:
  memory:
    command: npx
    args:
      - -y
      - "@anthropic/mcp-server-memory"
```

**提供的操作：**
- 存储事实和关系
- 查询记忆内容
- 关联搜索
- 知识图谱可视化

**能力：** 结构化记忆、关系存储、知识查询

---

## 完整配置示例

以下是一个集成了多种 MCP 服务器的完整配置示例：

```yaml
# Frees-Agent 完整配置
mcpServers:
  # 文件系统操作
  filesystem:
    command: npx
    args:
      - -y
      - "@modelcontextprotocol/server-filesystem"
      - "/Users/username/projects"

  # Git 仓库管理
  git:
    command: npx
    args:
      - -y
      - "@anthropic/mcp-server-git"

  # 视频处理
  ffmpeg:
    command: npx
    args:
      - -y
      - "@anthropic/mcp-server-ffmpeg"

  # 图片处理
  pillow:
    command: npx
    args:
      - -y
      - "@anthropic/mcp-server-pillow"

  # 浏览器自动化
  puppeteer:
    command: npx
    args:
      - -y
      - "@modelcontextprotocol/server-puppeteer"

  # 联网搜索
  tavily:
    command: npx
    args:
      - -y
      - "@anthropic/mcp-server-tavily"
    env:
      TAVILY_API_KEY: "${TAVILY_API_KEY}"

  # 数据库
  postgres:
    command: npx
    args:
      - -y
      - "@anthropic/mcp-server-postgres"
      - "postgresql://readonly:password@localhost:5432/mydb"

# 工具配置
tools:
  webSearch:
    enabled: true
    maxResults: 5

# Agent 行为配置
agent:
  autonomous:
    enabled: true
    maxSubTasks: 10
```

---

## 环境变量管理

### 使用 .env 文件

```bash
# .env 文件（放在 Frees-Agent 工作目录下）
TAVILY_API_KEY=tvly-your-key-here
BRAVE_API_KEY=BSA-your-key-here
GITHUB_TOKEN=ghp_your-token-here
```

### 配置引用环境变量

```yaml
mcpServers:
  tavily:
    command: npx
    args:
      - -y
      - "@anthropic/mcp-server-tavily"
    env:
      TAVILY_API_KEY: "${TAVILY_API_KEY}"
```

### 使用系统环境变量

```bash
# macOS / Linux (~/.zshrc 或 ~/.bashrc)
export TAVILY_API_KEY="tvly-your-key-here"

# 重新加载配置
source ~/.zshrc
```

### 环境变量安全最佳实践

1. **永远不要**将 API Key 直接写在 YAML 文件中并提交到版本控制
2. 使用 `.env` 文件并加入 `.gitignore`
3. 不同环境（开发/测试/生产）使用不同的 API Key
4. 定期轮换 API Key
5. 使用最小权限原则：只授予必要的权限

---

## 故障排查

### MCP 服务器无法启动

**现象**：Frees-Agent 启动时报错，提示 MCP 服务器连接失败。

**排查步骤：**

```bash
# 1. 手动测试命令能否正常执行
npx -y @anthropic/mcp-server-tavily

# 2. 检查是否有网络问题（npx 需要联网下载包）
npm ping

# 3. 检查 npm 缓存是否损坏
npx clear-npx-cache

# 4. 检查 Node.js 版本
node --version  # 需要 >= 18.0.0
```

### 常见问题及解决方案

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| `command not found: npx` | Node.js 未安装 | 安装 Node.js ≥ 18：`brew install node` |
| `Error: Cannot find module` | npm 包未正确安装 | 手动安装：`npm install -g <包名>` |
| `Connection refused` | 数据库服务器未启动 | 检查数据库服务状态 |
| `Permission denied` | 文件/目录权限不足 | 检查路径权限 |
| `ETIMEOUT` | 网络连接超时 | 检查网络连接和防火墙设置 |
| `TAVILY_API_KEY not set` | 环境变量未配置 | 检查 API Key 配置 |
| `Chromium failed to launch` | Puppeteer 依赖缺失 | `npx puppeteer install` |
| `FFmpeg not found` | FFmpeg 未安装 | `brew install ffmpeg` |
| Port conflict | 端口被占用 | 检查并释放端口 |

### 调试模式

如果遇到问题，可以启用调试日志：

```bash
# 设置 DEBUG 环境变量
DEBUG=mcp:* frees-agent chat

# 或更详细的日志
DEBUG=mcp:* frees-agent chat --verbose
```

### 验证 MCP 服务器状态

Frees-Agent 启动时，如果有 MCP 服务器连接失败，会在启动日志中显示错误信息。你也可以通过内置命令检查：

```bash
# 查看当前配置
frees-agent config show

# 查看 MCP 服务器状态
frees-agent mcp status
```

---

## 安全注意事项

### 1. MCP 服务器权限范围

每个 MCP 服务器在其进程中可以执行任何操作。这意味着：

- **文件系统服务器**可以读取、写入、删除其权限范围内的所有文件
- **Shell/Python 服务器**可以执行系统命令
- **数据库服务器**可以执行 SQL 语句

```yaml
# 安全做法：限制文件系统访问范围
mcpServers:
  filesystem:
    command: npx
    args:
      - -y
      - "@modelcontextprotocol/server-filesystem"
      - "/home/user/projects/allowed-dir"  # 只允许访问此目录
```

### 2. 连接字符串安全

```yaml
# 不安全：密码直接写在配置中
mcpServers:
  postgres:
    command: npx
    args:
      - -y
      - "@anthropic/mcp-server-postgres"
      - "postgresql://admin:SuperSecret123!@localhost:5432/prod"

# 安全：使用环境变量引用
mcpServers:
  postgres:
    command: npx
    args:
      - -y
      - "@anthropic/mcp-server-postgres"
      - "postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
```

### 3. 使用只读账号

```sql
-- 为 MCP 工具创建只读数据库用户
CREATE USER mcp_readonly WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE mydb TO mcp_readonly;
GRANT USAGE ON SCHEMA public TO mcp_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mcp_readonly;
```

### 4. MCP 服务器的安全风险

| 风险 | 说明 | 缓解措施 |
|------|------|----------|
| 命令注入 | 恶意参数可能触发危险命令 | 参数验证和转义 |
| 文件泄露 | 读取敏感文件 | 限制文件系统访问范围 |
| API 密钥泄露 | 环境变量暴露 | 使用环境变量引用，不在配置中硬编码 |
| 资源耗尽 | 无限制的文件操作导致磁盘或内存溢出 | 设置文件大小和数量限制 |
| 网络访问 | 某些 MCP 服务器可能发起网络请求 | 在隔离环境中使用时注意防火墙配置 |

### 5. 生产环境部署建议

- 使用专门的、最小权限的系统账号运行 Frees-Agent
- 对数据库 MCP 工具使用只读账号（除非需要写入）
- 文件系统 MCP 工具限制在专用工作目录
- 对包含 API Key 的配置文件设置 `600` 权限
- 定期审计 MCP 服务器使用日志
- 在 CI/CD 环境中禁用不需要的 MCP 工具
