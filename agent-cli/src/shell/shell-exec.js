import { spawn } from 'node:child_process';
import { createAbortController } from '../utils/abort.js';
import { getDefaultBashTimeoutMs, getMaxBashTimeoutMs } from '../utils/timeouts.js';

// ---------------------------------------------------------------------------
// Options & Result types
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ShellExecOptions
 * @property {string} [cwd] - Working directory (default: process.cwd())
 * @property {number} [timeoutMs] - Timeout in ms (default: 30_000)
 * @property {AbortSignal} [signal] - Optional abort signal
 * @property {Record<string,string>} [env] - Extra env vars
 * @property {number} [maxOutputBytes] - Max output bytes to capture (default: 1MB)
 * @property {boolean} [mergeStderr] - Merge stderr into stdout
 */

/**
 * @typedef {Object} ShellExecResult
 * @property {number} code - Exit code (null if killed by signal)
 * @property {string|null} signal - Signal that killed the process (null if exited normally)
 * @property {string} stdout - Stdout output (truncated if exceeded maxOutputBytes)
 * @property {string} stderr - Stderr output (truncated)
 * @property {boolean} timedOut - Whether the command timed out
 * @property {boolean} truncated - Whether output was truncated
 * @property {number} duration - Duration in ms
 */

// ---------------------------------------------------------------------------
// Security validation
// ---------------------------------------------------------------------------

const DANGEROUS_PATTERNS = [
  { pattern: /\|.*curl\s/, message: 'curl in pipe (possible data exfiltration)' },
  { pattern: /\|.*wget\s/, message: 'wget in pipe (possible data exfiltration)' },
  { pattern: /\|.*nc\s/, message: 'nc in pipe (possible data exfiltration)' },
  { pattern: />\s*\/dev\/(tcp|udp)\//, message: '/dev/tcp or /dev/udp redirect (network access)' },
  { pattern: /:\s{0,10};\s{0,10}/, message: 'shellshock-style pattern' },
  { pattern: /(\$\(|\{|;)\s*rm\s+-rf\s+(~|\/|\/\*)/, message: 'dangerous rm -rf' },
  { pattern: /chmod\s+-R\s+0{4}\s+/, message: 'chmod -R 000 (locks files)' },
  { pattern: /mkfs\.\w+|dd\s+if=\/dev\/zero/, message: 'filesystem destruction' },
];

/**
 * Check a shell command for dangerous patterns.
 * Returns { safe: true } or { safe: false, reason: string }.
 */
export function validateShellCommand(command) {
  if (!command || typeof command !== 'string') {
    return { safe: false, reason: 'Empty command' };
  }

  const trimmed = command.trim();
  if (!trimmed) {
    return { safe: false, reason: 'Empty command' };
  }

  for (const { pattern, message } of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { safe: false, reason: message };
    }
  }

  return { safe: true };
}

// ---------------------------------------------------------------------------
// Detect available shell
// ---------------------------------------------------------------------------

let _detectedShell = null;

export function detectShell() {
  if (_detectedShell) return _detectedShell;

  const isWin = process.platform === 'win32';

  _detectedShell = {
    isWindows: isWin,
    shell: isWin ? (process.env.COMSPEC || 'cmd.exe') : (process.env.SHELL || '/bin/bash'),
    shellArgs: isWin ? ['/d', '/s', '/c'] : ['-c'],
    type: isWin
      ? (process.env.SHELL?.includes('powershell') ? 'powershell' : 'cmd')
      : (process.env.SHELL?.includes('zsh') ? 'zsh' : 'bash'),
  };

  return _detectedShell;
}

export function resetShellCache() {
  _detectedShell = null;
}

// ---------------------------------------------------------------------------
// Execute shell command
// ---------------------------------------------------------------------------

/**
 * Execute a shell command with timeout and output limits.
 *
 * @param {string} command - The command to execute
 * @param {ShellExecOptions} [options]
 * @returns {Promise<ShellExecResult>}
 */
export function execShell(command, options = {}) {
  const {
    cwd,
    timeoutMs = getDefaultBashTimeoutMs(process.env),
    signal: externalSignal,
    env: extraEnv,
    maxOutputBytes = 1024 * 1024,
    mergeStderr = false,
  } = options;

  const shellInfo = detectShell();

  return new Promise((resolve) => {
    const startTime = Date.now();
    const controller = createAbortController(1);
    const signal = controller.signal;

    // Abort controller if external signal fires
    if (externalSignal && !externalSignal.aborted) {
      const onExternalAbort = () => { try { controller.abort(); } catch {} };
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      signal.addEventListener('abort', () => {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }, { once: true });
    }

    // Set timeout
    const maxTimeout = getMaxBashTimeoutMs(process.env);
    const effectiveTimeout = Math.min(timeoutMs, maxTimeout);
    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

    const env = { ...process.env, ...extraEnv };
    const proc = spawn(shellInfo.shell, [...shellInfo.shellArgs, command], {
      cwd: cwd || process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;

    const onStdoutData = (chunk) => {
      if (stdout.length >= maxOutputBytes) {
        stdoutTruncated = true;
        return;
      }
      stdout += chunk.toString();
    };

    const onStderrData = (chunk) => {
      if (stderr.length >= maxOutputBytes) {
        stderrTruncated = true;
        return;
      }
      stderr += chunk.toString();
    };

    proc.stdout.on('data', onStdoutData);
    proc.stderr.on('data', mergeStderr ? onStdoutData : onStderrData);

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      // If the error happened after abort, it's a timeout
      if (signal.aborted) {
        resolve({
          code: null,
          signal: 'SIGTERM',
          stdout,
          stderr: stderr || 'Command timed out',
          timedOut: true,
          truncated: stdoutTruncated,
          duration,
        });
        return;
      }

      resolve({
        code: -1,
        signal: null,
        stdout,
        stderr: err.message,
        timedOut: false,
        truncated: stdoutTruncated,
        duration,
      });
    });

    proc.on('close', (code, sig) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      resolve({
        code,
        signal: sig,
        stdout,
        stderr,
        timedOut: signal.aborted && code === null,
        truncated: stdoutTruncated,
        duration,
      });
    });
  });
}
