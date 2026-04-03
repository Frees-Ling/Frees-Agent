import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { shortHash, slugify } from '../utils/slug.js';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeUniqueArray(left = [], right = []) {
  const values = [...left, ...right]
    .map(item => String(item || '').trim())
    .filter(Boolean);
  return Array.from(new Set(values));
}

function mergeProfile(base = {}, patch = {}) {
  const next = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    if (Array.isArray(value)) {
      next[key] = mergeUniqueArray(base[key], value);
      continue;
    }
    if (isObject(value) && isObject(base[key])) {
      next[key] = mergeProfile(base[key], value);
      continue;
    }
    next[key] = value;
  }
  return next;
}

async function readJson(filePath, fallback) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function getStorageRoot(configPath) {
  return path.join(path.dirname(configPath), 'data');
}

function createSessionId({ workspaceRoot, sessionName }) {
  const workspacePart = workspaceRoot ? slugify(path.basename(workspaceRoot), 'workspace') : 'global';
  const sessionPart = slugify(sessionName || 'default', 'default');
  const hash = shortHash(`${workspaceRoot || 'global'}::${sessionName || 'default'}`);
  return `${workspacePart}-${sessionPart}-${hash}`;
}

export async function createMemoryStore({ configPath, workspaceRoot, sessionName }) {
  const storageRoot = getStorageRoot(configPath);
  const sessionId = createSessionId({ workspaceRoot, sessionName });
  const store = {
    storageRoot,
    memoryDir: path.join(storageRoot, 'memory'),
    sessionsDir: path.join(storageRoot, 'sessions'),
    profilePath: path.join(storageRoot, 'memory', 'profile.json'),
    durableMemoryPath: path.join(storageRoot, 'memory', 'durable-memories.json'),
    sessionPath: path.join(storageRoot, 'sessions', `${sessionId}.json`),
    sessionId,
    sessionName: sessionName || 'default',
    workspaceRoot: workspaceRoot || null
  };

  await mkdir(store.memoryDir, { recursive: true });
  await mkdir(store.sessionsDir, { recursive: true });

  return store;
}

export async function loadMemoryState(store, config) {
  const profile = await readJson(store.profilePath, {});
  const durableMemories = await readJson(store.durableMemoryPath, []);
  const session = await readJson(store.sessionPath, {
    id: store.sessionId,
    name: store.sessionName,
    workspaceRoot: store.workspaceRoot,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    totalTurns: 0,
    summary: '',
    recentMessages: []
  });

  return {
    config,
    store,
    profile,
    durableMemories,
    session
  };
}

export async function saveMemoryState(state) {
  state.session.updatedAt = new Date().toISOString();
  await writeJson(state.store.profilePath, state.profile);
  await writeJson(state.store.durableMemoryPath, state.durableMemories);
  await writeJson(state.store.sessionPath, state.session);
}

export function mergeMemoryExtraction(state, extraction, config) {
  if (extraction?.profilePatch) {
    state.profile = mergeProfile(state.profile, extraction.profilePatch);
  }

  if (Array.isArray(extraction?.durableMemories)) {
    const seen = new Set(
      state.durableMemories.map(item => `${item.category}::${item.content}`)
    );
    for (const memory of extraction.durableMemories) {
      const content = String(memory?.content || '').trim();
      const category = String(memory?.category || 'profile').trim() || 'profile';
      if (!content) {
        continue;
      }
      const key = `${category}::${content}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      state.durableMemories.push({
        id: shortHash(`${category}-${content}-${Date.now()}`),
        category,
        content,
        createdAt: new Date().toISOString()
      });
    }
  }

  const limit = config?.memory?.maxDurableMemories ?? 80;
  if (state.durableMemories.length > limit) {
    state.durableMemories = state.durableMemories.slice(-limit);
  }
}

export function appendTurnToSession(state, userMessage, assistantMessage) {
  state.session.totalTurns += 1;
  state.session.recentMessages.push(
    {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString()
    },
    {
      role: 'assistant',
      content: assistantMessage,
      timestamp: new Date().toISOString()
    }
  );
}

export function getRecentMessagesForModel(state) {
  return (state.session.recentMessages || []).map(message => ({
    role: message.role,
    content: message.content
  }));
}

export function clearMemoryState(state, options = {}) {
  if (options.profile || options.all) {
    state.profile = {};
  }
  if (options.durable || options.all) {
    state.durableMemories = [];
  }
  if (options.session || options.all) {
    state.session.summary = '';
    state.session.totalTurns = 0;
    state.session.recentMessages = [];
  }
}

export async function listSessions(storeRoot) {
  try {
    const entries = await readdir(path.join(storeRoot, 'sessions'));
    return entries
      .filter(name => name.endsWith('.json'))
      .sort();
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function clearAllSessionFiles(storeRoot) {
  await rm(path.join(storeRoot, 'sessions'), { recursive: true, force: true });
  await mkdir(path.join(storeRoot, 'sessions'), { recursive: true });
}
