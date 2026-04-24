import { extractFirstJsonObject, truncateForModel } from '../utils/json.js';

export async function buildExecutionPlan({
  plannerClient,
  message,
  workspaceOverview,
  enabled = true
}) {
  if (!enabled || !plannerClient) {
    return '';
  }

  try {
    const raw = await plannerClient.generateText({
      systemPrompt:
        '你是任务规划器。只返回 JSON：{"steps":["..."],"complexity":"low|medium|high"}',
      messages: [
        {
          role: 'user',
          content: `用户请求:\n${message}\n\n工作区概览:\n${truncateForModel(
            workspaceOverview,
            3000
          )}`
        }
      ],
      temperature: 0.1,
      maxOutputTokens: 500
    });
    const payload = extractFirstJsonObject(raw);
    if (!payload || !Array.isArray(payload.steps) || !payload.steps.length) {
      return '';
    }
    return `执行计划:\n${payload.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`;
  } catch {
    return '';
  }
}

export async function reflectAndRevise({
  criticClient,
  userMessage,
  draftReply,
  enabled = true
}) {
  if (!enabled || !criticClient || !draftReply) {
    return draftReply;
  }

  try {
    const raw = await criticClient.generateText({
      systemPrompt:
        '你是回答质检器。只返回 JSON：{"needsRevision":true|false,"improvedReply":"...","issues":["..."]}',
      messages: [
        {
          role: 'user',
          content: `用户问题:\n${userMessage}\n\n当前回答:\n${truncateForModel(
            draftReply,
            6000
          )}\n\n请检查是否存在遗漏、逻辑错误、可执行性不足。`
        }
      ],
      temperature: 0.1,
      maxOutputTokens: 1200
    });
    const payload = extractFirstJsonObject(raw);
    if (payload?.needsRevision && typeof payload?.improvedReply === 'string') {
      return payload.improvedReply.trim() || draftReply;
    }
    return draftReply;
  } catch {
    return draftReply;
  }
}
