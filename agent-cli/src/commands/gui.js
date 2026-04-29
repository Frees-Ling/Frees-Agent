import { execSync, spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const TAURI_DIR = path.join(PROJECT_ROOT, 'src-tauri');
const TAURI_BIN = path.join(TAURI_DIR, 'target', 'release', 'frees-agent.exe');

function isFile(p) {
  try { return statSync(p).isFile(); }
  catch { return false; }
}

/**
 * Build and launch the Frees-Agent GUI.
 *
 * Always starts the Express/WebSocket server first (needed by both
 * Tauri native mode and Web fallback mode). Then attempts Tauri;
 * if unavailable, keeps the server running as a Web UI.
 */
export async function runGuiCommand(options) {
  console.log('Frees-Agent Desktop GUI');
  console.log('──────────────────────');

  // ── Build runtime + server (shared by both Tauri and Web modes) ──
  const { runtime, server, port, host } = await buildServer(options);

  // ── Try Tauri ──
  if (await tryRunTauri()) {
    // Tauri window connects to the already-running server via WebSocket.
    // Keep the Node.js server alive until the user Ctrl+C's.
    console.log(`  ${await fmtHint('按 Ctrl+C 停止服务')}\n`);
    return new Promise((resolve) => { server.on('close', resolve); });
  }

  // ── Web fallback ──
  console.log('Tauri 不可用，启动 Web UI 回退模式...');
  console.log(`  Web UI: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  console.log(`  ${await fmtHint('按 Ctrl+C 停止服务')}\n`);
  return new Promise((resolve) => { server.on('close', resolve); });
}

// ── Helpers ──

async function fmtHint(text) {
  try {
    const { formatHint } = await import('../ui/mascot.js');
    return formatHint(text);
  } catch {
    return text;
  }
}

async function buildServer(options) {
  const { createModelClient, createRoleModelClient } = await import('../model/index.js');
  const { Spinner } = await import('../ui/progress.js');
  const { createGuiServer } = await import('../gui/server.js');

  const { client, runtime } = await createModelClient(options);
  const workspaceRoot = options.workspace ? path.resolve(options.workspace) : process.cwd();

  const initSpinner = new Spinner({ text: '初始化服务...', style: 'dots' });
  initSpinner.start();

  // Workspace indexing
  const { scanWorkspace, buildWorkspaceOverview } = await import('../workspace/indexer.js');
  const index = await scanWorkspace(workspaceRoot, runtime.config.workspace);
  const workspaceOverview = buildWorkspaceOverview(index);

  // Skills
  const { loadSkills, selectRelevantSkills } = await import('../skills/loader.js');
  const availableSkills = await loadSkills(workspaceRoot);

  // MCP
  const { McpManager } = await import('../tools/mcp-client.js');
  const mcpManager = new McpManager({
    config: runtime.config,
    storageRoot: path.dirname(runtime.configPath),
  });
  const mcpServerNames = Object.keys(runtime.config.mcpServers || {});

  // Memory
  const { createMemoryStore, loadMemoryState } = await import('../memory/store.js');
  const memoryStore = await createMemoryStore({
    configPath: runtime.configPath,
    workspaceRoot,
    sessionName: options.session || runtime.config.conversation?.defaultSessionName,
  });
  const memoryState = await loadMemoryState(memoryStore, runtime.config);

  // Planner / critic clients
  let plannerClient, criticClient;
  try { plannerClient = (await createRoleModelClient(options, 'planner')).client; } catch { plannerClient = client; }
  try { criticClient = (await createRoleModelClient(options, 'critic')).client; } catch { criticClient = client; }

  // Track counts for API
  runtime._memoryCount = memoryState?.session?.relevantMemories?.length || 0;
  runtime._tokenCount = memoryState?.session?.tokenEstimate || 0;
  runtime._availableSkills = availableSkills.map((s) => ({
    name: s.slug || s.name || 'unknown',
    description: s.description || '',
  }));
  runtime._availableTools = [];
  runtime._sessions = [];

  // ── Chat handler ──
  async function handleChat({ message, onToken, onDone, onError, onToolCall, onToolResult, onMemory, cancelled }) {
    try {
      // Local chat shortcuts
      const { resolveLocalChatShortcut } = await import('../memory/heuristics.js');
      const shortcutReply = resolveLocalChatShortcut(message, memoryState);
      if (shortcutReply) {
        await (await import('../memory/manager.js')).updateMemoryAfterTurn({
          client, state: memoryState, userMessage: message,
          assistantMessage: shortcutReply, config: runtime.config,
        });
        runtime._memoryCount = memoryState?.session?.relevantMemories?.length || 0;
        if (onMemory) onMemory(runtime._memoryCount);
        onDone(shortcutReply);
        return;
      }

      // Attach memories
      await (await import('../memory/manager.js')).attachSemanticMemoriesToState({
        state: memoryState, query: message, config: runtime.config,
      });

      // Select relevant skills
      const relevantSkills = availableSkills.length
        ? selectRelevantSkills(availableSkills, message) : [];

      // Planning
      const { buildExecutionPlan, buildStructuredPlan } = await import('../agent/reasoning.js');
      const planningHint = await buildExecutionPlan({
        plannerClient, message, workspaceOverview,
        enabled: runtime.config.conversation?.planningEnabled !== false,
      });
      const structuredPlan = await buildStructuredPlan({
        plannerClient, message, workspaceOverview,
        enabled: runtime.config.conversation?.planningEnabled !== false,
      });
      const planSteps = structuredPlan?.steps?.map((s) => ({
        id: s.id, description: s.description, status: 'pending',
      })) || [];

      // Web search
      let webHint = '';
      if (runtime.config.tools?.webSearch?.enabled !== false) {
        const { shouldUseWebSearch, searchWebWithTavily } = await import('../tools/web-search.js');
        if (shouldUseWebSearch(message)) {
          try {
            const web = await searchWebWithTavily(message, runtime.config, {
              maxResults: runtime.config.tools?.webSearch?.maxResults ?? 5,
            });
            webHint = [
              web.answer ? `摘要: ${web.answer}` : '',
              ...(web.results || []).map((i) => `- ${i.title} (${i.url}) ${i.content}`),
            ].filter(Boolean).join('\n');
          } catch { /* web search failure is non-fatal */ }
        }
      }

      // Build prompts
      const { buildChatUserPrompt, CHAT_SYSTEM_PROMPT } = await import('../agent/prompts.js');
      const prompt = buildChatUserPrompt({
        message, workspaceOverview,
        skillContext: [
          formatSkillContext(relevantSkills),
          planningHint ? `\n${planningHint}` : '',
          webHint ? `\n联网信息:\n${webHint}` : '',
        ].filter(Boolean).join('\n'),
      });

      const systemPrompt = (await import('../memory/manager.js')).buildChatSystemPrompt({
        baseSystemPrompt: CHAT_SYSTEM_PROMPT, state: memoryState, config: runtime.config,
      });

      const temperature = options.temperature ?? runtime.config.conversation?.temperature ?? 0.7;
      const maxOutputTokens = options.maxOutputTokens ?? runtime.config.conversation?.maxOutputTokens ?? 16000;

      // Check if tools might be needed
      const shouldUseToolLoop = (text) => {
        const keywords = [
          '修改', '重构', '删除', '创建文件', '读文件', 'search', 'grep',
          'read file', 'write file', '时间', '日期', '系统', 'bash', 'shell',
          '终端', '执行', '排查', '诊断', '网络', '进程',
        ];
        return keywords.some((kw) => text.toLowerCase().includes(kw));
      };
      const useChatTools = runtime.config.tools?.enabledInChat !== false && shouldUseToolLoop(message);

      let reply = '';
      if (useChatTools && index) {
        const { createAgentToolbox } = await import('../agent/tools.js');
        const { runChatToolAgent } = await import('../agent/chat-tool-loop.js');
        const toolbox = createAgentToolbox(index, { readOnly: true, config: runtime.config });

        // Hijack toolbox execute to emit tool_call events
        const origExecute = toolbox.execute;
        if (onToolCall && origExecute) {
          toolbox.execute = async (toolName, toolArgs, ...rest) => {
            if (cancelled && cancelled()) throw new Error('_aborted_');
            if (onToolCall) onToolCall(toolName, toolArgs);
            try {
              const result = await origExecute.call(toolbox, toolName, toolArgs, ...rest);
              if (onToolResult) onToolResult(toolName, `✓ ${toolName} 完成`);
              return result;
            } catch (err) {
              if (onToolResult) onToolResult(toolName, `✗ ${toolName} 失败`);
              throw err;
            }
          };
        }

        if (mcpServerNames.length && toolbox.setMcpManager) {
          toolbox.setMcpManager(mcpManager);
          await toolbox.mcpHandlers.refreshTools();
        }

        reply = await runChatToolAgent({
          client, toolbox, message, workspaceOverview,
          memoryHint: memoryState.session.summary || '',
          planningHint, webHint,
          temperature,
          maxOutputTokens,
          planSteps,
        });
      } else {
        let full = '';
        const request = { systemPrompt, messages: [{ role: 'user', content: prompt }], temperature, maxOutputTokens };
        await client.streamText({
          ...request,
          onToken(token) {
            if (cancelled && cancelled()) throw new Error('_aborted_');
            full += token;
            onToken(token);
          },
        });
        reply = full;
      }

      onDone(reply);

      // Update memory after turn
      await (await import('../memory/manager.js')).updateMemoryAfterTurn({
        client, state: memoryState, userMessage: message,
        assistantMessage: reply, config: runtime.config,
      });

      runtime._memoryCount = memoryState?.session?.relevantMemories?.length || 0;
      if (onMemory) onMemory(runtime._memoryCount);

    } catch (err) {
      if (cancelled && cancelled()) return;
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  // Create & start server
  const server = createGuiServer({ runtime, messageHandler: handleChat });
  const port = options.port || runtime.config.gui?.port || 7780;
  const host = options.host || runtime.config.gui?.host || '0.0.0.0';

  await new Promise((resolve, reject) => {
    server.listen(port, host, () => resolve());
    server.on('error', reject);
  });

  initSpinner.stop(`服务已启动: ${host === '0.0.0.0' ? 'localhost' : host}:${port}`);

  // Gather & expose tools list for API
  try {
    const { createAgentToolbox } = await import('../agent/tools.js');
    const tb = createAgentToolbox(index, { readOnly: true, config: runtime.config });
    runtime._availableTools = (tb.getToolList ? tb.getToolList() : []).map((t) => ({
      name: typeof t === 'string' ? t : t.name || '?',
    }));
  } catch { /* non-critical */ }

  // Gather sessions for API
  try {
    const { loadSessionIndex } = await import('../memory/store.js');
    const sessions = await loadSessionIndex({ configPath: runtime.configPath, workspaceRoot });
    runtime._sessions = (sessions || []).map((s) => ({
      id: s.id || s.name,
      name: s.name || s.id || '对话',
      messages: s.messages || [],
    }));
  } catch { /* non-critical */ }

  return { runtime, server, port, host };
}

async function tryRunTauri() {
  if (isFile(TAURI_BIN)) {
    console.log('启动 Tauri 桌面应用...');
    const proc = spawn(TAURI_BIN, [], { stdio: 'inherit', env: { ...process.env } });
    proc.on('error', () => {});
    return true;
  }

  console.log('构建 Tauri 桌面应用...');
  try {
    execSync('cargo build --release', { cwd: TAURI_DIR, stdio: 'inherit', timeout: 600000 });
    if (isFile(TAURI_BIN)) {
      console.log('\n启动 Tauri 桌面应用...');
      const proc = spawn(TAURI_BIN, [], { stdio: 'inherit', env: { ...process.env } });
      proc.on('error', () => {});
      return true;
    }
  } catch {
    console.log('Tauri 构建失败，回退到 Web UI 模式。');
  }
  return false;
}

function formatSkillContext(skills) {
  if (!skills?.length) return '';
  return skills.map((s) =>
    `SKILL ${s.slug}: ${s.description}\n${String(s.content || '').slice(0, 3000)}`
  ).join('\n\n');
}
