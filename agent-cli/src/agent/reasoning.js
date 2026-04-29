import { extractFirstJsonObject, truncateForModel } from '../utils/json.js';
import { hasUltraplanKeyword } from '../utils/ultraplan/keyword.js';

// ─── 多步任务分解 ───

/**
 * Build a structured execution plan with step tracking metadata.
 * Returns { steps: [{description, status}], complexity, toolsNeeded, risks } or null.
 */
export async function buildStructuredPlan({
  plannerClient,
  message,
  workspaceOverview,
  enabled = true
}) {
  const ultraplan = hasUltraplanKeyword(message);
  const effectiveEnabled = enabled || ultraplan;

  if (!effectiveEnabled || !plannerClient) {
    return null;
  }

  const planPrompt = ultraplan
    ? `你是增强规划器。将用户请求分解为可执行的 DAG 子任务。
返回 JSON 格式：
{
  "steps": ["步骤1描述", "步骤2描述", ...],
  "complexity": "low|medium|high",
  "dependencies": [["步骤2依赖步骤1的说明"], ...],
  "risks": ["风险说明"],
  "estimatedEffort": "预估工作量",
  "toolsNeeded": ["所需工具列表"]
}`
    : '你是任务规划器。返回 JSON：{"steps":["..."],"complexity":"low|medium|high"}';

  try {
    const raw = await plannerClient.generateText({
      systemPrompt: planPrompt,
      messages: [
        {
          role: 'user',
          content: `用户请求:\n${message}\n\n工作区概览:\n${truncateForModel(
            workspaceOverview,
            3000
          )}`
        }
      ],
      temperature: ultraplan ? 0.2 : 0.1,
      maxOutputTokens: ultraplan ? 1200 : 500
    });
    const payload = extractFirstJsonObject(raw);
    if (!payload || !Array.isArray(payload.steps) || !payload.steps.length) {
      return null;
    }

    return {
      steps: payload.steps.map((desc, i) => ({
        id: `step-${i + 1}`,
        description: desc,
        status: 'pending',
      })),
      complexity: payload.complexity || 'medium',
      dependencies: payload.dependencies || [],
      risks: payload.risks || [],
      estimatedEffort: payload.estimatedEffort || '',
      toolsNeeded: payload.toolsNeeded || [],
    };
  } catch {
    return null;
  }
}

export async function buildExecutionPlan({
  plannerClient,
  message,
  workspaceOverview,
  enabled = true
}) {
  const structured = await buildStructuredPlan({
    plannerClient, message, workspaceOverview, enabled
  });

  if (!structured) return '';

  let hint = `执行计划:\n${structured.steps.map((s, index) => `${index + 1}. ${s.description}`).join('\n')}`;

  if (structured.toolsNeeded.length) {
    hint += `\n所需工具: ${structured.toolsNeeded.join(', ')}`;
  }

  return hint;
}

// ─── 回答质检与修正 ───

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
        '你是回答质检器。返回 JSON：{"needsRevision":true|false,"improvedReply":"...","issues":["..."]}',
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
