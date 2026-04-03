import { extractFirstJsonObject, truncateForModel } from '../utils/json.js';
import { buildEditUserPrompt, EDIT_AGENT_SYSTEM_PROMPT } from './prompts.js';
import { createAgentToolbox } from './tools.js';

function isToolAction(action) {
  return action && action.type === 'tool' && typeof action.tool === 'string';
}

function isFinalAction(action) {
  return action && action.type === 'final';
}

function formatToolResult(name, result) {
  return [
    `TOOL_RESULT: ${name}`,
    truncateForModel(JSON.stringify(result, null, 2), 7000)
  ].join('\n');
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
  maxOutputTokens = 4000,
  verbose = false
}) {
  if (!index) {
    throw new Error('编辑代理未收到工作区索引。');
  }

  const actualToolbox = createAgentToolbox(index, { dryRun });
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
