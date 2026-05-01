import { execSync, spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const TAURI_DIR = path.join(PROJECT_ROOT, 'src-tauri');
const TAURI_BIN = process.platform === 'win32'
  ? path.join(TAURI_DIR, 'target', 'release', 'frees-agent.exe')
  : path.join(TAURI_DIR, 'target', 'release', 'frees-agent');
const TAURI_APP_BUNDLE = process.platform === 'darwin'
  ? path.join(TAURI_DIR, 'target', 'release', 'bundle', 'macos', 'Frees-Agent.app', 'Contents', 'MacOS', 'frees-agent')
  : null;

function isFile(p) {
  try { return statSync(p).isFile(); }
  catch { return false; }
}

/**
 * Build and launch the Frees-Agent GUI.
 *
 * Starts the Express/WebSocket server immediately (fast), then runs
 * model/workspace/memory initialization in the background. The UI
 * shows "正在初始化..." until the backend is ready.
 */
export async function runGuiCommand(options) {
  console.log('Frees-Agent 桌面 GUI');
  console.log('──────────────────────');

  const { runtime, server, port, host, ready } = await buildServer(options);

  // ── Try Tauri ──
  if (await tryRunTauri()) {
    console.log(`  ${await fmtHint('按 Ctrl+C 停止服务')}\n`);
    return new Promise((resolve) => { server.on('close', resolve); });
  }

  // ── Web fallback ──
  console.log('Tauri 不可用，启动 Web UI 回退模式...');
  console.log(`  Web UI: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  console.log(`  ${await fmtHint('按 Ctrl+C 停止服务')}\n`);

  // Wait for background init, then print ready
  ready.then(() => {
    console.log(`  ✓ 后端就绪 — ${runtime.providerName}/${runtime.model}`);
  }).catch(() => {});

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

function createFallbackClient() {
  return {
    generateText: async () => {
      throw new Error('没有可用的 AI 模型。请先在设置中配置 Provider 并确保模型服务正在运行。\n提示: 使用 frees-agent doctor --ping 检查连接。');
    },
    streamText: async ({ onToken }) => {
      const msg = '没有可用的 AI 模型。请先在设置中配置 Provider 并确保模型服务正在运行。';
      if (onToken) await onToken(msg);
      return msg;
    },
    generateStream: () => '',
  };
}

async function buildServer(options) {
  // ── Phase 1: minimal runtime + server start (instant) ──
  const { createModelClient, createRoleModelClient, resolveModelRuntime } = await import('../model/index.js');
  const { createGuiServer } = await import('../gui/server.js');

  // Resolve config immediately (fast, no network)
  const runtime = await resolveModelRuntime(options);
  runtime._memoryCount = 0;
  runtime._tokenCount = 0;
  runtime._availableSkills = [];
  runtime._availableTools = [];
  runtime._sessions = [];
  runtime._modelAvailable = false;
  runtime._initDone = false;

  // Use fallback client until real init completes
  const workspaceRoot = options.workspace ? path.resolve(options.workspace) : process.cwd();

  // Store promise refs so handleChat can await them
  let _resolveInit;
  const _initPromise = new Promise((resolve) => { _resolveInit = resolve; });

  // ── Chat handler (queues until init completes) ──
  async function handleChat({ message, onToken, onDone, onError, onToolCall, onToolResult, onMemory, onDiff, onPlan, cancelled }) {
    if (!runtime._initDone) {
      const msg = '正在初始化服务，请稍候...';
      if (onToken) await onToken(msg);
      if (onDone) onDone(msg);
      return;
    }
    try {
      // Guard against uninitialized memory state (e.g. memory init failed in background)
      const memState = _memoryState || {
        durableMemories: [], session: { messages: [], relevantMemories: [], summary: '', tokenEstimate: 0 },
      };

      const { resolveLocalChatShortcut } = await import('../memory/heuristics.js');
      const shortcutReply = resolveLocalChatShortcut(message, memState);
      if (shortcutReply) {
        await (await import('../memory/manager.js')).updateMemoryAfterTurn({
          client: _client, state: memState, userMessage: message,
          assistantMessage: shortcutReply, config: runtime.config,
        });
        runtime._memoryCount = memState?.session?.relevantMemories?.length || 0;
        if (onMemory) onMemory(runtime._memoryCount);
        onDone(shortcutReply);
        return;
      }

      await (await import('../memory/manager.js')).attachSemanticMemoriesToState({
        state: memState, query: message, config: runtime.config,
      });

      const relevantSkills = _availableSkills.length
        ? _selectRelevantSkills(_availableSkills, message) : [];

      const { buildExecutionPlan, buildStructuredPlan } = await import('../agent/reasoning.js');
      const planningHint = await buildExecutionPlan({
        plannerClient: _plannerClient, message, workspaceOverview: _workspaceOverview,
        enabled: runtime.config.conversation?.planningEnabled !== false,
      });
      const structuredPlan = await buildStructuredPlan({
        plannerClient: _plannerClient, message, workspaceOverview: _workspaceOverview,
        enabled: runtime.config.conversation?.planningEnabled !== false,
      });
      const planSteps = structuredPlan?.steps?.map((s) => ({
        id: s.id, description: s.description, status: 'pending',
      })) || [];
      if (onPlan && planSteps.length) onPlan(planSteps);

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

      const { buildChatUserPrompt, CHAT_SYSTEM_PROMPT } = await import('../agent/prompts.js');
      const prompt = buildChatUserPrompt({
        message, workspaceOverview: _workspaceOverview,
        skillContext: [
          formatSkillContext(relevantSkills),
          planningHint ? `\n${planningHint}` : '',
          webHint ? `\n联网信息:\n${webHint}` : '',
        ].filter(Boolean).join('\n'),
      });

      const systemPrompt = (await import('../memory/manager.js')).buildChatSystemPrompt({
        baseSystemPrompt: CHAT_SYSTEM_PROMPT, state: memState, config: runtime.config,
      });

      const temperature = options.temperature ?? runtime.config.conversation?.temperature ?? 0.7;
      const maxOutputTokens = options.maxOutputTokens ?? runtime.config.conversation?.maxOutputTokens ?? 16000;

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
      if (useChatTools && _index) {
        const { createAgentToolbox } = await import('../agent/tools.js');
        const { runChatToolAgent } = await import('../agent/chat-tool-loop.js');
        const toolbox = createAgentToolbox(_index, { readOnly: true, config: runtime.config });

        const writeTools = new Set(['write', 'write_file', 'replace_in_file', 'edit', 'search_and_replace', 'smart_edit']);
        const origExecute = toolbox.execute;
        if (onToolCall && origExecute) {
          toolbox.execute = async (toolName, toolArgs, ...rest) => {
            if (cancelled && cancelled()) throw new Error('_aborted_');
            if (onToolCall) onToolCall(toolName, toolArgs);
            try {
              // Read file before modification for diff computation
              let oldContent = '';
              const filePath = toolArgs?.path || toolArgs?.filePath || '';
              if (writeTools.has(toolName) && filePath && _index) {
                try {
                  const { readIndexedFile } = await import('../workspace/queries.js');
                  const before = await readIndexedFile(_index, filePath, { maxLength: 50000 });
                  oldContent = (typeof before === 'object' && before !== null) ? (before.content || before.text || '') : '';
                } catch { /* best-effort */ }
              }

              const result = await origExecute.call(toolbox, toolName, toolArgs, ...rest);
              if (onToolResult) onToolResult(toolName, `✓ ${toolName} 完成`);

              // Compute and emit diff after write operations
              if (writeTools.has(toolName) && filePath && _index && onDiff && result?.ok) {
                try {
                  const { readIndexedFile } = await import('../workspace/queries.js');
                  const after = await readIndexedFile(_index, filePath, { maxLength: 50000 });
                  const newContent = (typeof after === 'object' && after !== null) ? (after.content || after.text || '') : '';
                  if (newContent !== oldContent) {
                    const { unifiedDiff } = await import('../utils/diff.js');
                    const diffResult = unifiedDiff(oldContent, newContent, `a/${filePath}`, `b/${filePath}`);
                    if (diffResult.hasChanges) {
                      onDiff(filePath, { diff: diffResult.diff, added: diffResult.added, removed: diffResult.removed });
                    }
                  }
                } catch { /* diff is non-critical */ }
              }
              return result;
            } catch (err) {
              if (onToolResult) onToolResult(toolName, `✗ ${toolName} 失败`);
              throw err;
            }
          };
        }

        if (_mcpServerNames.length && toolbox.setMcpManager) {
          toolbox.setMcpManager(_mcpManager);
          await toolbox.mcpHandlers.refreshTools();
        }

        reply = await runChatToolAgent({
          client: _client, toolbox, message, workspaceOverview: _workspaceOverview,
          memoryHint: memState.session.summary || '',
          planningHint, webHint,
          temperature,
          maxOutputTokens,
          planSteps,
        });
      } else {
        let full = '';
        const request = { systemPrompt, messages: [{ role: 'user', content: prompt }], temperature, maxOutputTokens };
        await _client.streamText({
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

      await (await import('../memory/manager.js')).updateMemoryAfterTurn({
        client: _client, state: memState, userMessage: message,
        assistantMessage: reply, config: runtime.config,
      });

      runtime._memoryCount = memState?.session?.relevantMemories?.length || 0;
      if (onMemory) onMemory(runtime._memoryCount);

    } catch (err) {
      if (cancelled && cancelled()) return;
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  // Create & start server immediately (no waiting for model init)
  const server = createGuiServer({ runtime, messageHandler: handleChat });
  const port = options.port || runtime.config.gui?.port || 7780;
  const host = options.host || runtime.config.gui?.host || '0.0.0.0';

  await new Promise((resolve, reject) => {
    server.listen(port, host, () => resolve());
    server.on('error', reject);
  });

  console.log(`  服务已启动: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);

  // ── Phase 2: full init in background ──
  let _client, _memoryState, _index, _workspaceOverview;
  let _availableSkills = [], _selectRelevantSkills = () => [];
  let _plannerClient, _criticClient;
  let _mcpManager, _mcpServerNames = [];

  const initPromise = (async () => {
    try {
      // Model client (takes time due to provider probing)
      try {
        const result = await createModelClient(options);
        _client = result.client;
        Object.assign(runtime, result.runtime);
      } catch (providerError) {
        console.error(`[gui] 模型连接失败: ${providerError instanceof Error ? providerError.message : providerError}`);
        console.error('[gui] 将在无模型模式下启动 UI（可在设置中配置后重试）');
        _client = createFallbackClient();
      }
      runtime._modelAvailable = _client && typeof _client.streamText === 'function';

      // Expose reconnect so server can recreate the model client when provider/model changes
      runtime._reconnectClient = async () => {
        try {
          const result = await createModelClient({
            ...options,
            provider: runtime.providerName,
            model: runtime.model,
          });
          _client = result.client;
          Object.assign(runtime, result.runtime);
          runtime._modelAvailable = true;
        } catch (err) {
          console.error('[gui] 重新连接模型失败:', err instanceof Error ? err.message : String(err));
          _client = createFallbackClient();
          runtime._modelAvailable = false;
        }
      };

      // Workspace indexing (lazy — deferred scan to avoid blocking GUI startup)
      const emptyIndex = { root: workspaceRoot, files: [], stats: { totalFiles: 0, loadedFiles: 0, skippedFiles: 0, loadedBytes: 0 } };
      _index = emptyIndex;
      _workspaceOverview = '索引构建中...';

      // Start file watcher for incremental index updates
      let _stopWatcher = null;
      try {
        const { createWorkspaceWatcher } = await import('../utils/file-watcher.js');
        _stopWatcher = createWorkspaceWatcher(emptyIndex, {
          debounceMs: 500,
          onChange: () => {
            if (typeof runtime._onFilesChanged === 'function') {
              runtime._onFilesChanged();
            }
          },
        });
      } catch (err) {
        console.warn('[gui] 文件监控启动失败（非致命）:', err instanceof Error ? err.message : String(err));
      }
      runtime._stopWatcher = _stopWatcher;

      // Skills
      const { loadSkills, selectRelevantSkills } = await import('../skills/loader.js');
      _availableSkills = await loadSkills(workspaceRoot);
      _selectRelevantSkills = selectRelevantSkills;

      // MCP
      const { McpManager } = await import('../tools/mcp-client.js');
      _mcpManager = new McpManager({
        config: runtime.config,
        storageRoot: path.dirname(runtime.configPath),
      });
      _mcpServerNames = Object.keys(runtime.config.mcpServers || {});

      // Memory
      const { createMemoryStore, loadMemoryState } = await import('../memory/store.js');
      const memoryStore = await createMemoryStore({
        configPath: runtime.configPath,
        workspaceRoot,
        sessionName: options.session || runtime.config.conversation?.defaultSessionName,
      });
      _memoryState = await loadMemoryState(memoryStore, runtime.config);

      // Initialize vector embedding service
      const { initializeMemorySystem } = await import('../memory/manager.js');
      await initializeMemorySystem(runtime.config);

      // Planner / critic clients
      try { _plannerClient = (await createRoleModelClient(options, 'planner')).client; } catch { _plannerClient = _client; }
      try { _criticClient = (await createRoleModelClient(options, 'critic')).client; } catch { _criticClient = _client; }

      // Expose memory state and workspace index for the API
      runtime._memoryState = _memoryState;
      runtime._workspaceIndex = _index;

      // Deferred full workspace scan (runs after init so GUI responds instantly)
      setTimeout(async () => {
        try {
          const { scanWorkspace, buildWorkspaceOverview } = await import('../workspace/indexer.js');
          const realIndex = await scanWorkspace(workspaceRoot, runtime.config.workspace);
          _index.root = realIndex.root;
          _index.files = realIndex.files;
          _index.stats = realIndex.stats;
          _workspaceOverview = buildWorkspaceOverview(_index);
          runtime._workspaceIndex = _index;
        } catch (err) {
          console.warn('[gui] 工作区索引失败:', err instanceof Error ? err.message : String(err));
        }
      }, 500);

      // Update runtime
      runtime._memoryCount = _memoryState?.session?.relevantMemories?.length || 0;
      runtime._tokenCount = _memoryState?.session?.tokenEstimate || 0;
      runtime._availableSkills = _availableSkills.map((s) => ({
        name: s.slug || s.name || 'unknown',
        description: s.description || '',
      }));

      // Gather tools
      try {
        const { createAgentToolbox } = await import('../agent/tools.js');
        const tb = createAgentToolbox(_index, { readOnly: true, config: runtime.config });
        runtime._availableTools = (tb.getToolList ? tb.getToolList() : []).map((t) => ({
          name: typeof t === 'string' ? t : t.name || '?',
        }));
      } catch { /* non-critical */ }

      // Gather sessions
      try {
        const { loadSessionIndex } = await import('../memory/store.js');
        const sessions = await loadSessionIndex({ configPath: runtime.configPath, workspaceRoot });
        runtime._sessions = (sessions || []).map((s) => ({
          id: s.id || s.name,
          name: s.name || s.id || '对话',
          messages: s.messages || [],
        }));
      } catch { /* non-critical */ }

      runtime._initDone = true;
      _resolveInit();
    } catch (err) {
      console.error('[gui] 后台初始化失败:', err instanceof Error ? err.message : String(err));
      runtime._initDone = true;
      _resolveInit();
    }
  })();

  return { runtime, server, port, host, ready: initPromise };
}

async function tryRunTauri() {
  const candidates = [TAURI_BIN];
  if (TAURI_APP_BUNDLE) candidates.unshift(TAURI_APP_BUNDLE);

  // Check if Tauri binary is stale (built before latest frontend changes)
  const publicDir = path.join(PROJECT_ROOT, 'src', 'gui', 'public');
  const frontendSources = ['index.html', 'app.js', 'style.css'].map(f => path.join(publicDir, f));
  const frontendMaxMtime = Math.max(...frontendSources.map(f => {
    try { return statSync(f).mtimeMs; } catch { return 0; }
  }));

  for (const binPath of candidates) {
    if (isFile(binPath)) {
      // Skip stale Tauri binary — frontend has been modified since build
      if (frontendMaxMtime > 0) {
        try {
          const binMtime = statSync(binPath).mtimeMs;
          if (binMtime < frontendMaxMtime) {
            console.warn('  ⚠ Tauri 桌面应用版本过旧，请执行 npm run build:tauri 更新');
            console.warn('  回退到 Web UI 模式...\n');
            return false;
          }
        } catch { /* proceed anyway */ }
      }

      console.log('启动 Tauri 桌面应用...');
      const proc = spawn(binPath, [], { stdio: 'inherit', env: { ...process.env } });
      proc.on('error', () => {});
      return true;
    }
  }
  return false;
}

function formatSkillContext(skills) {
  if (!skills?.length) return '';
  return skills.map((s) =>
    `SKILL ${s.slug}: ${s.description}\n${String(s.content || '').slice(0, 3000)}`
  ).join('\n\n');
}
