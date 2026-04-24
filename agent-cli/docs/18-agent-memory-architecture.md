# Agent Memory Architecture

## 目标

统一 `profile + durable + session + vector + task`，并支持跨设备自动合并与上下文压缩。

## Memory Flow

1. 用户输入  
2. 本地规则提取（name/skills/goals/preferences/...）  
3. 模型提取（JSON profilePatch + durableMemories）  
4. Memory Router 分流：  
   - 画像字段进入 `profile.json`  
   - 事件记忆进入 `durable-memories.json`  
5. 向量索引更新：`vector-memories.json`  
6. 任务状态更新：`task-memory.json`  
7. 会话摘要压缩与 recent messages 截断

## Storage Schema

- `memory/profile.json`  
- `memory/durable-memories.json`  
- `memory/vector-memories.json`  
- `memory/task-memory.json`  
- `sessions/<session-id>.json`

## 跨设备合并策略

- `memory.autoMergeAcrossDevices=true` 时读取 `memory.syncRoots` 中所有根目录并自动合并。
- `memory.syncWritesToRoots=true` 时写入会同步回所有根目录。
- 合并策略：
  - profile：字段级 merge + 去重
  - durable：`category+content` 去重
  - sessions：消息按时间合并去重，summary 拼接
  - tasks：按 `task id` 合并状态

## Retrieval Strategy

- 画像+长期记忆：直接注入 system prompt
- 向量记忆：根据当前 query 检索 topK 语义相关片段注入
- 会话摘要：超过阈值自动压缩，避免上下文膨胀

## Token 管理

- 默认 `maxOutputTokens=16000`
- `maxRecentContextTokens` 控制 recent messages 的预算
- 达到阈值自动摘要
- 可启用 `autoContinueOnCutoff`

## Planner / Critic / Tools

- Planning Layer：复杂请求先生成执行计划
- Reflection Layer：回答后进行自检和修正
- Tool Layer：聊天支持 `list_files/search_text/read_file/web_search`
