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
import { Mascot, formatUserMessage, formatAssistantMessage, formatError, formatSuccess, formatHint, c, colors } from '../ui/mascot.js';
import { StatusBar, divider } from '../ui/status-bar.js';
import { Spinner, ThinkingIndicator } from '../ui/progress.js';
import { estimateMessagesTokens, estimateTokens } from '../utils/tokens.js';
import { StreamBatcher } from '../utils/stream.js';
import { runEditCommand } from './edit.js';
import { buildWorkspaceOverview, findRelevantFiles, scanWorkspace } from '../workspace/indexer.js';
import { McpManager } from '../tools/mcp-client.js';

const EMPTY_REPLY_FALLBACK = '我刚才没有收到模型的有效输出，请重试一次。';

function shouldUseToolLoop(message) {
  const text = String(message || '').trim().toLowerCase();
  if (!text) return false;
  const toolKeywords = [
    '修改', '重构', '创建文件', '读文件', '查看文件',
    'search', 'grep', 'read file', 'write file', 'replace',
    'patch', 'apply', '目录', '代码改造'
  ];
  return toolKeywords.some(keyword => text.includes(keyword));
}

function isFallbackAssistantReply(text) {
  return String(text || '').trim() === EMPTY_REPLY_FALLBACK;
}

function looksLikeReasoningLeak(text) {
  const value = String(text || '').trim();
  if (!value || value.length < 60) return false;
  return [
    /^here'?s a thinking process/i, /^用户询问[“"]/,
    /^根据系统提示/, /回答策略[:：]/, /最终回答将整合这些点/,
    /Analyze User Input/i, /Final Verification/i
  ].some(pattern => pattern.test(value));
}

function normalizeHistoryOrder(messages = []) {
  const cleaned = [];
  for (const message of messages || []) {
    const role = String(message?.role || '').trim();
    const content = String(message?.content || '').trim();
    if (!content) continue;
    if (role !== 'user' && role !== 'assistant') continue;
    if (role === 'assistant' && (isFallbackAssistantReply(content) || looksLikeReasoningLeak(content))) continue;
    cleaned.push({ role, content });
  }
  while (cleaned.length && cleaned[0].role === 'assistant') cleaned.shift();
  return cleaned;
}

