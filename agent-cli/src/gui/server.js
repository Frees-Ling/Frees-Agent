import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createGuiServer({ runtime, messageHandler }) {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  let abortChat = null; // function to abort current chat

  // Static files
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.json());

  // ── REST API ──

  // GET /api/status — basic status
  app.get('/api/status', (_req, res) => {
    res.json({
      model: runtime.model,
      provider: runtime.providerName,
      configPath: runtime.configPath,
      workspace: runtime.config.workspace?.rootDir || null,
      memoryEnabled: runtime.config.memory?.enabled !== false,
    });
  });

  // GET /api/config — full safe config
  app.get('/api/config', (_req, res) => {
    const safe = (({ apiKey, apiKeyEnv, ...rest }) => rest)(runtime.config.anthropic || {});
    res.json({
      anthropic: safe,
      model: runtime.model || '—',
      provider: runtime.providerName || '—',
      tools: runtime.config.tools || {},
      conversation: runtime.config.conversation || {},
      memoryCount: runtime._memoryCount,
      tokenCount: runtime._tokenCount,
      temperature: runtime.config.temperature,
      stream: runtime.config.stream !== false,
      planner: runtime.config.conversation?.planningEnabled !== false,
    });
  });

  // PATCH /api/config — update a setting
  app.patch('/api/config', (req, res) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'missing key' });
    // Forward to runtime config if mutable
    if (key === 'temperature') runtime.config.temperature = value;
    if (key === 'stream') runtime.config.stream = Boolean(value);
    if (key === 'planner') {
      if (!runtime.config.conversation) runtime.config.conversation = {};
      runtime.config.conversation.planningEnabled = Boolean(value);
    }
    if (key === 'model') runtime.model = String(value);
    if (key === 'provider') runtime.providerName = String(value);
    res.json({ ok: true });
  });

  // GET /api/system — system info (Node.js side)
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
      os_version: os.type() + ' ' + os.release(),
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
    if (!session) return res.status(404).json({ error: 'session not found' });
    res.json({ messages: session.messages || [] });
  });

  // ── WebSocket ──
  wss.on('connection', (ws) => {
    let cancelled = false;
    const abort = () => { cancelled = true; };
    abortChat = abort;

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

          await messageHandler({
            message: data.message || '',
            onToken,
            onDone,
            onError,
            onToolCall,
            onToolResult,
            onMemory,
            cancelled: () => cancelled,
          });
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
    });

    ws.on('close', () => {
      cancelled = true;
      if (abortChat === abort) abortChat = null;
    });
  });

  return server;
}
