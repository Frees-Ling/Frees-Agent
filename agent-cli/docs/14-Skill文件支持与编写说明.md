# Skill 文件支持与编写说明

`Frees Agent` 现在支持 `SKILL.md` 类型的技能文件。

## 1. 当前支持的目录约定

默认扫描工作区中的：

```text
.claude/skills/<skill-name>/SKILL.md
```

同时也支持个人目录中的：

```text
~/.claude/skills/<skill-name>/SKILL.md
```

以及项目私有目录中的：

```text
.frees-agent/skills/<skill-name>/SKILL.md
```

例如：

```text
.claude/
  skills/
    code-review/
      SKILL.md
```

## 2. 为什么采用这个格式

这是参考 Claude 官方的 Agent Skills 设计。

官方文档说明：

- Skill 是一种可发现的模块化能力
- 每个 Skill 至少包含一个 `SKILL.md`
- 可以带可选脚本、模板和其他资源
- Skill 会根据请求自动触发，而不是像 slash command 那样必须手动调用

官方文档：

- https://docs.claude.com/en/docs/claude-code/skills
- https://docs.claude.com/en/docs/agents-and-tools/agent-skills

## 3. 当前 Frees Agent 的实现能力

当前已经支持：

- 读取个人 skills
- 扫描 `.claude/skills/**/SKILL.md`
- 扫描 `.frees-agent/skills/**/SKILL.md`
- 读取 Skill 内容
- 在聊天中按请求自动匹配相关 Skill
- 把匹配到的 Skill 注入模型上下文
- 通过命令列出当前工作区 Skill

命令：

```bash
frees-agent skills
frees-agent skills code-review
frees-agent skills code-review --workspace .
```

聊天中也可以输入：

```text
/skills
```

## 4. 推荐的 SKILL.md 写法

根据官方文档，一个最小 Skill 可以这样写：

```md
---
name: Code Review
description: Review source code for bugs, structure, and missing tests. Use when reviewing code, PRs, or file changes.
allowed-tools: Read, Grep, Glob
---

# Code Review

## Instructions

1. Read the target files.
2. Search for related code.
3. Focus on bugs, regressions, and missing tests.
4. Keep summaries short and findings concrete.
```

## 5. Frees Agent 目前的解析范围

当前版本会优先读取：

- `name`
- `description`
- `allowed-tools`
- Markdown 正文

后续还可以继续增强：

- tool 白名单真正生效
- skill 依赖关系
- skill 优先级
- skill 自动加载更多引用文件

## 6. 建议

- 一个 Skill 只做一件事
- `description` 要写清楚触发场景
- Skill 名字尽量明确
- 避免把多个完全不同的能力塞进一个 Skill
