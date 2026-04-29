const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;

export function getDefaultBashTimeoutMs(env = process.env) {
  const envValue = env.BASH_DEFAULT_TIMEOUT_MS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TIMEOUT_MS;
}

export function getMaxBashTimeoutMs(env = process.env) {
  const envValue = env.BASH_MAX_TIMEOUT_MS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) return Math.max(parsed, getDefaultBashTimeoutMs(env));
  }
  return Math.max(MAX_TIMEOUT_MS, getDefaultBashTimeoutMs(env));
}
