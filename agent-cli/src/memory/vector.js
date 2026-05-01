/**
 * Vector memory index — stores and retrieves durable memories via vector similarity.
 *
 * By default uses FNV-1a n-gram bag-of-words embedding (zero-dependency).
 * When EmbeddingService is initialized with a provider (Ollama/OpenAI),
 * real neural embeddings replace the FNV-1a hash for higher quality.
 *
 * Architecture:
 *   - Hot tier: recent, high-importance memories (always in system prompt)
 *   - Warm tier: vector-indexed, retrieved by similarity query
 *   - Cold tier: archived, accessible via explicit search
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getEmbeddingService } from './embeddings.js';

const DIMENSION = 256;
const MAX_VECTOR_ITEMS = 1000;
const DEFAULT_TOP_K = 6;

// ── FNV-1a Fallback Embedding ──

function ngrams(word, min = 2, max = 4) {
  const result = new Set();
  const len = word.length;
  for (let n = min; n <= Math.min(max, len); n++) {
    for (let i = 0; i <= len - n; i++) {
      result.add(word.slice(i, i + n));
    }
  }
  return Array.from(result);
}

function hashToken(token) {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function tokenize(text) {
  const normalized = String(text || '').toLowerCase();
  const tokens = [];

  const segments = normalized.split(/([一-鿿㐀-䶿豈-﫿])/);

  let currentWord = '';
  for (const seg of segments) {
    if (!seg) continue;
    if (/[一-鿿㐀-䶿豈-﫿]/.test(seg)) {
      if (currentWord) {
        tokens.push(currentWord);
        tokens.push(...ngrams(currentWord, 2, 3));
        currentWord = '';
      }
      tokens.push(seg);
    } else {
      currentWord += seg;
    }
  }
  if (currentWord) {
    tokens.push(currentWord);
    tokens.push(...ngrams(currentWord, 2, 3));
  }

  const words = normalized
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 1);

  tokens.push(...words);

  return tokens.filter(Boolean);
}

export function embedText(text) {
  const vector = new Array(DIMENSION).fill(0);
  const tokens = tokenize(text);

  for (const token of tokens) {
    const slot = hashToken(token) % DIMENSION;
    vector[slot] += 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!norm) return vector;
  return vector.map(value => value / norm);
}

function cosineSimilarity(a, b) {
  const size = Math.min(a.length, b.length);
  let score = 0;
  for (let i = 0; i < size; i += 1) {
    score += (a[i] || 0) * (b[i] || 0);
  }
  return score;
}

// ── Persistence helpers ──

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

// ── Index loading ──

export async function loadVectorIndex(vectorPath) {
  const data = await readJson(vectorPath, { items: [] });
  return Array.isArray(data?.items) ? data : { items: [] };
}

// ── Importance Scoring ──

/**
 * Compute an importance score for a memory.
 * Factors:
 *   - recency: 0-1, how recently updated (within 30 days)
 *   - frequency: 0-1, how often accessed (based on accessCount)
 *   - category bonus: certain categories are inherently more important
 */
function computeImportance(memory) {
  let score = 0.5; // baseline

  // Recency (up to +0.3)
  if (memory.updatedAt) {
    const age = Date.now() - new Date(memory.updatedAt).getTime();
    const daysOld = age / (1000 * 60 * 60 * 24);
    score += Math.max(0, 0.3 - (daysOld / 30) * 0.3); // decays over 30 days
  }

  // Frequency (up to +0.2)
  const accessCount = memory.accessCount || 0;
  score += Math.min(0.2, accessCount * 0.02);

  // Category importance
  const categoryBonuses = {
    goal: 0.15,
    preference: 0.1,
    constraint: 0.1,
    project: 0.1,
    workflow: 0.05,
    tech: 0.05,
  };
  score += categoryBonuses[memory.category] || 0;

  return Math.min(1, Math.max(0, score));
}

// ── Memory Tiers ──

export const MEMORY_TIERS = {
  HOT: 'hot',
  WARM: 'warm',
  COLD: 'cold',
};

const TIER_THRESHOLDS = {
  hot: 0.7,   // importance >= 0.7 → hot
  warm: 0.35, // importance >= 0.35 → warm
  cold: 0,    // below 0.35 → cold
};

function classifyTier(importance) {
  if (importance >= TIER_THRESHOLDS.hot) return MEMORY_TIERS.HOT;
  if (importance >= TIER_THRESHOLDS.warm) return MEMORY_TIERS.WARM;
  return MEMORY_TIERS.COLD;
}

// ── Update token from text using EmbeddingService or FNV fallback ──

async function computeVector(text) {
  try {
    const service = getEmbeddingService();
    if (service) return await service.embed(text);
  } catch { /* fall through */ }
  return embedText(text);
}

// ── Upsert ──

