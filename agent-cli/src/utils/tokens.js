export function estimateTokens(text = '') {
  const value = String(text || '');
  if (!value) {
    return 0;
  }
  const cjkChars = (value.match(/[\u3400-\u9fff]/g) || []).length;
  const latinChars = Math.max(0, value.length - cjkChars);
  const cjkTokens = Math.ceil(cjkChars / 1.6);
  const latinTokens = Math.ceil(latinChars / 4);
  return cjkTokens + latinTokens;
}

export function estimateMessagesTokens(messages = []) {
  return (messages || []).reduce((total, message) => {
    const roleOverhead = 6;
    return total + roleOverhead + estimateTokens(message?.content || '');
  }, 0);
}
