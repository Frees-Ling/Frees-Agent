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
import { buildMcpToolHandlers } from '../tools/mcp-client.js';

export function createAgentToolbox(index, { dryRun = false, readOnly = false, config = {} } = {}) {
  const changes = [];
  let mcpHandlers = null;

  function setMcpManager(mcpManager) {
    if (mcpManager) {
      mcpHandlers = buildMcpToolHandlers(mcpManager);
    }
  }

  async function runTool(name, args = {}) {
    // Try MCP tools first if available
    if (mcpHandlers) {
      const mcpResult = await mcpHandlers.tryHandleMcpTool(name, args);
      if (mcpResult !== null) return mcpResult;
    }

    if (name === 'list_files') {
      return { ok: true, data: listFiles(index, args) };
    }

    if (name === 'search_text') {
      return { ok: true, data: searchText(index, args) };
    }

    if (name === 'read_file') {
      return { ok: true, data: readIndexedFile(index, args.path, args) };
    }

    if (name === 'mkdir') {
      if (readOnly) throw new Error('当前工具箱为只读模式，禁止 mkdir。');
      if (dryRun) {
        changes.push({ type: 'mkdir', path: args.path, dryRun: true });
        return { ok: true, data: { path: args.path, dryRun: true } };
      }
      const data = await createWorkspaceDirectory(index, args.path);
      changes.push({ type: 'mkdir', path: args.path });
      return { ok: true, data };
    }

    if (name === 'write_file') {
      if (readOnly) throw new Error('当前工具箱为只读模式，禁止 write_file。');
      if (dryRun) {
        changes.push({ type: 'write', path: args.path, dryRun: true });
        return { ok: true, data: { path: args.path, dryRun: true, bytes: Buffer.byteLength(args.content || '', 'utf8') } };
      }
      const data = await writeWorkspaceFile(index, args.path, args.content || '');
      changes.push({ type: 'write', path: args.path });
      return { ok: true, data };
    }

    if (name === 'replace_in_file') {
      if (readOnly) throw new Error('当前工具箱为只读模式，禁止 replace_in_file。');
      if (dryRun) {
        changes.push({ type: 'replace', path: args.path, dryRun: true });
        return { ok: true, data: { path: args.path, dryRun: true, replaceAll: Boolean(args.replaceAll) } };
      }
      const data = await replaceInWorkspaceFile(index, args.path, args.oldText, args.newText, Boolean(args.replaceAll));
      changes.push({ type: 'replace', path: args.path });
      return { ok: true, data };
    }

    if (name === 'delete_file') {
      if (readOnly) throw new Error('当前工具箱为只读模式，禁止 delete_file。');
      if (dryRun) {
        changes.push({ type: 'delete', path: args.path, dryRun: true });
        return { ok: true, data: { path: args.path, dryRun: true } };
      }
      const data = await deleteWorkspaceFile(index, args.path);
      changes.push({ type: 'delete', path: args.path });
      return { ok: true, data };
    }

    if (name === 'web_search') {
      const query = String(args.query || '').trim();
      if (!query) throw new Error('web_search 需要 query');
      const data = await searchWebWithTavily(query, config, { maxResults: args.maxResults });
      return { ok: true, data };
    }

    // List available MCP tools if requested
    if (name === 'list_mcp_tools') {
      if (!mcpHandlers) return { ok: true, data: { tools: [] } };
      return { ok: true, data: { tools: mcpHandlers.getToolSchemas() } };
    }

    throw new Error(`未知工具: ${name}。可用工具: list_files, search_text, read_file, write_file, replace_in_file, mkdir, delete_file, web_search${mcpHandlers ? ', ' + mcpHandlers.getToolNames().join(', ') : ''}`);
  }

  return {
    changes,
    runTool,
    setMcpManager,
    mcpHandlers
  };
}