function trimHistoryByBudget(messages = [], { maxTokens = 2800, maxMessages = 10 } = {}) {
  const limitedByCount =
    Number.isFinite(maxMessages) && maxMessages > 0 ? messages.slice(-maxMessages) : [...messages];
  if (!limitedByCount.length) return [];
  const safeBudget = Math.max(240, Number(maxTokens) || 0);
  const selected = [];
  let usedTokens = 0;
  for (let index = limitedByCount.length - 1; index >= 0; index -= 1) {
    const message = limitedByCount[index];
    const messageTokens = estimateTokens(message.content) + 6;
    if (usedTokens + messageTokens > safeBudget) {
      if (!selected.length) {
        const raw = String(message.content || '');
        const tail = raw.slice(-Math.max(200, Math.floor(raw.length * 0.5))).trim();
        if (tail) selected.unshift({ role: message.role, content: tail });
      }
      break;
    }
    selected.unshift(message);
    usedTokens += messageTokens;
  }
  while (selected.length && selected[0].role === 'assistant') selected.shift();
  return selected;
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

  // ── 初始化：工作区扫描 ──
  const initSpinner = new Spinner({ text: '扫描工作区...', style: 'dots' });
  initSpinner.start();
  index = await scanWorkspace(workspaceRoot, runtime.config.workspace);
  workspaceOverview = buildWorkspaceOverview(index);
  availableSkills = await loadSkills(workspaceRoot);
  initSpinner.stop(`工作区: ${index.stats.loadedFiles}/${index.stats.totalFiles} 文件索引完成`);
  if (availableSkills.length) {
    console.log(formatSuccess(`已加载 ${availableSkills.length} 个 skill`));
  }

  // ── MCP ──
  const mcpManager = new McpManager({
    config: runtime.config,
    storageRoot: path.dirname(runtime.configPath)
  });
  const mcpServerNames = Object.keys(runtime.config.mcpServers || {});
  if (mcpServerNames.length) {
    console.log(formatHint(`MCP 服务: ${mcpServerNames.join(', ')}`));
  }

  // ── 记忆 ──
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
  } catch { plannerClient = client; }
  try {
    criticClient = (await createRoleModelClient(options, 'critic')).client;
  } catch { criticClient = client; }

  // ── 桌宠 ──
  const mascotSpecies = process.env.FREES_AGENT_MASCOT || 'cat';
  const mascot = new Mascot({ species: mascotSpecies });

  // ── 状态栏 ──
  const statusBar = new StatusBar({
    modelName: runtime.model,
    sessionName: memoryState.session.name,
    mode: 'chat',
  });

  if (options.resetSession) {
    memoryState.session.summary = '';
    memoryState.session.totalTurns = 0;
    memoryState.session.recentMessages = [];
    await saveMemoryState(memoryState);
  }

  // ── 核心对话函数 ──
  async function askModel(message) {
    const shortcutReply = resolveLocalChatShortcut(message, memoryState);
    if (shortcutReply) {
      await updateMemoryAfterTurn({
        client, state: memoryState, userMessage: message,
        assistantMessage: shortcutReply, config: runtime.config
      });
      return { reply: shortcutReply, streamed: false };
    }

    statusBar.update({ statusText: `${mascot.renderInline()} 准备中...` });
    statusBar.show();

    const relevantFiles = index ? findRelevantFiles(index, message) : [];
    await attachSemanticMemoriesToState({
      state: memoryState, query: message, config: runtime.config
    });

    const relevantSkills = availableSkills.length
      ? selectRelevantSkills(availableSkills, message) : [];

    statusBar.update({ statusText: `${mascot.renderInline()} 生成策略...` });
    const planningHint = await buildExecutionPlan({
      plannerClient, message, workspaceOverview,
      enabled: runtime.config.conversation?.planningEnabled !== false
    });

    let webHint = '';
    if (runtime.config.tools?.webSearch?.enabled !== false &&
        shouldUseWebSearch(message) &&
        ['ollama', 'openai-compatible', 'mcp'].includes(runtime.providerName)) {
      statusBar.update({ statusText: `${mascot.renderInline()} 联网检索...` });
      try {
        const web = await searchWebWithTavily(message, runtime.config, {
          maxResults: runtime.config.tools?.webSearch?.maxResults ?? 5
        });
        webHint = [
          web.answer ? `摘要: ${web.answer}` : '',
          ...(web.results || []).map(item => `- ${item.title} (${item.url}) ${item.content}`)
        ].filter(Boolean).join('\n');
      } catch (error) {
        webHint = `联网检索失败: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    const prompt = buildChatUserPrompt({
      message, workspaceOverview, relevantFiles,
      skillContext: [
        formatSkillContext(relevantSkills),
        planningHint ? `\n${planningHint}` : '',
        webHint ? `\n联网信息:\n${webHint}` : ''
      ].filter(Boolean).join('\n')
    });

    const systemPrompt = buildChatSystemPrompt({
      baseSystemPrompt: CHAT_SYSTEM_PROMPT,
      state: memoryState, config: runtime.config
    });

    const configuredContextBudget = runtime.config.conversation?.maxRecentContextTokens ?? 2800;
    const hardContextCap = runtime.config.conversation?.hardContextCap ?? 3200;
    const effectiveContextBudget = Math.max(800, Math.min(configuredContextBudget, hardContextCap));
    const maxHistoryMessages = runtime.config.conversation?.maxHistoryMessages ?? 10;
    const promptTokens = estimateTokens(prompt);
    const systemPromptTokens = estimateTokens(systemPrompt);
    const historyTokenBudget = Math.max(240,
      effectiveContextBudget - promptTokens - Math.ceil(systemPromptTokens * 0.35));

    const recentMessages = trimHistoryByBudget(
      normalizeHistoryOrder(getRecentMessagesForModel(memoryState)),
      { maxTokens: historyTokenBudget, maxMessages: maxHistoryMessages }
    );

    const requestMessages = [...recentMessages, { role: 'user', content: prompt }];
    if (estimateMessagesTokens(requestMessages) > effectiveContextBudget) {
      const fallbackHistory = trimHistoryByBudget(recentMessages, {
        maxTokens: Math.floor(historyTokenBudget * 0.7),
        maxMessages: Math.max(4, Math.floor(maxHistoryMessages * 0.7))
      });
      requestMessages.splice(0, requestMessages.length, ...fallbackHistory, { role: 'user', content: prompt });
    }

    const request = {
      systemPrompt,
      messages: requestMessages,
      temperature: options.temperature,
      maxOutputTokens: options.maxOutputTokens ?? runtime.config.conversation?.maxOutputTokens ?? 16000
    };

    let reply = '';
    let streamed = false;
    let usedFallbackReply = false;
    const useChatTools = runtime.config.tools?.enabledInChat !== false && shouldUseToolLoop(message);

    // 状态栏：显示思考中
    statusBar.update({
      statusText: `${mascot.renderInline()} ${mascot.getThinkingReaction()}`,
      messageCount: memoryState.session.totalTurns || 0,
      tokenCount: estimateTokens(message),
    });

    if (useChatTools && index) {
      statusBar.update({ statusText: `${mascot.renderInline()} 使用工具中...` });
      const toolbox = createAgentToolbox(index, { readOnly: true, config: runtime.config });
      if (mcpServerNames.length && toolbox.setMcpManager) {
        toolbox.setMcpManager(mcpManager);
        await toolbox.mcpHandlers.refreshTools();
      }
      reply = await runChatToolAgent({
        client, toolbox, message, workspaceOverview, relevantFiles,
        memoryHint: memoryState.session.summary || '',
        planningHint, webHint,
        temperature: options.temperature ?? 0.1,
        maxOutputTokens: options.maxOutputTokens ?? runtime.config.conversation?.maxOutputTokens ?? 16000
      });
    } else if (streamResponses && typeof client.streamText === 'function') {
      streamed = true;
      statusBar.hide();
      console.log(`${colors.green}${mascot.displayName}${colors.reset} ${colors.dim}${mascot.species}${colors.reset}`);
      const batcher = new StreamBatcher({
        onFlush(chunk) { output.write(chunk); },
        intervalMs: 25,
        maxSize: 200
      });
      reply = await client.streamText({
        ...request,
        onToken(chunk) { batcher.write(chunk); }
      });
      batcher.end();
      if (String(reply || '').trim()) output.write('\n');
    } else {
      statusBar.hide();
      reply = await client.generateText(request);
    }

    if (streamed && !String(reply || '').trim()) {
      streamed = false;
      reply = await client.generateText({ ...request, temperature: request.temperature ?? 1 });
    }

    if (!String(reply || '').trim()) {
      streamed = false;
      reply = EMPTY_REPLY_FALLBACK;
      usedFallbackReply = true;
    }

    if (!streamed && runtime.config.conversation?.reflectionEnabled !== false && reply && !usedFallbackReply) {
      statusBar.show();
      statusBar.update({ statusText: `${mascot.renderInline()} ${mascot.getThinkingReaction()}` });
      reply = await reflectAndRevise({ criticClient, userMessage: message, draftReply: reply, enabled: true });
    }

    if (!streamed && runtime.config.conversation?.autoContinueOnCutoff !== false &&
        !usedFallbackReply && reply.length > 1000 && !/[。.!！?？]\s*$/.test(reply)) {
      statusBar.update({ statusText: `${mascot.renderInline()} 继续生成...` });
      const continuation = await client.generateText({
        systemPrompt,
        messages: [
          ...request.messages,
          { role: 'assistant', content: reply },
          { role: 'user', content: '请从上文中断处继续，避免重复已输出内容。' }
        ],
        temperature: options.temperature,
        maxOutputTokens: Math.min(request.maxOutputTokens || 16000, 6000)
      });
      if (continuation) reply = `${reply}\n${continuation}`;
    }

    statusBar.hide();

    await updateMemoryAfterTurn({
      client, state: memoryState, userMessage: message,
      assistantMessage: usedFallbackReply ? '' : reply, config: runtime.config
    });
    await compactConversationIfNeeded({ client, state: memoryState, config: runtime.config });

    return { reply, streamed };
  }

  // ── 单次消息模式 ──
  if (options.message) {
    try {
      const result = await askModel(options.message);
      if (!result.streamed) console.log(result.reply);
    } catch (error) {
      console.log(formatError('Frees Agent 当前无法完成对话。'));
      console.log(formatError(error instanceof Error ? error.message : String(error)));
    }
    return;
  }

  // ── REPL 循环 ──
  const rl = readline.createInterface({ input, output });

  console.log(divider());
  console.log(`${colors.green}${mascot.displayName}${colors.reset} ${colors.dim}说: ${mascot.getGreeting()}${colors.reset}`);
  console.log(`${colors.cyan}会话${colors.reset}: ${memoryState.session.name}`);
  console.log(`${colors.dim}输入 /help 查看命令 | /exit 退出 | 流式: ${streamResponses ? '开启' : '关闭'}${colors.reset}`);
  console.log(divider());

  try {
    while (true) {
      const line = (await rl.question(`${colors.cyan}╱╱ 你${colors.reset} `)).trim();
      if (!line) continue;

      // ── 命令处理 ──
      if (line === '/exit' || line === '/quit') break;

      if (line === '/help') {
        console.log(`${colors.cyan}╱╱ Frees Agent 帮助${colors.reset}`);
        const cmds = [
          ['/help', '查看帮助'],
          ['/exit', '退出聊天'],
          ['/reload', '重新扫描工作区'],
          ['/edit ...', '在当前工作区执行代码 Agent'],
          ['/memory', '查看当前持久化记忆'],
          ['/profile', '查看当前用户画像'],
          ['/summary', '查看长对话摘要'],
          ['/tasks', '查看任务记忆'],
          ['/skills', '查看当前加载的 skill 文件'],
          ['/stream on', '开启实时流式输出'],
          ['/stream off', '关闭实时流式输出'],
          ['/mascot', '查看或切换桌宠'],
          ['/mascot <name>', '切换到指定桌宠'],
          ['/status', '查看当前状态'],
        ];
        for (const [cmd, desc] of cmds) {
          console.log(`  ${colors.green}${cmd.padEnd(16)}${colors.reset} ${colors.dim}${desc}${colors.reset}`);
        }
        continue;
      }

      if (line === '/mascot') {
        console.log(`${colors.cyan}╱╱ 当前桌宠: ${mascot.displayName} (${mascot.species})${colors.reset}`);
        console.log(mascot.renderWithBubble(`你好！我是${mascot.displayName}~`, { colored: true, frame: 0 }));
        console.log(`${colors.dim}可用: cat, penguin, rabbit, ghost, dragon, owl${colors.reset}`);
        console.log(`${colors.dim}设置环境变量 FREES_AGENT_MASCOT=<name> 永久切换${colors.reset}`);
        continue;
      }

      if (line.startsWith('/mascot ')) {
        const newSpecies = line.slice('/mascot '.length).trim().toLowerCase();
        const validSpecies = ['cat', 'penguin', 'rabbit', 'ghost', 'dragon', 'owl'];
        if (validSpecies.includes(newSpecies)) {
          mascot.species = newSpecies;
          mascot.speciesConfig = mascot.constructor.SPECIES?.[newSpecies] || { name: newSpecies };
          mascot.displayName = mascot.speciesConfig.name || newSpecies;
          mascot.sprites = mascot.constructor.SPRITES?.[newSpecies] || mascot.sprites;
          console.log(formatSuccess(`已切换桌宠为 ${mascot.displayName}！`));
          console.log(mascot.renderWithBubble(`你好，我是${mascot.displayName}~`, { colored: true }));
        } else {
          console.log(`${colors.yellow}╱╱ 未知物种: ${newSpecies}${colors.reset}`);
          console.log(`${colors.dim}可用: cat, penguin, rabbit, ghost, dragon, owl${colors.reset}`);
        }
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
        const spin = new Spinner({ text: '重新扫描工作区...' });
        spin.start();
        index = await scanWorkspace(workspaceRoot, runtime.config.workspace);
        workspaceOverview = buildWorkspaceOverview(index);
        availableSkills = await loadSkills(workspaceRoot);
        spin.stop(`工作区已刷新: ${index.stats.loadedFiles}/${index.stats.totalFiles} 文件`);
        continue;
      }

      if (line === '/stream on') {
        streamResponses = true;
        console.log(formatSuccess('已开启实时流式输出'));
        continue;
      }

      if (line === '/stream off') {
        streamResponses = false;
        console.log(formatHint('已关闭实时流式输出'));
        continue;
      }

      if (line === '/status') {
        console.log(divider('状态'));
        console.log(`  模型:     ${runtime.model}`);
        console.log(`  Provider: ${runtime.providerName}`);
        console.log(`  会话:     ${memoryState.session.name}`);
        console.log(`  轮次:     ${memoryState.session.totalTurns}`);
        console.log(`  流式:     ${streamResponses ? '开启' : '关闭'}`);
        console.log(`  工作区:   ${index?.stats?.loadedFiles || 0} 文件`);
        console.log(`  桌宠:     ${mascot.displayName} (${mascot.species})`);
        console.log(`  记忆:     ${memoryState.durableMemories?.length || 0} 条持久化`);
        console.log(divider());
        continue;
      }

      if (line.startsWith('/edit ')) {
        if (!workspaceRoot) {
          console.log('当前 chat 未绑定工作区，无法执行代码编辑。');
          continue;
        }
        const spin = new Spinner({ text: '执行代码 Agent...', style: 'dots' });
        spin.start();
        await runEditCommand({
          ...options, workspace: workspaceRoot,
          task: line.slice('/edit '.length)
        });
        spin.stop('编辑 Agent 完成');
        index = await scanWorkspace(workspaceRoot, runtime.config.workspace);
        workspaceOverview = buildWorkspaceOverview(index);
        continue;
      }

      // ── 对话 ──
      try {
        console.log(divider(mascot.displayName, { char: '─', color: 'green' }));
        const result = await askModel(line);
        if (!result.streamed) {
          console.log(`${result.reply}`);
        }
        console.log(divider());
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.log(formatError(`${mascot.displayName} ${mascot.getConfusedReaction()}`));
        console.log(formatError(errMsg));
        console.log(formatHint('你可以继续输入 /help、/reload，或者修复模型服务后直接继续聊天。'));
        console.log(divider());
      }
    }
  } finally {
    statusBar.dispose();
    rl.close();
  }
}
