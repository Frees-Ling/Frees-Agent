import path from 'node:path';
import { createModelClient } from '../model/index.js';
import { printFreesAgentBanner } from '../ui/banner.js';
import { scanWorkspace } from '../workspace/indexer.js';
import { getFreesAgentVersion, validateConfig } from '../config.js';
import { McpManager } from '../tools/mcp-client.js';

export async function runDoctorCommand(options) {
  const { client, runtime } = await createModelClient(options);
  printFreesAgentBanner(runtime, { command: 'doctor' });

  console.log(`Frees Agent version: ${getFreesAgentVersion()}`);
  console.log(`config: ${runtime.configPath}`);
  console.log(`storageRoot: ${path.dirname(runtime.configPath)}`);
  console.log(`provider: ${runtime.providerName}`);
  console.log(`model: ${runtime.model}`);
  console.log(`baseUrl: ${runtime.baseUrl}`);
  console.log(`apiKey: ${runtime.apiKey ? 'configured' : 'not set'}`);

  // Config validation
  const configErrors = validateConfig(runtime.config);
  if (configErrors.length) {
    console.log('\n配置问题:');
    for (const error of configErrors) {
      console.log(`  - [WARN] ${error}`);
    }
  } else {
    console.log('\n配置校验: 通过');
  }

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
  console.log(`- stream responses: ${runtime.config.conversation?.streamResponses !== false}`);
  console.log(`- auto provider fallback: ${runtime.config.conversation?.autoProviderFallback !== false}`);
  console.log(`- keep recent messages: ${runtime.config.conversation?.keepRecentMessages}`);
  console.log(`- summarize after messages: ${runtime.config.conversation?.summarizeAfterMessages}`);
  console.log(`- context token budget: ${runtime.config.conversation?.maxRecentContextTokens}`);

  // System integration
  const sysInt = runtime.config.systemIntegration || {};
  console.log('\nSystem integration:');
  console.log(`- computer control: ${sysInt.computerControl !== false}`);
  console.log(`- shell execution: ${sysInt.shellExecution !== false}`);
  console.log(`- tools enabled in chat: ${runtime.config.tools?.enabledInChat !== false}`);
  console.log(`- web search: ${runtime.config.tools?.webSearch?.enabled !== false}`);

  // MCP diagnostics
  const mcpServers = runtime.config.mcpServers || {};
  const mcpNames = Object.keys(mcpServers);
  console.log(`\nMCP servers: ${mcpNames.length ? mcpNames.join(', ') : 'none configured'}`);
  if (mcpNames.length) {
    const mcpManager = new McpManager({
      config: runtime.config,
      storageRoot: path.dirname(runtime.configPath)
    });
    for (const name of mcpNames) {
      try {
        const conn = await mcpManager.getOrConnect(name);
        const tools = await conn.listTools();
        console.log(`  - ${name}: connected, ${tools.length} tools`);
        await conn.disconnect();
      } catch (error) {
        console.log(`  - ${name}: FAIL (${error.message})`);
      }
    }
  }

  // Workspace scan
  const workspaceRoot = path.resolve(options.workspace || process.cwd());
  const index = await scanWorkspace(workspaceRoot, runtime.config.workspace);
  console.log('\nWorkspace scan:');
  console.log(`- root: ${workspaceRoot}`);
  console.log(`- files: ${index.stats.totalFiles}`);
  console.log(`- loaded: ${index.stats.loadedFiles}`);
  console.log(`- skipped: ${index.stats.skippedFiles}`);

  if (options.ping) {
    console.log('\nPinging model...');
    try {
      const reply = await client.generateText({
        systemPrompt: 'You are a health check assistant.',
        messages: [{ role: 'user', content: 'Reply with exactly: PONG' }],
        temperature: 1,
        maxOutputTokens: 32
      });
      console.log(`Ping response: ${reply || '[empty]'}`);
    } catch (error) {
      console.log(`Ping failed: ${error.message}`);
    }
  }
}
