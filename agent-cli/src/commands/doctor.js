import path from 'node:path';
import { createModelClient } from '../model/index.js';
import { printFreesAgentBanner } from '../ui/banner.js';
import { scanWorkspace } from '../workspace/indexer.js';

export async function runDoctorCommand(options) {
  const { client, runtime } = await createModelClient(options);
  printFreesAgentBanner(runtime, { command: 'doctor' });
  console.log(`config: ${runtime.configPath}`);
  console.log(`provider: ${runtime.providerName}`);
  console.log(`model: ${runtime.model}`);
  console.log(`baseUrl: ${runtime.baseUrl}`);
  console.log(`apiKey: ${runtime.apiKey ? 'configured' : 'not set'}`);

  const formats = runtime.config.localModels || [];
  if (formats.length) {
    console.log('\nLocal model formats:');
    for (const model of formats) {
      console.log(`- ${model.format}: ${model.note}`);
    }
  }

  console.log('\nMemory & conversation:');
  console.log(`- memory enabled: ${runtime.config.memory?.enabled !== false}`);
  console.log(`- auto extract: ${runtime.config.memory?.autoExtract !== false}`);
  console.log(`- keep recent messages: ${runtime.config.conversation?.keepRecentMessages}`);
  console.log(`- summarize after messages: ${runtime.config.conversation?.summarizeAfterMessages}`);

  if (options.workspace) {
    const workspaceRoot = path.resolve(options.workspace);
    const index = await scanWorkspace(workspaceRoot, runtime.config.workspace);
    console.log('\nWorkspace scan:');
    console.log(`- root: ${workspaceRoot}`);
    console.log(`- files: ${index.stats.totalFiles}`);
    console.log(`- loaded: ${index.stats.loadedFiles}`);
    console.log(`- skipped: ${index.stats.skippedFiles}`);
  }

  if (options.ping) {
    const reply = await client.generateText({
      systemPrompt: 'You are a health check assistant.',
      messages: [{ role: 'user', content: 'Reply with exactly: PONG' }],
      temperature: 0,
      maxOutputTokens: 32
    });
    console.log(`\nPing response: ${reply}`);
  }
}
