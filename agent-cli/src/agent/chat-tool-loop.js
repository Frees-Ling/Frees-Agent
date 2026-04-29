import { extractFirstJsonObject } from '../utils/json.js';
import { truncateToWidth } from '../utils/truncate.js';
import { buildChatToolUserPrompt, CHAT_TOOL_SYSTEM_PROMPT } from './prompts.js';
import { partitionTools, executeToolBatch, formatToolResults } from './orchestration.js';

const MAX_TOOL_RESULT_LENGTH = 8000;
const MAX_MESSAGE_HISTORY = 20;
const MAX_RETRIES = 2;

function isToolAction(action) {
  return action && action.type === 'tool' && typeof action.tool === 'string';
}

function isFinalAction(action) {
  return action && action.type === 'final' && typeof action.reply === 'string';
}

function truncateToolResult(name, result) {
  const serialized = JSON.stringify(result, null, 2);
  if (serialized.length <= MAX_TOOL_RESULT_LENGTH) {
    return `TOOL_RESULT: ${name}\n${serialized}`;
  }
  // Truncate smartly: keep structure, trim long strings
  if (result.data && result.data.content && result.data.content.length > MAX_TOOL_RESULT_LENGTH / 2) {
    result = {
      ...result,
      data: {
        ...result.data,
        content: result.data.content.slice(0, MAX_TOOL_RESULT_LENGTH / 2) + '\n...[truncated]',
        truncated: true,
      }
    };
  } else if (result.data && result.data.stdout && result.data.stdout.length > MAX_TOOL_RESULT_LENGTH / 2) {
    result = {
      ...result,
      data: {
        ...result.data,
        stdout: result.data.stdout.slice(0, MAX_TOOL_RESULT_LENGTH / 2) + '\n...[truncated]',
        truncated: true,
      }
    };
  }
  return `TOOL_RESULT: ${name}\n${truncateToWidth(JSON.stringify(result, null, 2), MAX_TOOL_RESULT_LENGTH)}`;
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
  let messages = [
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
      // Execute single tool with retry
      const result = await executeWithRetry(toolbox, action.tool, action.args || {});
      messages.push({
        role: 'user',
        content: truncateToolResult(action.tool, result)
      });
      messages = trimMessageHistory(messages);
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
      const batchResults = await executeToolBatch(concurrent, (name, args) =>
        executeWithRetry(toolbox, name, args)
      );
      allResults.push(...batchResults);
    }
    // Execute sequential tools one by one
    for (const toolUse of sequential) {
      const result = await executeWithRetry(toolbox, toolUse.name, toolUse.args || {});
      allResults.push(result);
    }

    messages.push({
      role: 'user',
      content: formatToolResults(allResults)
    });
    messages = trimMessageHistory(messages);
  }

  return '已达到工具调用最大步数，建议你把任务拆小后重试。';
}

async function executeWithRetry(toolbox, toolName, args, maxRetries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const data = await toolbox.runTool(toolName, args);
      return { name: toolName, ok: data ? true : false, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < maxRetries && isTransientError(error)) {
        continue;
      }
      return { name: toolName, ok: false, error: message };
    }
  }
  return { name: toolName, ok: false, error: 'Max retries exceeded' };
}

function isTransientError(error) {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return msg.includes('eagain') || msg.includes('etimedout') || msg.includes('econnrefused');
}

function trimMessageHistory(messages) {
  if (messages.length <= MAX_MESSAGE_HISTORY * 2) return messages;
  // Keep the first (system prompt context) and last N messages
  const keep = [messages[0], ...messages.slice(-MAX_MESSAGE_HISTORY)];
  return keep;
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
