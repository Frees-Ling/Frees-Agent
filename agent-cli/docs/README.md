# Frees Agent 文档区

这里是 `Frees Agent` 的中文文档区，用来集中存放 AI 智能体、LLM 模型、训练、微调、模型加载、API 接入、记忆系统与超长对话等相关说明。

## 文档索引

- `01-什么是LLM模型与AI智能体.md`
  什么是 LLM，什么是 AI Agent，它们之间的关系是什么。
- `02-如何训练属于自己的LLM模型.md`
  从零预训练、继续预训练、SFT、LoRA/QLoRA、RAG 等路线说明。
- `03-LM-Studio模型二次训练.md`
  如何看待 LM Studio 下载模型的再训练问题，什么能训，什么不能直接训。
- `04-如何把模型训练到尽量稳定好用.md`
  训练策略、数据质量、评测与上线策略。
- `05-训练模型常见问题与解决方案.md`
  欠拟合、过拟合、灾难性遗忘、显存不足、格式问题等。
- `06-如何加载模型与接入自己的模型或云端API.md`
  如何在 `Frees Agent` 里配置本地模型、OpenAI 兼容 API、Anthropic API，以及如何在代码里增加新的 provider。
- `07-Frees-Agent记忆与超长对话.md`
  `Frees Agent` 的长期记忆、用户画像、会话持久化和超长对话摘要压缩机制。

## 推荐阅读顺序

1. 先读 LLM 与 Agent 基础
2. 再读训练与微调路线
3. 然后看模型加载与 API 接入
4. 最后看 `Frees Agent` 的记忆与长对话实现

## 在 CLI 中查看文档

你可以直接在终端里执行：

```bash
frees-agent docs
frees-agent docs llm-basics
frees-agent docs load-models
frees-agent docs memory-long-chat
```
