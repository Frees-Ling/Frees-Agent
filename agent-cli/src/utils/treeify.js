const TREE_CHARS = {
  branch: '├',
  lastBranch: '└',
  line: '│',
  empty: ' ',
};

export function treeify(obj, options = {}) {
  const {
    showValues = true,
    hideFunctions = false,
  } = options;

  const lines = [];
  const visited = new WeakSet();

  function growBranch(node, prefix, depth = 0) {
    if (typeof node === 'string') {
      lines.push(prefix + node);
      return;
    }

    if (typeof node !== 'object' || node === null) {
      if (showValues) lines.push(prefix + String(node));
      return;
    }

    if (visited.has(node)) {
      lines.push(prefix + '[Circular]');
      return;
    }
    visited.add(node);

    const keys = Object.keys(node).filter(key => {
      if (hideFunctions && typeof node[key] === 'function') return false;
      return true;
    });

    keys.forEach((key, index) => {
      const value = node[key];
      const isLastKey = index === keys.length - 1;
      const nodePrefix = depth === 0 && index === 0 ? '' : prefix;

      const treeChar = isLastKey ? TREE_CHARS.lastBranch : TREE_CHARS.branch;
      const keyLabel = key.trim() === '' ? '' : key;
      let line = nodePrefix + treeChar + (keyLabel ? ' ' + keyLabel : '');

      if (value && typeof value === 'object' && visited.has(value)) {
        lines.push(line + ': [Circular]');
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        lines.push(line);
        const continuationChar = isLastKey ? TREE_CHARS.empty : TREE_CHARS.line;
        growBranch(value, nodePrefix + continuationChar + ' ', depth + 1);
      } else if (Array.isArray(value)) {
        lines.push(line + ': [Array(' + value.length + ')]');
      } else if (showValues) {
        const valueStr = typeof value === 'function' ? '[Function]' : String(value);
        lines.push(line + ': ' + valueStr);
      } else {
        lines.push(line);
      }
    });
  }

  const keys = Object.keys(obj);
  if (keys.length === 0) return '(empty)';

  if (keys.length === 1 && keys[0].trim() === '' && typeof obj[keys[0]] === 'string') {
    return TREE_CHARS.lastBranch + ' ' + obj[keys[0]];
  }

  growBranch(obj, '', 0);
  return lines.join('\n');
}
