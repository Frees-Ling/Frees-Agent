import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { runEditAgent } from '../src/agent/edit-loop.js';
import { extractFirstJsonObject } from '../src/utils/json.js';
import {
  buildWorkspaceOverview,
  findRelevantFiles,
  scanWorkspace
} from '../src/workspace/indexer.js';
import { listFiles, readIndexedFile, searchText } from '../src/workspace/queries.js';

test('extractFirstJsonObject reads fenced json', () => {
  const parsed = extractFirstJsonObject('```json\n{"type":"final","summary":"ok"}\n```');
  assert.equal(parsed.type, 'final');
  assert.equal(parsed.summary, 'ok');
});

test('workspace scanner loads text files and supports queries', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-cli-'));
  await writeFile(path.join(tempRoot, 'app.ts'), 'export function add(a, b) {\n  return a + b;\n}\n');
  await writeFile(path.join(tempRoot, 'README.md'), '# Demo\n');

  const index = await scanWorkspace(tempRoot, {
    ignore: [],
    maxFileBytes: 1024 * 1024,
    maxWorkspaceBytes: 1024 * 1024
  });

  assert.equal(index.stats.totalFiles, 2);
  assert.equal(listFiles(index, { pattern: '**' }).length, 2);
  assert.equal(searchText(index, { query: 'return a + b' }).length, 1);
  assert.match(readIndexedFile(index, 'app.ts').content, /return a \+ b/);
});

test('edit agent can drive tool loop and modify files', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-cli-edit-'));
  const targetFile = path.join(tempRoot, 'index.js');
  await writeFile(targetFile, 'export const value = "old";\n');

  const index = await scanWorkspace(tempRoot, {
    ignore: [],
    maxFileBytes: 1024 * 1024,
    maxWorkspaceBytes: 1024 * 1024
  });

  const replies = [
    JSON.stringify({
      type: 'tool',
      tool: 'replace_in_file',
      args: {
        path: 'index.js',
        oldText: '"old"',
        newText: '"new"'
      }
    }),
    JSON.stringify({
      type: 'final',
      summary: 'updated file',
      changedFiles: ['index.js'],
      notes: []
    })
  ];

  let callCount = 0;
  const fakeClient = {
    async generateText() {
      const reply = replies[callCount];
      callCount += 1;
      return reply;
    }
  };

  const relevantFiles = findRelevantFiles(index, 'replace old with new');
  const result = await runEditAgent({
    client: fakeClient,
    index,
    workspaceOverview: buildWorkspaceOverview(index),
    relevantFiles,
    task: 'replace old with new',
    maxSteps: 4
  });

  const content = await readFile(targetFile, 'utf8');
  assert.match(content, /"new"/);
  assert.equal(result.summary, 'updated file');
});
