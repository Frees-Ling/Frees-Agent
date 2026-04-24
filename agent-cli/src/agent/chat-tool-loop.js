import { extractFirstJsonObject } from '../utils/json.js';
import { buildChatToolUserPrompt, CHAT_TOOL_SYSTEM_PROMPT } from './prompts.js';

function isToolAction(action) {
  return action && action.type === 'tool' && typeof action.tool === 'string';
}

function isFinalAction(action) {
  return action && action.type === 'final' && typeof action.reply === 'string';
}

function formatToolResult(name, result) {
  return `TOOL_RESULT ${name}\n${JSON.stringify(result, null, 2)}`;
}

export async function runChatToolAgent({
  client,
  toolbox,
  message,
  workspaceOverview,
  relevantFiles,
  memoryHint = '',
  planningHint = '',
  webHint = '',
  temperature = 0.2,
  maxOutputTokens = 16000,
  maxSteps = 6
}) {
  const messages = [
    {
      role: 'user',
      content: buildChatToolUserPrompt({
        message,
        workspaceOverview,
        relevantFiles,
        memoryHint,
        planningHint,
        webHint
      })
    }
  ];

  for (let step = 0; step < maxSteps; step += 1) {
    const raw = await client.generateText({
      systemPrompt: CHAT_TOOL_SYSTEM_PROMPT,
      messages,
      temperature,
      maxOutputTokens: Math.min(maxOutputTokens, 2000)
    });
    const action = extractFirstJsonObject(raw);
    messages.push({ role: 'assistant', content: raw });

    if (isFinalAction(action)) {
      return action.reply;
    }
    if (!isToolAction(action)) {
      messages.push({
        role: 'user',
        content:
          '上一条不是合法 JSON。请只返回 {"type":"tool"...} 或 {"type":"final","reply":"..."}。'
      });
      continue;
    }

    try {
      const result = await toolbox.runTool(action.tool, action.args || {});
      messages.push({
        role: 'user',
        content: formatToolResult(action.tool, result)
      });
    } catch (error) {
      messages.push({
        role: 'user',
        content: formatToolResult(action.tool, {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        })
      });
    }
  }

  return '已达到工具调用最大步数，建议你把任务拆小后重试。';
}
