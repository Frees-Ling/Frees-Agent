# 手把手把模型加载到 Frees Agent

这篇文档专门解决一个问题：

“我现在就想把模型接进 `Frees Agent`，到底从哪里开始？”

如果你之前看文档觉得乱，这一篇就按实际操作顺序来，不拐弯。

## 路线总览

你有三条最常见的路：

1. 用 `Ollama`
2. 用 `LM Studio`
3. 用云端 API

如果你是第一次上手，我最建议：

- 本地模型优先走 `LM Studio` 或 `Ollama`
- 云端模型优先走 `Anthropic` 或 OpenAI 兼容网关

## 方案 A：用 LM Studio 接本地模型

### 第 1 步：安装 LM Studio

到官方文档或官网下载并安装：

- https://lmstudio.ai/docs/

### 第 2 步：在 LM Studio 里下载模型

建议第一次先下中小型代码模型或中文模型，例如：

- Qwen coder 系列
- DeepSeek coder 系列
- Llama 系列较小版本

### 第 3 步：把模型加载到 LM Studio

在 LM Studio 里把模型下载好后，点开模型并加载。

参考官方文档：

- Local server
  https://lmstudio.ai/docs/developer/core/server
- OpenAI compatible endpoint
  https://lmstudio.ai/docs/developer/openai-compat

### 第 4 步：启动本地 API 服务

按 LM Studio 官方文档：

- 打开 Developer 页面
- 打开 Start server 开关

默认端口通常是：

```text
http://localhost:1234
```

OpenAI 兼容接口通常是：

```text
http://localhost:1234/v1
```

### 第 5 步：先验证服务是不是通的

```bash
frees-agent doctor --provider openai-compatible --base-url http://localhost:1234/v1 --model 你的模型名
```

如果还想进一步 ping：

```bash
frees-agent doctor --provider openai-compatible --base-url http://localhost:1234/v1 --model 你的模型名 --ping
```

### 第 6 步：开始聊天

```bash
frees-agent chat . --provider openai-compatible --base-url http://localhost:1234/v1 --model 你的模型名
```

### 第 7 步：开始代码 Agent

```bash
frees-agent edit . --provider openai-compatible --base-url http://localhost:1234/v1 --model 你的模型名 --task "阅读这个项目并补一个新的命令"
```

## 方案 B：用 Ollama 接本地模型

### 第 1 步：安装 Ollama

官方文档：

- https://docs.ollama.com/

### 第 2 步：拉取模型

```bash
ollama pull qwen2.5-coder:7b
```

### 第 3 步：确认 Ollama 服务在运行

默认端口通常是：

```text
http://localhost:11434
```

参考：

- https://docs.ollama.com/api/chat

### 第 4 步：让 Frees Agent 连上 Ollama

```bash
frees-agent chat . --provider ollama --model qwen2.5-coder:7b
```

## 方案 C：接云端 API

### Anthropic

```bash
export ANTHROPIC_API_KEY=你的key
frees-agent chat . --provider anthropic --model claude-sonnet-4-5
```

### OpenAI 兼容云端接口

```bash
export OPENAI_API_KEY=你的key
frees-agent chat . --provider openai-compatible --base-url https://你的域名/v1 --model 你的模型名
```

## 最推荐的实操顺序

1. 先装 LM Studio
2. 下载模型
3. 启动本地 server
4. 用 `frees-agent doctor ... --ping` 测试
5. 用 `frees-agent chat ...` 测试
6. 最后再用 `frees-agent edit ...`

## 常见报错与排查

### 1. 连不上 localhost

说明本地模型服务还没启动，或者端口不对。

### 2. 提示模型不存在

说明：

- 模型没加载
- 模型名写错
- 本地服务里展示的模型标识和你命令里写的不一致

### 3. 本地模型能聊天，但代码编辑很差

这很常见，因为 Agent 任务更吃：

- 上下文长度
- 指令遵循
- 代码能力
- 工具调用稳定性

所以尽量优先选更长上下文、更偏代码方向的模型。
