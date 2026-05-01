import { execFile, execFileSync, spawn } from 'node:child_process';
import { which } from './which.js';

const MAX_BUFFER_SIZE = 20_000_000;

let initPromise = null;
let rgConfig = null;

async function detectRg() {
  if (rgConfig) return rgConfig;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const rgPath = await which('rg');
    rgConfig = rgPath ? { mode: 'system', command: rgPath, args: [] } : { mode: null, command: null, args: [] };
    return rgConfig;
  })();
  return initPromise;
}

export async function ripgrepCommand() {
  const cfg = await detectRg();
  return { rgPath: cfg.command, rgArgs: cfg.args };
}

function isEagainError(stderr) {
  return stderr.includes('os error 11') || stderr.includes('Resource temporarily unavailable');
}

export class RipgrepTimeoutError extends Error {
  constructor(message, partialResults) {
    super(message);
    this.name = 'RipgrepTimeoutError';
    this.partialResults = partialResults;
  }
}

export async function ripGrep(args, target, abortSignal) {
  const cfg = await detectRg();
  if (!cfg.command) return [];

  const timeout = (parseInt(process.env.FA_GLOB_TIMEOUT_SECONDS || '', 10) || 30) * 1000;

  return new Promise((resolve, reject) => {
    const doExec = (singleThread, isRetry) => {
      const threadArgs = singleThread ? ['-j', '1'] : [];
      const fullArgs = [...cfg.args, ...threadArgs, ...args, target];
      execFile(cfg.command, fullArgs, {
        maxBuffer: MAX_BUFFER_SIZE, signal: abortSignal, timeout,
        killSignal: process.platform === 'win32' ? undefined : 'SIGKILL'
      }, (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout.trim().split('\n').map(l => l.replace(/\r$/, '')).filter(Boolean));
          return;
        }
        if (error.code === 1) { resolve([]); return; }
        if (['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) { reject(error); return; }

        if (!isRetry && isEagainError(String(stderr))) {
          doExec(true, true);
          return;
        }

        const hasOutput = stdout && stdout.trim().length > 0;
        const isTimeout = error.signal === 'SIGTERM' || error.signal === 'SIGKILL' || error.code === 'ABORT_ERR';
        const isBufferOverflow = error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';

        let lines = [];
        if (hasOutput) {
          lines = stdout.trim().split('\n').map(l => l.replace(/\r$/, '')).filter(Boolean);
          if (lines.length > 0 && (isTimeout || isBufferOverflow)) lines = lines.slice(0, -1);
        }

        if (isTimeout && lines.length === 0) {
          reject(new RipgrepTimeoutError('Ripgrep 搜索超时，请尝试指定更具体的路径或模式。', lines));
          return;
        }
        resolve(lines);
      });
    };
    doExec(false, false);
  });
}

export async function ripGrepStream(args, target, abortSignal, onLines) {
  const cfg = await detectRg();
  if (!cfg.command) return;

  return new Promise((resolve, reject) => {
    const child = spawn(cfg.command, [...cfg.args, ...args, target], {
      signal: abortSignal, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']
    });

    const stripCR = l => l.endsWith('\r') ? l.slice(0, -1) : l;
    let remainder = '';
    child.stdout?.on('data', chunk => {
      const data = remainder + chunk.toString();
      const lines = data.split('\n');
      remainder = lines.pop() ?? '';
      if (lines.length) onLines(lines.map(stripCR));
    });

    let settled = false;
    child.on('close', code => {
      if (settled) return;
      if (abortSignal.aborted) return;
      settled = true;
      if (code === 0 || code === 1) {
        if (remainder) onLines([stripCR(remainder)]);
        resolve();
      } else {
        reject(new Error(`ripgrep exited with code ${code}`));
      }
    });
    child.on('error', err => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

export async function getRipgrepStatus() {
  const cfg = await detectRg();
  if (!cfg.command) return { mode: null, path: null, working: false };

  try {
    execFileSync(cfg.command, ['--version'], { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
    return { mode: cfg.mode, path: cfg.command, working: true };
  } catch {
    return { mode: cfg.mode, path: cfg.command, working: false };
  }
}
