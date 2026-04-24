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

export function createAgentToolbox(index, { dryRun = false, readOnly = false, config = {} } = {}) {
  const changes = [];

  async function runTool(name, args = {}) {
    if (name === 'list_files') {
      return {
        ok: true,
        data: listFiles(index, args)
      };
    }

    if (name === 'search_text') {
      return {
        ok: true,
        data: searchText(index, args)
      };
    }

    if (name === 'read_file') {
      return {
        ok: true,
        data: readIndexedFile(index, args.path, args)
      };
    }

    if (name === 'mkdir') {
      if (readOnly) {
        throw new Error('当前工具箱为只读模式，禁止 mkdir。');
      }
      if (dryRun) {
        const result = { ok: true, data: { path: args.path, dryRun: true } };
        changes.push({ type: 'mkdir', path: args.path, dryRun: true });
        return result;
      }
      const data = await createWorkspaceDirectory(index, args.path);
      changes.push({ type: 'mkdir', path: args.path });
      return { ok: true, data };
    }

    if (name === 'write_file') {
      if (readOnly) {
        throw new Error('当前工具箱为只读模式，禁止 write_file。');
      }
      if (dryRun) {
        const data = {
          path: args.path,
          dryRun: true,
          bytes: Buffer.byteLength(args.content || '', 'utf8')
        };
        changes.push({ type: 'write', path: args.path, dryRun: true });
        return { ok: true, data };
      }
      const data = await writeWorkspaceFile(index, args.path, args.content || '');
      changes.push({ type: 'write', path: args.path });
      return { ok: true, data };
    }

    if (name === 'replace_in_file') {
      if (readOnly) {
        throw new Error('当前工具箱为只读模式，禁止 replace_in_file。');
      }
      if (dryRun) {
        const data = {
          path: args.path,
          dryRun: true,
          replaceAll: Boolean(args.replaceAll)
        };
        changes.push({ type: 'replace', path: args.path, dryRun: true });
        return { ok: true, data };
      }
      const data = await replaceInWorkspaceFile(
        index,
        args.path,
        args.oldText,
        args.newText,
        Boolean(args.replaceAll)
      );
      changes.push({ type: 'replace', path: args.path });
      return { ok: true, data };
    }

    if (name === 'delete_file') {
      if (readOnly) {
        throw new Error('当前工具箱为只读模式，禁止 delete_file。');
      }
      if (dryRun) {
        const data = { path: args.path, dryRun: true };
        changes.push({ type: 'delete', path: args.path, dryRun: true });
        return { ok: true, data };
      }
      const data = await deleteWorkspaceFile(index, args.path);
      changes.push({ type: 'delete', path: args.path });
      return { ok: true, data };
    }

    if (name === 'web_search') {
      const query = String(args.query || '').trim();
      if (!query) {
        throw new Error('web_search 需要 query');
      }
      const data = await searchWebWithTavily(query, config, {
        maxResults: args.maxResults
      });
      return { ok: true, data };
    }

    throw new Error(`未知工具: ${name}`);
  }

  return {
    changes,
    runTool
  };
}
