export function intersperse(as, separator) {
  return as.flatMap((a, i) => (i ? [separator(i), a] : [a]));
}

export function count(arr, pred) {
  let n = 0;
  for (const x of arr) n += +!!pred(x);
  return n;
}

export function uniq(xs) {
  return [...new Set(xs)];
}

export function objectGroupBy(items, keySelector) {
  const result = Object.create(null);
  let index = 0;
  for (const item of items) {
    const key = keySelector(item, index++);
    if (result[key] === undefined) result[key] = [];
    result[key].push(item);
  }
  return result;
}
