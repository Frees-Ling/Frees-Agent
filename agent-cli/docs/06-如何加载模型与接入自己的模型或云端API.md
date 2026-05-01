# 如何加载模型与接入自己的模型或云端 API

> Frees Agent 采用统一的 Provider 抽象层接入各类 LLM 模型。这意味着你可以在同一个 CLI 工具中灵活切换本地模型、云端 API 和自定义模型服务。本文详细讲解所有支持的接入方式、配置参数和扩展方案。

---

## 第一章：Frees Agent 的模型接入架构

### 1.1 Provider 抽象层

Frees Agent 的模型接入采用 **Provider** 设计模式——每种模型服务对应一个 Provider（提供商），所有 Provider 对外暴露统一的接口。

```text
┌──────────────────────────────────────────────────┐
│                  Frees Agent CLI                   │
├──────────────────────────────────────────────────┤
│  ┌──────────────────── Provider 抽象层 ──────────┐ │
│  │                                                │ │
│  │  统一接口：generateText() / streamText()       │ │
│  │                                                │ │
│  └───────┬─────────────┬────────────┬────────────┘ │
│          │             │            │               │
│          ▼             ▼            ▼               │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐      │
│  │  Ollama    │ │OpenAI-     │ │ Anthropic  │      │
│  │  Client    │ │Compatible  │ │  Client    │      │
│  └────────────┘ │  Client    │ └────────────┘      │
│                 └────────────┘                      │
│          │             │            │               │
│          ▼             ▼            ▼               │
│     本地推理        本地/云端API    Anthropic API    │
└──────────────────────────────────────────────────┘
```

每个 Provider 都必须实现两个核心方法：

```typescript
interface ModelClient {
  // 非流式生成：发送请求，等待完整回复
  async generateText(params: {
    systemPrompt: string;
    messages: Message[];
    temperature?: number;
    maxOutputTokens?: number;
  }): Promise<string>;

  // 流式生成：逐 token 回调，边生成边展示
  async streamText(params: {
    systemPrompt: string;
    messages: Message[];
    temperature?: number;
    maxOutputTokens?: number;
    onToken: (token: string) => Promise<void>;
  }): Promise<string>;
}
```

### 1.2 三种原生支持的 Provider

Frees Agent 当前内置支持三种 Provider：

| Provider | 适用场景 | 模型来源 | 是否需要 API Key |
|---------|---------|---------|----------------|
| **ollama** | 本地运行开源模型 | Ollama 模型库 | 否 |
| **openai-compatible** | 兼容 OpenAI API 的本地/云端服务 | LM Studio, vLLM, TGI, LocalAI 等 | 可能（取决于服务） |
| **anthropic** | 使用 Anthropic 云端 API | Claude 系列模型 | 是 |

---

## 第二章：配置详解

### 2.1 配置文件结构

默认配置文件路径（可由 `FREES_AGENT_HOME` 环境变量修改）：

```text
默认路径：
  .frees-agent/config.json  （当前工作目录）

自定义路径（设置环境变量）：
  export FREES_AGENT_HOME=/path/to/config
  配置路径：
    /path/to/config/config.json
```

### 2.2 完整配置示例

```json
{
  "defaultProvider": "ollama",
  "defaultModel": "qwen2.5-coder:7b",
  "conversation": {
    "streamResponses": true,
    "maxHistoryLength": 100,
    "systemPrompt": "你是 Frees Agent，一个智能编程助手..."
  },
  "providers": {
    "ollama": {
      "baseUrl": "http://127.0.0.1:11434",
      "model": "qwen2.5-coder:7b",
      "options": {
        "temperature": 0.7,
        "top_p": 0.9,
        "num_predict": 4096
      }
    },
    "openai-compatible": {
      "baseUrl": "http://127.0.0.1:1234/v1",
      "apiKeyEnv": "OPENAI_API_KEY",
      "model": "your-local-model",
      "options": {
        "temperature": 0.5,
        "max_tokens": 4096
      }
    },
    "anthropic": {
      "baseUrl": "https://api.anthropic.com",
      "apiKeyEnv": "ANTHROPIC_API_KEY",
      "model": "claude-sonnet-4-5",
      "options": {
        "temperature": 0.3,
        "max_tokens": 8192
      }
    }
  }
}
```

