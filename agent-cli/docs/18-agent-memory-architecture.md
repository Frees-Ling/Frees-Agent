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

## Vector Search API

向量搜索实现在 `src/memory/vector.js`，采用纯内存方案（无需外部向量数据库）：

- **分词（tokenize）**：CJK 字符逐字保留，非 CJK 文本按 Unicode 属性分词，同时生成 2-4 n-gram 提升部分匹配能力
- **嵌入（embedText）**：基于 FNV-1a 哈希将每个 token 映射到 256 维向量槽位，累加后 L2 归一化
- **检索（queryVectorMemories）**：余弦相似度排序，过滤 score ≤ 0.06 的低质量结果，返回 topK
- **索引持久化**：`memory/vector-memories.json`，上限 500 条，超限时淘汰最早条目

核心 API：
- `embedText(text)` → `number[]`：将文本转为 256 维向量
- `queryVectorMemories(vectorPath, query, topK)` → `{id, category, content, score}[]`：检索最相似记忆
- `upsertDurableMemoriesToVectorIndex(vectorPath, durableMemories)`：将持久化记忆同步到向量索引

## Token 管理

- 默认 `maxOutputTokens=16000`
- `maxRecentContextTokens` 控制 recent messages 的预算
- 达到阈值自动摘要
- 可启用 `autoContinueOnCutoff`

## Planner / Critic / Tools

- Planning Layer：复杂请求先生成执行计划
- Reflection Layer：回答后进行自检和修正
- Tool Layer：聊天支持 `list_files/search_text/read_file/web_search`
