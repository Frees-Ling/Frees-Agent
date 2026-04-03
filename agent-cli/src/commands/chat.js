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
import { resolveLocalChatShortcut } from '../memory/heuristics.js';
import { createMemoryStore, getRecentMessagesForModel, loadMemoryState, saveMemoryState } from '../memory/store.js';
import { createModelClient } from '../model/index.js';
import { formatSkillContext, loadSkills, selectRelevantSkills } from '../skills/loader.js';
import { printFreesAgentBanner } from '../ui/banner.js';
import { runEditCommand } from './edit.js';
import { buildWorkspaceOverview, findRelevantFiles, scanWorkspace } from '../workspace/indexer.js';

export async function runChatCommand(options) {
  const { client, runtime } = await createModelClient(options);
  printFreesAgentBanner(runtime, { command: 'chat' });
  let workspaceRoot = path.resolve(options.workspace || process.cwd());
  let index = null;
  let workspaceOverview = '未指定工作区。';
  let availableSkills = [];

  index = await scanWorkspace(workspaceRoot, runtime.config.workspace);
  workspaceOverview = buildWorkspaceOverview(index);
  availableSkills = await loadSkills(workspaceRoot);
  console.log(
    `[chat] workspace indexed: ${index.stats.loadedFiles}/${index.stats.totalFiles} files`
  );
  if (availableSkills.length) {
    console.log(`[chat] loaded skills: ${availableSkills.length}`);
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
    const shortcutReply = resolveLocalChatShortcut(message, memoryState);
    if (shortcutReply) {
      await updateMemoryAfterTurn({
        client,
        state: memoryState,
        userMessage: message,
        assistantMessage: shortcutReply,
        config: runtime.config
      });
      return shortcutReply;
    }

    const relevantFiles = index ? findRelevantFiles(index, message) : [];
    const relevantSkills = availableSkills.length
      ? selectRelevantSkills(availableSkills, message)
      : [];
    const prompt = buildChatUserPrompt({
      message,
      workspaceOverview,
      relevantFiles,
      skillContext: formatSkillContext(relevantSkills)
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
    try {
      const reply = await askModel(options.message);
      console.log(reply);
    } catch (error) {
      console.log('');
      console.log('Frees Agent 当前无法完成对话。');
      console.log(error instanceof Error ? error.message : String(error));
    }
    return;
  }

  const rl = readline.createInterface({ input, output });
  console.log(`Frees Agent Chat 已启动`);
  console.log(`会话: ${memoryState.session.name} (${memoryState.session.id})`);
  console.log('输入 /help 查看命令，输入 /exit 退出。');
  console.log('如果对话失败，不要退出终端，直接看错误提示并按提示修复。');

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
        console.log('/skills     查看当前加载的 skill 文件');
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

      if (line === '/skills') {
        if (!availableSkills.length) {
          console.log('当前工作区没有加载到 skill 文件。');
        } else {
          for (const skill of availableSkills) {
            console.log(`- ${skill.slug}: ${skill.description}`);
          }
        }
        continue;
      }

      if (line === '/reload') {
        index = await scanWorkspace(workspaceRoot, runtime.config.workspace);
        workspaceOverview = buildWorkspaceOverview(index);
        availableSkills = await loadSkills(workspaceRoot);
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

      try {
        const reply = await askModel(line);
        console.log(`\n${reply}\n`);
      } catch (error) {
        console.log('');
        console.log('Frees Agent 当前无法完成这次对话。');
        console.log(error instanceof Error ? error.message : String(error));
        console.log('你可以继续输入 /help、/reload，或者修复模型服务后直接继续聊天。');
        console.log('');
      }
    }
  } finally {
    rl.close();
  }
}
