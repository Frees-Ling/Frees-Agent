import { extractFirstJsonObject } from '../utils/json.js';
import { buildEditUserPrompt, EDIT_AGENT_SYSTEM_PROMPT } from './prompts.js';
import { createAgentToolbox } from './tools.js';

const MAX_TOOL_RESULT_LENGTH = 8000;

function isToolAction(action) {
  return action && action.type === 'tool' && typeof action.tool === 'string';
}

function isFinalAction(action) {
  return action && action.type === 'final';
}

function formatToolResult(name, result) {
  const serialized = JSON.stringify(result, null, 2);
  if (serialized.length <= MAX_TOOL_RESULT_LENGTH) {
    return `TOOL_RESULT: ${name}\n${serialized}`;
  }
  // Truncate long content fields
  if (result.data?.content?.length > MAX_TOOL_RESULT_LENGTH / 2) {
    result.data.content = result.data.content.slice(0, MAX_TOOL_RESULT_LENGTH / 2) + '\n...[truncated]';
    result.data.truncated = true;
  }
  return `TOOL_RESULT: ${name}\n${truncateToWidth(JSON.stringify(result, null, 2), MAX_TOOL_RESULT_LENGTH)}`;
}

function truncateToWidth(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 100) + '\n...[truncated]';
}

export async function runEditAgent({
  client,
  index,
  workspaceOverview,
  relevantFiles,
  task,
  maxSteps = 14,
  dryRun = false,
  temperature = 0.2,
  maxOutputTokens = 16000,
  verbose = false,
  mcpManager = null
}) {
  if (!index) {
    throw new Error('编辑代理未收到工作区索引。');
  }

  const actualToolbox = createAgentToolbox(index, { dryRun });

  // Attach MCP tools if available
  if (mcpManager && actualToolbox.setMcpManager) {
    actualToolbox.setMcpManager(mcpManager);
    await actualToolbox.mcpHandlers.refreshTools();
    const mcpTools = actualToolbox.mcpHandlers.getToolNames();
    if (mcpTools.length && verbose) {
      console.log(`[edit] loaded ${mcpTools.length} MCP tools`);
    }
  }

  const messages = [
    {
      role: 'user',
      content: buildEditUserPrompt({
        task,
        workspaceOverview,
        relevantFiles,
        dryRun
      })
    }
  ];

  let lastRawReply = '';

  for (let step = 1; step <= maxSteps; step += 1) {
    const rawReply = await client.generateText({
      systemPrompt: EDIT_AGENT_SYSTEM_PROMPT,
      messages,
      temperature,
      maxOutputTokens
    });

    lastRawReply = rawReply;
    const action = extractFirstJsonObject(rawReply);
    if (verbose) {
      console.log(`\n[agent step ${step}]`);
      console.log(rawReply);
    }

    messages.push({ role: 'assistant', content: rawReply });

    if (isFinalAction(action)) {
      return {
        ...action,
        changes: actualToolbox.changes,
        rawReply
      };
    }

    if (!isToolAction(action)) {
      messages.push({
        role: 'user',
        content:
          '你上一条回复不是合法 JSON。请只返回一个 JSON 对象，格式必须是 {"type":"tool"...} 或 {"type":"final"...}。'
      });
      continue;
    }

    try {
      const result = await actualToolbox.runTool(action.tool, action.args || {});
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

  return {
    type: 'final',
    summary: '已达到最大 Agent 步数，代理被强制结束。',
    changedFiles: actualToolbox.changes.map(change => change.path),
    notes: ['可提高 --max-steps 后重试。'],
    changes: actualToolbox.changes,
    rawReply: lastRawReply
  };
}
