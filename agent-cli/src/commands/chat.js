import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { buildChatUserPrompt, CHAT_SYSTEM_PROMPT } from '../agent/prompts.js';
import {
  buildChatSystemPrompt,
  compactConversationIfNeeded,
  describeMemoryState,
  updateMemoryAfterTurn
} from '../memory/manager.js';
import { createMemoryStore, getRecentMessagesForModel, loadMemoryState, saveMemoryState } from '../memory/store.js';
import { createModelClient } from '../model/index.js';
import { printFreesAgentBanner } from '../ui/banner.js';
import { runEditCommand } from './edit.js';
import { buildWorkspaceOverview, findRelevantFiles, scanWorkspace } from '../workspace/indexer.js';

export async function runChatCommand(options) {
  const { client, runtime } = await createModelClient(options);
  printFreesAgentBanner(runtime, { command: 'chat' });
  let index = null;
  let workspaceOverview = '未指定工作区。';
  let workspaceRoot = null;

  if (options.workspace) {
    workspaceRoot = path.resolve(options.workspace);
    index = await scanWorkspace(workspaceRoot, runtime.config.workspace);
    workspaceOverview = buildWorkspaceOverview(index);
    console.log(
      `[chat] workspace indexed: ${index.stats.loadedFiles}/${index.stats.totalFiles} files`
    );
  }

  const memoryStore = await createMemoryStore({
    configPath: runtime.configPath,
    workspaceRoot,
    sessionName: options.session || runtime.config.conversation?.defaultSessionName
  });
  const memoryState = await loadMemoryState(memoryStore, runtime.config);

  if (options.resetSession) {
    memoryState.session.summary = '';
    memoryState.session.totalTurns = 0;
    memoryState.session.recentMessages = [];
    await saveMemoryState(memoryState);
  }

  async function askModel(message) {
    const relevantFiles = index ? findRelevantFiles(index, message) : [];
    const prompt = buildChatUserPrompt({
      message,
      workspaceOverview,
      relevantFiles
    });
    const systemPrompt = buildChatSystemPrompt({
      baseSystemPrompt: CHAT_SYSTEM_PROMPT,
      state: memoryState,
      config: runtime.config
    });
    const reply = await client.generateText({
      systemPrompt,
      messages: [...getRecentMessagesForModel(memoryState), { role: 'user', content: prompt }],
      temperature: options.temperature,
      maxOutputTokens: options.maxOutputTokens
    });
    await updateMemoryAfterTurn({
      client,
      state: memoryState,
      userMessage: message,
      assistantMessage: reply,
      config: runtime.config
    });
    await compactConversationIfNeeded({
      client,
      state: memoryState,
      config: runtime.config
    });
    return reply;
  }

  if (options.message) {
    const reply = await askModel(options.message);
    console.log(reply);
    return;
  }

  const rl = readline.createInterface({ input, output });
  console.log(`Frees Agent Chat 已启动。provider=${runtime.providerName} model=${runtime.model}`);
  console.log(`session=${memoryState.session.name} id=${memoryState.session.id}`);
  console.log('输入 /help 查看命令，/exit 退出。');

  try {
    while (true) {
      const line = (await rl.question('> ')).trim();
      if (!line) {
        continue;
      }

      if (line === '/exit' || line === '/quit') {
        break;
      }

      if (line === '/help') {
        console.log('/help       查看帮助');
        console.log('/exit       退出聊天');
        console.log('/reload     重新扫描工作区');
        console.log('/edit ...   在当前工作区执行代码 Agent');
        console.log('/memory     查看当前持久化记忆');
        console.log('/profile    查看当前用户画像');
        console.log('/summary    查看长对话摘要');
        continue;
      }

      if (line === '/memory') {
        console.log(JSON.stringify(describeMemoryState(memoryState), null, 2));
        continue;
      }

      if (line === '/profile') {
        console.log(JSON.stringify(memoryState.profile, null, 2));
        continue;
      }

      if (line === '/summary') {
        console.log(memoryState.session.summary || '当前还没有长对话摘要。');
        continue;
      }

      if (line === '/reload') {
        if (!workspaceRoot) {
          console.log('当前没有工作区。可使用 frees-agent chat <workspace> 启动。');
          continue;
        }
        index = await scanWorkspace(workspaceRoot, runtime.config.workspace);
        workspaceOverview = buildWorkspaceOverview(index);
        console.log(
          `[chat] workspace reloaded: ${index.stats.loadedFiles}/${index.stats.totalFiles} files`
        );
        continue;
      }

      if (line.startsWith('/edit ')) {
        if (!workspaceRoot) {
          console.log('当前 chat 未绑定工作区，无法执行代码编辑。');
          continue;
        }
        await runEditCommand({
          ...options,
          workspace: workspaceRoot,
          task: line.slice('/edit '.length)
        });
        index = await scanWorkspace(workspaceRoot, runtime.config.workspace);
        workspaceOverview = buildWorkspaceOverview(index);
        continue;
      }

      const reply = await askModel(line);
      console.log(`\n${reply}\n`);
    }
  } finally {
    rl.close();
  }
}
