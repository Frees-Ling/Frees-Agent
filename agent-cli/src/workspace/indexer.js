import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  detectLanguage,
  formatBytes,
  isProbablyTextFile,
  normalizeRelativePath,
  walkDirectory
} from '../utils/files.js';

const DEFAULT_IGNORE_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.turbo',
  '.idea',
  '.vscode'
]);

export async function scanWorkspace(workspaceRoot, config = {}) {
  const ignoreNames = new Set([...(config.ignore || []), ...DEFAULT_IGNORE_NAMES]);
  const maxFileBytes = config.maxFileBytes ?? 1024 * 1024;
  const maxWorkspaceBytes = config.maxWorkspaceBytes ?? 24 * 1024 * 1024;

  const files = [];
  let totalLoadedBytes = 0;

  async function visit(currentDir) {
    await walkDirectory(currentDir, async (entry, absolutePath) => {
      if (ignoreNames.has(entry.name)) {
        return;
      }

      const relativePath = normalizeRelativePath(path.relative(workspaceRoot, absolutePath));

      if (entry.isDirectory()) {
        await visit(absolutePath);
        return;
      }

      if (!entry.isFile()) {
        return;
      }

      const fileStats = await stat(absolutePath);
      const record = {
        absolutePath,
        relativePath,
        size: fileStats.size,
        language: detectLanguage(absolutePath),
        content: null,
        skippedReason: null
      };

      if (fileStats.size > maxFileBytes) {
        record.skippedReason = `file>${formatBytes(maxFileBytes)}`;
        files.push(record);
        return;
      }

      if (totalLoadedBytes + fileStats.size > maxWorkspaceBytes) {
        record.skippedReason = `workspace>${formatBytes(maxWorkspaceBytes)}`;
        files.push(record);
        return;
      }

      const buffer = await readFile(absolutePath);
      if (!isProbablyTextFile(absolutePath, buffer)) {
        record.skippedReason = 'binary';
        files.push(record);
        return;
      }

      record.content = buffer.toString('utf8');
      totalLoadedBytes += fileStats.size;
      files.push(record);
    });
  }

  await visit(workspaceRoot);

  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  return {
    root: workspaceRoot,
    files,
    stats: {
      totalFiles: files.length,
      loadedFiles: files.filter(file => file.content !== null).length,
      skippedFiles: files.filter(file => file.content === null).length,
      loadedBytes: totalLoadedBytes
    }
  };
}

export function buildWorkspaceOverview(index, { maxFiles = 250 } = {}) {
  const lines = [
    `workspace_root: ${index.root}`,
    `total_files: ${index.stats.totalFiles}`,
    `loaded_files: ${index.stats.loadedFiles}`,
    `skipped_files: ${index.stats.skippedFiles}`,
    `loaded_bytes: ${index.stats.loadedBytes}`
  ];

  lines.push('files:');
  for (const file of index.files.slice(0, maxFiles)) {
    const suffix = file.skippedReason ? ` [${file.skippedReason}]` : '';
    lines.push(`- ${file.relativePath}${suffix}`);
  }

  if (index.files.length > maxFiles) {
    lines.push(`- ... ${index.files.length - maxFiles} more files`);
  }

  return lines.join('\n');
}

function tokenize(text) {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^\p{L}\p{N}_./-]+/u)
        .map(token => token.trim())
        .filter(token => token.length >= 2)
    )
  );
}

export function findRelevantFiles(index, task, limit = 12) {
  const keywords = tokenize(task);
  const scored = [];

  for (const file of index.files) {
    let score = 0;
    const haystackPath = file.relativePath.toLowerCase();
    const haystackContent = (file.content || '').toLowerCase();

    for (const keyword of keywords) {
      if (haystackPath.includes(keyword)) {
        score += 6;
      }
      if (haystackContent.includes(keyword)) {
        score += 2;
      }
    }

    if (score > 0) {
      scored.push({ file, score });
    }
  }

  return scored
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(entry => entry.file);
}
