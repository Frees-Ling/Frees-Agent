import { execFile, execFileSync } from 'node:child_process';

function execPromise(cmd, args) {
  return new Promise(resolve => {
    execFile(cmd, args, { shell: false }, (error, stdout) => {
      resolve(error ? null : stdout.toString().trim().split(/\r?\n/)[0] || null);
    });
  });
}

export async function which(command) {
  if (process.platform === 'win32') {
    const result = await execPromise('where.exe', [command]);
    return result;
  }
  const result = await execPromise('which', [command]);
  return result;
}

export function whichSync(command) {
  try {
    const cmd = process.platform === 'win32' ? 'where.exe' : 'which';
    const result = execFileSync(cmd, [command], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    return result.toString().trim().split(/\r?\n/)[0] || null;
  } catch {
    return null;
  }
}
