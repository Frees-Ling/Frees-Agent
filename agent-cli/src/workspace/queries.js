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

export function readIndexedFile(index, relativePath, { startLine = 1, endLine, addLineNumbers: withLineNumbers = true } = {}) {
  const normalizedPath = relativePath.replaceAll('\\', '/');
  const file = index.files.find(item => item.relativePath === normalizedPath);
  if (!file) {
    throw new Error(`File not found: ${relativePath}`);
  }
  if (file.content === null) {
    throw new Error(`File not loaded (too large or binary): ${relativePath}`);
  }

  const lines = file.content.split(/\r?\n/);
  const totalLines = lines.length;
  const end = endLine ? Math.min(endLine, totalLines) : totalLines;
  const start = Math.max(1, startLine);
  const selected = lines.slice(start - 1, end);

  const content = withLineNumbers
    ? selected
        .map((line, offset) => {
          const lineNum = String(start + offset);
          const padding = lineNum.length >= 6 ? '' : ' '.repeat(Math.max(1, 6 - lineNum.length));
          return `${padding}${lineNum} | ${line}`;
        })
        .join('\n')
    : selected.join('\n');

  return {
    path: normalizedPath,
    language: file.language || detectLanguage(normalizedPath),
    size: file.size,
    startLine: start,
    endLine: end,
    totalLines,
    truncated: end < totalLines,
    content
  };
}

export function stripLineNumberPrefix(line) {
  const match = line.match(/^\s*\d+\s*\|(.*)$/);
  return match ? match[1].trim() : line;
}

export async function writeWorkspaceFile(index, relativePath, content) {
  const absolutePath = resolveInsideWorkspace(index.root, relativePath);
  await writeTextFile(absolutePath, content);
  await refreshFile(index, relativePath);
  return { path: toRelative(index, relativePath), bytes: Buffer.byteLength(content, 'utf8') };
}

// ---------------------------------------------------------------------------
// Smart string matching for file edits (port from reference FileEditTool)
// ---------------------------------------------------------------------------

const LEFT_SINGLE_CURLY_QUOTE = '‘';
const RIGHT_SINGLE_CURLY_QUOTE = '’';
const LEFT_DOUBLE_CURLY_QUOTE = '“';
const RIGHT_DOUBLE_CURLY_QUOTE = '”';

function normalizeQuotes(str) {
  return str
    .replaceAll(LEFT_SINGLE_CURLY_QUOTE, "'")
    .replaceAll(RIGHT_SINGLE_CURLY_QUOTE, "'")
    .replaceAll(LEFT_DOUBLE_CURLY_QUOTE, '"')
    .replaceAll(RIGHT_DOUBLE_CURLY_QUOTE, '"');
}

export function findActualString(fileContent, searchString) {
  if (fileContent.includes(searchString)) return searchString;
  const normalizedSearch = normalizeQuotes(searchString);
  const normalizedFile = normalizeQuotes(fileContent);
  const searchIndex = normalizedFile.indexOf(normalizedSearch);
  if (searchIndex !== -1) {
    return fileContent.substring(searchIndex, searchIndex + searchString.length);
  }
  return null;
}

function findSimilarNearLine(fileContent, searchString) {
  const lines = searchString.split('\n');
  const firstLine = lines.find(l => l.trim().length > 5);
  if (firstLine) {
    const idx = fileContent.indexOf(firstLine.trim().slice(0, 40));
    if (idx !== -1) {
      const lineNum = fileContent.slice(0, idx).split('\n').length;
      return { nearLine: lineNum, hint: `Found similar text near line ${lineNum} but exact match failed` };
    }
  }
  return {};
}

export function findBestMatch(fileContent, oldText) {
  if (fileContent.includes(oldText)) return { found: true, actual: oldText };
  const actual = findActualString(fileContent, oldText);
  if (actual) return { found: true, actual };
  return { found: false, ...findSimilarNearLine(fileContent, oldText) };
}

export async function replaceInWorkspaceFile(index, relativePath, oldText, newText, replaceAll = false) {
  const normalizedPath = relativePath.replaceAll('\\', '/');
  const existing = index.files.find(file => file.relativePath === normalizedPath);
  if (!existing || existing.content === null) {
    throw new Error(`无法替换，文件不存在或未载入: ${relativePath}`);
  }

  const match = findBestMatch(existing.content, oldText);
  if (!match.found) {
    const hint = match.hint ? `\n${match.hint}` : '';
    throw new Error(`未找到待替换文本: ${relativePath}${hint}`);
  }

  const actualOldText = match.actual;
  const nextContent = replaceAll
    ? existing.content.split(actualOldText).join(newText)
    : existing.content.replace(actualOldText, newText);

  if (nextContent === existing.content) {
    throw new Error(`替换后内容未变化，请检查 oldText 是否匹配: ${relativePath}`);
  }

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
