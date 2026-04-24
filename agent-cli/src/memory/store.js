import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isLikelyValidName, sanitizeProfilePatch } from './heuristics.js';
import { normalizeDurableMemories, routeMemoryExtraction } from './ingest.js';
import { loadTaskMemory, mergeTasks } from './tasks.js';
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

function sanitizeDurableMemories(memories = []) {
  return normalizeDurableMemories(memories).filter(memory => {
    const category = String(memory?.category || '').trim();
    const content = String(memory?.content || '').trim();
    if (!content) {
      return false;
    }

    if (category !== 'profile') {
      return true;
    }

    const match = content.match(/用户的名字是\s+(.+?)[。.!！]?$/);
    if (!match?.[1]) {
      return true;
    }

    return isLikelyValidName(match[1]);
  });
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
    vectorMemoryPath: path.join(storageRoot, 'memory', 'vector-memories.json'),
    taskMemoryPath: path.join(storageRoot, 'memory', 'task-memory.json'),
    sessionPath: path.join(storageRoot, 'sessions', `${sessionId}.json`),
    sessionId,
    sessionName: sessionName || 'default',
    workspaceRoot: workspaceRoot || null
  };

  await mkdir(store.memoryDir, { recursive: true });
  await mkdir(store.sessionsDir, { recursive: true });

  return store;
}

function resolveSyncRoots(store, config) {
  const roots = [store.storageRoot];
  if (config?.memory?.autoMergeAcrossDevices !== false) {
    for (const value of config?.memory?.syncRoots || []) {
      const candidate = path.resolve(String(value || '').trim());
      if (candidate && !roots.includes(candidate)) {
        roots.push(candidate);
      }
    }
  }
  return roots;
}

function mergeSessions(base, patch) {
  const nextBase = base || {};
  if (!patch) {
    return nextBase;
  }
  const mergedMessages = [...(nextBase.recentMessages || []), ...(patch.recentMessages || [])];
  const deduped = [];
  const seen = new Set();
  for (const message of mergedMessages) {
    const key = `${message?.role}::${message?.timestamp}::${message?.content}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(message);
    }
  }
  deduped.sort((left, right) =>
    String(left?.timestamp || '').localeCompare(String(right?.timestamp || ''))
  );

  return {
    ...nextBase,
    ...patch,
    summary: [nextBase.summary, patch.summary].filter(Boolean).join('\n\n').trim(),
    totalTurns: Math.max(nextBase.totalTurns || 0, patch.totalTurns || 0),
    recentMessages: deduped
  };
}

export async function loadMemoryState(store, config) {
  let profile = {};
  let durableMemories = [];
  let session = {
    id: store.sessionId,
    name: store.sessionName,
    workspaceRoot: store.workspaceRoot,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    totalTurns: 0,
    summary: '',
    recentMessages: []
  };
  let tasks = [];

  for (const root of resolveSyncRoots(store, config)) {
    const sourceProfile = sanitizeProfilePatch(
      await readJson(path.join(root, 'memory', 'profile.json'), {})
    );
    profile = mergeProfile(profile, sourceProfile);

    const sourceDurable = sanitizeDurableMemories(
      await readJson(path.join(root, 'memory', 'durable-memories.json'), [])
    );
    durableMemories = sanitizeDurableMemories([...durableMemories, ...sourceDurable]);

    const sourceSession = await readJson(
      path.join(root, 'sessions', `${store.sessionId}.json`),
      null
    );
    session = mergeSessions(session, sourceSession);

    const sourceTask = await loadTaskMemory(path.join(root, 'memory', 'task-memory.json'));
    tasks = mergeTasks(tasks, sourceTask.tasks || []);
  }

  return {
    config,
    store,
    profile,
    durableMemories,
    session,
    tasks,
    semanticMemories: []
  };
}

export async function saveMemoryState(state) {
  state.session.updatedAt = new Date().toISOString();
  state.profile = sanitizeProfilePatch(state.profile);
  state.durableMemories = sanitizeDurableMemories(state.durableMemories);
  const roots = resolveSyncRoots(state.store, state.config);
  const writeRoots =
    state.config?.memory?.syncWritesToRoots === true ? roots : [state.store.storageRoot];

  for (const root of writeRoots) {
    await writeJson(path.join(root, 'memory', 'profile.json'), state.profile);
    await writeJson(path.join(root, 'memory', 'durable-memories.json'), state.durableMemories);
    await writeJson(path.join(root, 'sessions', `${state.store.sessionId}.json`), state.session);
  }
}

export function mergeMemoryExtraction(state, extraction, config) {
  const routed = routeMemoryExtraction(extraction);

  if (routed?.profilePatch) {
    state.profile = mergeProfile(state.profile, sanitizeProfilePatch(routed.profilePatch));
  }

  if (Array.isArray(routed?.durableMemories)) {
    const seen = new Set(
      state.durableMemories.map(item => `${item.category}::${item.content}`)
    );
    for (const memory of sanitizeDurableMemories(routed.durableMemories)) {
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

export async function listSessionsAcrossRoots(store, config) {
  const names = new Set();
  for (const root of resolveSyncRoots(store, config)) {
    const sessions = await listSessions(root);
    for (const name of sessions) {
      names.add(name);
    }
  }
  return Array.from(names).sort();
}

function createEmptySession(store) {
  return {
    id: store.sessionId,
    name: store.sessionName,
    workspaceRoot: store.workspaceRoot,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    totalTurns: 0,
    summary: '',
    recentMessages: []
  };
}

export async function mergeAllSessionsForStore(store, config) {
  let merged = createEmptySession(store);
  let mergedFileCount = 0;
  const roots = resolveSyncRoots(store, config);

  for (const root of roots) {
    const sessionsDir = path.join(root, 'sessions');
    let entries = [];
    try {
      entries = await readdir(sessionsDir);
    } catch (error) {
      if (!error || typeof error !== 'object' || error.code !== 'ENOENT') {
        throw error;
      }
      entries = [];
    }

    for (const entry of entries) {
      if (!entry.endsWith('.json')) {
        continue;
      }
      const filePath = path.join(sessionsDir, entry);
      const session = await readJson(filePath, null);
      if (!session) {
        continue;
      }
      merged = mergeSessions(merged, session);
      mergedFileCount += 1;
    }
  }

  if (!merged.id) {
    merged.id = store.sessionId;
  }
  if (!merged.name) {
    merged.name = store.sessionName;
  }
  if (!merged.workspaceRoot) {
    merged.workspaceRoot = store.workspaceRoot;
  }
  merged.updatedAt = new Date().toISOString();

  return {
    mergedSession: merged,
    mergedFileCount
  };
}

export async function clearAllSessionFiles(storeRoot) {
  await rm(path.join(storeRoot, 'sessions'), { recursive: true, force: true });
  await mkdir(path.join(storeRoot, 'sessions'), { recursive: true });
}
