import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { runEditAgent } from '../src/agent/edit-loop.js';
import {
  buildChatSystemPrompt,
  compactConversationIfNeeded,
  updateMemoryAfterTurn
} from '../src/memory/manager.js';
import { resolveLocalChatShortcut } from '../src/memory/heuristics.js';
import { createMemoryStore, loadMemoryState } from '../src/memory/store.js';
import { buildPermissionGuide } from '../src/system/permissions.js';
import { loadSkills, selectRelevantSkills } from '../src/skills/loader.js';
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

test('memory store persists profile and durable memories', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-cli-memory-'));
  const configPath = path.join(tempRoot, 'config.json');
  await writeFile(configPath, '{}\n');

  const store = await createMemoryStore({
    configPath,
    workspaceRoot: tempRoot,
    sessionName: 'demo'
  });
  const state = await loadMemoryState(store, {
    memory: {
      enabled: true,
      autoExtract: true,
      maxDurableMemories: 80
    },
    conversation: {
      keepRecentMessages: 12,
      summarizeAfterMessages: 18,
      maxSummaryChars: 6000
    }
  });

  const fakeClient = {
    async generateText({ systemPrompt }) {
      if (String(systemPrompt).includes('长期记忆提取器')) {
        return JSON.stringify({
          profilePatch: {
            language: 'zh-CN',
            goals: ['构建更强的 AI Agent CLI']
          },
          durableMemories: [
            {
              category: 'goal',
              content: '用户希望 Frees Agent 支持更强的记忆和长对话。'
            }
          ]
        });
      }
      return '{}';
    }
  };

  await updateMemoryAfterTurn({
    client: fakeClient,
    state,
    userMessage: '请帮我把 Frees Agent 做得更强，最好支持超长对话和记忆。',
    assistantMessage: '好的，我会为你增强记忆和长对话。',
    config: state.config
  });

  const reloaded = await loadMemoryState(store, state.config);
  assert.equal(reloaded.profile.language, 'zh-CN');
  assert.match(reloaded.durableMemories[0].content, /长对话/);
});

test('conversation compaction builds session summary', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-cli-summary-'));
  const configPath = path.join(tempRoot, 'config.json');
  await writeFile(configPath, '{}\n');

  const store = await createMemoryStore({
    configPath,
    workspaceRoot: tempRoot,
    sessionName: 'summary'
  });
  const state = await loadMemoryState(store, {
    memory: {
      enabled: true,
      autoExtract: false
    },
    conversation: {
      keepRecentMessages: 4,
      summarizeAfterMessages: 6,
      maxSummaryChars: 6000
    }
  });

  for (let index = 0; index < 8; index += 1) {
    state.session.recentMessages.push({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `message-${index}`,
      timestamp: new Date().toISOString()
    });
  }

  const fakeClient = {
    async generateText() {
      return JSON.stringify({
        summary: '用户正在增强 Frees Agent，并讨论了记忆与超长对话。',
        keyFacts: ['要支持持久化记忆', '要支持长对话摘要'],
        openLoops: ['继续完善文档']
      });
    }
  };

  await compactConversationIfNeeded({
    client: fakeClient,
    state,
    config: state.config
  });

  assert.match(state.session.summary, /持久化记忆/);
  assert.equal(state.session.recentMessages.length, 4);
});

test('chat system prompt includes memory context', async () => {
  const prompt = buildChatSystemPrompt({
    baseSystemPrompt: 'base',
    state: {
      profile: { language: 'zh-CN' },
      durableMemories: [{ category: 'goal', content: '构建 Frees Agent' }],
      session: { summary: '之前已经讨论过记忆系统。' }
    },
    config: {
      memory: {
        enabled: true,
        includeUserProfile: true,
        includeDurableMemories: true
      }
    }
  });

  assert.match(prompt, /用户画像/);
  assert.match(prompt, /长期记忆/);
  assert.match(prompt, /长对话摘要/);
});

test('permission guide returns platform-aware content', () => {
  const guide = buildPermissionGuide();
  assert.ok(guide.platform);
  assert.ok(Array.isArray(guide.steps));
  assert.ok(guide.steps.length >= 1);
});

test('local chat shortcut remembers and returns user name', () => {
  const reply = resolveLocalChatShortcut('我叫什么名字', {
    profile: { name: 'Frees Ling' }
  });
  assert.equal(reply, '你叫 Frees Ling。');
});

test('skills loader reads SKILL.md files and matches relevant skills', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-cli-skills-'));
  const skillDir = path.join(tempRoot, '.claude', 'skills', 'code-review');
  await import('node:fs/promises').then(module =>
    module.mkdir(skillDir, { recursive: true })
  );
  await writeFile(
    path.join(skillDir, 'SKILL.md'),
    `---\nname: Code Review\ndescription: Review code for bugs and missing tests.\nallowed-tools: Read, Grep\n---\n\n# Code Review\n`
  );

  const skills = await loadSkills(tempRoot);
  assert.ok(skills.some(skill => skill.slug === 'code-review'));

  const matched = selectRelevantSkills(skills, '请帮我 review 代码并找 bug');
  assert.ok(matched.some(skill => skill.slug === 'code-review'));
});
