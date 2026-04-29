import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { memoize } from './memoize.js';
import { whichSync } from './which.js';

// ---------------------------------------------------------------------------
// git binary path (cached)
// ---------------------------------------------------------------------------

export const gitExe = memoize(() => whichSync('git') || 'git');

// ---------------------------------------------------------------------------
// findGitRoot — walk up directory tree looking for .git
// ---------------------------------------------------------------------------

const GIT_ROOT_NOT_FOUND = Symbol('git-root-not-found');

function findGitRootImpl(startPath) {
  let current = resolve(startPath);
  const root = current.substring(0, current.indexOf(sep) + 1) || sep;

  while (current !== root) {
    try {
      const gitPath = join(current, '.git');
      const st = statSync(gitPath);
      if (st.isDirectory() || st.isFile()) {
        return current.normalize('NFC');
      }
    } catch { /* .git not here, continue up */ }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  // Check root
  try {
    const st = statSync(join(root, '.git'));
    if (st.isDirectory() || st.isFile()) return root.normalize('NFC');
  } catch { /* not at root */ }

  return GIT_ROOT_NOT_FOUND;
}

function createFindGitRoot() {
  function wrapper(startPath) {
    const result = findGitRootImpl(startPath);
    return result === GIT_ROOT_NOT_FOUND ? null : result;
  }
  return wrapper;
}

/**
 * Find the git root by walking up the directory tree.
 * Looks for a .git directory or file (worktrees/submodules use a file).
 * Returns the directory containing .git, or null if not found.
 */
export const findGitRoot = createFindGitRoot();

/**
 * Resolve a git root to the canonical main repository root.
 * For a regular repo this is a no-op. For a worktree, follows the
 * `.git` file → `gitdir:` → `commondir` chain to find the main repo.
 */
function resolveCanonicalRoot(gitRoot) {
  try {
    const gitContent = statSync(join(gitRoot, '.git'));
    if (!gitContent.isFile()) return gitRoot;

    const content = require('fs').readFileSync(join(gitRoot, '.git'), 'utf-8').trim();
    if (!content.startsWith('gitdir:')) return gitRoot;

    const worktreeGitDir = resolve(gitRoot, content.slice('gitdir:'.length).trim());
    const commonDirRaw = require('fs').readFileSync(join(worktreeGitDir, 'commondir'), 'utf-8').trim();
    const commonDir = resolve(worktreeGitDir, commonDirRaw);

    if (resolve(dirname(worktreeGitDir)) !== join(commonDir, 'worktrees')) return gitRoot;

    const backlink = realpathSync(
      require('fs').readFileSync(join(worktreeGitDir, 'gitdir'), 'utf-8').trim(),
    );
    if (backlink !== join(realpathSync(gitRoot), '.git')) return gitRoot;

    if (basename(commonDir) !== '.git') return commonDir.normalize('NFC');
    return dirname(commonDir).normalize('NFC');
  } catch {
    return gitRoot;
  }
}

export function findCanonicalGitRoot(startPath) {
  const root = findGitRoot(startPath);
  return root ? resolveCanonicalRoot(root) : null;
}

// ---------------------------------------------------------------------------
// Quick checks
// ---------------------------------------------------------------------------

export function getIsGit(cwd) {
  return findGitRoot(cwd || process.cwd()) !== null;
}

export function isAtGitRoot(cwd) {
  const c = cwd || process.cwd();
  const gitRoot = findGitRoot(c);
  if (!gitRoot) return false;
  try {
    const r1 = realpathSync(c);
    const r2 = realpathSync(gitRoot);
    return r1 === r2;
  } catch {
    return c === gitRoot;
  }
}

// ---------------------------------------------------------------------------
// Exec helper
// ---------------------------------------------------------------------------

function gitExec(args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(gitExe(), args, { timeout: 10000, ...options }, (err, stdout, stderr) => {
      if (err) {
        // @ts-ignore err.code exists for execFile errors
        resolve({ stdout: '', stderr: stderr || err.message, code: err.code === 'ENOENT' ? -1 : (err.code || 1) });
      } else {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code: 0 });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// HEAD / branch / remote
// ---------------------------------------------------------------------------

export async function getHead(cwd) {
  const { stdout, code } = await gitExec(['rev-parse', 'HEAD'], cwd ? { cwd } : {});
  return code === 0 ? stdout : null;
}

export async function getBranch(cwd) {
  const { stdout, code } = await gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], cwd ? { cwd } : {});
  return code === 0 && stdout !== 'HEAD' ? stdout : null;
}

export async function getDefaultBranch(cwd) {
  const { stdout, code } = await gitExec(['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'], cwd ? { cwd } : {});
  return code === 0 ? stdout : null;
}

export async function getRemoteUrl(cwd) {
  const { stdout, code } = await gitExec(['config', '--get', 'remote.origin.url'], cwd ? { cwd } : {});
  return code === 0 ? stdout : null;
}

/**
 * Normalize a git remote URL to canonical form: host/owner/repo (lowercase, no .git).
 * Handles SSH (git@host:owner/repo.git) and HTTPS/SSH URL formats.
 */
export function normalizeGitRemoteUrl(url) {
  const trimmed = (url || '').trim();
  if (!trimmed) return null;

  // SSH format: git@host:owner/repo.git
  const sshMatch = trimmed.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (sshMatch) return `${sshMatch[1]}/${sshMatch[2]}`.toLowerCase();

  // HTTPS/SSH URL format
  const urlMatch = trimmed.match(/^(?:https?|ssh):\/\/(?:[^@]+@)?([^/]+)\/(.+?)(?:\.git)?$/);
  if (urlMatch) {
    const host = urlMatch[1];
    const path = urlMatch[2];
    if (/^127\./.test(host) && path.startsWith('git/')) {
      const segments = path.slice(4).split('/');
      if (segments.length >= 3 && segments[0].includes('.')) {
        return path.slice(4).toLowerCase();
      }
      return `github.com/${path.slice(4)}`.toLowerCase();
    }
    return `${host}/${path}`.toLowerCase();
  }
  return null;
}

export async function getRepoRemoteHash(cwd) {
  const remoteUrl = await getRemoteUrl(cwd);
  if (!remoteUrl) return null;
  const normalized = normalizeGitRemoteUrl(remoteUrl);
  if (!normalized) return null;
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Working tree status
// ---------------------------------------------------------------------------

export async function getIsClean(options = {}) {
  const args = ['status', '--porcelain'];
  if (options.ignoreUntracked) args.push('-uno');
  const { stdout, code } = await gitExec(args);
  return code === 0 && stdout.length === 0;
}

export async function getChangedFiles() {
  const { stdout, code } = await gitExec(['diff', '--name-only']);
  if (code !== 0) return [];
  const files = stdout ? stdout.split('\n').filter(Boolean) : [];

  const { stdout: staged } = await gitExec(['diff', '--cached', '--name-only']);
  if (staged) {
    for (const f of staged.split('\n').filter(Boolean)) {
      if (!files.includes(f)) files.push(f);
    }
  }
  return files;
}

export async function hasUnpushedCommits() {
  const { stdout, code } = await gitExec(['rev-list', '--count', '@{u}..HEAD']);
  return code === 0 && parseInt(stdout, 10) > 0;
}

export async function getIsHeadOnRemote() {
  const { code } = await gitExec(['rev-parse', '@{u}']);
  return code === 0;
}

// ---------------------------------------------------------------------------
// SHA validation
// ---------------------------------------------------------------------------

export function isValidGitSha(s) {
  return /^[0-9a-f]{40}$/.test(s) || /^[0-9a-f]{64}$/.test(s);
}

// ---------------------------------------------------------------------------
// Git diff helpers
// ---------------------------------------------------------------------------

export async function getGitDiff(filePath, cached = false) {
  const args = ['diff'];
  if (cached) args.push('--cached');
  if (filePath) args.push('--', filePath);
  const { stdout, code } = await gitExec(args);
  return code === 0 ? stdout : null;
}

/**
 * Get comprehensive git repository state.
 */
export async function getGitState(cwd) {
  const repoRoot = findGitRoot(cwd || process.cwd());
  if (!repoRoot) return null;

  const [head, branch, remoteUrl, isClean, changedFiles] = await Promise.all([
    getHead(repoRoot),
    getBranch(repoRoot),
    getRemoteUrl(repoRoot),
    getIsClean({ ignoreUntracked: true }),
    getChangedFiles(),
  ]);

  return {
    repoRoot,
    head,
    branch,
    remoteUrl,
    isClean,
    changedFiles,
    remoteHash: remoteUrl ? normalizeGitRemoteUrl(remoteUrl) : null,
  };
}
