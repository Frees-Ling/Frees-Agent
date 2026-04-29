import { truncateForModel } from '../utils/json.js';

export const MEMORY_EXTRACT_SYSTEM_PROMPT = `
你是一个长期记忆提取器，从对话中提取值得持久化的用户信息。

规则:
1. 只提取稳定、有价值、后续会用的信息，忽略一次性闲聊
2. 如果没有提取到新记忆，profilePatch 返回空对象{}，durableMemories返回空数组[]
3. profilePatch 只放用户画像字段
4. durableMemories 放目标/偏好/约束/项目背景等
5. 提问句不是事实，"我叫什么名字"不能提取为name
6. 绝对别把疑问词写入name字段

返回JSON:
{
  "profilePatch": {"name":"","role":"","bio":"","language":"","goals":[],"preferences":[],"skills":[],"stack":[],"constraints":[],"interests":[]},
  "durableMemories":[{"category":"goal|preference|constraint|project|workflow|tech","content":"..."}]
}
`;

export function buildMemoryExtractionPrompt({
  profile,
  durableMemories,
  userMessage,
  assistantMessage
}) {
  const profileStr = Object.keys(profile || {}).length
    ? JSON.stringify(profile, Object.keys(profile).filter(k => profile[k]), 2)
    : '(空)';
  const memoryStr = Array.isArray(durableMemories) && durableMemories.length
    ? durableMemories.slice(0, 15).map(m => `[${m.category}] ${m.content}`).join('\n')
    : '(空)';

  return [
    `当前画像:\n${profileStr}`,
    `当前记忆:\n${memoryStr}`,
    `用户:\n${userMessage}`,
    `助手:\n${truncateForModel(assistantMessage, 2000)}`
  ].join('\n\n');
}

export const SUMMARY_SYSTEM_PROMPT = `
你是长对话压缩器。把较早的聊天历史压缩为忠实、可用的摘要。

要求：只输出JSON。保留用户目标、约束、决定、待办、关键上下文。不要编造事实。

返回格式:
{"summary":"压缩摘要","keyFacts":["..."],"openLoops":["..."]}
`;

export function buildSummaryPrompt({ existingSummary, messagesToSummarize }) {
  const history = messagesToSummarize
    .map(m => `${m.role === 'user' ? 'U' : 'A'}: ${truncateForModel(m.content, 1200)}`)
    .join('\n');

  return `已有摘要:\n${existingSummary || '(无)'}\n\n需要压缩:\n${history}`;
}

export function buildMemoryContext({
  profile,
  durableMemories,
  sessionSummary,
  semanticMemories = [],
  tasks = []
}) {
  const sections = [];

  // Compress profile: only include non-empty fields, limit array lengths
  if (profile && Object.keys(profile).length > 0) {
    const compact = {};
    const name = profile.name || profile.nickname;
    if (name) compact.n = name;
    if (profile.role) compact.r = profile.role;
    if (profile.language) compact.l = profile.language;
    if (profile.persona) compact.p = profile.persona;

    const goals = (profile.goals || []).slice(0, 4);
    const skills = (profile.skills || []).slice(0, 6);
    const stack = (profile.stack || []).slice(0, 6);
    const prefs = (profile.preferences || []).slice(0, 4);
    const interests = (profile.interests || []).slice(0, 4);

    if (goals.length) compact.g = goals;
    if (skills.length) compact.s = skills;
    if (stack.length) compact.st = stack;
    if (prefs.length) compact.pf = prefs;
    if (interests.length) compact.i = interests;

    sections.push(`画像: ${truncateForModel(JSON.stringify(compact), 1600)}`);
  }

  // Durable memories: limit to 8 most relevant
  if (durableMemories?.length) {
    const items = durableMemories.slice(0, 8);
    sections.push(
      `记忆:\n${items.map((m, i) => `${i + 1}. [${m.category}] ${truncateForModel(m.content || '', 120)}`).join('\n')}`
    );
  }

  if (sessionSummary) {
    sections.push(`摘要:\n${sessionSummary}`);
  }

  if (semanticMemories?.length) {
    const items = semanticMemories.slice(0, 4);
    sections.push(
      `召回:\n${items.map((m, i) => `${i + 1}. [${m.category}] ${truncateForModel(m.content || '', 120)}`).join('\n')}`
    );
  }

  if (tasks?.length) {
    const items = tasks.slice(0, 6);
    sections.push(
      `任务:\n${items.map((t, i) => `${i + 1}. [${t.status}] ${t.title}`).join('\n')}`
    );
  }

  if (!sections.length) return '';

  return `[记忆] ${sections.join(' | ')}`;
}
