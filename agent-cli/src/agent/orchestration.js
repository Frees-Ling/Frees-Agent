// Tool orchestration with concurrent execution support.
// Reference: Claude Code CLI src/services/tools/toolOrchestration.ts

const READONLY_TOOLS = new Set([
  'list_files',
  'search_text',
  'read_file',
  'web_search',
  'list_mcp_tools'
]);

function isReadOnlyTool(name) {
  return READONLY_TOOLS.has(name) || name.startsWith('mcp__');
}

export function partitionTools(toolUses) {
  const concurrent = [];
  const sequential = [];

  for (const toolUse of toolUses) {
    if (isReadOnlyTool(toolUse.name)) {
      concurrent.push(toolUse);
    } else {
      sequential.push(toolUse);
    }
  }

  return { concurrent, sequential };
}

export async function executeToolBatch(toolUses, runToolFn, { concurrency = 5 } = {}) {
  const results = [];

  async function executeOne(toolUse) {
    try {
      const data = await runToolFn(toolUse.name, toolUse.args || {});
      return { name: toolUse.name, ok: true, data };
    } catch (error) {
      return {
        name: toolUse.name,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Execute in batches of `concurrency`
  for (let i = 0; i < toolUses.length; i += concurrency) {
    const batch = toolUses.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(executeOne));
    results.push(...batchResults);
  }

  return results;
}

export async function executeToolsSequential(toolUses, runToolFn) {
  const results = [];
  for (const toolUse of toolUses) {
    try {
      const data = await runToolFn(toolUse.name, toolUse.args || {});
      results.push({ name: toolUse.name, ok: true, data });
    } catch (error) {
      results.push({
        name: toolUse.name,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return results;
}

export function formatToolResults(results) {
  return results
    .map(result => {
      const output = result.ok
        ? JSON.stringify(result.data, null, 2)
        : JSON.stringify({ error: result.error }, null, 2);
      return `TOOL_RESULT: ${result.name}\n${output}`;
    })
    .join('\n\n');
}
