# Agent Memory Architecture

## 概述

Frees-Agent 的记忆系统是一个**分层、多模态、跨设备可合并**的持久化记忆框架。它不仅存储对话历史，更致力于构建一个能够不断学习用户偏好、积累项目知识、并支持语义检索的"Agent 大脑"。

整个记忆系统由五个核心子系统构成：

| 子系统 | 存储文件 | 功能定位 |
|--------|----------|----------|
| Profile Memory | `memory/profile.json` | 用户画像（静态属性、偏好、技能、目标） |
| Durable Memory | `memory/durable-memories.json` | 长期事件记忆（用户明确希望记住的事实） |
| Vector Memory | `memory/vector-memories.json` | 语义向量索引（支持模糊检索与联想） |
| Task Memory | `memory/task-memory.json` | 任务状态跟踪（待办、进行中、已完成） |
| Session Memory | `sessions/<session-id>.json` | 会话级短期记忆（对话历史与摘要） |

---

## 一、记忆流水线（Memory Flow）

每一次用户输入，都会触发完整的记忆处理流水线：

```
用户输入
    │
    ▼
┌──────────────────────────────────────────┐
│ 1. 输入预处理                              │
│    - 过滤空内容/异常消息                    │
│    - 检查是否包含"记住/忘记"等记忆指令       │
└─────────────────┬────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────┐
│ 2. 本地规则提取                            │
│    - name / skills / goals / preferences   │
│    - 通过正则和模式匹配识别结构化信息         │
└─────────────────┬────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────┐
│ 3. 模型提取（LLM 辅助）                    │
│    - JSON profilePatch（增量画像更新）       │
│    - JSON durableMemories（长期记忆条目）    │
│    - 通过 prompt 引导模型输出结构化记忆数据   │
└─────────────────┬────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────┐
│ 4. Memory Router（记忆路由器）              │
│    │                                       │
│    ├── 画像字段 → profile.json              │
│    │     按字段级合并 + 去重                │
│    │                                       │
│    ├── 事件记忆 → durable-memories.json     │
│    │     按 category+content 去重           │
│    │                                       │
│    ├── 向量索引 → vector-memories.json      │
│    │     通过 embedText 生成向量并插入索引   │
│    │                                       │
│    ├── 任务状态 → task-memory.json          │
│    │     按 task id 合并/更新状态           │
│    │                                       │
│    └── 会话摘要 → sessions/<id>.json       │
│          自动压缩，避免上下文膨胀            │
└─────────────────────────────────────────┘
```

### 1.1 输入预处理阶段

在用户消息进入记忆系统之前，先经过一道过滤层：

- **空内容过滤**：如果用户消息或助手回复为空，不会写入记忆，避免污染持久化存储
- **记忆指令识别**：检测用户是否使用了"请记住..."、"忘记..."等指令，触发对应的记忆操作
- **异常消息清洗**：对模型的空回复或异常内容进行兜底处理，不写入长期记忆

### 1.2 本地规则提取

这一阶段使用轻量级的正则匹配和模式识别，从用户消息中提取结构化信息：

```javascript
// 伪代码示意：本地规则提取
function extractLocally(text) {
  const patterns = {
    name: /我叫(.{1,20})|我是(.{1,20})/,
    skill: /我会(.{1,50})|我擅长(.{1,50})/,
    preference: /我喜欢(.{1,100})|我讨厌(.{1,100})/,
    goal: /我的目标是(.{1,100})|我想(.{1,100})/
  };
  // 匹配并返回结构化对象
}
```

本地规则提取的优势是速度快、零成本，缺点是覆盖面有限。因此接下来需要模型辅助提取。

### 1.3 模型辅助提取（LLM Extraction）

在本地规则之后，系统会调用 LLM 进行更深层的记忆提取。通过精心设计的 prompt，引导模型输出结构化的 JSON：

```json
{
  "profilePatch": {
    "name": "张三",
    "preferences": {
      "coding_style": "喜欢 TypeScript 和函数式编程",
      "tools": "偏好 Vim 和终端工作流"
    },
    "goals": ["学习 Rust 语言", "完成自动化部署工具"]
  },
  "durableMemories": [
    {
      "category": "project",
      "content": "正在开发一个基于 MCP 协议的自动化工具",
      "timestamp": "2026-04-30T10:00:00Z"
    }
  ]
}
```

模型提取的 JSON 会被合并到路由阶段，由 Memory Router 分发到不同的存储子系统。

### 1.4 Memory Router（记忆路由器）

