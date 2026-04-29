import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isLikelyValidName, sanitizeProfilePatch } from './heuristics.js';
import { normalizeDurableMemories, routeMemoryExtraction } from './ingest.js';
import { loadTaskMemory, mergeTasks } from './tasks.js';
import { shortHash, slugify } from '../utils/slug.js';

const MEMORY_VERSION = 2;

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
    if (value === undefined || value === null || value === '') continue;
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

const MAX_DURABLE_MEMORIES = 200;
const MAX_DURABLE_MEMORIES_PER_CATEGORY = 60;

function sanitizeDurableMemories(memories = []) {
  const clean = normalizeDurableMemories(memories).filter(memory => {
    const content = String(memory?.content || '').trim();
    if (!content) return false;
    if (memory.category !== 'profile') return true;
    const match = content.match(/用户的名字是\s+(.+?)[。.!！]?$/);
    if (!match?.[1]) return true;
    return isLikelyValidName(match[1]);
  });

  // Compact similar memories
  const compacted = compactSimilarMemories(clean);

  // Enforce limits per category
  const byCategory = {};
  for (const mem of compacted) {
    const cat = mem.category || 'other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(mem);
  }

  const result = [];
  for (const [cat, items] of Object.entries(byCategory)) {
    // Keep newest items within per-category limit
    const sorted = items.sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
    result.push(...sorted.slice(0, MAX_DURABLE_MEMORIES_PER_CATEGORY));
  }

  // Enforce global limit
  return result.slice(0, MAX_DURABLE_MEMORIES);
}

/**
 * Merge similar durable memories to avoid redundancy.
 * Two memories are "similar" if they share the same category and
 * have high content overlap.
 */
