# 如何加载模型与接入自己的模型或云端 API

## 1. Frees Agent 当前支持的模型接入方式

`Frees Agent` 当前支持三类 provider：

- `ollama`
- `openai-compatible`
- `anthropic`

核心入口在：

- `src/model/index.js`
- `src/model/ollama.js`
- `src/model/openai-compatible.js`
- `src/model/anthropic.js`

## 2. 如何在配置里切换模型

默认情况下，配置文件会写到当前工作目录下：

- `.frees-agent/config.json`

如果你想改位置，可以设置：

- `FREES_AGENT_HOME`

示例：

```json
{
  "defaultProvider": "ollama",
  "defaultModel": "qwen2.5-coder:7b",
  "providers": {
    "ollama": {
      "baseUrl": "http://127.0.0.1:11434",
      "model": "qwen2.5-coder:7b"
    },
    "openai-compatible": {
      "baseUrl": "http://127.0.0.1:1234/v1",
      "apiKeyEnv": "OPENAI_API_KEY",
      "model": "your-local-model"
    },
    "anthropic": {
      "baseUrl": "https://api.anthropic.com",
      "apiKeyEnv": "ANTHROPIC_API_KEY",
      "model": "claude-sonnet-4-5"
    }
  }
}
```

## 3. 如何加载本地模型

### 方式 A：Ollama

```bash
frees-agent chat . --provider ollama --model qwen2.5-coder:7b
```

配置中：

- `provider = ollama`
- `baseUrl = http://127.0.0.1:11434`

### 方式 B：OpenAI 兼容本地服务

适合：

- LM Studio
- llama.cpp server
- vLLM
- TGI
- LocalAI

示例：

```bash
frees-agent chat . \
  --provider openai-compatible \
  --base-url http://127.0.0.1:1234/v1 \
  --model your-model-name
```

## 4. 如何加载多切割本地模型

对于 `GGUF` 多切割模型，例如：

- `model-00001-of-00004.gguf`
- `model-00002-of-00004.gguf`
- `model-00003-of-00004.gguf`
- `model-00004-of-00004.gguf`

通常不是 `Frees Agent` 自己直接去拼接文件，而是由：

- Ollama
- llama.cpp
- LM Studio
- 其他推理后端

来负责加载。

`Frees Agent` 只负责连接这些后端提供的服务接口。

## 5. 如何接入云端 API

### Anthropic

```bash
export ANTHROPIC_API_KEY=your_key
frees-agent chat . --provider anthropic --model claude-sonnet-4-5
```

### OpenAI 兼容云端接口

如果你的服务兼容 OpenAI Chat Completions API，也可以这样接：

```bash
export OPENAI_API_KEY=your_key
frees-agent chat . \
  --provider openai-compatible \
  --base-url https://your-api.example.com/v1 \
  --model your-model
```

## 6. 如何在代码里增加新的 provider

如果你想在 `Frees Agent` 代码内接入自己的模型或网关，可以按下面方式扩展：

### 第一步：新增 provider 客户端

在 `src/model/` 下增加一个文件，例如：

```js
export class MyProviderClient {
  constructor({ baseUrl, apiKey, model }) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateText({ systemPrompt, messages, temperature, maxOutputTokens }) {
    // 在这里写你自己的 HTTP 请求逻辑
    return "your model output";
  }
}
```

### 第二步：在 `src/model/index.js` 注册

在 `createModelClient()` 里加入：

```js
} else if (runtime.providerName === 'my-provider') {
  client = new MyProviderClient({
    baseUrl: runtime.baseUrl,
    apiKey: runtime.apiKey,
    model: runtime.model
  });
}
```

### 第三步：在配置文件里增加 provider

```json
"providers": {
  "my-provider": {
    "baseUrl": "https://your-endpoint.example.com",
    "apiKeyEnv": "MY_PROVIDER_API_KEY",
    "model": "my-model"
  }
}
```

## 7. 一句最关键的话

`Frees Agent` 不是把模型硬编码进 CLI，而是通过统一的 provider 抽象层接入模型。

这意味着你既可以：

- 接本地模型
- 接云端模型
- 接代理网关
- 接自己封装的私有模型服务
