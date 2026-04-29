import { setMaxListeners } from 'node:events';

const DEFAULT_MAX_LISTENERS = 50;

export function createAbortController(maxListeners = DEFAULT_MAX_LISTENERS) {
  const controller = new AbortController();
  setMaxListeners(maxListeners, controller.signal);
  return controller;
}

export function createChildAbortController(parent, maxListeners) {
  const child = createAbortController(maxListeners);
  if (parent.signal.aborted) {
    child.abort(parent.signal.reason);
    return child;
  }

  const weakChild = new WeakRef(child);
  const weakParent = new WeakRef(parent);
  const handler = function () {
    const p = weakParent.deref();
    const c = weakChild.deref();
    c?.abort(p?.signal.reason);
  };

  parent.signal.addEventListener('abort', handler, { once: true });
  child.signal.addEventListener('abort', function () {
    const p = weakParent.deref();
    if (p) p.signal.removeEventListener('abort', handler);
  }, { once: true });

  return child;
}
