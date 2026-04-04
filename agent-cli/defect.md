# 目前存在的缺陷

- 无法联网，无法使用在线资源。
- 无法真正的做到创建文件夹，在指定目录，并编写代码
- LM Studio MCP配置文件：

```json
{
  "mcpServers": {
    "tavily": {
      "command": "npx",
      "args": [
        "@tavily/mcp"
      ],
      "env": {
        "TAVILY_API_KEY": "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"
      }
    }
  }
}
```

- 模型太呆了，无法理解复杂指令和上下文

# Frees Agent 缺陷记录

## 缺陷名称

**Agent 用户长期记忆系统不完整（Profile 与 Durable Memory 未统一管理）**

---

# 一、问题描述（Problem Description）

当前 `Frees Agent` 的长期记忆系统存在结构不完整的问题。

系统目前仅支持将部分对话总结为自然语言并写入：

例如：
durable-memories.json

```json
{
  "category": "profile",
  "content": "用户的名字是 Frees Ling"
}
但用户画像文件：profile.json
中的字段：
goals
preferences
skills
constraints
均未被自动填充或更新。

即：

Agent 只写入“事件型记忆”，
没有维护 结构化用户画像（User Profile）。

二、问题表现（Observed Behavior）

当前系统行为：

1 Agent 会生成 durable memory，例如：
用户正在开发 Rust 猜数字游戏

写入：

durable-memories.json
2 但不会更新：
profile.json
例如：

{
  "skills": [],
  "goals": [],
  "preferences": []
}

始终为空。

三、问题原因（Root Cause）

推测当前 Agent Memory 设计仅实现：
memory.write({
  category,
  content
})

即：

自然语言记忆写入

但未实现：

profile.update(...)

或：

memory.extractProfile(...)

因此：

Agent 无法从对话中提取并维护：

技能
兴趣
目标
偏好
技术栈
四、影响范围（Impact）

该问题会导致以下问题：

1 用户画像缺失

Agent 无法长期记住用户：

技能
技术栈
学习方向
兴趣
2 个性化能力下降

Agent 无法进行：

context personalization

例如：

无法知道用户是：

开发者
AI爱好者
Python / Rust 用户
3 记忆冗余

所有信息只能存为：

自然语言记录

导致：

memory duplication
memory fragmentation

例如：

用户喜欢AI
用户对AI感兴趣
用户在学习AI

无法统一。

五、目标（Expected Behavior）

Agent 需要实现 完整长期记忆系统：

包括三种记忆类型：

1 用户画像（User Profile）

存储：

profile.json

示例：

{
  "name": "Frees Ling",
  "skills": ["Python", "C++", "Git"],
  "stack": ["Rust"],
  "goals": ["成为全栈工程师"],
  "preferences": ["喜欢条理清晰解释"]
}
2 长期事件记忆（Durable Memory）

存储：

durable-memories.json

记录：

项目
事件
行为
关系

例如：

用户正在开发Rust小游戏
3 语义记忆（Semantic Memory）

用于：

vector search
RAG
context recall

（可作为未来扩展）

六、解决方案（Proposed Solution）

新增 Memory Ingest 模块

用于：

从对话自动提取用户信息

并写入：

profile.json
解决方案结构

新增模块：

memory/
  memory-ingest.ts

功能：

extractUserProfile()

流程：

对话
 ↓
LLM总结
 ↓
结构化解析
 ↓
更新profile.json
七、需要实现的功能（Tasks）
Task 1

实现 Profile Extractor

函数：

extractProfileFromText(text)

识别：

技能
技术栈
目标
兴趣
偏好
Task 2

实现 Profile Updater

函数：

updateProfile(profile)

写入：

profile.json

并进行：

去重
合并
Task 3

实现 Memory Router

逻辑：

如果内容属于用户画像
    写入 profile.json

否则
    写入 durable-memories.json
Task 4

实现 Memory Schema

定义：

interface UserProfile {
  name: string
  skills: string[]
  stack: string[]
  goals: string[]
  preferences: string[]
  interests: string[]
}
八、未来扩展（Future Improvements）

未来可以增加：

Vector Memory

目录：

memory/vector

用于：

semantic recall
RAG
long context retrieval
Episodic Memory

记录：

用户行为
聊天历史
任务
九、验收标准（Acceptance Criteria）

完成后系统应满足：

1

用户信息可自动写入：

profile.json

例如：

skills
goals
preferences
2

事件型信息写入：

durable-memories.json
3

新增用户信息时：

不会重复

例如：

Python
Python开发
Python编程

应合并。

4

Agent 在对话时能够引用：

profile.json

实现：

personalized responses
十、优先级（Priority）
Priority: Medium
Type: Enhancement
Component: Memory System
备注

当前 Frees Agent Memory 仅支持 Durable Memory（事件型记忆），
需要补充 User Profile Memory（结构化用户画像），以实现：

个性化对话
用户长期记忆
技能与兴趣识别
Agent 个性化行为

---

如果你愿意，Puro还能帮你 **再升级一版**，做成 **开源项目级别的设计文档**，例如：


docs/
agent-memory-architecture.md


里面会包含：

- Agent Memory Architecture 图
- Memory Flow
- Storage Schema
- Retrieval Strategy
- RAG Integration

那基本就是 **AI Agent 项目的架构文档级别**了。
