export function createCombinedAbortSignal(signal, opts = {}) {
  const { signalB, timeoutMs } = opts;
  const controller = new AbortController();

  if (signal?.aborted || signalB?.aborted) {
    controller.abort();
    return { signal: controller.signal, cleanup: () => {} };
  }

  let timer;
  const abortCombined = () => {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
  };

  if (timeoutMs !== undefined) {
    timer = setTimeout(abortCombined, timeoutMs);
    timer.unref?.();
  }
  signal?.addEventListener('abort', abortCombined);
  signalB?.addEventListener('abort', abortCombined);

  const cleanup = () => {
    if (timer !== undefined) clearTimeout(timer);
    signal?.removeEventListener('abort', abortCombined);
    signalB?.removeEventListener('abort', abortCombined);
  };

  return { signal: controller.signal, cleanup };
}
