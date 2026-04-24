import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { buildChatUserPrompt, CHAT_SYSTEM_PROMPT } from '../agent/prompts.js';
import { buildExecutionPlan, reflectAndRevise } from '../agent/reasoning.js';
import { runChatToolAgent } from '../agent/chat-tool-loop.js';
import { createAgentToolbox } from '../agent/tools.js';
import {
  attachSemanticMemoriesToState,
  buildChatSystemPrompt,
  compactConversationIfNeeded,
  describeMemoryState,
  updateMemoryAfterTurn
} from '../memory/manager.js';
import { resolveLocalChatShortcut } from '../memory/heuristics.js';
import { createMemoryStore, getRecentMessagesForModel, loadMemoryState, saveMemoryState } from '../memory/store.js';
import { createModelClient, createRoleModelClient } from '../model/index.js';
import { formatSkillContext, loadSkills, selectRelevantSkills } from '../skills/loader.js';
import { searchWebWithTavily, shouldUseWebSearch } from '../tools/web-search.js';
import { printFreesAgentBanner } from '../ui/banner.js';
import { runEditCommand } from './edit.js';
import { buildWorkspaceOverview, findRelevantFiles, scanWorkspace } from '../workspace/indexer.js';

function shouldUseToolLoop(message) {
  const text = String(message || '').trim().toLowerCase();
  if (!text) {
    return false;
  }
  const toolKeywords = [
    '修改',
    '重构',
    '创建文件',
    '读文件',
    '查看文件',
    'search',
    'grep',
    'read file',
    'write file',
    'replace',
    'patch',
    'apply',
    '目录',
    '代码改造'
  ];
  return toolKeywords.some(keyword => text.includes(keyword));
}