Memory Router 是整个记忆系统的中枢。它的职责是：

1. **分类**：判断每条记忆属于哪个子系统
2. **去重**：检查是否与已有记忆重复
3. **合并**：将新记忆与现有记忆合并
4. **索引**：更新向量索引以便后续检索
5. **持久化**：写入磁盘文件

---

## 二、存储架构（Storage Schema）

### 2.1 目录结构

```
.frees-agent/
├── memory/
│   ├── profile.json              # 用户画像
│   ├── durable-memories.json     # 持久化记忆
│   ├── vector-memories.json      # 向量索引
│   └── task-memory.json          # 任务记忆
└── sessions/
    └── <session-id>.json         # 会话记录
```

### 2.2 Profile（画像存储）

`profile.json` 存储用户的静态属性和动态积累的偏好。格式为 JSON 对象，支持嵌套结构：

```json
{
  "name": "张三",
  "skills": ["TypeScript", "React", "Node.js"],
  "goals": ["学习 Rust", "完成 Frees-Agent 项目"],
  "preferences": {
    "language": "zh-CN",
    "coding_style": "函数式编程优先",
    "tools": ["Vim", "tmux", "git"],
    "communication": "喜欢简短清晰的回答"
  },
  "lastUpdated": "2026-04-30T10:00:00Z"
}
```

**合并策略**：字段级合并（field-level merge）。相同字段的新值覆盖旧值，数组类型做并集去重。

### 2.3 Durable Memory（持久化记忆）

`durable-memories.json` 存储用户明确希望记住的事件和事实：

```json
[
  {
    "id": "mem_001",
    "category": "project",
    "content": "正在开发基于 MCP 协议的多 Agent 协作系统",
    "timestamp": "2026-04-30T10:00:00Z",
    "source": "user_input"
  },
  {
    "id": "mem_002",
    "category": "personal",
    "content": "用户的工作时间是北京时间 9:00-18:00",
    "timestamp": "2026-04-29T14:30:00Z",
    "source": "auto_extract"
  }
]
```

**去重策略**：以 `category + content` 为唯一键，相同的条目不会重复添加。这样可以避免 LLM 从不同角度描述同一件事时产生重复记忆。

### 2.4 Vector Memory（向量记忆）

`vector-memories.json` 存储的是经过向量化的记忆索引。每条记录包含原始文本及其对应的向量表示：

```json
[
  {
    "id": "vec_001",
    "category": "project",
    "content": "正在开发基于 MCP 协议的多 Agent 协作系统",
    "vector": [0.023, -0.145, 0.331, ...],  // 256 维 FNV-1a 向量
    "timestamp": "2026-04-30T10:00:00Z"
  }
]
```

上限为 **500 条**，超出时淘汰最早条目（FIFO 策略）。

### 2.5 Task Memory（任务记忆）

`task-memory.json` 跟踪长期任务的状态：

```json
{
  "tasks": [
    {
      "id": "task_001",
      "description": "实现跨设备记忆合并功能",
      "status": "in_progress",
      "createdAt": "2026-04-28T09:00:00Z",
      "updatedAt": "2026-04-30T10:00:00Z"
    }
  ]
}
```

**合并策略**：按 `task id` 合并状态。相同 id 的任务用新状态覆盖旧状态。

### 2.6 Session Memory（会话记忆）

会话记忆以 `<session-id>.json` 文件存储，记录一次完整对话的所有消息及其摘要：

```json
{
  "sessionId": "sess_abc123",
  "createdAt": "2026-04-30T09:00:00Z",
  "updatedAt": "2026-04-30T10:00:00Z",
  "summary": "用户询问了关于 Frees-Agent 记忆架构的问题，我们讨论了向量搜索和存储策略。",
  "messages": [
    { "role": "user", "content": "请解释 Agent 记忆架构", "timestamp": "..." },
    { "role": "assistant", "content": "Frees-Agent 的记忆架构..." , "timestamp": "..."}
  ],
  "tokenCount": 2847
}
```

---

## 三、向量搜索引擎（Vector Search Engine）

向量搜索引擎是记忆系统中实现"语义检索"的核心组件。实现在 `src/memory/vector.js`，采用**纯内存方案**运行，无需外部向量数据库（如 Pinecone、Weaviate、Chroma）。

### 3.1 设计哲学

纯内存方案的决策基于以下考量：

