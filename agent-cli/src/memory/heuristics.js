function cleanCapture(value) {
  return String(value || '')
    .trim()
    .replace(/[。！!？，,\s]+$/g, '')
    .trim();
}

function normalizeNameCandidate(value) {
  return cleanCapture(value)
    .replace(/^["“”'‘’]+/g, '')
    .replace(/["“”'‘’]+$/g, '')
    .trim();
}

function isNameQuestion(message) {
  const text = String(message || '').trim().toLowerCase();
  if (!text) {
    return false;
  }

  return [
    /^(我叫什么名字)[?？]?$/,
    /^(你知道我叫什么名字吗)[?？]?$/,
    /^(你记得我叫什么吗)[?？]?$/,
    /^(你知道我是谁吗)[?？]?$/,
    /^(你记得我是谁吗)[?？]?$/,
    /^(who am i)[?？]?$/,
    /^(what is my name)[?？]?$/,
    /^(do you know who i am)[?？]?$/
  ].some(pattern => pattern.test(text));
}

export function isLikelyValidName(value) {
  const text = normalizeNameCandidate(value);
  if (!text || text.length > 40) {
    return false;
  }

  if (/[?？]/.test(text)) {
    return false;
  }

  if (
    /(什么|谁|啥|哪位|名字|姓名|吗|么|呢|是谁|叫啥|很高兴认识你|请多关照|谢谢|你好)/i.test(
      text
    )
  ) {
    return false;
  }

  return /^[A-Za-z\u4e00-\u9fa5·'\-]+(?:\s+[A-Za-z\u4e00-\u9fa5·'\-]+){0,3}$/.test(text);
}

export function sanitizeProfilePatch(profile = {}) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return {};
  }

  const next = { ...profile };
  if ('name' in next) {
    const normalizedName = normalizeNameCandidate(next.name);
    if (isLikelyValidName(normalizedName)) {
      next.name = normalizedName;
    } else {
      delete next.name;
    }
  }
  return next;
}

function tryMatchName(userMessage) {
  if (isNameQuestion(userMessage)) {
    return '';
  }

  const patterns = [
    /我叫\s*["“]?(.{1,40}?)["”]?(?=\s*(?:[，,。.!！；;]|$|很高兴认识你|请多关照))/i,
    /我的名字是\s*["“]?(.{1,40}?)["”]?(?=\s*(?:[，,。.!！；;]|$|很高兴认识你|请多关照))/i,
    /你可以叫我\s*["“]?(.{1,40}?)["”]?(?=\s*(?:[，,。.!！；;]|$|很高兴认识你|请多关照))/i,
    /my name is\s+["“]?(.{1,40}?)["”]?(?=\s*(?:[,.!?]|$))/i,
    /call me\s+["“]?(.{1,40}?)["”]?(?=\s*(?:[,.!?]|$))/i
  ];

  for (const pattern of patterns) {
    const match = userMessage.match(pattern);
    if (match?.[1]) {
      const candidate = normalizeNameCandidate(match[1]);
      if (isLikelyValidName(candidate)) {
        return candidate;
      }
    }
  }
  return '';
}

function tryMatchGoal(userMessage) {
  const patterns = [
    /我希望(.{1,80}?)(?:。|！|!|\?|？|$)/,
    /我想要(.{1,80}?)(?:。|！|!|\?|？|$)/,
    /i want to\s+(.{1,80}?)(?:\.|!|\?|$)/i
  ];

  for (const pattern of patterns) {
    const match = userMessage.match(pattern);
    if (match?.[1]) {
      return cleanCapture(match[1]);
    }
  }
  return '';
}

function tryMatchPreference(userMessage) {
  const patterns = [
    /我喜欢(.{1,80}?)(?:。|！|!|\?|？|$)/,
    /我偏好(.{1,80}?)(?:。|！|!|\?|？|$)/,
    /i prefer\s+(.{1,80}?)(?:\.|!|\?|$)/i
  ];

  for (const pattern of patterns) {
    const match = userMessage.match(pattern);
    if (match?.[1]) {
      return cleanCapture(match[1]);
    }
  }
  return '';
}

export function inferLocalMemory(userMessage) {
  const profilePatch = {};
  const durableMemories = [];

  const name = tryMatchName(userMessage);
  if (name) {
    profilePatch.name = name;
    durableMemories.push({
      category: 'profile',
      content: `用户的名字是 ${name}。`
    });
  }

  const goal = tryMatchGoal(userMessage);
  if (goal) {
    profilePatch.goals = [goal];
    durableMemories.push({
      category: 'goal',
      content: `用户当前目标是：${goal}`
    });
  }

  const preference = tryMatchPreference(userMessage);
  if (preference) {
    profilePatch.preferences = [preference];
    durableMemories.push({
      category: 'preference',
      content: `用户偏好：${preference}`
    });
  }

  return { profilePatch, durableMemories };
}

export function resolveLocalChatShortcut(message, state) {
  const text = String(message || '').trim();
  const lower = text.toLowerCase();
  const introducedName = tryMatchName(text);

  if (introducedName) {
    return `你好，${introducedName}。很高兴认识你，我已经记住你的名字了。`;
  }

  if (['hi', 'hello', '你好', '您好', '嗨'].includes(lower)) {
    const name = state?.profile?.name;
    return name
      ? `你好，${name}。我是 Frees Agent。有什么我可以直接帮你处理的？`
      : '你好，我是 Frees Agent。有什么我可以直接帮你处理的？';
  }

  if (
    /^(我叫什么名字|你知道我叫什么名字吗|你记得我叫什么吗|你知道我是谁吗|你记得我是谁吗|who am i|what is my name|do you know who i am)\??$/i.test(
      text
    )
  ) {
    const name = state?.profile?.name;
    return name
      ? `你叫 ${name}。`
      : '我还没有记住你的名字，你可以直接告诉我“我叫 XXX”。';
  }

  return '';
}