/**
 * Rebuild the vector index from durable memories.
 * Each item gets: id, category, content, vector, importance, tier, accessCount, updatedAt
 */
export async function upsertDurableMemoriesToVectorIndex(vectorPath, durableMemories = []) {
  const index = await loadVectorIndex(vectorPath);
  const existing = new Map(index.items.map(item => [item.id, item]));
  const nextItems = [];

  for (const memory of durableMemories) {
    const id = String(memory?.id || '').trim();
    const content = String(memory?.content || '').trim();
    const category = String(memory?.category || 'other').trim();
    if (!id || !content) continue;

    const prev = existing.get(id);
    const isSameContent = prev && prev.content === content;

    if (isSameContent) {
      // Bump access count and recalculate importance
      prev.accessCount = (prev.accessCount || 0) + 1;
      prev.importance = computeImportance(prev);
      prev.tier = classifyTier(prev.importance);
      nextItems.push(prev);
      continue;
    }

    const vector = await computeVector(`${category}: ${content}`);

    const item = {
      id,
      category,
      content,
      vector,
      importance: computeImportance({ category, updatedAt: new Date().toISOString() }),
      accessCount: prev ? (prev.accessCount || 0) + 1 : 1,
      tier: MEMORY_TIERS.WARM, // new items start as warm
      updatedAt: new Date().toISOString(),
    };

    nextItems.push(item);
  }

  // Sort by importance descending, keep top N
  nextItems.sort((a, b) => (b.importance || 0) - (a.importance || 0));
  if (nextItems.length > MAX_VECTOR_ITEMS) {
    nextItems.length = MAX_VECTOR_ITEMS;
  }

  await writeJson(vectorPath, { items: nextItems });
}

// ── Query ──

/**
 * Query the vector index by semantic similarity + tier filtering.
 *
 * @param {string} vectorPath - path to vector-index.json
 * @param {string} query - search text
 * @param {object} [options]
 * @param {number} [options.topK=6] - max results
 * @param {number} [options.minScore=0.06] - minimum similarity threshold
 * @param {string[]} [options.tiers] - which tiers to include (default: ['hot', 'warm'])
 * @param {string} [options.category] - filter by category
 * @returns {Promise<Array>} scored memory items
 */
export async function queryVectorMemories(vectorPath, query, options = {}) {
  const source = String(query || '').trim();
  if (!source) return [];

  const {
    topK = DEFAULT_TOP_K,
    minScore = 0.06,
    tiers = ['hot', 'warm'],
    category,
  } = typeof options === 'number' ? { topK: options } : options;

  const index = await loadVectorIndex(vectorPath);
  if (!index.items.length) return [];

  const queryVector = await computeVector(source);

  const scored = [];

  for (const item of index.items) {
    // Tier filter
    if (tiers && !tiers.includes(item.tier || 'warm')) continue;

    // Category filter
    if (category && item.category !== category) continue;

    const vec = item.vector || [];
    const simScore = cosineSimilarity(queryVector, vec);

    // Boost score slightly for high-importance items
    const importance = item.importance || 0.5;
    const boostedScore = simScore * (0.8 + 0.2 * importance);

    if (boostedScore > minScore) {
      scored.push({
        id: item.id,
        category: item.category,
        content: item.content,
        score: Number(boostedScore.toFixed(4)),
        similarity: Number(simScore.toFixed(4)),
        importance: Number(importance.toFixed(3)),
        tier: item.tier || 'warm',
        updatedAt: item.updatedAt,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

// ── Tier utilities ──

/**
 * Get all memories in the hot tier (high importance).
 */
export async function getHotMemories(vectorPath) {
  const index = await loadVectorIndex(vectorPath);
  return index.items
    .filter(item => item.tier === MEMORY_TIERS.HOT)
    .map(item => ({
      id: item.id,
      category: item.category,
      content: item.content,
      importance: item.importance,
      updatedAt: item.updatedAt,
    }));
}

/**
 * Promote/demote a specific memory to a different tier.
 */
export async function setMemoryTier(vectorPath, memoryId, tier) {
  if (!Object.values(MEMORY_TIERS).includes(tier)) return null;
  const index = await loadVectorIndex(vectorPath);
  const item = index.items.find(i => i.id === memoryId);
  if (!item) return null;
  item.tier = tier;
  await writeJson(vectorPath, index);
  return item;
}

/**
 * Age all memories: decay importance and reclassify tiers.
 * Called periodically to prevent stagnation.
 */
export async function ageMemories(vectorPath) {
  const index = await loadVectorIndex(vectorPath);
  if (!index.items.length) return;

  for (const item of index.items) {
    // Decay access count
    item.accessCount = Math.max(0, (item.accessCount || 0) - 1);

    // Decay importance
    item.importance = computeImportance(item);
    item.tier = classifyTier(item.importance);
  }

  await writeJson(vectorPath, index);
}
