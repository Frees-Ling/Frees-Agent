export function partiallySanitizeUnicode(prompt) {
  let current = prompt;
  let previous = '';
  let iterations = 0;
  const MAX_ITERATIONS = 10;

  while (current !== previous && iterations < MAX_ITERATIONS) {
    previous = current;
    current = current.normalize('NFKC');
    current = current.replace(/[\p{Cf}\p{Co}\p{Cn}]/gu, '');
    current = current
      .replace(/[​-‏]/g, '')
      .replace(/[‪-‮]/g, '')
      .replace(/[⁦-⁩]/g, '')
      .replace(/[﻿]/g, '')
      .replace(/[-]/g, '');
    iterations++;
  }

  if (iterations >= MAX_ITERATIONS) {
    throw new Error(
      `Unicode sanitization reached max iterations (${MAX_ITERATIONS}) for input: ${prompt.slice(0, 100)}`
    );
  }

  return current;
}

export function recursivelySanitizeUnicode(value) {
  if (typeof value === 'string') return partiallySanitizeUnicode(value);
  if (Array.isArray(value)) return value.map(recursivelySanitizeUnicode);
  if (value !== null && typeof value === 'object') {
    const sanitized = {};
    for (const [key, val] of Object.entries(value)) {
      sanitized[recursivelySanitizeUnicode(key)] = recursivelySanitizeUnicode(val);
    }
    return sanitized;
  }
  return value;
}
