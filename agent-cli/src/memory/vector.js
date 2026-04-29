import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DIMENSION = 256;

/**
 * Generate n-grams from a token for better partial matching.
 * E.g., "javascript" → "jav", "ava", "vas", "asc", "scr", "cri", "rip", "ipt"
 */
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

/**
 * Tokenize text for embedding.
 * CJK-aware: preserves individual CJK characters as tokens.
 * Generates n-grams for better partial matching.
 */
function tokenize(text) {
  const normalized = String(text || '').toLowerCase();
  const tokens = [];

  // Split into CJK and non-CJK segments
  const segments = normalized.split(/([一-鿿㐀-䶿豈-﫿])/);

  let currentWord = '';
  for (const seg of segments) {
    if (!seg) continue;
    if (/[一-鿿㐀-䶿豈-﫿]/.test(seg)) {
      // CJK character - add as individual token
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

  // Also add word-level tokens for non-CJK text
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

  // Normalize to unit vector
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!norm) return vector;
  return vector.map(value => value / norm);
}

function cosineSimilarity(left, right) {
  const size = Math.min(left.length, right.length);
  let score = 0;
  for (let index = 0; index < size; index += 1) {
    score += left[index] * right[index];
  }
  return score;
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

export async function loadVectorIndex(vectorPath) {
  const data = await readJson(vectorPath, { items: [] });
  return Array.isArray(data?.items) ? data : { items: [] };
}

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
    if (prev && prev.content === content) {
      nextItems.push(prev);
      continue;
    }

    nextItems.push({
      id,
      category,
      content,
      vector: embedText(`${category}: ${content}`),
      updatedAt: new Date().toISOString(),
    });
  }

  // Keep most recent N items
  const MAX_VECTOR_ITEMS = 500;
  if (nextItems.length > MAX_VECTOR_ITEMS) {
    nextItems.splice(0, nextItems.length - MAX_VECTOR_ITEMS);
  }

  await writeJson(vectorPath, { items: nextItems });
}

export async function queryVectorMemories(vectorPath, query, topK = 6) {
  const source = String(query || '').trim();
  if (!source) return [];

  const index = await loadVectorIndex(vectorPath);
  const queryVector = embedText(source);

  const scored = index.items
    .map(item => ({
      ...item,
      score: cosineSimilarity(queryVector, item.vector || []),
    }))
    .filter(item => item.score > 0.06)
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);

  return scored.map(item => ({
    id: item.id,
    category: item.category,
    content: item.content,
    score: Number(item.score.toFixed(4)),
    updatedAt: item.updatedAt,
  }));
}
