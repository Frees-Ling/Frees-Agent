/**
 * Build a nested file tree structure from a flat file list
 */
export function buildFileTree(files, rootDir) {
  const tree = [];
  const map = {};

  // Normalize root
  const root = rootDir ? rootDir.replace(/\\/g, '/').replace(/\/+$/, '') : '';

  // Helper to ensure parent directories exist in the map
  function ensureParent(path) {
    const parts = path.replace(/\\/g, '/').split('/');
    if (parts.length <= 1) return;
    for (let i = 1; i <= parts.length; i++) {
      const parentPath = parts.slice(0, i).join('/');
      if (!map[parentPath]) {
        const parentName = parts[i - 1];
        const entry = { name: parentName, path: parentPath, isDir: true, size: 0, children: [] };
        map[parentPath] = entry;
      } else {
        map[parentPath].isDir = true;
      }
    }
  }

  for (const file of files) {
    const path = (file.path || file).replace(/\\/g, '/');
    const name = file.name || path.split('/').pop();
    const isDir = file.isDirectory || path.endsWith('/');
    const size = file.size || 0;

    ensureParent(path);
    const entry = { name, path, isDir, size, children: [] };
    map[path] = entry;
  }

  // Build hierarchy
  for (const [path, entry] of Object.entries(map)) {
    const parts = path.split('/');
    if (parts.length <= 1) {
      tree.push(entry);
      continue;
    }
    const parentPath = parts.slice(0, -1).join('/');
    const parent = map[parentPath];
    if (parent) {
      parent.children.push(entry);
    } else {
      tree.push(entry);
    }
  }

  // Sort: dirs first, then alphabetical
  function sortTree(nodes) {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.children.length) sortTree(n.children);
    }
  }
  sortTree(tree);

  return tree;
}
