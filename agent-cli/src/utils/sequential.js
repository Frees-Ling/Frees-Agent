export function sequential(fn) {
  const queue = [];
  let processing = false;

  async function processQueue() {
    if (processing) return;
    if (queue.length === 0) return;
    processing = true;
    while (queue.length > 0) {
      const { args, resolve, reject, context } = queue.shift();
      try {
        const result = await fn.apply(context, args);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }
    processing = false;
    if (queue.length > 0) void processQueue();
  }

  return function (...args) {
    return new Promise((resolve, reject) => {
      queue.push({ args, resolve, reject, context: this });
      void processQueue();
    });
  };
}
