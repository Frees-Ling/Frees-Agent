# Frees Agent 的记忆系统与超长对话

## 1. 新增了什么能力

`Frees Agent` 现在新增了：

- 持久化用户画像
- 持久化长期记忆
- 持久化会话
- 超长对话摘要压缩
- 会话恢复与续聊

这意味着它不再只是“当前窗口里会聊天”，而是开始具备真正智能体系统的状态能力。

## 2. 记忆分成三层

### 第一层：用户画像

用于保存较稳定的用户信息，例如：

- 用户身份
- 角色
- 技术栈
- 语言偏好
- 长期目标
- 常用工作方式

### 第二层：长期记忆

用于保存之后还会反复使用的信息，例如：

- 用户偏好
- 项目背景
- 约束条件
- 固定流程
- 长期任务目标

### 第三层：会话摘要

用于解决“对话太长，模型上下文放不下”的问题。

当消息变长后，较早的消息会被压缩成摘要，保留：

- 关键决定
- 用户目标
- 当前进度
- 未完成事项

然后只保留最近一部分原始消息继续对话。

## 3. 现在的工作方式

聊天时，`Frees Agent` 会：

1. 读取当前用户画像
2. 读取长期记忆
3. 读取当前会话摘要
4. 再拼上最近消息
5. 然后继续回答

所以即使对话很长，也能尽量保持连续性。

## 4. 新增的命令

### 查看记忆

```bash
frees-agent memory show
```

### 清理记忆

```bash
frees-agent memory clear --session-only
frees-agent memory clear --profile
frees-agent memory clear --durable
frees-agent memory clear --all
```

### 查看会话文件列表

```bash
frees-agent memory sessions
```

## 5. 聊天中的内置命令

进入聊天后可以使用：

- `/memory`
- `/profile`
- `/summary`
- `/reload`
- `/edit ...`

## 6. 存储位置

默认情况下，记忆与会话数据会保存在配置目录下的：

- `data/memory/`
- `data/sessions/`

也就是：

- `~/.terminal-ai-agent/data/memory/`
- `~/.terminal-ai-agent/data/sessions/`

## 7. 为什么这很重要

一个没有记忆、不能处理超长对话的 Agent，很容易出现：

- 说着说着忘了前文
- 忘记用户偏好
- 忘记项目目标
- 上下文一长就崩

而 `Frees Agent` 这次新增的能力，就是为了解决这个问题。
