const BASE_58_CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const VERSION = '01';
const ENCODED_LENGTH = 22;

function base58Encode(n) {
  const base = BigInt(BASE_58_CHARS.length);
  const result = new Array(ENCODED_LENGTH).fill(BASE_58_CHARS[0]);
  let i = ENCODED_LENGTH - 1;
  let value = n;
  while (value > 0n) {
    const rem = Number(value % base);
    result[i] = BASE_58_CHARS[rem];
    value = value / base;
    i--;
  }
  return result.join('');
}

function uuidToBigInt(uuid) {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32) throw new Error(`Invalid UUID hex length: ${hex.length}`);
  return BigInt('0x' + hex);
}

export function toTaggedId(tag, uuid) {
  const n = uuidToBigInt(uuid);
  return `${tag}_${VERSION}${base58Encode(n)}`;
}
