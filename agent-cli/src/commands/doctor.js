import path from 'node:path';
import { createModelClient } from '../model/index.js';
import { printFreesAgentBanner } from '../ui/banner.js';
import { scanWorkspace } from '../workspace/indexer.js';
import { getFreesAgentVersion, validateConfig } from '../config.js';
import { McpManager } from '../tools/mcp-client.js';

export async function runDoctorCommand(options) {
  const { client, runtime } = await createModelClient(options);
  printFreesAgentBanner(runtime, { command: 'doctor' });

  console.log(`Frees Agent 版本: ${getFreesAgentVersion()}`);
  console.log(`配置路径: ${runtime.configPath}`);
  console.log(`存储根目录: ${path.dirname(runtime.configPath)}`);
  console.log(`提供者: ${runtime.providerName}`);
  console.log(`模型: ${runtime.model}`);
  console.log(`接口地址: ${runtime.baseUrl}`);
  console.log(`API 密钥: ${runtime.apiKey ? '已配置' : '未设置'}`);

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
    console.log('\n本地模型格式:');
    for (const model of formats) {
      console.log(`- ${model.format}: ${model.note}`);
    }
  }

  console.log('\n记忆与对话:');
  console.log(`- 记忆功能: ${runtime.config.memory?.enabled !== false}`);
  console.log(`- 自动提取: ${runtime.config.memory?.autoExtract !== false}`);
  console.log(`- 流式输出: ${runtime.config.conversation?.streamResponses !== false}`);
  console.log(`- 自动回退: ${runtime.config.conversation?.autoProviderFallback !== false}`);
  console.log(`- 保留最近消息数: ${runtime.config.conversation?.keepRecentMessages}`);
  console.log(`- 摘要触发消息数: ${runtime.config.conversation?.summarizeAfterMessages}`);
  console.log(`- 上下文 Token 预算: ${runtime.config.conversation?.maxRecentContextTokens}`);

  // System integration
  const sysInt = runtime.config.systemIntegration || {};
  console.log('\n系统集成:');
  console.log(`- 电脑控制: ${sysInt.computerControl !== false}`);
  console.log(`- Shell 执行: ${sysInt.shellExecution !== false}`);
  console.log(`- 聊天中启用工具: ${runtime.config.tools?.enabledInChat !== false}`);
  console.log(`- 联网搜索: ${runtime.config.tools?.webSearch?.enabled !== false}`);

  // MCP diagnostics
  const mcpServers = runtime.config.mcpServers || {};
  const mcpNames = Object.keys(mcpServers);
  console.log(`\nMCP 服务器: ${mcpNames.length ? mcpNames.join(', ') : '未配置'}`);
  if (mcpNames.length) {
    const mcpManager = new McpManager({
      config: runtime.config,
      storageRoot: path.dirname(runtime.configPath)
    });
    for (const name of mcpNames) {
      try {
        const conn = await mcpManager.getOrConnect(name);
        const tools = await conn.listTools();
        console.log(`  - ${name}: 已连接，${tools.length} 个工具`);
        await conn.disconnect();
      } catch (error) {
        console.log(`  - ${name}: 失败（${error.message}）`);
      }
    }
  }

  // Workspace scan
  const workspaceRoot = path.resolve(options.workspace || process.cwd());
  const index = await scanWorkspace(workspaceRoot, runtime.config.workspace);
  console.log('\n工作区扫描:');
  console.log(`- 根目录: ${workspaceRoot}`);
  console.log(`- 文件总数: ${index.stats.totalFiles}`);
  console.log(`- 已加载: ${index.stats.loadedFiles}`);
  console.log(`- 已跳过: ${index.stats.skippedFiles}`);

  if (options.ping) {
    console.log('\n正在测试模型连接...');
    try {
      const reply = await client.generateText({
        systemPrompt: 'You are a health check assistant.',
        messages: [{ role: 'user', content: 'Reply with exactly: PONG' }],
        temperature: 1,
        maxOutputTokens: 32
      });
      console.log(`模型响应: ${reply || '[空]'}`);
    } catch (error) {
      console.log(`连接测试失败: ${error.message}`);
    }
  }
}