| 因素 | 纯内存方案 | 外部向量数据库 |
|------|-----------|---------------|
| 部署复杂度 | 零依赖，开箱即用 | 需要安装和维护数据库 |
| 速度 | 毫秒级检索 | 网络延迟 + 数据库开销 |
| 数据量上限 | 500 条（约 1-2MB） | 可支持百万级 |
| 精度 | 中等（FNV-1a 近似） | 高（真实神经网络嵌入） |
| 成本 | 免费 | SaaS 费用或硬件开销 |

对于个人 Agent 场景，500 条记忆的上限足够捕获用户的主要偏好和项目上下文。如果未来需要更大的容量，可以在不改变 API 的前提下替换后端为真实向量数据库。

### 3.2 分词（Tokenization）

分词是向量化的第一步。向量引擎支持 CJK（中日韩）和非 CJK 文本的混合分词：

```javascript
// 伪代码：分词逻辑
function tokenize(text) {
  const tokens = [];

  for (const char of text) {
    if (isCJK(char)) {
      // CJK 字符逐字保留
      tokens.push(char);
    }
  }

  // 非 CJK 文本按 Unicode 属性分词
  const latinTokens = text.match(/\b[a-zA-Z]+\b/g) || [];
  tokens.push(...latinTokens);

  // 生成 2-4 元 n-gram 提升部分匹配能力
  for (let n = 2; n <= 4; n++) {
    for (let i = 0; i < tokens.length - n + 1; i++) {
      const gram = tokens.slice(i, i + n).join('');
      tokens.push(gram);
    }
  }

  return tokens;
}
```

**分词策略详解**：

1. **CJK 字符逐字**：每个汉字作为一个独立 token。如此处理是因为中文的词边界不明确，逐字处理可以避免分词错误。
2. **非 CJK 按单词**：英文和数字按空格和标点分割为单词 token。
3. **n-gram 生成**：对上述 tokens 生成 2-4 元组合，提升部分匹配能力。例如 `"开发 MCP 协议"` 会生成 `"开发MCP"`、`"MCP协议"` 等 n-gram，确保搜索 `"MCP"` 时也能匹配到 `"MCP协议"`。

### 3.3 嵌入（embedText）—— FNV-1a 哈希嵌入

```javascript
// 伪代码：FNV-1a 哈希嵌入
function embedText(text) {
  const tokens = tokenize(text);
  const vector = new Array(256).fill(0);

  for (const token of tokens) {
    const hash = fnv1a(token);          // 32-bit FNV-1a hash
    const slot = hash % 256;            // 映射到 256 维槽位
    vector[slot] += 1.0 / tokens.length; // 归一化权重
  }

  // L2 归一化
  const magnitude = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
  for (let i = 0; i < 256; i++) {
    vector[i] /= magnitude;
  }

  return vector;
}
```

**FNV-1a 哈希** 是一种快速、简单的非加密哈希函数。其核心计算：

```javascript
function fnv1a(str) {
  let hash = 0x811c9dc5;     // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;  // FNV prime, unsigned 32-bit
  }
  return hash;
}
```

**为什么用 FNV-1a 而不是真实嵌入？**

| 方面 | FNV-1a 哈希嵌入 | 真实神经网络嵌入（如 text-embedding-3-small） |
|------|-----------------|----------------------------------------------|
| 语义理解 | 弱：仅基于 token 共现 | 强：理解同义词、语境、抽象概念 |
| 计算开销 | 纳秒级 | 数十毫秒（需 GPU/API 调用） |
| 内存占用 | ~2KB 固定 | ~10-100MB 模型权重 |
| 离线可用 | 完全离线 | 需 API 或加载模型 |
| 维度 | 256（固定） | 通常 512-3072 |
| "苹果" vs "iPhone" | 不相关（字符不同） | 语义接近（同领域概念） |

FNV-1a 本质上做的是**基于字符组成的关键词映射**，而非真正的语义嵌入。它擅长：
- 精确关键词匹配（搜索"记忆"能匹配到所有包含"记忆"的条目）
- 部分匹配（n-gram 让"向量检索"能匹配"向量相似度检索"）

它不擅长：
- 同义词理解（搜索"汽车"找不到"车辆"）
- 抽象概念联想（搜索"悲剧"找不到"罗密欧与朱丽叶"）

对于个人 Agent 的 500 条记忆上限，FNV-1a 方案完全可用。用户聊天的记忆需求通常是精确的"我记得你说过 X"，而非模糊的"我想起类似的东西"。

### 3.4 检索（queryVectorMemories）

向量检索流程：

