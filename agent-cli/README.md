# Frees Agent

`Frees Agent` 是一套跨平台终端 AI Agent CLI，定位是“可运行、可扩展、可跨平台”的轻量实现。当前实现不依赖第三方 npm 包，直接基于 Node.js 标准库运行，适合继续二次开发、接入更多模型后端，或者继续扩展成更完整的工程代理系统。

## 产品定位

`Frees Agent` 面向以下场景：

- 在终端里直接与 AI 聊天问答
- 让 AI 阅读指定工作区代码并理解项目结构
- 让 AI 根据需求自动生成代码、补全代码、修改代码
- 在本地模型和云端模型之间切换
- 在 Windows 和 macOS 上统一使用同一套 CLI 工作流

## 当前已支持的功能

### 1. 聊天能力

- 支持终端交互式聊天
- 支持单次消息模式
- 支持绑定工作区后进行“带代码上下文”的项目问答
- 支持在聊天中重新扫描工作区

对应命令：

- `frees-agent chat [workspace]`
- `frees-agent chat [workspace] --message "..."`

### 2. 代码理解能力

- 自动扫描指定目录
- 自动读取全部可载入的文本与代码文件
- 自动建立工作区代码索引
- 自动根据任务筛选相关文件
- 支持文件列表、文本搜索、片段读取等上下文工具

这意味着在执行代码任务前，`Frees Agent` 会先尽量理解现有项目，而不是盲目生成代码。

### 3. 代码编辑能力

- 支持 Agent 式自动代码编辑
- 支持生成新文件
- 支持修改已有文件
- 支持局部字符串替换
- 支持创建目录
- 支持删除文件
- 支持 `dry-run` 预演模式

对应命令：

- `frees-agent edit <workspace> --task "..."`

### 4. 代码补全能力

- 支持基于工作区上下文进行代码补全
- 支持指定目标文件进行定向补全
- 支持让模型结合相关文件风格生成补全结果

对应命令：

- `frees-agent complete <workspace> --instruction "..."`
- `frees-agent complete <workspace> --file src/main.ts --instruction "..."`

### 5. 配置与诊断能力

- 支持初始化配置文件
- 支持查看当前配置
- 支持查看当前模型接入方式
- 支持查看本地模型格式说明
- 支持扫描工作区并输出诊断信息
- 支持模型健康检查 `--ping`

对应命令：

- `frees-agent config init`
- `frees-agent config show`
- `frees-agent doctor [workspace]`
- `frees-agent doctor [workspace] --ping`

## 支持的平台

- macOS
- Windows

当前代码没有依赖特定 shell，也没有依赖 Bun、GNU 工具或类 Unix 专属路径逻辑，路径处理全部走 Node.js `path`，因此更容易保持跨平台一致性。

## 模型支持

### 1. 本地模型接入方式

`Frees Agent` 当前内置三种模型接入方式：

- `ollama`
  适合本地直接部署与运行模型，接入最简单。
- `openai-compatible`
  适合通过 `LM Studio`、`llama.cpp server`、`vLLM`、`TGI`、`LocalAI` 等服务，以 OpenAI 兼容接口方式接入本地模型。
- `anthropic`
  适合直接接入云端 API。

### 2. 支持的本地模型格式

- `GGUF`
  适合 `Ollama`、`llama.cpp`、`LM Studio` 等本地运行环境。
- `GGUF` 多切割模型
  例如：
  `model-00001-of-00004.gguf`
  `model-00002-of-00004.gguf`
  `model-00003-of-00004.gguf`
  `model-00004-of-00004.gguf`
  这类模型一般由本地推理后端负责装载与拼接，CLI 通过本地服务统一访问。
- `MLX`
  适合 Apple Silicon / macOS。
- `safetensors`
  适合 `vLLM`、`TGI` 等本地推理服务。

说明：
`Frees Agent` 采用的是“统一接入本地推理服务”的架构，而不是把推理框架硬编码进 CLI 本体。这样在 Windows 和 macOS 上更稳，也更方便替换模型后端。

## 快速开始

### 1. 初始化配置

```bash
node ./bin/ai-agent.js config init
```

如果以包方式安装，也可以直接使用：

```bash
frees-agent config init
```

默认配置文件位置：

- macOS/Linux: `~/.terminal-ai-agent/config.json`
- Windows: 当前用户主目录下的 `.terminal-ai-agent/config.json`

### 2. 终端聊天

```bash
node ./bin/ai-agent.js chat .
```

### 3. 自动代码编辑

```bash
node ./bin/ai-agent.js edit . --task "阅读当前项目并补齐一个新的 CLI doctor 子命令"
```

### 4. 代码补全

```bash
node ./bin/ai-agent.js complete . --file src/main.ts --instruction "补全参数校验逻辑"
```

### 5. 环境诊断

```bash
node ./bin/ai-agent.js doctor . --ping
```

## Agent 代码编辑工作流

当执行 `edit` 命令时，`Frees Agent` 会按下面的流程工作：

1. 扫描工作区
2. 读取全部可载入的文本/代码文件并建立索引
3. 基于任务对相关文件进行筛选
4. 把工作区概览和相关代码片段提供给模型
5. 允许模型通过工具循环完成代码任务
6. 最后输出改动总结

当前内置工具包括：

- `list_files`
- `search_text`
- `read_file`
- `write_file`
- `replace_in_file`
- `mkdir`
- `delete_file`

这套机制对应了“给定文件夹后，自行阅读全部代码、自动补全、自动 Agent、自动生成代码与修改代码”的目标。

## 工程目录说明

- `agent-cli/`
  `Frees Agent` 独立工程目录
- `agent-cli/src/cli.js`
  命令入口与参数解析
- `agent-cli/src/model/`
  模型接入层
- `agent-cli/src/workspace/`
  工作区扫描、索引与查询
- `agent-cli/src/agent/`
  Agent 提示词与编辑循环
- `agent-cli/src/commands/`
  命令实现

## 当前设计特点

- 不直接修改仓库原始 `src/` 快照逻辑
- 新工程完全独立，便于单独维护
- 零第三方依赖，便于跨平台运行
- 已经具备继续扩展成更强 Agent CLI 的基础骨架
