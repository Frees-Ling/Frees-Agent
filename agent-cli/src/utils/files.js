import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TEXT_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.json', '.jsonc', '.jsonl',
  '.md', '.mdx', '.txt', '.text',
  '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf',
  '.env', '.gitignore', '.gitattributes', '.gitmodules',
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.psm1', '.psd1',
  '.py', '.rb', '.php', '.java', '.kt', '.kts', '.go', '.rs',
  '.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp', '.hxx',
  '.cs', '.fs', '.fsx',
  '.swift', '.scala', '.clj', '.cljs', '.edn',
  '.sql', '.ddl', '.dml',
  '.css', '.scss', '.sass', '.less', '.styl',
  '.html', '.htm', '.xhtml', '.xml', '.svg',
  '.vue', '.svelte', '.astro', '.liquid',
  '.wasm', '.wat',
  '.lock', '.patch', '.diff',
  '.dockerfile', '.Dockerfile',
  '.makefile', '.Makefile',
  '.cmake', '.ninja',
  '.gradle', '.properties',
  '.lua', '.pl', '.pm', '.t',
  '.r', '.R',
  '.m', '.mm',
  '.hs', '.lhs',
  '.erl', '.hrl', '.ex', '.exs',
  '.cr', '.elm',
  '.zig', '.nim', '.odin',
  '.proto', '.graphql', '.gql',
  '.terraform', '.tf', '.tfvars', '.hcl',
  '.rst', '.asciidoc', '.adoc',
  '.tex', '.bib',
  '.log', '.out',
  '.eslintrc', '.prettierrc', '.babelrc',
  '.npmrc', '.yarnrc', '.pnpmrc',
  '.nix',
]);

const BINARY_EXTENSIONS = new Set([
  // Images
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.tiff', '.tif', '.avif', '.heic', '.heif',
  // Videos
  '.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.flv', '.m4v', '.mpeg', '.mpg', '.ogv', '.3gp',
  // Audio
  '.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma', '.aiff', '.opus', '.mid', '.midi',
  // Archives
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar', '.xz', '.z', '.tgz', '.lz', '.lzma', '.zst',
  '.iso', '.dmg', '.img', '.vhd', '.vhdx', '.vmdk',
  // Executables
  '.exe', '.dll', '.so', '.dylib', '.bin', '.o', '.a', '.obj', '.lib', '.app', '.msi',
  '.deb', '.rpm', '.apk', '.appimage', '.snap', '.flatpak',
  // Documents (binary formats)
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp',
  // Fonts
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  // Bytecode / compiled
  '.pyc', '.pyo', '.class', '.jar', '.war', '.ear', '.node', '.wasm', '.rlib', '.pyd',
  // Database
  '.sqlite', '.sqlite3', '.db', '.mdb', '.idx', '.dbf',
  // Design / 3D
  '.psd', '.ai', '.eps', '.sketch', '.fig', '.blend', '.obj', '.fbx', '.glb', '.gltf',
  '.stl', '.step', '.iges',
  // Cache / build artifacts
  '.map', '.cache', '.tmp',
]);

const MAX_TEXT_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

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
  // Check explicit binary extensions first
  if (BINARY_EXTENSIONS.has(ext)) {
    return false;
  }
  // Check known text extensions
  if (TEXT_EXTENSIONS.has(ext)) {
    return true;
  }
  const base = path.basename(filePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(base)) {
    return true;
  }
  // Fall back to content sniffing
  if (!buffer || buffer.length === 0) return true;
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
