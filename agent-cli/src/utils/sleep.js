export function sleep(ms, signal, opts = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      if (opts.throwOnAbort || opts.abortError) {
        reject(opts.abortError?.() ?? new Error('aborted'));
      } else {
        resolve();
      }
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      if (opts.throwOnAbort || opts.abortError) {
        reject(opts.abortError?.() ?? new Error('aborted'));
      } else {
        resolve();
      }
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    if (opts.unref) timer.unref();
  });
}

export function withTimeout(promise, ms, message) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
    if (typeof timer === 'object') timer.unref?.();
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
