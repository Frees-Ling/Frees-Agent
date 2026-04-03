import { stat } from 'node:fs/promises';
import path from 'node:path';
import {
  deleteFile,
  detectLanguage,
  ensureDir,
  readTextIfPossible,
  resolveInsideWorkspace,
  writeTextFile
} from '../utils/files.js';

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = escaped.replaceAll('**', '<<<globstar>>>').replaceAll('*', '[^/]*').replaceAll('<<<globstar>>>', '.*').replaceAll('?', '.');
  return new RegExp(`^${regex}$`, 'i');
}

function toRelative(index, targetPath) {
  return targetPath.split(path.sep).join('/');
}

export function listFiles(index, { pathPrefix = '.', pattern = '**', limit = 200 } = {}) {
  const matcher = globToRegExp(pattern);
  const normalizedPrefix = pathPrefix === '.' ? '' : pathPrefix.replaceAll('\\', '/').replace(/\/+$/, '');
  return index.files
    .filter(file => !normalizedPrefix || file.relativePath.startsWith(normalizedPrefix))
    .filter(file => matcher.test(file.relativePath))
    .slice(0, limit)
    .map(file => ({
      path: file.relativePath,
      size: file.size,
      loaded: file.content !== null
    }));
}

export function searchText(index, { query, limit = 20 } = {}) {
  const results = [];
  if (!query) {
    return results;
  }

  const isRegex = query.startsWith('/') && query.lastIndexOf('/') > 0;
  let matcher = null;
  let normalizedQuery = query.toLowerCase();

  if (isRegex) {
    const lastSlash = query.lastIndexOf('/');
    const pattern = query.slice(1, lastSlash);
    const flags = query.slice(lastSlash + 1) || 'i';
    matcher = new RegExp(pattern, flags);
  }

  for (const file of index.files) {
    if (!file.content) {
      continue;
    }

    const lines = file.content.split(/\r?\n/);
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
      const line = lines[lineNumber];
      if (matcher) {
        matcher.lastIndex = 0;
      }
      const matches = matcher ? matcher.test(line) : line.toLowerCase().includes(normalizedQuery);
      if (matches) {
        results.push({
          path: file.relativePath,
          line: lineNumber + 1,
          preview: line.trim().slice(0, 240)
        });
      }
      if (results.length >= limit) {
        return results;
      }
    }
  }

  return results;
}

export function readIndexedFile(index, relativePath, { startLine = 1, endLine } = {}) {
  const normalizedPath = relativePath.replaceAll('\\', '/');
  const file = index.files.find(item => item.relativePath === normalizedPath);
  if (!file) {
    throw new Error(`文件不存在: ${relativePath}`);
  }
  if (file.content === null) {
    throw new Error(`文件未载入内存，可能过大或为二进制: ${relativePath}`);
  }

  const lines = file.content.split(/\r?\n/);
  const end = endLine ? Math.min(endLine, lines.length) : lines.length;
  const start = Math.max(1, startLine);
  const selected = lines
    .slice(start - 1, end)
    .map((line, offset) => `${start + offset}| ${line}`);

  return {
    path: normalizedPath,
    startLine: start,
    endLine: end,
    content: selected.join('\n')
  };
}

export async function writeWorkspaceFile(index, relativePath, content) {
  const absolutePath = resolveInsideWorkspace(index.root, relativePath);
  await writeTextFile(absolutePath, content);
  await refreshFile(index, relativePath);
  return { path: toRelative(index, relativePath), bytes: Buffer.byteLength(content, 'utf8') };
}

export async function replaceInWorkspaceFile(index, relativePath, oldText, newText, replaceAll = false) {
  const normalizedPath = relativePath.replaceAll('\\', '/');
  const existing = index.files.find(file => file.relativePath === normalizedPath);
  if (!existing || existing.content === null) {
    throw new Error(`无法替换，文件不存在或未载入: ${relativePath}`);
  }

  if (!existing.content.includes(oldText)) {
    throw new Error(`未找到待替换文本: ${relativePath}`);
  }

  const nextContent = replaceAll
    ? existing.content.split(oldText).join(newText)
    : existing.content.replace(oldText, newText);

  await writeWorkspaceFile(index, relativePath, nextContent);
  return {
    path: normalizedPath,
    changed: true
  };
}

export async function createWorkspaceDirectory(index, relativePath) {
  const absolutePath = resolveInsideWorkspace(index.root, relativePath);
  await ensureDir(absolutePath);
  return { path: relativePath.replaceAll('\\', '/') };
}

export async function deleteWorkspaceFile(index, relativePath) {
  const absolutePath = resolveInsideWorkspace(index.root, relativePath);
  await deleteFile(absolutePath);
  const normalizedPath = relativePath.replaceAll('\\', '/');
  index.files = index.files.filter(file => file.relativePath !== normalizedPath);
  return { path: normalizedPath };
}

export async function refreshFile(index, relativePath) {
  const normalizedPath = relativePath.replaceAll('\\', '/');
  const absolutePath = resolveInsideWorkspace(index.root, relativePath);
  const content = await readTextIfPossible(absolutePath);
  const stats = await stat(absolutePath);
  const record = {
    absolutePath,
    relativePath: normalizedPath,
    size: stats.size,
    language: detectLanguage(normalizedPath),
    content,
    skippedReason: content === null ? 'binary' : null
  };

  const existingIndex = index.files.findIndex(file => file.relativePath === normalizedPath);
  if (existingIndex >= 0) {
    index.files.splice(existingIndex, 1, record);
  } else {
    index.files.push(record);
    index.files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  }
}
