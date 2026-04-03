function cleanCapture(value) {
  return String(value || '')
    .trim()
    .replace(/[。！!？，,\s]+$/g, '')
    .trim();
}

function tryMatchName(userMessage) {
  const patterns = [
    /我叫\s*([A-Za-z\u4e00-\u9fa5·\s-]{1,40})/i,
    /我的名字是\s*([A-Za-z\u4e00-\u9fa5·\s-]{1,40})/i,
    /你可以叫我\s*([A-Za-z\u4e00-\u9fa5·\s-]{1,40})/i,
    /my name is\s+([A-Za-z][A-Za-z\s'-]{0,40})/i,
    /call me\s+([A-Za-z][A-Za-z\s'-]{0,40})/i
  ];

  for (const pattern of patterns) {
    const match = userMessage.match(pattern);
    if (match?.[1]) {
      return cleanCapture(match[1]);
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

  if (['hi', 'hello', '你好', '您好', '嗨'].includes(lower)) {
    const name = state?.profile?.name;
    return name
      ? `你好，${name}。我是 Frees Agent。有什么我可以直接帮你处理的？`
      : '你好，我是 Frees Agent。有什么我可以直接帮你处理的？';
  }

  if (/^(我叫什么名字|你知道我叫什么名字吗|你记得我叫什么吗|who am i|what is my name)\??$/i.test(text)) {
    const name = state?.profile?.name;
    return name ? `你叫 ${name}。` : '我还没有记住你的名字，你可以直接告诉我“我叫 XXX”。';
  }

  return '';
}
