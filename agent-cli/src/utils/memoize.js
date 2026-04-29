export function memoize(fn, resolver = (...args) => args[0]) {
  const cache = new Map();
  return (...args) => {
    const key = resolver(...args);
    if (cache.has(key)) return cache.get(key);
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}
