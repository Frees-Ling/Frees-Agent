# MCP 工具配置模板

本文档提供常用 MCP 服务器的配置模板，复制到 `frees-agent.yaml` 即可启用。

## 视频处理 (FFmpeg)

```yaml
mcpServers:
  ffmpeg:
    command: npx
    args:
      - -y
      - "@anthropic/mcp-server-ffmpeg"
```

能力：视频剪辑、合并、转码、加字幕、提取音频、截取帧

## 图片处理 (Pillow)

```yaml
mcpServers:
  pillow:
    command: npx
    args:
      - -y
      - "@anthropic/mcp-server-pillow"
```

能力：图片裁剪、缩放、滤镜、格式转换、绘图

## 网页截图 (Puppeteer)

```yaml
mcpServers:
  puppeteer:
    command: npx
    args:
      - -y
      - "@modelcontextprotocol/server-puppeteer"
```

能力：网页截图、PDF 导出、点击操作、表单填写

## 文件系统增强

```yaml
mcpServers:
  filesystem:
    command: npx
    args:
      - -y
      - "@modelcontextprotocol/server-filesystem"
      - "/path/to/allowed/directory"
```

能力：文件搜索、内容搜索、批量操作

## 联网搜索 (Tavily)

```yaml
mcpServers:
  tavily:
    command: npx
    args:
      - -y
      - "@anthropic/mcp-server-tavily"
    env:
      TAVILY_API_KEY: "your-key-here"

tools:
  webSearch:
    enabled: true
    maxResults: 5
```

或通过环境变量：
```bash
set TAVILY_API_KEY=your-key-here
```

能力：实时联网搜索、新闻查询、信息检索

## 数据库 (PostgreSQL)

```yaml
mcpServers:
  postgres:
    command: npx
    args:
      - -y
      - "@anthropic/mcp-server-postgres"
      - "postgresql://user:pass@localhost/dbname"
```

能力：SQL 查询、表结构查看、数据导出

## 完整配置示例

```yaml
mcpServers:
  ffmpeg:
    command: npx
    args: ["-y", "@anthropic/mcp-server-ffmpeg"]
  pillow:
    command: npx
    args: ["-y", "@anthropic/mcp-server-pillow"]
  tavily:
    command: npx
    args: ["-y", "@anthropic/mcp-server-tavily"]
    env:
      TAVILY_API_KEY: "${TAVILY_API_KEY}"

tools:
  webSearch:
    enabled: true
    maxResults: 5

agent:
  autonomous:
    enabled: true
    maxSubTasks: 10
```
