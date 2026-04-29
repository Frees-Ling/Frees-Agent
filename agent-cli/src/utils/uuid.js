import { randomBytes } from 'node:crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateUuid(maybeUuid) {
  if (typeof maybeUuid !== 'string') return null;
  return UUID_REGEX.test(maybeUuid) ? maybeUuid : null;
}

export function createAgentId(label) {
  const suffix = randomBytes(8).toString('hex');
  return label ? `a${label}-${suffix}` : `a${suffix}`;
}