function compactSimilarMemories(memories) {
  if (memories.length <= 1) return memories;

  const groups = {};
  for (const mem of memories) {
    const key = mem.category || 'other';
    if (!groups[key]) groups[key] = [];
    groups[key].push(mem);
  }

  const result = [];
  for (const [, group] of Object.entries(groups)) {
    if (group.length <= 3) {
      result.push(...group);
      continue;
    }

    // For large groups, keep the most distinct ones
    const sorted = group.sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });

    const kept = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      const currentNorm = normalizeText(current.content);

      // Check if current memory is sufficiently different from kept ones
      const isDuplicate = kept.some(k => {
        const kNorm = normalizeText(k.content);
        return wordsOverlap(currentNorm, kNorm) > 0.7;
      });

      if (!isDuplicate) {
        kept.push(current);
      }
    }

    result.push(...kept);
  }

  return result;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function wordsOverlap(a, b) {
  const wordsA = new Set(a.split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.split(/\s+/).filter(Boolean));
  if (!wordsA.size || !wordsB.size) return 0;
  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  return intersection.size / Math.max(wordsA.size, wordsB.size);
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return fallback;
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

function emptySession(store) {
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

// ─── Old file paths (for migration) ───

function oldMemoryPaths(storageRoot) {
  return {
    profilePath: path.join(storageRoot, 'memory', 'profile.json'),
    durablePath: path.join(storageRoot, 'memory', 'durable-memories.json'),
    taskPath: path.join(storageRoot, 'memory', 'task-memory.json'),
    sessionsDir: path.join(storageRoot, 'sessions')
  };
}

async function tryMigrateFromOldFormat(memoryPath, storageRoot) {
  const old = oldMemoryPaths(storageRoot);
  const [oldProfile, oldDurable, oldTask] = await Promise.all([
    readJson(old.profilePath, null),
    readJson(old.durablePath, null),
    readJson(old.taskPath, null)
  ]);
  if (!oldProfile && !oldDurable && !oldTask) return null;

  // Try loading sessions
  let oldSession = null;
  try {
    const entries = await readdir(old.sessionsDir).catch(() => []);
    for (const entry of entries.filter(e => e.endsWith('.json'))) {
      const s = await readJson(path.join(old.sessionsDir, entry), null);
      if (s) oldSession = mergeSessions(oldSession, s);
    }
  } catch { /* ignore */ }

  const memory = {
    version: MEMORY_VERSION,
    profile: sanitizeProfilePatch(oldProfile || {}),
    durableMemories: sanitizeDurableMemories(oldDurable || []),
    tasks: (oldTask?.tasks || []).slice(0, 120),
    conversations: {
      currentSession: oldSession || null,
      recentMessages: oldSession?.recentMessages || [],
      summary: oldSession?.summary || ''
    },
    updatedAt: new Date().toISOString()
  };

  await writeJson(memoryPath, memory);

  // Clean up old files (best-effort)
  try {
    await rm(old.profilePath, { force: true });
    await rm(old.durablePath, { force: true });
    await rm(old.taskPath, { force: true });
    await rm(old.sessionsDir, { recursive: true, force: true });
  } catch { /* ignore */ }

  return memory;
}

// ─── Store creation ───

export async function createMemoryStore({ configPath, workspaceRoot, sessionName }) {
  const storageRoot = getStorageRoot(configPath);
  const sessionId = createSessionId({ workspaceRoot, sessionName });
  const memoryDir = path.join(storageRoot, 'memory');
  const memoryPath = path.join(memoryDir, 'memory.json');

  await mkdir(memoryDir, { recursive: true });

  return {
    storageRoot,
    memoryPath,
    vectorMemoryPath: path.join(memoryDir, 'vector-index.json'),
    taskMemoryPath: path.join(memoryDir, 'tasks.json'),
    sessionId,
    sessionName: sessionName || 'default',
    workspaceRoot: workspaceRoot || null
  };
}

// ─── Cross-device sync roots ───

function resolveSyncRoots(store, config) {
  const roots = [store.storageRoot];
  if (config?.memory?.autoMergeAcrossDevices !== false) {
    for (const value of config?.memory?.syncRoots || []) {
      const candidate = path.resolve(String(value || '').trim());
      if (candidate && !roots.includes(candidate)) roots.push(candidate);
    }
  }
  return roots;
}

function memoryFilePath(root) {
  return path.join(root, 'memory', 'memory.json');
}

// ─── Merge helpers ───

function mergeSessions(base, patch) {
  if (!patch) return base || null;
  const next = base ? { ...base } : {};
  return {
    ...next,
    ...patch,
    summary: [next.summary, patch.summary].filter(Boolean).join('\n\n').trim(),
    totalTurns: Math.max(next.totalTurns || 0, patch.totalTurns || 0),
    recentMessages: sanitizeSessionMessages([
      ...(next.recentMessages || []),
      ...(patch.recentMessages || [])
    ])
  };
}

function sanitizeSessionMessages(messages = []) {
  const deduped = [];
  const seen = new Set();
  for (const message of messages || []) {
    const role = String(message?.role || '').trim();
    const content = String(message?.content || '').trim();
    const timestamp = String(message?.timestamp || '').trim() || new Date().toISOString();
    if (!content) continue;
    if (role !== 'user' && role !== 'assistant') continue;
    const key = `${role}::${timestamp}::${content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ role, content, timestamp });
  }
  deduped.sort((a, b) =>
    String(a?.timestamp || '').localeCompare(String(b?.timestamp || ''))
  );
  return deduped;
}

function mergeMemoryData(base, patch) {
  return {
    version: MEMORY_VERSION,
    profile: mergeProfile(base.profile || {}, patch.profile || {}),
    durableMemories: sanitizeDurableMemories([
      ...(base.durableMemories || []),
      ...(patch.durableMemories || [])
    ]),
    tasks: mergeTasks(base.tasks || [], patch.tasks || []),
    conversations: {
      currentSession: mergeSessions(
        base.conversations?.currentSession,
        patch.conversations?.currentSession
      ),
      recentMessages: sanitizeSessionMessages([
        ...(base.conversations?.recentMessages || []),
        ...(patch.conversations?.recentMessages || [])
      ]),
      summary: [base.conversations?.summary, patch.conversations?.summary]
        .filter(Boolean).join('\n\n').trim()
    },
    updatedAt: new Date().toISOString()
  };
}

// ─── Load / Save ───

export async function loadMemoryState(store, config) {
  let memory = null;

  for (const root of resolveSyncRoots(store, config)) {
    const mp = memoryFilePath(root);
    const data = await readJson(mp, null);
    if (data) {
      memory = memory ? mergeMemoryData(memory, data) : data;
    }
  }

  // If no memory.json found, try migrating from old format
  if (!memory) {
    const primary = memoryFilePath(store.storageRoot);
    memory = await tryMigrateFromOldFormat(primary, store.storageRoot);
  }

  // Fresh state
  if (!memory) {
    memory = {
      version: MEMORY_VERSION,
      profile: {},
      durableMemories: [],
      tasks: [],
      conversations: {
        currentSession: null,
        recentMessages: [],
        summary: ''
      },
      updatedAt: new Date().toISOString()
    };
  }

  // Ensure version
  if (!memory.version) memory.version = MEMORY_VERSION;
  if (!memory.profile) memory.profile = {};
  if (!Array.isArray(memory.durableMemories)) memory.durableMemories = [];
  if (!Array.isArray(memory.tasks)) memory.tasks = [];
  if (!memory.conversations) {
    memory.conversations = { currentSession: null, recentMessages: [], summary: '' };
  }
  if (!Array.isArray(memory.conversations.recentMessages)) {
    memory.conversations.recentMessages = [];
  }

  const session = memory.conversations.currentSession
    ? {
        ...emptySession(store),
        ...memory.conversations.currentSession,
        recentMessages: sanitizeSessionMessages(memory.conversations.recentMessages)
      }
    : {
        ...emptySession(store),
        recentMessages: sanitizeSessionMessages(memory.conversations.recentMessages)
      };
  session.totalTurns = Math.max(0, session.totalTurns || Math.floor(session.recentMessages.length / 2));

  return {
    config,
    store,
    memory,
    profile: sanitizeProfilePatch(memory.profile || {}),
    durableMemories: sanitizeDurableMemories(memory.durableMemories || []),
    session,
    tasks: memory.tasks || [],
    semanticMemories: []
  };
}

export async function saveMemoryState(state) {
  const now = new Date().toISOString();

  state.memory.profile = sanitizeProfilePatch(state.profile || {});
  state.memory.durableMemories = sanitizeDurableMemories(state.durableMemories || []);
  state.memory.tasks = (state.tasks || []).slice(0, 120);
  state.memory.conversations.recentMessages = sanitizeSessionMessages(
    state.session.recentMessages || []
  );
  state.memory.conversations.summary = state.session.summary || '';
  state.memory.conversations.currentSession = {
    id: state.session.id,
    name: state.session.name,
    workspaceRoot: state.session.workspaceRoot,
    createdAt: state.session.createdAt,
    updatedAt: now,
    totalTurns: Math.max(0, state.session.totalTurns || 0),
    summary: state.session.summary || ''
  };
  state.memory.updatedAt = now;

  const roots = state.config?.memory?.syncWritesToRoots === true
    ? resolveSyncRoots(state.store, state.config)
    : [state.store.storageRoot];

  for (const root of roots) {
    await writeJson(memoryFilePath(root), state.memory);
  }
}

// ─── Memory extraction ───

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
      if (!content) continue;
      const key = `${category}::${content}`;
      if (seen.has(key)) continue;
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
  const now = new Date().toISOString();
  const normalizedUser = String(userMessage || '').trim();
  const normalizedAssistant = String(assistantMessage || '').trim();

  if (normalizedUser) {
    state.session.totalTurns += 1;
    state.session.recentMessages.push({ role: 'user', content: normalizedUser, timestamp: now });
  }
  if (normalizedAssistant) {
    state.session.recentMessages.push({ role: 'assistant', content: normalizedAssistant, timestamp: now });
  }

  state.session.recentMessages = sanitizeSessionMessages(state.session.recentMessages);
}

export function getRecentMessagesForModel(state) {
  return sanitizeSessionMessages(state.session.recentMessages || []).map(m => ({
    role: m.role,
    content: m.content
  }));
}

export function clearMemoryState(state, options = {}) {
  if (options.profile || options.all) state.profile = {};
  if (options.durable || options.all) state.durableMemories = [];
  if (options.session || options.all) {
    state.session.summary = '';
    state.session.totalTurns = 0;
    state.session.recentMessages = [];
  }
}

export async function listSessions(storeRoot) {
  // In v2, sessions are embedded in memory.json — list memory files instead
  const memoryFile = path.join(storeRoot, 'memory', 'memory.json');
  try {
    const data = await readJson(memoryFile, null);
    if (data?.conversations?.currentSession) {
      return [data.conversations.currentSession];
    }
  } catch { /* ignore */ }
  return [];
}

export async function listSessionsAcrossRoots(store, config) {
  const sessions = [];
  for (const root of resolveSyncRoots(store, config)) {
    const s = await listSessions(root);
    sessions.push(...s);
  }
  return sessions;
}

export async function mergeAllSessionsForStore(store, config) {
  const state = await loadMemoryState(store, config);
  return {
    mergedSession: state.session,
    mergedFileCount: 1
  };
}

export async function clearAllSessionFiles(storeRoot) {
  const memoryFile = path.join(storeRoot, 'memory', 'memory.json');
  try {
    const data = await readJson(memoryFile, null);
    if (data) {
      data.conversations = { currentSession: null, recentMessages: [], summary: '' };
      data.updatedAt = new Date().toISOString();
      await writeJson(memoryFile, data);
    }
  } catch { /* ignore */ }
}

// ─── Enhanced Session Persistence ───

function getSessionsDir(storageRoot) {
  return path.join(storageRoot, 'sessions');
}

/**
 * Save session to a separate file for independent management.
 */
export async function saveSessionToFile(state) {
  const sessionsDir = getSessionsDir(state.store.storageRoot);
  await mkdir(sessionsDir, { recursive: true });
  const sessionFile = path.join(sessionsDir, `${state.session.id}.json`);
  await writeFile(sessionFile, JSON.stringify({
    id: state.session.id,
    name: state.session.name,
    workspaceRoot: state.session.workspaceRoot,
    createdAt: state.session.createdAt,
    updatedAt: new Date().toISOString(),
    totalTurns: state.session.totalTurns,
    summary: state.session.summary,
    recentMessages: state.session.recentMessages,
  }, null, 2) + '\n', 'utf8');
}

/**
 * Load a specific session file by ID.
 */
export async function loadSessionFromFile(storageRoot, sessionId) {
  const sessionFile = path.join(getSessionsDir(storageRoot), `${sessionId}.json`);
  try {
    return JSON.parse(await readFile(sessionFile, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * List all session files in the sessions directory.
 */
export async function listAllSessionFiles(storageRoot) {
  const sessionsDir = getSessionsDir(storageRoot);
  try {
    const entries = await readdir(sessionsDir);
    const sessions = [];
    for (const entry of entries.filter(e => e.endsWith('.json'))) {
      try {
        const data = JSON.parse(await readFile(path.join(sessionsDir, entry), 'utf8'));
        sessions.push({
          id: data.id,
          name: data.name,
          totalTurns: data.totalTurns,
          updatedAt: data.updatedAt,
          summary: (data.summary || '').slice(0, 80),
        });
      } catch { /* skip corrupt files */ }
    }
    sessions.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return sessions;
  } catch {
    return [];
  }
}

/**
 * Auto-generate a session name from the first user message.
 */
export function autoNameSession(firstMessage, existingNames = []) {
  const clean = String(firstMessage || '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .slice(0, 40);
  if (!clean) return `session-${Date.now()}`;
  const slug = clean.toLowerCase().replace(/\s+/g, '-');
  if (!existingNames.includes(slug)) return slug;
  let suffix = 1;
  while (existingNames.includes(`${slug}-${suffix}`)) suffix++;
  return `${slug}-${suffix}`;
}
