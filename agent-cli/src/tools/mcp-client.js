import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

let nextId = 1;

function createJsonRpcRequest(method, params = {}) {
  const id = nextId++;
  return { jsonrpc: '2.0', id, method, params };
}

const MCP_RESPONSE_TIMEOUT_MS = 30000;

class McpConnection {
  constructor({ name, config, storageRoot }) {
    this.name = name;
    this.config = config;
    this.storageRoot = storageRoot;
    this.process = null;
    this.pending = new Map();
    this.buffer = '';
    this.connected = false;
    this.capabilities = {};
    this._toolsCache = null;
  }

  async _connectStdio() {
    const command = this.config.command;
    const args = this.config.args || [];
    const env = { ...process.env, ...(this.config.env || {}) };

    // Determine if shell is needed: Windows always, or if command is a shell-builtin/script
    const needsShell = process.platform === 'win32' || (
      typeof command === 'string' && (
        !command.includes(path.sep) && !command.startsWith('.')
      )
    );

    return new Promise((resolve, reject) => {
      let resolved = false;
      try {
        const child = spawn(command, args, {
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: needsShell
        });
        this.process = child;
      } catch (error) {
        reject(new Error(`MCP server "${this.name}" 启动失败: ${error.message}`));
        return;
      }

      const { process: child } = this;
      let startupResolved = false;

      const onError = (error) => {
        if (!startupResolved) {
          startupResolved = true;
          resolved = true;
          reject(new Error(`MCP server "${this.name}" 进程错误: ${error.message}`));
        }
      };

      const onExit = (code) => {
        this.connected = false;
        if (!startupResolved) {
          startupResolved = true;
          resolved = true;
          reject(new Error(`MCP server "${this.name}" 进程退出(code=${code})`));
        }
      };

      child.on('error', onError);
      child.on('exit', onExit);

      child.stdout.on('data', (data) => {
        this._handleData(data.toString());
      });

      child.stderr.on('data', (data) => {
        const text = data.toString();
        if (text.trim()) {
          console.error(`[mcp:${this.name}] ${text.trim()}`);
        }
      });

      // Send initialize request
      this._sendRaw(createJsonRpcRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'frees-agent', version: '1.0.0' }
      })).then((result) => {
        if (!startupResolved) {
          startupResolved = true;
          resolved = true;
          this.connected = true;
          this.capabilities = result?.capabilities || {};
          // Send initialized notification
          this._sendRaw({ jsonrpc: '2.0', method: 'notifications/initialized' });
          resolve();
        }
      }).catch((error) => {
        if (!startupResolved) {
          startupResolved = true;
          resolved = true;
          reject(error);
        }
      });
    });
  }

  _handleData(chunk) {
    this.buffer += chunk;
    while (true) {
      const newlineIndex = this.buffer.indexOf('\n');
      if (newlineIndex === -1) break;

      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (!line) continue;

      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      if (parsed.id !== undefined && this.pending.has(parsed.id)) {
        const { resolve, reject, timer } = this.pending.get(parsed.id);
        clearTimeout(timer);
        this.pending.delete(parsed.id);
        if (parsed.error) {
          reject(new Error(parsed.error.message || 'MCP 请求错误'));
        } else {
          resolve(parsed.result);
        }
      }
    }
  }

  async _sendRaw(request, timeoutMs = MCP_RESPONSE_TIMEOUT_MS) {
    if (!this.process || !this.process.stdin) {
      throw new Error(`MCP server "${this.name}" 未连接`);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new Error(`MCP 请求超时: ${request.method}`));
      }, timeoutMs);

      this.pending.set(request.id, { resolve, reject, timer });

      try {
        this.process.stdin.write(`${JSON.stringify(request)}\n`);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(request.id);
        reject(new Error(`MCP 写入失败: ${error.message}`));
      }
    });
  }

  async connect() {
    const transport = this.config.transport || 'stdio';
    if (transport === 'stdio') {
      await this._connectStdio();
    } else {
      throw new Error(`MCP 不支持的传输方式: ${transport}`);
    }
  }

  async disconnect() {
    this.connected = false;
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error('MCP 连接已关闭'));
    }
    this.pending.clear();
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  async listTools() {
    if (this._toolsCache) return this._toolsCache;
    const result = await this._sendRaw(createJsonRpcRequest('tools/list'));
    this._toolsCache = (result?.tools || []).map(tool => ({
      ...tool,
      serverName: this.name
    }));
    return this._toolsCache;
  }

  async callTool(toolName, args = {}) {
    this._toolsCache = null; // invalidate after call
    const result = await this._sendRaw(createJsonRpcRequest('tools/call', {
      name: toolName,
      arguments: args
    }), this.config.timeoutMs || MCP_RESPONSE_TIMEOUT_MS);
    return result;
  }

  isConnected() {
    return this.connected && this.process !== null && !this.process.killed;
  }
}

export class McpManager {
  constructor({ config, storageRoot }) {
    this.serverConfigs = config?.mcpServers || {};
    this.storageRoot = storageRoot || process.cwd();
    this.connections = new Map();
  }

  async getOrConnect(name) {
    if (this.connections.has(name)) {
      const existing = this.connections.get(name);
      if (existing.isConnected()) return existing;
      try {
        await existing.connect();
      } catch {
        this.connections.delete(name);
        return this._connectNew(name);
      }
      return existing;
    }
    return this._connectNew(name);
  }

  async _connectNew(name) {
    const config = this.serverConfigs[name];
    if (!config) {
      throw new Error(`MCP 服务器未配置: ${name}。请在 config.json 的 mcpServers.${name} 中配置。`);
    }
    const conn = new McpConnection({ name, config, storageRoot: this.storageRoot });
    await conn.connect();
    this.connections.set(name, conn);
    return conn;
  }

  async listAllTools() {
    const allTools = [];
    const serverNames = Object.keys(this.serverConfigs);
    for (const name of serverNames) {
      try {
        const conn = await this.getOrConnect(name);
        const tools = await conn.listTools();
        allTools.push(...tools);
      } catch (error) {
        console.error(`[mcp] 获取 ${name} 工具列表失败: ${error.message}`);
      }
    }
    return allTools;
  }

  async callTool(serverName, toolName, args = {}) {
    const conn = await this.getOrConnect(serverName);
    return conn.callTool(toolName, args);
  }

  async disconnectAll() {
    for (const conn of this.connections.values()) {
      try {
        await conn.disconnect();
      } catch {
        // ignore disconnect errors
      }
    }
    this.connections.clear();
  }
}

export function buildMcpToolHandlers(mcpManager) {
  const mcpToolMap = new Map();

  async function refreshTools() {
    mcpToolMap.clear();
    const tools = await mcpManager.listAllTools();
    for (const tool of tools) {
      const qualifiedName = `mcp__${tool.serverName}__${tool.name}`;
      mcpToolMap.set(qualifiedName, { serverName: tool.serverName, toolName: tool.name, schema: tool.inputSchema });
    }
    return tools;
  }

  async function tryHandleMcpTool(name, args = {}) {
    const entry = mcpToolMap.get(name);
    if (!entry) return null;
    try {
      const result = await mcpManager.callTool(entry.serverName, entry.toolName, args);
      return { ok: true, data: result };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  function getToolNames() {
    return Array.from(mcpToolMap.keys());
  }

  function getToolSchemas() {
    return Array.from(mcpToolMap.entries()).map(([name, info]) => ({
      name,
      serverName: info.serverName,
      inputSchema: info.schema
    }));
  }

  return { refreshTools, tryHandleMcpTool, getToolNames, getToolSchemas };
}
