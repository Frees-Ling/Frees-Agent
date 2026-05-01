import { spawn } from 'node:child_process';
import path from 'node:path';
import { validateShellCommand } from './shell-exec.js';

let _detectedShell = null;

function detectShell() {
  if (_detectedShell) return _detectedShell;
  const isWin = process.platform === 'win32';
  const unixDefault = process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash';
  const shellPath = process.env.SHELL || unixDefault;
  _detectedShell = {
    shell: isWin ? (process.env.COMSPEC || 'cmd.exe') : shellPath,
    args: isWin ? ['/d', '/s', '/c'] : ['-c'],
  };
  return _detectedShell;
}

/**
 * Execute a shell command with streaming output.
 *
 * @param {string} command
 * @param {Object} [options]
 * @param {string} [options.cwd] - Working directory
 * @param {Object} [options.env] - Extra env vars
 * @param {AbortSignal} [options.signal] - Abort signal
 * @param {function(string):void} [options.onStdout] - Called with each stdout chunk
 * @param {function(string):void} [options.onStderr] - Called with each stderr chunk
 * @param {function(number, string|null):void} [options.onExit] - Called with (code, signal)
 * @returns {Promise<{code: number|null, signal: string|null}>}
 */
export function streamShell(command, options = {}) {
  return new Promise((resolve) => {
    const { cwd, env: extraEnv, signal, onStdout, onStderr, onExit } = options;
    const shellInfo = detectShell();
    const env = { ...process.env, ...extraEnv };

    const proc = spawn(shellInfo.shell, [...shellInfo.args, command], {
      cwd: cwd || process.cwd(),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    if (signal) {
      signal.addEventListener('abort', () => {
        try { proc.kill('SIGTERM'); } catch {}
      }, { once: true });
    }

    proc.stdout.on('data', (chunk) => {
      if (onStdout) onStdout(chunk.toString());
    });

    proc.stderr.on('data', (chunk) => {
      if (onStderr) onStderr(chunk.toString());
    });

    proc.on('close', (code, sig) => {
      if (onExit) onExit(code, sig);
      resolve({ code, signal: sig });
    });

    proc.on('error', () => {
      if (onExit) onExit(-1, null);
      resolve({ code: -1, signal: null });
    });
  });
}

/**
 * Run a persistent interactive shell session.
 * Returns a controller object with stdin.write(), kill(), and a promise that resolves on exit.
 */
export function createInteractiveShell(options = {}) {
  const { cwd, env: extraEnv, signal, onStdout, onStderr, onExit } = options;
  const shellInfo = detectShell();
  const env = { ...process.env, ...extraEnv };

  const proc = spawn(shellInfo.shell, [], {
    cwd: cwd || process.cwd(),
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  if (signal) {
    signal.addEventListener('abort', () => {
      try { proc.kill('SIGTERM'); } catch {}
    }, { once: true });
  }

  proc.stdout.on('data', (chunk) => {
    if (onStdout) onStdout(chunk.toString());
  });

  proc.stderr.on('data', (chunk) => {
    if (onStderr) onStderr(chunk.toString());
  });

  proc.on('close', (code, sig) => {
    if (onExit) onExit(code, sig);
  });

  proc.on('error', () => {
    if (onExit) onExit(-1, null);
  });

  return {
    write(input) {
      if (proc.stdin.writable) {
        proc.stdin.write(input);
      }
    },
    kill() {
      try { proc.kill('SIGTERM'); } catch {}
      setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch {}
      }, 2000);
    },
    pid: proc.pid,
  };
}