### 2.3 顶层配置字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `defaultProvider` | 是 | 默认使用的 provider 名称 |
| `defaultModel` | 否 | 默认使用的模型名（可被命令行参数覆盖） |
| `conversation.streamResponses` | 否 | 是否启用流式输出（默认 true） |
| `conversation.maxHistoryLength` | 否 | 保留的最大历史消息数 |
| `conversation.systemPrompt` | 否 | 自定义系统提示词 |
| `providers` | 是 | 各 provider 的具体配置 |

### 2.4 配置优先级的规则

Frees Agent 的配置遵循"具体优先"原则：

```text
优先级从高到低：
1. 命令行参数（最高）
   --provider, --model, --base-url 等

2. 环境变量
   ANTHROPIC_API_KEY, OPENAI_API_KEY 等
   FREES_AGENT_HOME（配置目录）

3. 配置文件
   .frees-agent/config.json

4. 默认值（最低）
```

即：命令行参数 > 环境变量 > 配置文件 > 内置默认值

---

## 第三章：Ollama 接入

### 3.1 安装与启动

```bash
# macOS
brew install ollama
ollama serve  # 启动服务（默认 11434 端口）

# Linux
curl -fsSL https://ollama.com/install.sh | sh

# 下载模型
ollama pull qwen2.5-coder:7b
ollama pull llama3.1:8b
ollama pull deepseek-coder-v2:16b

# 查看已下载模型
ollama list
```

### 3.2 Frees Agent 配置

```json
{
  "defaultProvider": "ollama",
  "defaultModel": "qwen2.5-coder:7b",
  "providers": {
    "ollama": {
      "baseUrl": "http://127.0.0.1:11434",
      "model": "qwen2.5-coder:7b"
    }
  }
}
```

### 3.3 使用命令行启动

```bash
# 使用默认配置中的 Ollama 模型
frees-agent chat .

# 指定 Ollama Provider 和模型
frees-agent chat . --provider ollama --model qwen2.5-coder:7b

# 指定自定义 Ollama 服务地址
frees-agent chat . \
  --provider ollama \
  --base-url http://192.168.1.100:11434 \
  --model qwen2.5-coder:7b
```

### 3.4 Ollama 支持的模型格式

Ollama 本身支持多种模型格式，包括：
- 原生 Ollama 模型（Modelfile 格式）
- GGUF 格式量化模型
- 部分 safetensors 格式模型（通过 Ollama 导入）

**不建议通过 Ollama API 直接训练模型**。Ollama 是推理服务，不是训练框架。

### 3.5 查看 Ollama 连接状态

```bash
# 检查 Ollama 服务是否运行
curl http://127.0.0.1:11434/api/tags

# 测试特定模型是否可用
curl http://127.0.0.1:11434/api/generate \
  -d '{"model": "qwen2.5-coder:7b", "prompt": "Hello", "stream": false}'
```

---

## 第四章：OpenAI 兼容接口接入

### 4.1 支持的后端列表

所有实现了 OpenAI Chat Completions API 的服务都可以通过 `openai-compatible` Provider 接入：

| 后端服务 | 典型端口 | 特点 | 适用场景 |
|---------|---------|------|---------|
| **LM Studio** | 1234 | GUI 操作，模型下载+推理一体 | 初学者、快速实验 |
| **llama.cpp server** | 8080 | 轻量级，高性能，CPU+GPU | 高级用户、生产部署 |
| **vLLM** | 8000 | 高性能推理引擎，PagedAttention | 生产环境、高并发 |
| **TGI** (Text Generation Inference) | 80 | Hugging Face 官方方案 | 企业级部署 |
| **LocalAI** | 8080 | Docker 部署，多后端 | 容器化环境 |
| **OpenAI API** | - | 官方云端服务 | 直接使用 GPT 系列 |
| **兼容 OpenAI 的第三方 API** | 自定义 | 各种云服务商 | 代理网关、私有云 |

