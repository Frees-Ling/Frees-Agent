import { which } from './which.js';

const binaryCache = new Map();

export async function isBinaryInstalled(command) {
  if (!command || !command.trim()) return false;
  const trimmedCommand = command.trim();
  const cached = binaryCache.get(trimmedCommand);
  if (cached !== undefined) return cached;
  let exists = false;
  if (await which(trimmedCommand).catch(() => null)) exists = true;
  binaryCache.set(trimmedCommand, exists);
  return exists;
}

export function clearBinaryCache() {
  binaryCache.clear();
}
