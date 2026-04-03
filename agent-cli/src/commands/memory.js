import { loadConfig } from '../config.js';
import { describeMemoryState } from '../memory/manager.js';
import {
  clearAllSessionFiles,
  clearMemoryState,
  createMemoryStore,
  listSessions,
  loadMemoryState,
  saveMemoryState
} from '../memory/store.js';

export async function runMemoryCommand(options) {
  const { config, path: configPath } = await loadConfig(options.configPath);
  const store = await createMemoryStore({
    configPath,
    workspaceRoot: options.workspace,
    sessionName: options.session
  });

  if (options.subcommand === 'show') {
    const state = await loadMemoryState(store, config);
    console.log(JSON.stringify(describeMemoryState(state), null, 2));
    return;
  }

  if (options.subcommand === 'clear') {
    const state = await loadMemoryState(store, config);
    const all = Boolean(options.all);
    clearMemoryState(state, {
      all,
      profile: all || Boolean(options.profile),
      durable: all || Boolean(options.durable),
      session: all || Boolean(options.sessionOnly)
    });
    await saveMemoryState(state);
    if (all) {
      await clearAllSessionFiles(store.storageRoot);
    }
    console.log('记忆已清理。');
    return;
  }

  if (options.subcommand === 'sessions') {
    const sessions = await listSessions(store.storageRoot);
    console.log(JSON.stringify(sessions, null, 2));
    return;
  }

  console.log('用法:');
  console.log('  frees-agent memory show [--session name]');
  console.log('  frees-agent memory clear [--all|--profile|--durable|--session-only]');
  console.log('  frees-agent memory sessions');
}