### 4.2 LM Studio 模式配置

```json
{
  "providers": {
    "openai-compatible": {
      "baseUrl": "http://127.0.0.1:1234/v1",
      "model": "qwen2.5-coder-7b-instruct",
      "apiKeyEnv": "OPENAI_API_KEY",
      "options": {
        "temperature": 0.7,
        "max_tokens": 4096,
        "top_p": 0.95
      }
    }
  }
}
```

```bash
# 使用 LM Studio 后端
frees-agent chat . \
  --provider openai-compatible \
  --base-url http://127.0.0.1:1234/v1 \
  --model qwen2.5-coder-7b-instruct
```

### 4.3 vLLM 模式配置

```json
{
  "providers": {
    "openai-compatible": {
      "baseUrl": "http://127.0.0.1:8000/v1",
      "model": "Qwen/Qwen2.5-Coder-7B-Instruct",
      "apiKeyEnv": "OPENAI_API_KEY"
    }
  }
}
```

### 4.4 直接接入 OpenAI / Azure OpenAI

```json
{
  "providers": {
    "openai-compatible": {
      "baseUrl": "https://api.openai.com/v1",
      "apiKeyEnv": "OPENAI_API_KEY",
      "model": "gpt-4o"
    }
  }
}
```

```bash
# 设置环境变量
export OPENAI_API_KEY=sk-your-key-here

# 启动
frees-agent chat . --provider openai-compatible --model gpt-4o
```

### 4.5 后端服务测试验证

```bash
# 测试 OpenAI 兼容 API 是否正常
curl http://127.0.0.1:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5-coder-7b-instruct",
    "messages": [
      {"role": "user", "content": "Hello"}
    ],
    "stream": false
  }'
```

---

## 第五章：Anthropic API 接入

### 5.1 配置方式

```json
{
  "providers": {
    "anthropic": {
      "baseUrl": "https://api.anthropic.com",
      "apiKeyEnv": "ANTHROPIC_API_KEY",
      "model": "claude-sonnet-4-5"
    }
  }
}
```

### 5.2 使用命令行启动

```bash
# 设置 API Key
export ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx

# 启动
frees-agent chat . --provider anthropic --model claude-sonnet-4-5

# 可用模型（根据你的 API 权限）：
#   claude-sonnet-4-5
#   claude-opus-4-5
#   claude-haiku-4-5
#   claude-3-5-sonnet-latest
```

### 5.3 Anthropic API 特性

与本地模型不同，Anthropic API 提供了一些独特的能力：

```text
1. 超大上下文窗口
   Claude 4.x 系列支持超过 200K token 的上下文
   适合需要处理超长文档或代码库的场景

2. 高可靠性
   云端管理的推理基础设施，无需担心本地资源

3. 持续更新
   无需手动下载模型，API 始终使用最新版本

4. 按需付费
   按 token 计费，无需预置硬件
```

---

## 第六章：流式输出（Streaming）

### 6.1 什么是流式输出

流式输出（Streaming）让模型在生成内容的同时，逐步将 token 推送给客户端，而不是等全部生成完毕再一次性返回。

```text
非流式模式：
用户发送请求 → [模型思考...等待...等待...] → 一次性返回完整回复
                                     ↑
                             用户体验：等待时间感知更长

流式模式：
用户发送请求 → [开始输出第一个字 → 输出第二字 → ... → 输出完毕]
                         ↑
                 用户体验：立刻看到响应，等待感大大降低
```

### 6.2 如何配置流式输出

```json
{
  "conversation": {
    "streamResponses": true
  }
}
```

或通过命令行关闭：

```bash
frees-agent chat . --no-stream
```

