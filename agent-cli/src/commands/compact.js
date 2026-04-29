import { loadConfig } from '../config.js';
import { createMemoryStore, loadMemoryState } from '../memory/store.js';
import { compactConversationIfNeeded, describeMemoryState } from '../memory/manager.js';
import { createModelClient } from '../model/index.js';

export async function runCompactCommand(options) {
  const { config, path: configPath } = await loadConfig(options.configPath);
  const store = await createMemoryStore({
    configPath,
    workspaceRoot: options.workspace,
    sessionName: options.session
  });
  const state = await loadMemoryState(store, config);

  const desc = describeMemoryState(state);
  console.log(`会话: ${state.session.recentMessages.length} 条消息`);

  if (!options.model) {
    console.log('需要 --model 参数指定用于压缩的模型');
    return;
  }

  const client = await createModelClient({
    provider: options.provider || config?.provider,
    model: options.model,
    apiKey: options.apiKey,
    apiKeyEnv: options.apiKeyEnv,
    baseUrl: options.baseUrl,
    temperature: 0.1
  });

  const beforeLen = state.session.recentMessages.length;
  await compactConversationIfNeeded({ client, state, config });
  await store.saveState(state);
  const afterLen = state.session.recentMessages.length;

  console.log(`压缩完成: ${beforeLen} → ${afterLen} 条消息 (${beforeLen - afterLen} 条已摘要化)`);
}
