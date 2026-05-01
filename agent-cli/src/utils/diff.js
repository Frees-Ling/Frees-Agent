/**
 * Simple line-based unified diff generator.
 * No external dependencies — uses LCS-based algorithm.
 */

function lcs(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const result = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.push({ type: 'equal', value: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'insert', value: b[j - 1] });
      j--;
    } else {
      result.push({ type: 'delete', value: a[i - 1] });
      i--;
    }
  }
  return result.reverse();
}

/**
 * Compute a unified diff between two strings.
 * @param {string} oldText - the original text
 * @param {string} newText - the modified text
 * @param {string} [oldName='a'] - label for old file
 * @param {string} [newName='b'] - label for new file
 * @param {number} [contextLines=3] - lines of context
 * @returns {{ diff: string, hasChanges: boolean, added: number, removed: number }}
 */
export function unifiedDiff(oldText, newText, oldName = 'a', newName = 'b', contextLines = 3) {
  if (oldText === newText) {
    return { diff: '', hasChanges: false, added: 0, removed: 0 };
  }

  const oldLines = (oldText || '').split('\n');
  const newLines = (newText || '').split('\n');
  const ops = lcs(oldLines, newLines);

  let added = 0, removed = 0;
  for (const op of ops) {
    if (op.type === 'delete') removed++;
    else if (op.type === 'insert') added++;
  }

  if (added === 0 && removed === 0) {
    return { diff: '', hasChanges: false, added: 0, removed: 0 };
  }

  // Group operations into hunks with context
  const hunks = [];
  let hunk = null;
  let contextBefore = [];
  let contextAfter = [];

  function flushHunk() {
    if (!hunk || hunk.lines.length === 0) return;
    // Add remaining trailing context
    for (const c of contextAfter.slice(0, contextLines)) {
      hunk.lines.push({ type: 'ctx', value: c });
    }
    contextAfter = [];
    hunks.push(hunk);
    hunk = null;
  }

  for (const op of ops) {
    if (op.type === 'equal') {
      if (hunk) {
        contextAfter.push(op.value);
        if (contextAfter.length > contextLines) {
          const excess = contextAfter.shift();
          hunk.lines.push({ type: 'ctx', value: excess });
        }
      } else {
        contextBefore.push(op.value);
        if (contextBefore.length > contextLines) {
          contextBefore.shift();
        }
      }
    } else {
      if (!hunk) {
        hunk = { lines: [] };
        for (const c of contextBefore) {
          hunk.lines.push({ type: 'ctx', value: c });
        }
        contextBefore = [];
      }
      // Flush any accumulated trailing context as leading context
      for (const c of contextAfter) {
        hunk.lines.push({ type: 'ctx', value: c });
      }
      contextAfter = [];

      if (op.type === 'delete') {
        hunk.lines.push({ type: 'del', value: op.value });
      } else {
        hunk.lines.push({ type: 'ins', value: op.value });
      }
    }
  }
  flushHunk();

  if (hunks.length === 0) {
    return { diff: '', hasChanges: false, added: 0, removed: 0 };
  }

  // Build unified diff text
  const result = [`--- ${oldName}`, `+++ ${newName}`];
  let oldLine = 1, newLine = 1;

  for (const hunk of hunks) {
    let hunkOld = 0, hunkNew = 0;
    for (const line of hunk.lines) {
      if (line.type === 'ctx' || line.type === 'del') hunkOld++;
      if (line.type === 'ctx' || line.type === 'ins') hunkNew++;
    }
    result.push(`@@ -${oldLine},${hunkOld} +${newLine},${hunkNew} @@`);

    for (const line of hunk.lines) {
      if (line.type === 'ctx') {
        result.push(' ' + line.value);
        oldLine++; newLine++;
      } else if (line.type === 'del') {
        result.push('-' + line.value);
        oldLine++;
      } else {
        result.push('+' + line.value);
        newLine++;
      }
    }
  }

  return { diff: result.join('\n'), hasChanges: true, added, removed };
}
