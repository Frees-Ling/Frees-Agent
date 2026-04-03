import { createHash } from 'node:crypto';

export function slugify(value, fallback = 'default') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return normalized || fallback;
}

export function shortHash(value) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, 8);
}
