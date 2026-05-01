/**
 * Embedding Service — abstraction over multiple embedding providers.
 *
 * Supports:
 *  - Ollama /api/embeddings (nomic-embed-text, bge-m3, mxbai-embed-large, etc.)
 *  - OpenAI text-embedding-3-small / text-embedding-3-large
 *  - FNV-1a hash fallback (zero-dependency, from vector.js)
 *
 * Provider selection:
 *   config.memory.embeddings.provider = 'ollama' | 'openai' | 'fnv' (default: 'fnv')
 *
 * LRU cache avoids redundant API calls for identical text.
 */

import { embedText as fnvEmbed } from './vector.js';

// ── LRU Cache ──

class LRUCache {
  constructor(maxSize = 500) {
    this.maxSize = maxSize;
    this._map = new Map();
  }

  get(key) {
    if (!this._map.has(key)) return undefined;
    const value = this._map.get(key);
    // Move to end (most recently used)
    this._map.delete(key);
    this._map.set(key, value);
    return value;
  }

  set(key, value) {
    if (this._map.has(key)) {
      this._map.delete(key);
    } else if (this._map.size >= this.maxSize) {
      // Evict least recently used (first item)
      const firstKey = this._map.keys().next().value;
      this._map.delete(firstKey);
    }
    this._map.set(key, value);
  }

  clear() { this._map.clear(); }
  get size() { return this._map.size; }
}

// ── Embedding Provider Implementations ──

async function ollamaEmbed(texts, config = {}) {
  const baseUrl = (config?.ollama?.baseUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const model = config?.ollama?.embeddingModel || 'nomic-embed-text';
  const results = [];

  // Ollama supports batch; send texts one by one for simplicity & reliability
  for (const text of texts) {
    const resp = await fetch(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) throw new Error(`Ollama embedding error: ${resp.status} ${resp.statusText}`);
    const data = await resp.json();
    results.push(data.embedding || []);
  }
  return results;
}

async function openaiEmbed(texts, config = {}) {
  const apiKey = config?.openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI embedding requires apiKey config or OPENAI_API_KEY env');

  const baseUrl = (config?.openai?.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = config?.openai?.embeddingModel || 'text-embedding-3-small';

  const resp = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: texts }),
    signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) throw new Error(`OpenAI embedding error: ${resp.status} ${resp.statusText}`);
  const data = await resp.json();
  // Return embeddings in the same order as input texts
  if (!Array.isArray(data.data)) throw new Error('OpenAI embedding: unexpected response format');
  const sorted = data.data.sort((a, b) => a.index - b.index);
  return sorted.map(item => item.embedding);
}

function normalizeVector(vec) {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (!norm || !isFinite(norm)) return vec;
  return vec.map(v => v / norm);
}

// ── Main Embedding Service ──

export class EmbeddingService {
  constructor(config = {}) {
    this.config = config;
    this.cache = new LRUCache(config?.cacheSize || 500);
    this._provider = null;
    this._providerName = null;
    this._dimension = null;
  }

  /** Return the provider name string for debugging. */
  get provider() { return this._providerName || 'fnv'; }

  /** Return the embedding dimension, inferred from first successful embed. */
  get dimension() { return this._dimension || 256; }