export async function runChatCommand(options) {
  const { client, runtime } = await createModelClient(options);
  printFreesAgentBanner(runtime, { command: 'chat' });
  let streamResponses =
    options.stream ?? runtime.config.conversation?.streamResponses ?? true;
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
  let plannerClient = null;
  let criticClient = null;
  try {
    plannerClient = (await createRoleModelClient(options, 'planner')).client;
  } catch {
    plannerClient = client;
  }
  try {
    criticClient = (await createRoleModelClient(options, 'critic')).client;
  } catch {
    criticClient = client;
  }

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
      return {
        reply: shortcutReply,
        streamed: false
      };
    }

    const relevantFiles = index ? findRelevantFiles(index, message) : [];
    await attachSemanticMemoriesToState({
      state: memoryState,
      query: message,
      config: runtime.config
    });
    const relevantSkills = availableSkills.length
      ? selectRelevantSkills(availableSkills, message)
      : [];
    const planningHint = await buildExecutionPlan({
      plannerClient,
      message,
      workspaceOverview,
      enabled: runtime.config.conversation?.planningEnabled !== false
    });
    let webHint = '';
    if (
      runtime.config.tools?.webSearch?.enabled !== false &&
      shouldUseWebSearch(message) &&
      ['ollama', 'openai-compatible', 'mcp'].includes(runtime.providerName)
    ) {
      try {
        const web = await searchWebWithTavily(message, runtime.config, {
          maxResults: runtime.config.tools?.webSearch?.maxResults ?? 5
        });
        webHint = [
          web.answer ? `摘要: ${web.answer}` : '',
          ...(web.results || []).map(item => `- ${item.title} (${item.url}) ${item.content}`)
        ]
          .filter(Boolean)
          .join('\n');
      } catch (error) {
        webHint = `联网检索失败: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    const prompt = buildChatUserPrompt({
      message,
      workspaceOverview,
      relevantFiles,
      skillContext: [
        formatSkillContext(relevantSkills),
        planningHint ? `\n${planningHint}` : '',
        webHint ? `\n联网信息:\n${webHint}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    });
    const systemPrompt = buildChatSystemPrompt({
      baseSystemPrompt: CHAT_SYSTEM_PROMPT,
      state: memoryState,
      config: runtime.config
    });
    const request = {
      systemPrompt,
      messages: [...getRecentMessagesForModel(memoryState), { role: 'user', content: prompt }],
      temperature: options.temperature,
      maxOutputTokens:
        options.maxOutputTokens ??
        runtime.config.conversation?.maxOutputTokens ??
        16000
    };
    let reply = '';
    let streamed = false;
    const useChatTools =
      runtime.config.tools?.enabledInChat !== false && shouldUseToolLoop(message);

    if (useChatTools && index) {
      const toolbox = createAgentToolbox(index, {
        readOnly: true,
        config: runtime.config
      });
      reply = await runChatToolAgent({
        client,
        toolbox,
        message,
        workspaceOverview,
        relevantFiles,
        memoryHint: memoryState.session.summary || '',
        planningHint,
        webHint,
        temperature: options.temperature ?? 0.1,
        maxOutputTokens:
          options.maxOutputTokens ??
          runtime.config.conversation?.maxOutputTokens ??
          16000
      });
    } else if (streamResponses && typeof client.streamText === 'function') {
      streamed = true;
      reply = await client.streamText({
        ...request,
        onToken(chunk) {
          output.write(chunk);
        }
      });
      if (String(reply || '').trim()) {
        output.write('\n');
      }
    } else {
      reply = await client.generateText(request);
    }

    if (streamed && !String(reply || '').trim()) {
      // Some gateways may return an empty streamed body under specific constraints.
      // Fallback once to non-stream mode to avoid writing empty assistant turns.
      streamed = false;
      reply = await client.generateText({
        ...request,
        temperature: request.temperature ?? 1
      });
    }

    if (!String(reply || '').trim()) {
      streamed = false;
      reply = '我刚才没有收到模型的有效输出，请重试一次。';
    }

    if (
      !streamed &&
      runtime.config.conversation?.reflectionEnabled !== false &&
      reply
    ) {
      reply = await reflectAndRevise({
        criticClient,
        userMessage: message,
        draftReply: reply,
        enabled: true
      });
    }

    if (
      !streamed &&
      runtime.config.conversation?.autoContinueOnCutoff !== false &&
      reply.length > 1000 &&
      !/[。.!！?？]\s*$/.test(reply)
    ) {
      const continuation = await client.generateText({
        systemPrompt,
        messages: [
          ...request.messages,
          { role: 'assistant', content: reply },
          {
            role: 'user',
            content: '请从上文中断处继续，避免重复已输出内容。'
          }
        ],
        temperature: options.temperature,
        maxOutputTokens: Math.min(request.maxOutputTokens || 16000, 6000)
      });
      if (continuation) {
        reply = `${reply}\n${continuation}`;
      }
    }

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
    return {
      reply,
      streamed
    };
  }

  if (options.message) {
    try {
      const result = await askModel(options.message);
      if (!result.streamed) {
        console.log(result.reply);
      }
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
  console.log(`流式输出: ${streamResponses ? '开启' : '关闭'}`);

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
        console.log('/tasks      查看任务记忆');
        console.log('/skills     查看当前加载的 skill 文件');
        console.log('/stream on  开启实时流式输出');
        console.log('/stream off 关闭实时流式输出');
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

      if (line === '/tasks') {
        if (!memoryState.tasks?.length) {
          console.log('当前没有任务记忆。');
        } else {
          for (const task of memoryState.tasks.slice(0, 20)) {
            console.log(`- [${task.status}] ${task.title}`);
          }
        }
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

      if (line === '/stream on') {
        streamResponses = true;
        console.log('已开启实时流式输出。');
        continue;
      }

      if (line === '/stream off') {
        streamResponses = false;
        console.log('已关闭实时流式输出。');
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
        const result = await askModel(line);
        if (!result.streamed) {
          console.log(`\n${result.reply}\n`);
        } else {
          console.log('');
        }
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
