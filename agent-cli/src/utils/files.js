import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TEXT_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.json',
  '.jsonc',
  '.md',
  '.mdx',
  '.txt',
  '.yml',
  '.yaml',
  '.toml',
  '.ini',
  '.env',
  '.sh',
  '.bash',
  '.zsh',
  '.ps1',
  '.psm1',
  '.py',
  '.rb',
  '.php',
  '.java',
  '.kt',
  '.go',
  '.rs',
  '.c',
  '.cc',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.swift',
  '.scala',
  '.sql',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.html',
  '.xml',
  '.vue',
  '.svelte',
  '.astro',
  '.lock',
  '.gitignore',
  '.gitattributes',
  '.dockerfile'
]);

function hasBinaryByte(buffer) {
  const sample = buffer.subarray(0, 4096);
  for (const byte of sample) {
    if (byte === 0) {
      return true;
    }
  }
  return false;
}

export function isProbablyTextFile(filePath, buffer) {
  const ext = path.extname(filePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) {
    return true;
  }
  const base = path.basename(filePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(base)) {
    return true;
  }
  return !hasBinaryByte(buffer);
}

export function detectLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mapping = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.kt': 'kotlin',
    '.swift': 'swift',
    '.cpp': 'cpp',
    '.c': 'c',
    '.cs': 'csharp',
    '.php': 'php',
    '.rb': 'ruby',
    '.sh': 'shell',
    '.ps1': 'powershell',
    '.json': 'json',
    '.md': 'markdown',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.toml': 'toml',
    '.html': 'html',
    '.css': 'css'
  };
  return mapping[ext] || 'text';
}

export async function readTextIfPossible(filePath) {
  const buffer = await readFile(filePath);
  if (!isProbablyTextFile(filePath, buffer)) {
    return null;
  }
  return buffer.toString('utf8');
}

export async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

export async function writeTextFile(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, content, 'utf8');
}

export async function deleteFile(filePath) {
  await unlink(filePath);
}

export async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export async function walkDirectory(rootDir, callback) {
  const items = await readdir(rootDir, { withFileTypes: true });
  for (const item of items) {
    const absolutePath = path.join(rootDir, item.name);
    await callback(item, absolutePath);
  }
}

export function normalizeRelativePath(filePath) {
  return filePath.split(path.sep).join('/');
}

export function resolveInsideWorkspace(workspaceRoot, targetPath) {
  const absolute = path.resolve(workspaceRoot, targetPath);
  const relative = path.relative(workspaceRoot, absolute);
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`路径越界，禁止访问工作区外文件: ${targetPath}`);
  }
  return absolute;
}

export function formatBytes(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
