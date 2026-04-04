# 如何接入 MCP 外部工具并配置 Frees Agent

本文件介绍如何将外部 MCP 工具与 `Frees Agent` 集成，并将配置写入 `agent-cli` 的默认配置中。

## 1. 背景

`Frees Agent` 当前的模型接入层基于 `provider` 抽象，默认支持：

- `ollama`
- `openai-compatible`
- `anthropic`

对于 `@tavily/mcp` 这类外部代理工具，最稳定的接入方式是通过 `openai-compatible` 接口访问它提供的本地 HTTP 端点。

## 2. 代码里已经写入的配置

在 `src/config.js` 中，已新增以下默认配置：

```js
providers: {
  ollama: {
    baseUrl: 'http://127.0.0.1:11434',
    model: 'qwen2.5-coder:7b'
  },
  'openai-compatible': {
    baseUrl: 'http://127.0.0.1:1234/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    model: 'qwen/qwen3.5-9b'
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    model: 'claude-sonnet-4-5'
  },
  mcp: {
    baseUrl: 'http://127.0.0.1:1234/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    model: 'your-model-name',
    server: 'tavily'
  }
},
mcpServers: {
  tavily: {
    command: 'npx',
    args: ['@tavily/mcp'],
    env: {
      TAVILY_API_KEY: 'YOUR_TAVILY_API_KEY'
    },
    baseUrl: 'http://127.0.0.1:1234/v1'
  }
}
```

这意味着：

- `mcp` 已被视为一个合法 provider
- 默认会使用 `tavily` MCP 服务器配置
- `mcpServers` 定义了外部进程启动方式和默认本地端点

## 3. 代码变化说明

### 3.1 `src/model/index.js`

已扩展 `resolveModelRuntime()`，支持：

- `provider = 'mcp'`
- `provider.server` 指向 `config.mcpServers` 中的服务名
- 如果 `baseUrl` 为空，则可从 `mcpServers[server].baseUrl` 读取

### 3.2 `createModelClient()`

已将 `mcp` provider 映射到 `OpenAICompatibleClient`：

- `mcp` 与 `openai-compatible` 共享同一 OpenAI 兼容请求逻辑
- 发送路径仍为 `${baseUrl}/chat/completions`

### 3.3 `src/cli.js`

CLI 帮助信息已更新，支持：

- `--provider mcp`

## 4. 如何使用

### 4.1 启动 MCP 工具

请先启动 `@tavily/mcp`：

```bash
export TAVILY_API_KEY=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
npx @tavily/mcp
```

如果你的 MCP 工具监听地址不是 `http://127.0.0.1:1234/v1`，请按实际地址修改 `baseUrl`。

### 4.2 配置 `.frees-agent/config.json`

将你的配置写入项目目录下的 `.frees-agent/config.json`，例如：

```json
{
  "defaultProvider": "mcp",
  "defaultModel": "your-model-name",
  "providers": {
    "mcp": {
      "baseUrl": "http://127.0.0.1:1234/v1",
      "apiKeyEnv": "OPENAI_API_KEY",
      "model": "your-model-name",
      "server": "tavily"
    }
  },
  "mcpServers": {
    "tavily": {
      "command": "npx",
      "args": ["@tavily/mcp"],
      "env": {
        "TAVILY_API_KEY": "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"
      },
      "baseUrl": "http://127.0.0.1:1234/v1"
    }
  }
}
```

### 4.3 直接命令行使用

如果你不想改配置文件，也可以直接在命令行传参数：

```bash
frees-agent chat . \
  --provider mcp \
  --base-url http://127.0.0.1:1234/v1 \
  --model your-model-name \
  --api-key-env OPENAI_API_KEY
```

## 5. 选项说明

- `provider=mcp`
  使用 `mcp` provider，当前会通过 `OpenAICompatibleClient` 发送请求。
- `mcpServers` 
  定义外部 MCP 进程启动方式。
- `server` 
  在 `providers.mcp.server` 中指定具体的 MCP 服务配置。
- `baseUrl` 
  如果命令行或 provider 配置中提供 `baseUrl`，优先使用它。

## 6. 运行诊断

可以使用 `doctor` 命令检查配置是否生效：

```bash
frees-agent doctor . --provider mcp --base-url http://127.0.0.1:1234/v1 --model your-model-name --ping
```

如果配置正确，`doctor` 会显示 provider、baseUrl、model，并在 `--ping` 时收到回复。

## 7. 注意事项

1. `Frees Agent` 本身不会自动下载 `@tavily/mcp`，你需要先安装并启动它。
2. `mcpServers` 中的 API key 写法只用于说明；生产环境请避免把真实密钥直接提交到仓库。
3. `mcp` provider 的实际请求方式与 `openai-compatible` 保持一致，适合 MCP 提供 OpenAI 兼容接口的场景。