  /**
   * Select and warm up an embedding provider.
   * Tries configured provider → detects available → falls back to FNV.
   */
  async initialize(embedConfig = {}) {
    const preferred = embedConfig.provider || 'fnv';

    if (preferred === 'ollama') {
      try {
        const test = await ollamaEmbed(['test'], this.config);
        if (test?.[0]?.length > 0) {
          this._provider = (texts) => ollamaEmbed(texts, this.config);
          this._providerName = 'ollama';
          this._dimension = test[0].length;
          return;
        }
      } catch {
        // Fall through
      }
    }

    if (preferred === 'openai') {
      try {
        const test = await openaiEmbed(['test'], this.config);
        if (test?.[0]?.length > 0) {
          this._provider = (texts) => openaiEmbed(texts, this.config);
          this._providerName = 'openai';
          this._dimension = test[0].length;
          return;
        }
      } catch {
        // Fall through
      }
    }

    // Auto-detect: try Ollama first, then OpenAI, then FNV fallback
    if (preferred === 'auto' || preferred === 'fnv') {
      if (!preferred === 'fnv') {
        try {
          const test = await ollamaEmbed(['test'], this.config);
          if (test?.[0]?.length > 0) {
            this._provider = (texts) => ollamaEmbed(texts, this.config);
            this._providerName = 'ollama';
            this._dimension = test[0].length;
            return;
          }
        } catch { /* fall through */ }

        try {
          const test = await openaiEmbed(['test'], this.config);
          if (test?.[0]?.length > 0) {
            this._provider = (texts) => openaiEmbed(texts, this.config);
            this._providerName = 'openai';
            this._dimension = test[0].length;
            return;
          }
        } catch { /* fall through */ }
      }

      // FNV fallback
      this._provider = null;
      this._providerName = 'fnv';
      this._dimension = 256;
    }
  }

  /**
   * Embed a single text string.
   * Returns a normalized vector (array of numbers).
   */
  async embed(text) {
    const normalized = String(text || '').trim();
    if (!normalized) return new Array(this.dimension).fill(0);

    // Check cache
    const cached = this.cache.get(normalized);
    if (cached) return cached;

    let vector;
    if (this._provider) {
      try {
        const results = await this._provider([normalized]);
        vector = results[0];
      } catch {
        vector = fnvEmbed(normalized);
      }
    } else {
      vector = fnvEmbed(normalized);
    }

    const normalizedVec = normalizeVector(vector);
    this.cache.set(normalized, normalizedVec);
    return normalizedVec;
  }

  /**
   * Embed multiple texts in batch (more efficient for API providers).
   */
  async embedBatch(texts) {
    const normalized = texts.map(t => String(t || '').trim()).filter(Boolean);
    if (!normalized.length) return [];

    // Check cache for each
    const uncached = [];
    const cachedResults = [];
    for (const text of normalized) {
      const cached = this.cache.get(text);
      if (cached) {
        cachedResults.push(cached);
      } else {
        uncached.push(text);
        cachedResults.push(null); // placeholder
      }
    }

    // Embed uncached texts
    if (uncached.length > 0 && this._provider) {
      try {
        const vectors = await this._provider(uncached);
        for (let i = 0; i < normalized.length; i++) {
          if (cachedResults[i] === null) {
            const vi = uncached.indexOf(normalized[i]);
            if (vi >= 0 && vi < vectors.length) {
              const vec = normalizeVector(vectors[vi]);
              cachedResults[i] = vec;
              this.cache.set(normalized[i], vec);
            }
          }
        }
      } catch {
        // Fall back to FNV for all uncached
        for (let i = 0; i < normalized.length; i++) {
          if (cachedResults[i] === null) {
            const vec = normalizeVector(fnvEmbed(normalized[i]));
            cachedResults[i] = vec;
            this.cache.set(normalized[i], vec);
          }
        }
      }
    } else {
      // FNV for all uncached
      for (let i = 0; i < normalized.length; i++) {
        if (cachedResults[i] === null) {
          const vec = normalizeVector(fnvEmbed(normalized[i]));
          cachedResults[i] = vec;
          this.cache.set(normalized[i], vec);
        }
      }
    }

    return cachedResults;
  }

  /** Compute cosine similarity between two vectors. */
  cosineSimilarity(a, b) {
    const size = Math.min(a.length, b.length);
    let dot = 0;
    for (let i = 0; i < size; i++) dot += (a[i] || 0) * (b[i] || 0);
    return dot;
  }

  /** Clear the LRU cache. */
  clearCache() { this.cache.clear(); }
}

// ── Singleton helper ──

let _instance = null;

export function getEmbeddingService(config) {
  if (!_instance) {
    _instance = new EmbeddingService(config);
  }
  return _instance;
}

export async function initializeEmbeddings(config) {
  const service = getEmbeddingService(config);
  await service.initialize(config?.memory?.embeddings || {});
  return service;
}
