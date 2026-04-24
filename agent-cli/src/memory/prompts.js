import { truncateForModel } from '../utils/json.js';

export const MEMORY_EXTRACT_SYSTEM_PROMPT = `
你是 Frees Agent 的长期记忆提取器。

你的任务是从一轮对话里提取“值得长期保存”的用户信息，并且只返回一个 JSON 对象。

规则：
1. 只提取稳定、有价值、之后还会用到的信息。
2. 不要保存一次性的闲聊噪音。
3. 如果没有新增记忆，也必须返回合法 JSON。
4. profilePatch 里只放用户画像相关字段。
5. durableMemories 里放长期偏好、目标、约束、项目背景等。
6. 提问句不是事实，例如“我叫什么名字”“你知道我是谁吗”不能被提取成 name。
7. 绝对不要把“什么名字吗”“谁吗”这类疑问词写进 profilePatch.name。

返回格式：
{
  "profilePatch": {
    "name": "",
    "role": "",
    "bio": "",
    "language": "",
    "goals": [],
    "preferences": [],
    "skills": [],
    "stack": [],
    "constraints": [],
    "interests": []
  },
  "durableMemories": [
    {
      "category": "profile|goal|preference|constraint|project|workflow",
      "content": "..."
    }
  ]
}
`;

export function buildMemoryExtractionPrompt({
  profile,
  durableMemories,
  userMessage,
  assistantMessage
}) {
  return `
当前用户画像：
${JSON.stringify(profile || {}, null, 2)}

当前长期记忆：
${JSON.stringify(durableMemories || [], null, 2)}

本轮用户消息：
${userMessage}

本轮助手回复：
${truncateForModel(assistantMessage, 4000)}
`.trim();
}

export const SUMMARY_SYSTEM_PROMPT = `
你是 Frees Agent 的长对话压缩器。

你的任务是把较早的聊天历史压缩成忠实、可继续使用的摘要。

要求：
1. 只输出一个 JSON 对象。
2. 保留用户目标、约束、已做决定、待办事项、关键上下文。
3. 不要编造事实。
4. 摘要要能支持后续超长对话继续进行。

返回格式：
{
  "summary": "压缩后的连续摘要",
  "keyFacts": ["..."],
  "openLoops": ["..."]
}
`;

export function buildSummaryPrompt({ existingSummary, messagesToSummarize }) {
  return `
已有摘要：
${existingSummary || '暂无'}

需要继续压缩的历史消息：
${messagesToSummarize
  .map(message => `${message.role.toUpperCase()}: ${truncateForModel(message.content, 2000)}`)
  .join('\n\n')}
`.trim();
}

export function buildMemoryContext({
  profile,
  durableMemories,
  sessionSummary,
  semanticMemories = [],
  tasks = []
}) {
  const sections = [];

  if (profile && Object.keys(profile).length > 0) {
    sections.push(`用户画像:\n${JSON.stringify(profile, null, 2)}`);
  }

  if (durableMemories?.length) {
    sections.push(
      `长期记忆:\n${durableMemories
        .slice(0, 20)
        .map((item, index) => `${index + 1}. [${item.category}] ${item.content}`)
        .join('\n')}`
    );
  }

  if (sessionSummary) {
    sections.push(`长对话摘要:\n${sessionSummary}`);
  }

  if (semanticMemories?.length) {
    sections.push(
      `语义召回记忆:\n${semanticMemories
        .map((item, index) => `${index + 1}. [${item.category}] ${item.content}`)
        .join('\n')}`
    );
  }

  if (tasks?.length) {
    sections.push(
      `任务记忆:\n${tasks
        .slice(0, 12)
        .map((task, index) => `${index + 1}. [${task.status}] ${task.title}`)
        .join('\n')}`
    );
  }

  if (!sections.length) {
    return '';
  }

  return `
以下是 Frees Agent 持久化记忆与长对话上下文。回答时请参考，但不要臆造记忆中没有的信息。

${sections.join('\n\n')}
`.trim();
}