```javascript
function queryVectorMemories(vectorPath, query, topK = 5) {
  // 1. 加载向量索引
  const index = loadVectorIndex(vectorPath);

  // 2. 对 query 做嵌入
  const queryVec = embedText(query);

  // 3. 计算余弦相似度
  const scored = index.map(entry => ({
    ...entry,
    score: cosineSimilarity(queryVec, entry.vector)
  }));

  // 4. 过滤低质量结果（score <= 0.06）
  const filtered = scored.filter(e => e.score > 0.06);

  // 5. 按分数降序排列
  filtered.sort((a, b) => b.score - a.score);

  // 6. 返回 topK
  return filtered.slice(0, topK);
}

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
```

**分数阈值 0.06** 的设定依据：
- 在 FNV-1a 嵌入下，随机文本之间的余弦相似度通常低于 0.03
- 有部分关键词重合的文本得分在 0.03-0.06 之间
- 强相关性文本得分通常在 0.06-0.3 之间
- 过滤 score <= 0.06 可以有效去除噪声，只保留有意义的匹配

### 3.5 索引持久化与淘汰

```javascript
function upsertDurableMemoriesToVectorIndex(vectorPath, durableMemories) {
  const index = loadVectorIndex(vectorPath);

  for (const mem of durableMemories) {
    // 检查是否已存在
    const exists = index.find(e => e.content === mem.content);
    if (exists) continue;

    // 嵌入并添加
    index.push({
      id: `vec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      category: mem.category,
      content: mem.content,
      vector: embedText(mem.content),
      timestamp: mem.timestamp
    });
  }

  // 超限淘汰：按时间排序，移除最旧的
  if (index.length > MAX_VECTOR_MEMORIES) {
    index.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    index.splice(0, index.length - MAX_VECTOR_MEMORIES);
  }

  saveVectorIndex(vectorPath, index);
}
```

**淘汰策略**：FIFO（先进先出）。最早的记忆最先被淘汰。这是一个简单的策略，适合个人 Agent 场景——用户的兴趣和上下文会随时间变化，旧的记忆自然应被淘汰。

### 3.6 核心 API 参考

所有向量操作集中通过以下三个 API 暴露：

```javascript
// 1. 文本 → 256 维向量
function embedText(text) → number[]

// 2. 查询最相似记忆
function queryVectorMemories(vectorPath, query, topK) → Array<{
  id: string,
  category: string,
  content: string,
  score: number
}>

// 3. 同步持久化记忆到向量索引
function upsertDurableMemoriesToVectorIndex(vectorPath, durableMemories) → void
```

---

## 四、记忆检索策略（Retrieval Strategy）

系统在生成回答时，需要从多个记忆源获取上下文。检索策略决定了"哪些记忆、以什么形式、在什么时机注入到 LLM 上下文"。

### 4.1 三层检索架构

```
                    ┌─────────────────────┐
                    │   LLM 上下文         │
                    │  (System Prompt +    │
                    │   Recent Messages)   │
                    └──────┬──────────────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
            ▼              ▼              ▼
    ┌────────────┐ ┌────────────┐ ┌────────────┐
    │ 画像+长期   │ │ 向量记忆    │ │ 会话摘要    │
    │ 记忆直接注入 │ │ 语义检索    │ │ 自动压缩    │
    │ (profile +  │ │ (topK 相关  │ │ (超过阈值   │
    │  durable)   │ │  片段注入)  │ │  时触发)    │
    └────────────┘ └────────────┘ └────────────┘
