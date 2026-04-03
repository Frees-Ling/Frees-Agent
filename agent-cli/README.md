# Frees Agent

`Frees Agent` 是一套跨平台终端 AI Agent CLI，定位是“可运行、可扩展、可跨平台”的轻量实现。当前实现基于 Node.js 标准库，已经具备聊天、代码理解、Agent 式代码编辑、持久化记忆、超长对话、中文文档区等核心能力。

## 当前已支持的功能

### 1. 聊天能力

- 支持终端交互式聊天
- 支持单次消息模式
- 支持绑定工作区后进行项目问答
- 支持持久化会话续聊
- 支持用户画像与长期记忆
- 支持超长对话自动摘要压缩

### 2. 代码理解与编辑能力

- 自动扫描指定目录
- 自动读取全部可载入的文本与代码文件
- 自动建立工作区索引
- 支持 Agent 式自动代码编辑、生成与重构
- 支持 `dry-run` 预演模式

### 3. 代码补全能力

- 支持基于工作区上下文进行代码补全
- 支持指定目标文件进行定向补全

### 4. 模型接入能力

- 支持 `ollama`
- 支持 `openai-compatible`
- 支持 `anthropic`
- 支持本地模型和云端模型统一接入

### 5. 文档中心能力

- 内置中文文档区
- 支持查看 LLM、训练、数据集、模型接入、权限、记忆与长对话等文档
- 新增真正按步骤写的“手把手加载模型”文档

### 6. 品牌展示与权限引导

- 模型加载成功后显示 `Frees Agent` 横幅
- 显示当前 provider、model、模式和能力状态
- 提供系统权限与电脑控制引导命令

## 常用命令

```bash
frees-agent chat .
frees-agent chat . --session my-project
frees-agent edit . --task "阅读这个项目并补一个新的命令"
frees-agent complete . --file src/main.ts --instruction "补全参数校验逻辑"
frees-agent doctor . --ping
frees-agent memory show
frees-agent docs
frees-agent docs load-model-step-by-step
frees-agent permissions
```

## 推荐先看

如果你现在最关心的是“怎么把模型真正接进去”，先看：

- `agent-cli/docs/11-手把手把模型加载到Frees-Agent.md`

如果你想看完整文档目录，再看：

- `agent-cli/docs/README.md`