### 6.3 Provider 的流式实现

不同 Provider 的流式实现方式不同，但 Frees Agent 将其统一封装为 `onToken` 回调：

```javascript
// OpenAI 兼容（LM Studio / vLLM / OpenAI API）
async streamText({ systemPrompt, messages, onToken }) {
  const response = await fetch(`${this.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    },
    body: JSON.stringify({
      model: this.model,
      messages: [{role: 'system', content: systemPrompt}, ...messages],
      stream: true,  // 关键标记
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, {stream: true});
    const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

    for (const line of lines) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;

      const parsed = JSON.parse(data);
      const token = parsed.choices[0]?.delta?.content || '';
      if (token) {
        fullText += token;
        await onToken(token);
      }
    }
  }

  return fullText;
}
```

---

## 第七章：Provider 扩展——接入自定义模型

### 7.1 扩展架构

你可以通过编写新的 Provider 客户端来接入任何自定义模型或模型网关。架构非常简单：

```text
src/model/
├── index.js          ← 注册所有 Provider 的入口
├── ollama.js         ← Ollama Provider 实现
├── openai-compatible.js  ← OpenAI 兼容实现
├── anthropic.js      ← Anthropic API 实现
└── your-provider.js  ← 你的自定义 Provider（新建）
```

### 7.2 自定义 Provider 示例（完整版）

```javascript
// src/model/your-provider.js
export class YourProviderClient {
  constructor({ baseUrl, apiKey, model }) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.model = model;
  }

  // 非流式生成
  async generateText({ systemPrompt, messages, temperature, maxOutputTokens }) {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        temperature: temperature ?? 0.7,
        max_tokens: maxOutputTokens ?? 4096,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  // 流式生成
  async streamText({ systemPrompt, messages, temperature, maxOutputTokens, onToken }) {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        temperature: temperature ?? 0.7,
        max_tokens: maxOutputTokens ?? 4096,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';  // 保留不完整的行

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const token = parsed.choices?.[0]?.delta?.content || '';
          if (token) {
            fullText += token;
            await onToken(token);
          }
        } catch {
          // 跳过解析失败的 chunk
        }
      }
    }

    return fullText;
  }
}
```

### 7.3 注册 Provider

```javascript
// src/model/index.js
import { OllamaClient } from './ollama.js';
import { OpenAIClient } from './openai-compatible.js';
import { AnthropicClient } from './anthropic.js';
import { YourProviderClient } from './your-provider.js';  // 引入

export function createModelClient(runtime) {
  let client;

  if (runtime.providerName === 'ollama') {
    client = new OllamaClient({
      baseUrl: runtime.baseUrl,
      model: runtime.model,
    });
  } else if (runtime.providerName === 'openai-compatible') {
    client = new OpenAIClient({
      baseUrl: runtime.baseUrl,
      apiKey: runtime.apiKey,
      model: runtime.model,
    });
  } else if (runtime.providerName === 'anthropic') {
    client = new AnthropicClient({
      baseUrl: runtime.baseUrl,
      apiKey: runtime.apiKey,
      model: runtime.model,
    });
  } else if (runtime.providerName === 'your-provider') {  // 新增
    client = new YourProviderClient({
      baseUrl: runtime.baseUrl,
      apiKey: runtime.apiKey,
      model: runtime.model,
    });
  } else {
    throw new Error(`Unknown provider: ${runtime.providerName}`);
  }

  return client;
}
```

### 7.4 配置自定义 Provider

```json
{
  "providers": {
    "your-provider": {
      "baseUrl": "https://your-endpoint.example.com",
      "apiKeyEnv": "YOUR_PROVIDER_API_KEY",
      "model": "your-model-name"
    }
  }
}
```

```bash
export YOUR_PROVIDER_API_KEY=your-key-here
frees-agent chat . --provider your-provider --model your-model-name
```

---

## 第八章：多切割模型处理

### 8.1 什么是多切割模型

大型模型（如 70B、130B）的权重文件通常被分割成多个文件：

```text
model-00001-of-00004.safetensors  4.6GB
model-00002-of-00004.safetensors  4.6GB
model-00003-of-00004.safetensors  4.6GB
model-00004-of-00004.safetensors  4.2GB
model.safetensors.index.json       ← 映射文件
```

### 8.2 Frees Agent 的处理方式

**Frees Agent 本身不处理多切割文件的拼接。** 这项工作由底层的推理后端负责：

```text
多切割权重文件
      │
      ▼
