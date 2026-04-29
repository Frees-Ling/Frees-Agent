import { loadConfig } from '../config.js';
import { createMemoryStore, loadMemoryState } from '../memory/store.js';
import { describeMemoryState, buildChatSystemPrompt } from '../memory/manager.js';
import { estimateMessagesTokens, estimateTokens } from '../utils/tokens.js';

export async function runCostCommand(options) {
  const { config, path: configPath } = await loadConfig(options.configPath);
  const store = await createMemoryStore({
    configPath,
    workspaceRoot: options.workspace,
    sessionName: options.session
  });
  const state = await loadMemoryState(store, config);

  const recentMessages = state.session.recentMessages || [];
  const systemPrompt = buildChatSystemPrompt(state, {
    userName: config?.user?.name,
    userLanguage: config?.user?.language
  });

  const systemTokens = estimateTokens(systemPrompt);
  const messagesTokens = estimateMessagesTokens(recentMessages);
  const totalTokens = systemTokens + messagesTokens;

  console.log('Token 用量统计：');
  console.log(`  系统提示词: ${systemTokens} tokens`);
  console.log(`  会话消息:   ${messagesTokens} tokens (${recentMessages.length} 条消息)`);
  console.log(`  总计:       ${totalTokens} tokens`);

  if (recentMessages.length > 0) {
    const sessionTokens = estimateTokens(state.session.summary || '');
    console.log(`  会话摘要:   ${sessionTokens} tokens`);
  }

  const model = options.model || config?.model || 'default';
  const contextWindow = options.contextWindow || 128000;
  const usagePercent = ((totalTokens / contextWindow) * 100).toFixed(1);
  console.log(`  模型:       ${model} (上下文 ${(contextWindow / 1000).toFixed(0)}K)`);
  console.log(`  占用率:     ${usagePercent}%`);

  if (totalTokens > contextWindow * 0.8) {
    console.log('\n  警告: token 占用率超过 80%，建议压缩对话。');
  }
}
