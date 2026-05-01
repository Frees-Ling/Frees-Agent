/**
 * File system watcher for incremental workspace index updates.
 * Uses fs.watch with recursive mode (macOS/Linux) or polling fallback.
 * Debounces rapid events and updates an in-memory index.
 */

import { watch, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { readTextIfPossible, detectLanguage, normalizeRelativePath } from './files.js';

const DEBOUNCE_MS = 300;
const DEFAULT_IGNORE = new Set([
  '.git', 'node_modules', 'dist', 'build', 'coverage',
  '.next', '.nuxt', '.turbo', '.idea', '.vscode',
  '.DS_Store', 'Thumbs.db', '.cache', '__pycache__',
  'vendor', 'bower_components', 'Pods', '.venv', 'venv',
  '.env', 'DerivedData', '.build', 'target', '.swc',
  '.yarn', '.pnp', '.pnp.js', '*.tsbuildinfo',
]);

function shouldIgnore(relativePath) {
  const parts = relativePath.split(/[/\\]/);
  return parts.some((p) => DEFAULT_IGNORE.has(p));
}

/**
 * Create a workspace file watcher.
 * @param {Object} index - The mutable workspace index object { root, files }
 * @param {Object} [opts]
 * @param {number} [opts.debounceMs=300]
 * @returns {Function} stop() function
 */
export function createWorkspaceWatcher(index, opts = {}) {
  const debounceMs = opts.debounceMs ?? DEBOUNCE_MS;
  const onChange = opts.onChange || null;
  if (!index || !index.root) return () => {};

  const pending = new Map();
  let timer = null;
  let stopped = false;

  const maxFileBytes = 1024 * 1024;
  const maxWorkspaceBytes = 24 * 1024 * 1024;

  async function updateIndex(relativePath) {
    if (stopped || shouldIgnore(relativePath)) return;

    const absolutePath = path.join(index.root, relativePath);

    // Check if file still exists
    if (!existsSync(absolutePath)) {
      const idx = index.files.findIndex((f) => f.relativePath === relativePath);
      if (idx >= 0) {
        index.files.splice(idx, 1);
      }
      return;
    }

    // Check if it's a file (not directory)
    try {
      const s = await stat(absolutePath);
      if (!s.isFile()) return;

      const existing = index.files.find((f) => f.relativePath === relativePath);

      if (!existing) {
        // New file — add to index
        const fileSize = s.size;
        let content = null;

        if (fileSize <= maxFileBytes) {
          const totalLoadedBytes = index.files.reduce((acc, f) => acc + (f.content ? f.content.length : 0), 0);
          if (totalLoadedBytes + fileSize <= maxWorkspaceBytes) {
            try {
              const buf = readTextIfPossible(absolutePath);
              if (buf) content = buf;
            } catch { /* binary or error */ }
          }
        }

        index.files.push({
          absolutePath,
          relativePath,
          size: fileSize,
          language: detectLanguage(absolutePath),
          content,
          skippedReason: content === null ? (fileSize > maxFileBytes ? `file>1MB` : 'binary') : null,
        });

        if (index.stats) {
          index.stats.totalFiles++;
          if (content !== null) index.stats.loadedFiles++;
          else index.stats.skippedFiles++;
        }
      } else {
        // Existing file — update content
        existing.size = s.size;
        if (existing.content !== null) {
          try {
            const buf = readTextIfPossible(absolutePath);
            existing.content = buf || '';
            existing.skippedReason = null;
          } catch {
            existing.content = null;
            existing.skippedReason = 'binary';
          }
        }
      }
    } catch {
      // File deleted or inaccessible between stat and read
      const idx = index.files.findIndex((f) => f.relativePath === relativePath);
      if (idx >= 0) index.files.splice(idx, 1);
    }
  }

  async function startWatching() {
    try {
      const ac = new AbortController();
      stopped = false;

      try {
        const watcher = watch(index.root, { recursive: true, signal: ac.signal });
        for await (const event of watcher) {
          if (stopped) break;
          const relativePath = (event.filename || '').replace(/\\/g, '/');
          if (!relativePath || shouldIgnore(relativePath)) continue;

          pending.set(relativePath, Date.now());
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            if (stopped) return;
            let changed = false;
            const now = Date.now();
            for (const [p, t] of pending) {
              if (now - t >= debounceMs) {
                pending.delete(p);
                updateIndex(p);
                changed = true;
              }
            }
            if (pending.size > 0) {
              timer = setTimeout(() => {
                if (stopped) return;
                for (const [p] of pending) {
                  pending.delete(p);
                  updateIndex(p);
                  changed = true;
                }
                if (changed && onChange) onChange();
                timer = null;
              }, debounceMs);
            } else {
              if (changed && onChange) onChange();
              timer = null;
            }
          }, debounceMs);
        }
      } catch (err) {
        if (err.code === 'ENOSPC') {
          console.warn('[watcher] 文件监视器达到系统上限，停止文件变更跟踪');
        }
      }
    } catch { /* watcher error — non-critical */ }
  }

  startWatching();

  return () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pending.clear();
  };
}
