import path from 'node:path';
import { createModelClient } from '../model/index.js';
import { printFreesAgentBanner } from '../ui/banner.js';
import { runEditAgent } from '../agent/edit-loop.js';
import { buildWorkspaceOverview, findRelevantFiles, scanWorkspace } from '../workspace/indexer.js';
import { McpManager } from '../tools/mcp-client.js';

export async function runEditCommand(options) {
  if (!options.workspace) {
    throw new Error('edit 命令需要工作区路径，例如: frees-agent edit . --task "修复登录逻辑"');
  }
  if (!options.task) {
    throw new Error('edit 命令必须提供 --task');
  }

  const workspaceRoot = path.resolve(options.workspace);
  const { client, runtime } = await createModelClient(options);
  printFreesAgentBanner(runtime, { command: 'edit' });
  const mcpManager = new McpManager({
    config: runtime.config,
    storageRoot: path.dirname(runtime.configPath)
  });
  const mcpServerNames = Object.keys(runtime.config.mcpServers || {});
  if (mcpServerNames.length) {
    console.log(`[edit] mcp servers: ${mcpServerNames.join(', ')}`);
  }
  const index = await scanWorkspace(workspaceRoot, runtime.config.workspace);
  const workspaceOverview = buildWorkspaceOverview(index);
  const relevantFiles = findRelevantFiles(index, options.task);

  console.log(`[edit] provider=${runtime.providerName} model=${runtime.model}`);
  console.log(`[edit] scanning ${workspaceRoot}`);
  console.log(
    `[edit] indexed ${index.stats.loadedFiles}/${index.stats.totalFiles} files (${index.stats.loadedBytes} bytes loaded)`
  );

  const result = await runEditAgent({
    client,
    index,
    workspaceOverview,
    relevantFiles,
    task: options.task,
    maxSteps: options.maxSteps,
    dryRun: options.dryRun,
    temperature: options.temperature,
    maxOutputTokens:
      options.maxOutputTokens ??
      runtime.config.conversation?.maxOutputTokens ??
      16000,
    verbose: options.verbose,
    mcpManager: mcpServerNames.length ? mcpManager : null
  });

  console.log('\n总结:');
  console.log(result.summary || '无总结');

  if (result.changedFiles?.length) {
    console.log('\n修改的文件:');
    for (const file of new Set(result.changedFiles)) {
      console.log(`- ${file}`);
    }
  }

  if (result.notes?.length) {
    console.log('\n备注:');
    for (const note of result.notes) {
      console.log(`- ${note}`);
    }
  }

  if (options.dryRun) {
    console.log('\n[dry-run] 未实际写入文件。');
  }
}