```

### 4.2 画像+长期记忆：直接注入 System Prompt

Profile 和 Durable Memory 的内容会被序列化并注入到 system prompt 中。这意味着每次对话开始，LLM 都知道用户是谁、有什么偏好、之前记住了什么。

```javascript
function buildSystemPrompt(profile, memories) {
  let prompt = '你是 Frees-Agent，一个智能助手。\n\n';

  if (profile.name) {
    prompt += `用户信息：\n名称：${profile.name}\n`;
  }
  if (profile.preferences) {
    prompt += `偏好：${JSON.stringify(profile.preferences)}\n`;
  }
  if (profile.goals?.length) {
    prompt += `目标：${profile.goals.join('、')}\n`;
  }

  if (memories.length > 0) {
    prompt += '\n记住以下信息：\n';
    memories.forEach(m => {
      prompt += `- [${m.category}] ${m.content}\n`;
    });
  }

  return prompt;
}
```

**为什么直接注入？** 用户画像和长期记忆是高度结构化的信息，每次对话都需要。将它们直接放入 system prompt 是最简单、最可靠的方案，没有检索失败的顾虑。

### 4.3 向量记忆：语义检索注入

向量记忆通过相似度检索，只注入与当前 query 最相关的 topK 条：

```javascript
function injectVectorMemories(systemPrompt, query, vectorPath, topK = 5) {
  const results = queryVectorMemories(vectorPath, query, topK);

  if (results.length > 0) {
    systemPrompt += '\n\n相关历史记忆：\n';
    results.forEach(r => {
      systemPrompt += `- [${r.category}] ${r.content}\n`;
    });
  }

  return systemPrompt;
}
```

**检索时机**：每次用户发送新消息时，使用最新 query 重新检索。这样可以确保注入的记忆始终与当前话题最相关。

**为什么用检索而不是全量注入？** 500 条向量记忆如果全部注入 system prompt，会消耗大量 token 预算。检索只取最相关的 5-6 条，在信息密度和成本之间取得平衡。

### 4.4 会话摘要：自动压缩与截断

对话历史是 LLM 上下文膨胀的主要原因。系统采用"摘要+截断"双层策略：

```
对话进行中...
    │
    ▼
消息数超过 summarizeAfterMessages (18)?
    ├── 否 → 继续正常对话
    └── 是 → 对历史消息做摘要压缩
                │
                ▼
最近消息 token 数超过 maxRecentContextTokens (2800)?
    ├── 否 → 保留最近消息 + 历史摘要
    └── 是 → 截断较早消息，保留关键摘要
                │
                ▼
总历史 token 超过 hardContextCap (3200)?
    ├── 否 → 正常
    └── 是 → 强制截断，丢弃最早历史
```

**关键参数**：

| 参数 | 默认值 | 作用 |
|------|--------|------|
| `summarizeAfterMessages` | 18 | 消息条数达到此值时触发摘要 |
| `maxRecentContextTokens` | 2800 | 最近消息的 token 预算上限 |
| `maxHistoryMessages` | 10 | 发送给模型的最大历史消息条数 |
| `hardContextCap` | 3200 | 总历史 token 硬上限 |

**摘要生成机制**：
```javascript
function summarizeConversation(messages) {
  // 调用 LLM 对历史消息做摘要
  const summaryPrompt = `请总结以下对话的核心内容：\n${formatMessages(messages)}`;
  const summary = llmCall(summaryPrompt);

  return {
    summary,
    originalMessageCount: messages.length,
    compressedTokens: estimateTokens(messages) - estimateTokens(summary)
  };
}
```

---

## 五、跨设备合并策略（Cross-Device Merge）

Frees-Agent 支持在多台设备上运行共享记忆。通过配置 `syncRoots` 目录，系统可以自动合并多台设备的记忆文件。

### 5.1 合并架构

```
设备 A（MacBook）
    │
    ├── ~/.frees-agent/memory/profile.json
    ├── ...
    │
    └── 共享目录（iCloud / Syncthing / NAS）
         │
         ▼
     ┌─────────────────┐
     │    合并引擎       │  ← 设备 B（Linux 台式机）也写入此目录
     │  autoMergeAcross │
     │  Devices = true  │
     └────────┬────────┘
              │
              ▼
        合并后的记忆
```

### 5.2 各子系统的合并策略

**Profile（字段级合并 + 去重）**：
```javascript
function mergeProfiles(local, remote) {
  const merged = { ...local };
  for (const [key, value] of Object.entries(remote)) {
    if (Array.isArray(value) && Array.isArray(merged[key])) {
      // 数组合并去重
      merged[key] = [...new Set([...merged[key], ...value])];
    } else if (typeof value === 'object' && value !== null) {
      // 对象递归合并
      merged[key] = { ...merged[key], ...value };
    } else {
      // 标量值：以最新时间戳为准
      merged[key] = value;
    }
  }
  return merged;
}
```

**Durable Memory（category+content 去重）**：
- 以 `category + content` 为唯一键去重
- 两个设备可能记录同一件事，通过内容去重避免重复

**Sessions（时间合并去重，摘要拼接）**：
- 消息按时间戳排序
- 相同消息（内容完全相同）去重
- 对话摘要做拼接（而非替换），保留完整上下文

**Tasks（按 task id 合并状态）**：
- 相同 task id 以最新状态为准
- 本地没有的任务从远程补充
- 状态冲突时以较新的 timestamp 为准

### 5.3 同步模式

| 模式 | 配置 | 行为 |
|------|------|------|
| 只读合并 | `autoMergeAcrossDevices=true` `syncWritesToRoots=false` | 读取时合并所有根目录，但只写入本地目录 |
| 双向同步 | `autoMergeAcrossDevices=true` `syncWritesToRoots=true` | 每次写入同时同步到所有根目录 |
| 手动触发 | 命令行执行 `frees-agent memory merge` | 手动触发一次性合并 |

**推荐实践**：大多数用户应该使用"只读合并"模式。这样每台设备独立运行，只在读取时融合其他设备的知识，写入不会互相干扰。

---

## 六、Token 管理与预算控制

记忆系统的每个环节都直接或间接地消耗 token 预算。系统通过多层参数控制 token 使用。

### 6.1 Token 预算分配

```
总历史 Token 预算 (hardContextCap: 3200)
    │
    ├── 会话摘要 ~200-400 tokens
    ├── 向量记忆 topK ~100-300 tokens
    ├── 画像+长期记忆 ~200-500 tokens
    └── 最近消息 (maxRecentContextTokens: 2800)
         └── 每条 ~100-300 tokens
              └── maxHistoryMessages: 10
