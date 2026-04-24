import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DIMENSION = 256;

function hashToken(token) {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .map(item => item.trim())
    .filter(Boolean);
}

export function embedText(text) {
  const vector = new Array(DIMENSION).fill(0);
  const tokens = tokenize(text);
  for (const token of tokens) {
    const slot = hashToken(token) % DIMENSION;
    vector[slot] += 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!norm) {
    return vector;
  }
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
    if (!id || !content) {
      continue;
    }
    const prev = existing.get(id);
    if (prev && prev.content === content) {
      nextItems.push(prev);
      continue;
    }
    nextItems.push({
      id,
      category: memory.category,
      content,
      vector: embedText(content)
    });
  }

  await writeJson(vectorPath, { items: nextItems });
}

export async function queryVectorMemories(vectorPath, query, topK = 6) {
  const source = String(query || '').trim();
  if (!source) {
    return [];
  }
  const index = await loadVectorIndex(vectorPath);
  const queryVector = embedText(source);
  return index.items
    .map(item => ({
      ...item,
      score: cosineSimilarity(queryVector, item.vector || [])
    }))
    .filter(item => item.score > 0.08)
    .sort((left, right) => right.score - left.score)
    .slice(0, topK)
    .map(item => ({
      id: item.id,
      category: item.category,
      content: item.content,
      score: Number(item.score.toFixed(4))
    }));
}
