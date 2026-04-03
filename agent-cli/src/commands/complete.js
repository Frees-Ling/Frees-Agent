import path from 'node:path';
import { buildCompletionPrompt, COMPLETE_SYSTEM_PROMPT } from '../agent/prompts.js';
import { createModelClient } from '../model/index.js';
import { printFreesAgentBanner } from '../ui/banner.js';
import { readIndexedFile } from '../workspace/queries.js';
import { buildWorkspaceOverview, findRelevantFiles, scanWorkspace } from '../workspace/indexer.js';

export async function runCompleteCommand(options) {
  if (!options.workspace) {
    throw new Error('complete 命令需要工作区路径');
  }
  if (!options.instruction) {
    throw new Error('complete 命令必须提供 --instruction');
  }

  const workspaceRoot = path.resolve(options.workspace);
  const { client, runtime } = await createModelClient(options);
  printFreesAgentBanner(runtime, { command: 'complete' });
  const index = await scanWorkspace(workspaceRoot, runtime.config.workspace);
  const relevantFiles = findRelevantFiles(index, `${options.instruction} ${options.file || ''}`);
  let fileContext = '';

  if (options.file) {
    const selected = readIndexedFile(index, options.file);
    fileContext = `${selected.path}\n${selected.content}`;
  }

  const response = await client.generateText({
    systemPrompt: COMPLETE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: buildCompletionPrompt({
          instruction: options.instruction,
          workspaceOverview: buildWorkspaceOverview(index),
          relevantFiles,
          fileContext
        })
      }
    ],
    temperature: options.temperature ?? 0.1,
    maxOutputTokens: options.maxOutputTokens ?? 3000
  });

  console.log(response);
}