推理后端（Ollama / llama.cpp / LM Studio）
  ├── 读取索引文件（index.json）
  ├── 加载所有分片
  ├── 在内存中组合为完整模型
  └── 暴露统一 API
          │
          ▼
Frees Agent
  通过 Provider 接口调用 API
  无需关心后端如何管理权重文件
```

如果你遇到多切割模型的问题，应该排查推理后端而非 Frees Agent。

---

## 第九章：安全与最佳实践

### 9.1 API Key 安全

```text
永远不要将 API Key 硬编码在配置文件中！

正确做法：
  {"apiKeyEnv": "ANTHROPIC_API_KEY"}
  通过环境变量设置：
  export ANTHROPIC_API_KEY=sk-ant-xxxxxxxx

错误做法：
  {"apiKey": "sk-ant-xxxxxxxx"}
  API Key 会泄漏到版本控制和日志中
```

### 9.2 连接本地模型的网络安全

```text
推荐：使用 localhost 或 127.0.0.1
  "baseUrl": "http://127.0.0.1:11434"

避免：暴露到局域网
  "baseUrl": "http://0.0.0.0:11434"
  → 局域网内的其他机器可以访问你的模型服务

严重风险：暴露到互联网
  不要在公网 IP 上运行未认证的模型服务
```

### 9.3 Provider 切换的最佳实践

```text
日常开发：
  ├── 使用本地模型（Ollama / LM Studio）
  ├── 零延迟、零成本、数据不离开本地
  └── 推荐模型：Qwen2.5-Coder-7B / DeepSeek-Coder-V2

复杂任务：
  ├── 切换到云端 API（Anthropic / OpenAI）
  ├── 更强的模型能力，可处理复杂推理
  └── 适合：架构设计、代码审查、复杂重构

模型配置：
  ├── 在 .frees-agent/config.json 中配置多个 Provider
  ├── 通过 --provider 参数按需切换
  └── 甚至可以针对不同的目录使用不同的配置
```

### 9.4 故障排查

```text
连接问题排查流程：

1. 确认服务是否在运行
   curl http://127.0.0.1:11434/api/tags  # Ollama
   curl http://127.0.0.1:1234/v1/models   # LM Studio

2. 确认模型是否已下载
   ollama list  # Ollama
   或在 LM Studio GUI 中查看

3. 确认 API Key 是否正确设置
   echo $ANTHROPIC_API_KEY  # 检查环境变量
   env | grep API_KEY       # 列出所有 API Key 环境变量

4. 确认配置文件格式正确
   python3 -m json.tool .frees-agent/config.json
```

---

## 第十章：总结

```text
Frees Agent 的模型接入设计哲学：

统一抽象
  └── 所有模型通过统一的 Provider 接口访问
  └── 用户无需关心底层 API 差异

灵活切换
  └── 同一套工具，可以接本地模型、云端 API、自定义服务
  └── 命令行参数一键切换 Provider

开放扩展
  └── 只需实现两个方法，就能接入任意模型服务
  └── 无需修改核心代码

安全优先
  └── API Key 通过环境变量管理
  └── 配置文件不包含敏感信息

这就是 Frees Agent 的模型接入之道——
一个 CLI，连接万物。
```

---

> **延伸阅读**：当模型接入就绪后，下一篇文章《Frees Agent 记忆与超长对话》将介绍如何让 Agent 在长期交互中记住你和你的项目。