```

### 6.2 关键参数详解

| 参数 | 默认值 | 适用场景 | 调整建议 |
|------|--------|----------|----------|
| `maxOutputTokens` | 16000 | 控制单次回答长度 | 本地小模型设为 4096-8192 |
| `maxRecentContextTokens` | 2800 | 近消息预算 | 4k 上下文模型设为 2000 |
| `hardContextCap` | 3200 | 历史硬上限 | 不要超过模型上下文窗口的 70% |
| `maxHistoryMessages` | 10 | 消息条数上限 | 本地模型建议 6-10 |
| `autoContinueOnCutoff` | true | 截断时自动续写 | 高精度场景建议开启 |

### 6.3 自动续写机制

当 `autoContinueOnCutoff = true` 时，如果模型回答被截断，系统会：

1. 检测到截断（通过特殊标记或 token 计数）
2. 将已生成的部分作为上下文
3. 请求模型续写剩余内容
4. 重复直到回答完整或达到最大重试次数

---

## 七、Planner / Critic / Tools 集成

记忆系统的信息输出会被 Planner（规划层）和 Critic（反思层）使用：

- **Planning Layer**：复杂请求先生在规划中引用记忆中的相关信息，制定执行计划
- **Reflection Layer**：回答后进行自检时，会检查是否完整使用了记忆系统中的信息
- **Tool Layer**：工具调用（文件搜索、代码阅读、联网检索）的结果可以写入记忆

这种集成使得记忆系统不仅是信息的存储地，更是整个 Agent 行为的上下文基础：

```
Tool 执行结果
    │
    ▼
记忆系统吸收新信息
    │
    ▼
下次对话检索到相关信息
    │
    ▼
Planner 做出更准确的规划
    │
    ▼
Critic 基于完整信息做自检
```

---

## 八、最佳实践与注意事项

### 8.1 何时使用哪种记忆类型？

| 场景 | 推荐记忆类型 | 原因 |
|------|-------------|------|
| 用户姓名/偏好 | Profile | 静态属性，每次都需要 |
| 用户提到的个人事件 | Durable Memory | 明确需要记住的事实 |
| 项目技术细节 | Vector Memory | 需要语义检索找到相关上下文 |
| 待办/进行中的任务 | Task Memory | 需要跟踪状态变更 |
| 当前对话上下文 | Session Memory | 短期、会轮换的信息 |

### 8.2 向量检索的限制

- FNV-1a 嵌入不能理解同义词，所以检索关键词选择很重要
- 如果用户用不同表述描述同一件事（如"我的 Mac" vs "我的笔记本电脑"），向量检索可能找不到匹配
- 建议用户在关键记忆中使用明确、一致的关键词

### 8.3 跨设备同步注意事项

- 共享目录必须所有设备都能访问
- 避免同时在多台设备修改同一记忆条目（会导致冲突）
- iCloud/Syncthing 等同步服务可能会有延迟

---

## 九、未来路线

- [ ] **真实嵌入后端**：支持接入 text-embedding-3-small 等真实嵌入模型，提升语义检索精度
- [ ] **记忆衰减**：基于访问频率和时间的衰减机制，而不是简单的 FIFO 淘汰
- [ ] **记忆图**：将记忆组织为知识图谱，支持关系推理
- [ ] **主动回忆**：Agent 在适当时机主动询问"是否要记住这个？"
- [ ] **记忆加密**：支持对敏感记忆使用本地加密存储
