import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { buildFileTree } from './file-tree.js';
import { streamShell } from '../shell/shell-stream.js';
import { validateShellCommand } from '../shell/shell-exec.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Security: rate limiter ──
const rateLimits = new Map();
function rateLimit(ip, maxRequests = 60, windowMs = 60000) {
  const now = Date.now();
  const entry = rateLimits.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs; }
  entry.count++;
  rateLimits.set(ip, entry);
  return entry.count <= maxRequests;
}

// ── Security: CSP nonce ──
function generateNonce() {
  return crypto.randomBytes(16).toString('hex');
}

export function createGuiServer({ runtime, messageHandler }) {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  let abortChat = null; // function to abort current chat
  let _wsClients = new Set();

  // Track diffs for file changes during a chat turn
  let _pendingDiffs = [];

  function resetPendingDiffs() {
    _pendingDiffs = [];
  }

  function addDiff(filePath, diffData) {
    if (diffData && diffData.hasChanges) {
      _pendingDiffs.push({ filePath, ...diffData });
    }
  }

  function flushPendingDiffs(ws) {
    if (_pendingDiffs.length && ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'diffs', diffs: _pendingDiffs }));
    }
    _pendingDiffs = [];
  }

  // Static files with CSP headers
  app.use((req, res, next) => {
    const nonce = generateNonce();
    res.locals.nonce = nonce;
    // Rate limiting on API routes
    if (req.path.startsWith('/api/')) {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      if (!rateLimit(ip)) {
        return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
      }
    }
    // CSP headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' ws: wss: http: https: data: blob:; img-src 'self' data: https:;");
    next();
  });

  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.json({ limit: '1mb' }));

  // ── REST API ──

  // GET / — serve index.html
  app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // GET /api/health — health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: runtime.version || '2.0.0',
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage().heapUsed,
    });
  });

  // GET /api/status — basic status
  app.get('/api/status', (_req, res) => {
    res.json({
      model: runtime.model || '未配置',
      provider: runtime.providerName || '未配置',
      configPath: runtime.configPath || '',
      workspace: runtime.config?.workspace?.rootDir || null,
      memoryEnabled: runtime.config?.memory?.enabled !== false,
      modelAvailable: runtime._modelAvailable !== false,
      initDone: runtime._initDone === true,
      skills: (runtime._availableSkills || []).length,
      sessions: (runtime._sessions || []).length,
    });
  });

  // GET /api/config — full safe config (no API keys exposed)
  app.get('/api/config', (_req, res) => {
    const safeConfig = JSON.parse(JSON.stringify(runtime.config || {}));
    // Strip sensitive fields
    const stripKeys = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      for (const key of Object.keys(obj)) {
        if (key.toLowerCase().includes('apikey') || key.toLowerCase().includes('secret') || key === 'apiKey') {
          obj[key] = obj[key] ? '••••••' : '';
        } else if (typeof obj[key] === 'object') {
          stripKeys(obj[key]);
        }
      }
    };
    stripKeys(safeConfig);
    res.json({
      config: safeConfig,
      model: runtime.model || '—',
      provider: runtime.providerName || '—',
      tools: runtime.config?.tools || {},
      conversation: runtime.config?.conversation || {},
      initDone: runtime._initDone === true,
      memoryCount: runtime._memoryCount || 0,
      tokenCount: runtime._tokenCount || 0,
      temperature: runtime.config?.conversation?.temperature || 0.7,
      stream: runtime.config?.conversation?.streamResponses !== false,
      planner: runtime.config?.conversation?.planningEnabled !== false,
    });
  });

  // PATCH /api/config — update a setting
  app.patch('/api/config', async (req, res) => {
    const updates = req.body;
    if (!updates || typeof updates !== 'object') return res.status(400).json({ error: '无效的请求体' });

    let needsReconnect = false;

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'temperature') {
        if (!runtime.config.conversation) runtime.config.conversation = {};
        runtime.config.conversation.temperature = Math.max(0, Math.min(2, Number(value) || 0.7));
      }
      if (key === 'stream') {
        if (!runtime.config.conversation) runtime.config.conversation = {};
        runtime.config.conversation.streamResponses = Boolean(value);
      }
      if (key === 'planner') {
        if (!runtime.config.conversation) runtime.config.conversation = {};
        runtime.config.conversation.planningEnabled = Boolean(value);
      }
      if (key === 'model') {
        runtime.model = String(value);
        // Persist to provider-specific config
        const pName = runtime.providerName || runtime.config.defaultProvider;
        if (pName && runtime.config.providers?.[pName]) {
          if (!runtime.config.providers[pName]) runtime.config.providers[pName] = {};
          runtime.config.providers[pName].model = String(value);
        }
        needsReconnect = true;
      }
      if (key === 'provider') {
        const newProvider = String(value);
        runtime.providerName = newProvider;
        runtime.config.defaultProvider = newProvider;
        // Switch model to new provider's default
        if (runtime.config.providers?.[newProvider]?.model) {
          runtime.model = runtime.config.providers[newProvider].model;
        }
        needsReconnect = true;
      }
    }

    // Persist to config file
    try {
      const { writeFile } = await import('node:fs/promises');
      const configPath = runtime.configPath;
      if (configPath) {
        await writeFile(configPath, JSON.stringify(runtime.config, null, 2), 'utf8');
      }
    } catch { /* config write is non-critical */ }

    // Recreate model client so settings take effect immediately
    if (needsReconnect && typeof runtime._reconnectClient === 'function') {
      runtime._reconnectClient().catch(() => {});
    }

    res.json({ ok: true });
  });

  // POST /api/chat — send a message (REST fallback, prefer WebSocket)
  app.post('/api/chat', (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: '缺少消息内容' });
    res.json({ ok: true, hint: 'WebSocket 模式请连接 ws://host:port' });
  });

  // GET /api/system — system info
  app.get('/api/system', (_req, res) => {
    const cpus = os.cpus();
    const cpu = cpus.length ? cpus[0].model : '—';
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    res.json({
      platform: process.platform,
      arch: process.arch,
      hostname: os.hostname(),
      uptime: os.uptime(),
      os_version: `${os.type()} ${os.release()}`,
      cpu,
      cpu_cores: cpus.length,
      cpu_load: os.loadavg()[0],
      memory_total: totalMem,
      memory_used: usedMem,
      disk_total: null,
      disk_used: null,
      processes: null,
    });
  });

  // GET /api/skills — available skills
  app.get('/api/skills', (_req, res) => {
    const skills = runtime._availableSkills || [];
    res.json({ skills });
  });

  // GET /api/tools — available tools
  app.get('/api/tools', (_req, res) => {
    const tools = runtime._availableTools || [];
    res.json({ tools });
  });

  // GET /api/sessions — conversation list
  app.get('/api/sessions', (_req, res) => {
    const sessions = runtime._sessions || [];
    res.json({ sessions });
  });

  // GET /api/sessions/:id — session messages
  app.get('/api/sessions/:id', (req, res) => {
    const id = req.params.id;
    const sessions = runtime._sessions || [];
    const session = sessions.find((s) => s.id === id);
    if (!session) return res.status(404).json({ error: '未找到会话' });
    res.json({ messages: session.messages || [] });
  });

  // GET /api/files — workspace file tree
  app.get('/api/files', (_req, res) => {
    const index = runtime._workspaceIndex;
    if (!index || !index.files) {
      return res.json({ files: [], tree: [] });
    }
    // Build tree structure
    const tree = buildFileTree(index.files, runtime.config?.workspace?.rootDir || '');
    // Flat list for search
    const files = index.files.map(f => ({
      path: f.path,
      name: f.name || f.path.split(/[/\\]/).pop(),
      size: f.size || f.content?.length || 0,
      isDir: f.isDirectory || false,
    }));
    res.json({ files, tree });
  });

  // GET /api/files/content — read file content
  app.get('/api/files/content', (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: '缺少 path 参数' });
    const index = runtime._workspaceIndex;
    if (!index || !index.files) return res.status(404).json({ error: '工作区未索引' });
    const file = index.files.find((f) => f.relativePath === filePath || f.absolutePath === filePath);
    if (!file) return res.status(404).json({ error: '文件未找到' });
    res.json({
      path: file.relativePath,
      absolutePath: file.absolutePath,
      size: file.size,
      language: file.language,
      content: file.content,
      skippedReason: file.skippedReason,
    });
  });

  // POST /api/sessions — create new session
  app.post('/api/sessions', async (req, res) => {
    const { name } = req.body || {};
    try {
      const { createSession } = await import('../memory/store.js');
      const session = await createSession({
        configPath: runtime.configPath,
        workspaceRoot: runtime.config?.workspace?.rootDir || process.cwd(),
        name: name || '新对话',
      });
      if (session && runtime._sessions) {
        runtime._sessions.unshift({ id: session.id || session.name, name: session.name || '新对话', messages: [] });
      }
      res.json({ ok: true, session });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // PATCH /api/sessions/:id — rename session
  app.patch('/api/sessions/:id', async (req, res) => {
    const id = req.params.id;
    const { name } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: '名称不能为空' });
    try {
      const { renameSession } = await import('../memory/store.js');
      await renameSession({
        configPath: runtime.configPath,
        workspaceRoot: runtime.config?.workspace?.rootDir || process.cwd(),
        sessionId: id,
        name: name.trim(),
      });
      // Update runtime cache
      if (runtime._sessions) {
        const s = runtime._sessions.find((x) => x.id === id);
        if (s) s.name = name.trim();
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // DELETE /api/sessions/:id — delete session
  app.delete('/api/sessions/:id', async (req, res) => {
    const id = req.params.id;
    try {
      const { deleteSession } = await import('../memory/store.js');
      await deleteSession({
        configPath: runtime.configPath,
        workspaceRoot: runtime.config?.workspace?.rootDir || process.cwd(),
        sessionId: id,
      });
      if (runtime._sessions) {
        runtime._sessions = runtime._sessions.filter((x) => x.id !== id);
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/memory — memory entries
  app.get('/api/memory', (_req, res) => {
    const memories = runtime._memoryState?.session?.relevantMemories || [];
    const summary = runtime._memoryState?.session?.summary || '';
    res.json({ memories, summary, memoryCount: memories.length });
  });

  // ── MCP Management APIs ──
  // GET /api/mcp/servers — list MCP servers
  app.get('/api/mcp/servers', (_req, res) => {
    const servers = runtime.config?.mcpServers || {};
    const list = Object.entries(servers).map(([name, cfg]) => ({
      name,
      command: cfg.command || '',
      args: cfg.args || [],
      enabled: cfg.enabled !== false,
      env: cfg.env ? Object.keys(cfg.env).length : 0,
    }));
    res.json({ servers: list });
  });

  // POST /api/mcp/servers — add or update MCP server
  app.post('/api/mcp/servers', async (req, res) => {
    const { name, command, args, env } = req.body || {};
    if (!name || !command) return res.status(400).json({ error: '名称和命令不能为空' });
    if (!runtime.config.mcpServers) runtime.config.mcpServers = {};
    runtime.config.mcpServers[name] = { command, args: args || [], env: env || {} };
    // Persist
    try {
      const { writeFile } = await import('node:fs/promises');
      if (runtime.configPath) {
        await writeFile(runtime.configPath, JSON.stringify(runtime.config, null, 2), 'utf8');
      }
    } catch { /* non-critical */ }
    res.json({ ok: true });
  });

  // DELETE /api/mcp/servers/:name — remove MCP server
  app.delete('/api/mcp/servers/:name', async (req, res) => {
    const name = req.params.name;
    if (runtime.config.mcpServers?.[name]) {
      delete runtime.config.mcpServers[name];
      try {
        const { writeFile } = await import('node:fs/promises');
        if (runtime.configPath) {
          await writeFile(runtime.configPath, JSON.stringify(runtime.config, null, 2), 'utf8');
        }
      } catch { /* non-critical */ }
    }
    res.json({ ok: true });
  });

  // ── Helpers ──
  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const kb = bytes / 1024;
    if (kb < 1) return bytes + ' B';
    if (kb < 1024) return kb.toFixed(1) + ' KB';
    return (kb / 1024).toFixed(1) + ' MB';
  }

  function buildChatMessageWithFiles(data) {
    let msg = data.message || '';
    const files = data.files || [];
    if (!files.length) return msg;

    const fileContext = files.map((f) => {
      const ext = f.name?.split('.').pop()?.toLowerCase() || '';
      const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
      if (isImage && f.data) {
        return `[文件 ${f.name}] 图片已上传 (${formatBytes(f.size)}) (base64 数据已忽略)`;
      }
      try {
        const text = Buffer.from(f.data, 'base64').toString('utf8').slice(0, 20000);
        return `[文件 ${f.name} (${formatBytes(f.size)})]:\n\`\`\`\n${text}\n\`\`\``;
      } catch {
        return `[文件 ${f.name} (${formatBytes(f.size)})] 二进制文件，内容已忽略`;
      }
    }).join('\n\n');

    return fileContext + '\n\n---\n\n' + msg;
  }

  // ── File change notification bridge ──
  runtime._onFilesChanged = () => {
    for (const ws of _wsClients) {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'files_changed' }));
      }
    }
  };

  // ── WebSocket ──
  wss.on('connection', (ws) => {
    let cancelled = false;
    const abort = () => { cancelled = true; };
    abortChat = abort;
    _wsClients.add(ws);

    // Shell execution tracking per client
    let _shellAbort = null;
    let _interactiveShell = null;

    ws.on('message', async (raw) => {
      let data;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: '无效的 JSON' }));
        return;
      }

      if (data.type === 'chat') {
        cancelled = false;
        try {
          // Inject attached file contents into message
          const chatMessage = buildChatMessageWithFiles(data);

          const onToken = (token) => {
            if (cancelled) throw new Error('_aborted_');
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'token', data: token }));
            }
          };
          const onDone = (reply) => {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'done', data: reply }));
            }
          };
          const onError = (err) => {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'error', message: err }));
            }
          };
          const onToolCall = (name, args) => {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'tool_call', name, args }));
            }
          };
          const onToolResult = (name, msg) => {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'tool_result', name, message: msg }));
            }
          };
          const onMemory = (count) => {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'memory', memoryCount: count }));
            }
          };
          const onDiff = (filePath, diffData) => {
            addDiff(filePath, diffData);
          };
          const onPlan = (steps) => {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'plan_steps', steps }));
            }
          };

          resetPendingDiffs();
          await messageHandler({
            message: chatMessage || '',
            onToken,
            onDone,
            onError,
            onToolCall,
            onToolResult,
            onMemory,
            onDiff,
            onPlan,
            cancelled: () => cancelled,
          });
          flushPendingDiffs(ws);
        } catch (err) {
          if (cancelled || (err && err.message === '_aborted_')) return;
          const msg = err instanceof Error ? err.message : String(err);
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'error', message: msg }));
          }
        }
      }

      if (data.type === 'stop') {
        cancelled = true;
        if (abortChat) abortChat();
      }

      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }

      // ── Shell execution ──
      if (data.type === 'shell_exec') {
        const { command, cwd } = data;
        if (!command || !command.trim()) {
          ws.send(JSON.stringify({ type: 'shell_error', message: '命令不能为空' }));
          return;
        }
        const validation = validateShellCommand(command);
        if (!validation.safe) {
          ws.send(JSON.stringify({ type: 'shell_error', message: `命令被拒绝: ${validation.reason}` }));
          return;
        }

        const ac = new AbortController();
        _shellAbort = ac;
        ws.send(JSON.stringify({ type: 'shell_start' }));

        streamShell(command, {
          cwd: cwd || process.cwd(),
          signal: ac.signal,
          onStdout(chunk) {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'shell_output', data: chunk }));
            }
          },
          onStderr(chunk) {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'shell_output', data: chunk }));
            }
          },
          onExit(code, sig) {
            _shellAbort = null;
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'shell_done', code, signal: sig }));
            }
          },
        }).catch(() => {
          _shellAbort = null;
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'shell_done', code: -1, signal: null }));
          }
        });
      }

      if (data.type === 'shell_stop') {
        if (_shellAbort) {
          _shellAbort.abort();
          _shellAbort = null;
        }
        if (_interactiveShell) {
          _interactiveShell.kill();
          _interactiveShell = null;
        }
      }

      if (data.type === 'shell_input') {
        if (_interactiveShell) {
          _interactiveShell.write(data.input || '');
        }
      }

      // ── Interactive shell session ──
      if (data.type === 'shell_session_start') {
        const { cwd } = data;
        const { createInteractiveShell } = await import('../shell/shell-stream.js');
        _interactiveShell = createInteractiveShell({
          cwd: cwd || process.cwd(),
          onStdout(chunk) {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'shell_output', data: chunk }));
            }
          },
          onStderr(chunk) {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'shell_output', data: chunk }));
            }
          },
          onExit(code) {
            _interactiveShell = null;
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'shell_done', code }));
            }
          },
        });
        ws.send(JSON.stringify({ type: 'shell_session_ready', pid: _interactiveShell.pid }));
      }
    });

    ws.on('close', () => {
      cancelled = true;
      if (abortChat === abort) abortChat = null;
      _wsClients.delete(ws);
      if (_shellAbort) { _shellAbort.abort(); _shellAbort = null; }
      if (_interactiveShell) { _interactiveShell.kill(); _interactiveShell = null; }
    });
  });

  return server;
}
