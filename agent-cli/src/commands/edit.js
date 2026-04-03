import path from 'node:path';
import { createModelClient } from '../model/index.js';
import { runEditAgent } from '../agent/edit-loop.js';
import { buildWorkspaceOverview, findRelevantFiles, scanWorkspace } from '../workspace/indexer.js';

export async function runEditCommand(options) {
  if (!options.workspace) {
    throw new Error('edit 命令需要工作区路径，例如: ai-agent edit . --task "修复登录逻辑"');
  }
  if (!options.task) {
    throw new Error('edit 命令必须提供 --task');
  }

  const workspaceRoot = path.resolve(options.workspace);
  const { client, runtime } = await createModelClient(options);
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
    maxOutputTokens: options.maxOutputTokens,
    verbose: options.verbose
  });

  console.log('\nSummary:');
  console.log(result.summary || 'No summary');

  if (result.changedFiles?.length) {
    console.log('\nChanged files:');
    for (const file of new Set(result.changedFiles)) {
      console.log(`- ${file}`);
    }
  }

  if (result.notes?.length) {
    console.log('\nNotes:');
    for (const note of result.notes) {
      console.log(`- ${note}`);
    }
  }

  if (options.dryRun) {
    console.log('\n[dry-run] 未实际写入文件。');
  }
}
