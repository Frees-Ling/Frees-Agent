# 如何拓展开发 Frees Agent

这份文档面向后续继续维护和扩展 `Frees Agent` 的开发者。

## 1. 当前项目结构

- `src/cli.js`
  CLI 命令入口
- `src/commands/`
  每个命令一份文件
- `src/model/`
  模型 provider 抽象层
- `src/memory/`
  用户画像、长期记忆、会话摘要
- `src/workspace/`
  工作区扫描与查询
- `src/skills/`
  skill 文件加载与匹配
- `src/ui/`
  终端展示相关
- `src/system/`
  平台权限与系统集成说明

## 2. 如何增加一个新命令

### 第一步

在 `src/commands/` 下新增文件，例如：

```js
export async function runMyCommand(options) {
  console.log('hello');
}
```

### 第二步

在 `src/cli.js` 里导入并注册。

### 第三步

在 `README` 和 `docs/` 里补使用说明。

## 3.5 如何增加一个新工具

工具箱（toolbox）实现在 `src/agent/tools.js`，分三步注册新工具：

### 第一步：实现工具逻辑

在 `src/agent/tools.js` 的 `runTool` 函数中添加 `case`：

```js
case 'my_new_tool': {
  const param = String(args.param || '').trim();
  if (!param) throw new Error('my_new_tool 需要 param');
  const data = await doSomething(param);
  return { ok: true, data };
}
```

### 第二步：注册工具描述

在 `getToolList` 函数中添加工具描述：

```js
{ name: 'my_new_tool', description: 'What this tool does' },
```

### 第三步：在提示词中暴露

在 `src/agent/prompts.js` 的 `CHAT_TOOL_SYSTEM_PROMPT` 或 `TOOL_DESCRIPTIONS` 中添加用法说明，让模型知道工具的存在。

### 第四步（可选）：MCP 工具

如果你的工具需要外部服务，考虑封装为 MCP 服务器，通过 `mcpServers` 配置注入。<code>mcpHandlers</code> 会自动把 MCP 工具合并到工具箱中。

## 3. 如何增加一个新的模型 provider

### 第一步

在 `src/model/` 下新增客户端文件。

### 第二步

在 `src/model/index.js` 里注册 provider。

### 第三步

在配置文件里增加 provider 配置项。

## 4. 如何扩展记忆系统

可以从这些方向扩展：

- 更强的用户画像字段
- 项目级记忆和全局记忆分层
- 向量检索
- RAG 召回
- 记忆重要度评分

关键文件：

- `src/memory/store.js`
- `src/memory/manager.js`
- `src/memory/heuristics.js`

## 5. 如何扩展 skill 支持

当前支持的 skill 文件约定路径：

```text
.claude/skills/<skill-name>/SKILL.md
```

你可以继续扩展：

- frontmatter 解析
- allowed-tools 校验
- skill 依赖
- skill 自动触发
- skill 权限规则

关键文件：

- `src/skills/loader.js`
- `src/commands/skills.js`

## 6. 维护建议

- 一个文件只做一件核心事情
- 命令层不要直接堆复杂逻辑
- 复杂逻辑下沉到独立模块
- 每新增功能都补测试
- 每新增功能都补文档
