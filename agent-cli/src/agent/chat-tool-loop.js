import { extractFirstJsonObject } from '../utils/json.js';
import { buildChatToolUserPrompt, CHAT_TOOL_SYSTEM_PROMPT } from './prompts.js';
import { partitionTools, executeToolBatch, formatToolResults } from './orchestration.js';

function isToolAction(action) {
  return action && action.type === 'tool' && typeof action.tool === 'string';
}

function isFinalAction(action) {
  return action && action.type === 'final' && typeof action.reply === 'string';
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

    // Try to extract multiple JSON objects for parallel tool calls
    const actions = extractMultipleJsonObjects(raw);

    messages.push({ role: 'assistant', content: raw });

    if (!actions.length) {
      // Single action parsing
      const action = extractFirstJsonObject(raw);
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
      // Execute single tool
      try {
        const result = await toolbox.runTool(action.tool, action.args || {});
        messages.push({
          role: 'user',
          content: `TOOL_RESULT ${action.tool}\n${JSON.stringify(result, null, 2)}`
        });
      } catch (error) {
        messages.push({
          role: 'user',
          content: `TOOL_RESULT ${action.tool}\n${JSON.stringify({ ok: false, error: error.message }, null, 2)}`
        });
      }
      continue;
    }

    // Check if any is final
    const finalAction = actions.find(isFinalAction);
    if (finalAction) {
      return finalAction.reply;
    }

    // Partition into concurrent and sequential groups
    const toolActions = actions.filter(isToolAction);
    if (!toolActions.length) {
      messages.push({
        role: 'user',
        content:
          '请只返回 {"type":"tool"...} 或 {"type":"final","reply":"..."}。'
      });
      continue;
    }

    const toolUses = toolActions.map(a => ({ name: a.tool, args: a.args || {} }));
    const { concurrent, sequential } = partitionTools(toolUses);

    // Execute concurrent tools in parallel
    const allResults = [];
    if (concurrent.length) {
      const batchResults = await executeToolBatch(concurrent, toolbox.runTool.bind(toolbox));
      allResults.push(...batchResults);
    }
    // Execute sequential tools one by one
    for (const toolUse of sequential) {
      try {
        const data = await toolbox.runTool(toolUse.name, toolUse.args || {});
        allResults.push({ name: toolUse.name, ok: true, data });
      } catch (error) {
        allResults.push({
          name: toolUse.name,
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    messages.push({
      role: 'user',
      content: formatToolResults(allResults)
    });
  }

  return '已达到工具调用最大步数，建议你把任务拆小后重试。';
}

export function extractMultipleJsonObjects(text) {
  const results = [];
  let pos = 0;

  // First try parsing as a JSON array
  try {
    const array = JSON.parse(text);
    if (Array.isArray(array)) {
      for (const item of array) {
        if (item && typeof item === 'object' && (item.type === 'tool' || item.type === 'final')) {
          results.push(item);
        }
      }
      if (results.length > 0) return results;
    }
  } catch {
    // Not an array, continue with regex extraction
  }

  // Extract all JSON objects from the text
  const jsonRegex = /\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\})*)*\}))*\}/g;
  let match;
  while ((match = jsonRegex.exec(text)) !== null) {
    try {
      const obj = JSON.parse(match[0]);
      if (obj && typeof obj === 'object' && (obj.type === 'tool' || obj.type === 'final')) {
        results.push(obj);
      }
    } catch {
      // continue
    }
  }

  return results;
}
