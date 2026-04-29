import {
  createWorkspaceDirectory,
  deleteWorkspaceFile,
  listFiles,
  readIndexedFile,
  replaceInWorkspaceFile,
  searchText,
  writeWorkspaceFile
} from '../workspace/queries.js';
import { searchWebWithTavily } from '../tools/web-search.js';
import { fetchUrl, htmlToBasicText } from '../tools/web-fetch.js';
import { execShell, validateShellCommand } from '../shell/shell-exec.js';
import { buildMcpToolHandlers } from '../tools/mcp-client.js';

export function createAgentToolbox(index, {
  dryRun = false, readOnly = false, config = {},
  allowedTools = null, blockedTools = null,
} = {}) {
  const changes = [];
  let mcpHandlers = null;

  function checkToolPermission(name) {
    if (allowedTools && Array.isArray(allowedTools) && allowedTools.length > 0) {
      if (!allowedTools.includes(name)) {
        throw new Error(`工具 "${name}" 未被当前技能允许。允许的工具: ${allowedTools.join(', ')}`);
      }
    }
    if (blockedTools && Array.isArray(blockedTools) && blockedTools.length > 0) {
      if (blockedTools.includes(name)) {
        throw new Error(`工具 "${name}" 已被当前技能禁止使用。`);
      }
    }
  }

  function setMcpManager(mcpManager) {
    if (mcpManager) {
      mcpHandlers = buildMcpToolHandlers(mcpManager);
    }
  }

  async function runTool(name, args = {}) {
    // Check tool permissions
    checkToolPermission(name);

    // Try MCP tools first if available
    if (mcpHandlers) {
      const mcpResult = await mcpHandlers.tryHandleMcpTool(name, args);
      if (mcpResult !== null) return mcpResult;
    }

    switch (name) {
      // ---- Read operations ----
      case 'list_files':
      case 'glob': {
        return { ok: true, data: listFiles(index, args) };
      }

      case 'search_text':
      case 'grep': {
        return { ok: true, data: searchText(index, args) };
      }

      case 'read_file':
      case 'read': {
        return { ok: true, data: readIndexedFile(index, args.path, args) };
      }

      // ---- Write operations ----
      case 'mkdir': {
        if (readOnly) throw new Error('当前工具箱为只读模式，禁止 mkdir。');
        if (dryRun) {
          changes.push({ type: 'mkdir', path: args.path, dryRun: true });
          return { ok: true, data: { path: args.path, dryRun: true } };
        }
        const data = await createWorkspaceDirectory(index, args.path);
        changes.push({ type: 'mkdir', path: args.path });
        return { ok: true, data };
      }

      case 'write_file':
      case 'write': {
        if (readOnly) throw new Error('当前工具箱为只读模式，禁止 write_file。');
        if (dryRun) {
          changes.push({ type: 'write', path: args.path, dryRun: true });
          return { ok: true, data: { path: args.path, dryRun: true, bytes: Buffer.byteLength(args.content || '', 'utf8') } };
        }
        const data = await writeWorkspaceFile(index, args.path, args.content || '');
        changes.push({ type: 'write', path: args.path });
        return { ok: true, data };
      }

      case 'replace_in_file':
      case 'edit': {
        if (readOnly) throw new Error('当前工具箱为只读模式，禁止 replace_in_file。');
        if (dryRun) {
          changes.push({ type: 'replace', path: args.path, dryRun: true });
          return { ok: true, data: { path: args.path, dryRun: true, replaceAll: Boolean(args.replaceAll) } };
        }
        const data = await replaceInWorkspaceFile(index, args.path, args.oldText, args.newText, Boolean(args.replaceAll));
        changes.push({ type: 'replace', path: args.path });
        return { ok: true, data };
      }

      case 'delete_file': {
        if (readOnly) throw new Error('当前工具箱为只读模式，禁止 delete_file。');
        if (dryRun) {
          changes.push({ type: 'delete', path: args.path, dryRun: true });
          return { ok: true, data: { path: args.path, dryRun: true } };
        }
        const data = await deleteWorkspaceFile(index, args.path);
        changes.push({ type: 'delete', path: args.path });
        return { ok: true, data };
      }

      // ---- Web operations ----
      case 'web_search': {
        const query = String(args.query || '').trim();
        if (!query) throw new Error('web_search 需要 query');
        const data = await searchWebWithTavily(query, config, { maxResults: args.maxResults });
        return { ok: true, data };
      }

      case 'web_fetch':
      case 'fetch': {
        const url = String(args.url || '').trim();
        if (!url) throw new Error('web_fetch 需要 url');
        const result = await fetchUrl(url, { timeoutMs: args.timeoutMs });
        // Convert HTML to readable text if it's HTML
        if (result.contentType.includes('text/html')) {
          result.content = htmlToBasicText(result.content);
        }
        return { ok: true, data: result };
      }

      // ---- Shell operations ----
      case 'bash':
      case 'shell':
      case 'execute_command': {
        const command = String(args.command || '').trim();
        if (!command) return { ok: false, error: 'bash 需要 command' };

        const validation = validateShellCommand(command);
        if (!validation.safe) {
          return { ok: false, error: `命令安全检查未通过: ${validation.reason}` };
        }

        const result = await execShell(command, {
          cwd: args.cwd,
          timeoutMs: args.timeoutMs,
          mergeStderr: args.mergeStderr,
        });

        return {
          ok: result.code === 0,
          data: {
            stdout: result.stdout,
            stderr: result.stderr,
            code: result.code,
            timedOut: result.timedOut,
            truncated: result.truncated,
            duration: result.duration,
          }
        };
      }

      // ---- MCP tools ----
      case 'list_mcp_tools': {
        if (!mcpHandlers) return { ok: true, data: { tools: [] } };
        return { ok: true, data: { tools: mcpHandlers.getToolSchemas() } };
      }

      // ---- System info ----
      case 'system_info': {
        const { getSystemInfo } = await import('../utils/system-info.js');
        return { ok: true, data: getSystemInfo() };
      }

      default:
        throw new Error(
          `未知工具: ${name}。可用工具: read_file, search_text, list_files, write_file, replace_in_file, mkdir, delete_file, web_search, web_fetch, bash${mcpHandlers ? ', ' + mcpHandlers.getToolNames().join(', ') : ''}`
        );
    }
  }

  function getToolList() {
    const tools = [
      { name: 'read_file', description: 'Read file with line numbers' },
      { name: 'search_text', description: 'Search text in workspace' },
      { name: 'list_files', description: 'List workspace files with glob' },
      { name: 'write_file', description: 'Write content to file' },
      { name: 'replace_in_file', description: 'Replace text in file' },
      { name: 'delete_file', description: 'Delete a file' },
      { name: 'mkdir', description: 'Create a directory' },
      { name: 'web_search', description: 'Search the web via Tavily' },
      { name: 'web_fetch', description: 'Fetch a URL and get content' },
      { name: 'bash', description: 'Execute a shell command' },
      { name: 'system_info', description: 'Get current system time, date, platform, and OS info' },
    ];
    if (mcpHandlers) {
      for (const t of mcpHandlers.getToolSchemas()) {
        tools.push({ name: t.name, description: t.description || 'MCP tool' });
      }
    }
    return tools;
  }

  return {
    changes,
    runTool,
    setMcpManager,
    getToolList,
    mcpHandlers
  };
}
