const PROFILE_ARRAY_FIELDS = [
  'skills',
  'stack',
  'goals',
  'preferences',
  'constraints',
  'interests'
];

function normalizeText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[。！!？，,；;、\s]+$/g, '')
    .trim();
}

function canonicalKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s\-_/.:：，,。!！?？]/g, '');
}

function splitTerms(raw) {
  return String(raw || '')
    .split(/[、,，/|]/g)
    .map(part => part.trim())
    .filter(Boolean);
}

function normalizeTechName(value) {
  const text = normalizeText(value);
  const lowered = text.toLowerCase();
  const compacted = lowered.replace(/\s+/g, '');
  const mappings = [
    [/^python(?:开发|编程)?$/, 'Python'],
    [/^rust(?:开发|编程)?$/, 'Rust'],
    [/^typescript$/, 'TypeScript'],
    [/^javascript$/, 'JavaScript'],
    [/^(?:node|nodejs|node\.js)$/, 'Node.js'],
    [/^c\+\+(?:开发|编程)?$/, 'C++'],
    [/^c#(?:开发|编程)?$/, 'C#'],
    [/^golang$/, 'Go'],
    [/^postgres(?:ql)?$/, 'PostgreSQL'],
    [/^mysql$/, 'MySQL'],
    [/^mongodb$/, 'MongoDB'],
    [/^k8s$/, 'Kubernetes']
  ];

  for (const [pattern, target] of mappings) {
    if (pattern.test(compacted)) {
      return target;
    }
  }

  if (lowered.includes('技术栈')) {
    return text.replace(/技术栈/gi, '').trim();
  }

  return text;
}

function dedupeTerms(values = [], { useTechNormalization = false } = {}) {
  const results = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = useTechNormalization ? normalizeTechName(value) : normalizeText(value);
    if (!normalized) {
      continue;
    }
    const key = canonicalKey(normalized);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push(normalized);
  }
  return results;
}

function mergeArrayField(left = [], right = [], options = {}) {
  return dedupeTerms([...left, ...right], options);
}

function mergeProfilePatch(base = {}, patch = {}) {
  const next = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    if (Array.isArray(value) || PROFILE_ARRAY_FIELDS.includes(key)) {
      const useTechNormalization = key === 'skills' || key === 'stack';
      next[key] = mergeArrayField(next[key], Array.isArray(value) ? value : [value], {
        useTechNormalization
      });
      continue;
    }
    next[key] = normalizeText(value);
  }
  return next;
}

function normalizeDurableContent(value) {
  return normalizeText(value).replace(/\s+/g, ' ');
}

export function normalizeDurableMemories(memories = []) {
  if (!Array.isArray(memories)) {
    return [];
  }

  const seen = new Set();
  const next = [];

  for (const memory of memories) {
    const category = normalizeText(memory?.category || 'profile') || 'profile';
    const content = normalizeDurableContent(memory?.content);
    if (!content) {
      continue;
    }
    const key = `${category}::${canonicalKey(content)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push({
      ...memory,
      category,
      content
    });
  }

  return next;
}

function pushPatchArray(target, key, value) {
  if (!value) {
    return;
  }
  if (!target[key]) {
    target[key] = [];
  }
  target[key].push(value);
}

function extractByRegex(source, patterns, key) {
  const patch = {};
  for (const pattern of patterns) {
    const regex = pattern.global
      ? pattern
      : new RegExp(pattern.source, `${pattern.flags}g`);
    for (const match of source.matchAll(regex)) {
      if (!match?.[1]) {
        continue;
      }
      const terms = splitTerms(match[1]);
      if (!terms.length) {
        continue;
      }
      for (const term of terms) {
        pushPatchArray(patch, key, term);
      }
    }
  }
  return patch;
}

function mergePatches(...patches) {
  return patches.reduce((acc, patch) => mergeProfilePatch(acc, patch), {});
}

function detectTechTerms(text) {
  const techRules = [
    [/python/gi, 'Python'],
    [/rust/gi, 'Rust'],
    [/typescript/gi, 'TypeScript'],
    [/javascript/gi, 'JavaScript'],
    [/\bnode(?:\.js|js)?\b/gi, 'Node.js'],
    [/react/gi, 'React'],
    [/\bvue\b/gi, 'Vue'],
    [/docker/gi, 'Docker'],
    [/\bkubernetes\b|\bk8s\b/gi, 'Kubernetes'],
    [/postgresql|postgres/gi, 'PostgreSQL'],
    [/mysql/gi, 'MySQL'],
    [/mongodb/gi, 'MongoDB'],
    [/redis/gi, 'Redis'],
    [/\bgit\b/gi, 'Git'],
    [/linux/gi, 'Linux'],
    [/c\+\+/gi, 'C++'],
    [/c#/gi, 'C#'],
    [/\bjava\b/gi, 'Java'],
    [/\bgo\b|\bgolang\b/gi, 'Go']
  ];

  const result = [];
  for (const [regex, label] of techRules) {
    if (regex.test(text)) {
      result.push(label);
    }
  }
  return dedupeTerms(result, { useTechNormalization: true });
}

export function extractProfileFromText(text) {
  const source = normalizeText(text);
  if (!source) {
    return {};
  }

  const skillPatch = extractByRegex(
    source,
    [
      /(?:擅长|熟悉|掌握|技能(?:是|有)?|会用)\s*[:：]?\s*([^。！!\n]+)/gi,
      /(?:skills?)\s*[:：]?\s*([^。!?\n]+)/gi
    ],
    'skills'
  );
  const stackPatch = extractByRegex(
    source,
    [
      /(?:技术栈|技术方向|tech\s*stack)\s*[:：]?\s*([^。！!\n]+)/gi,
      /(?:技术栈|技术方向|tech\s*stack)\s*(?:是|有)\s*[:：]?\s*([^。！!\n]+)/gi,
      /(?:正在用|使用)\s*[:：]?\s*([^。！!\n]+?)(?:开发|做项目|构建)/gi
    ],
    'stack'
  );
  const goalPatch = extractByRegex(
    source,
    [
      /(?:我的目标是|目标是|我希望|我想要|我打算)\s*[:：]?\s*([^。！!\n]+)/gi,
      /(?:goal|goals)\s*[:：]?\s*([^。!?\n]+)/gi
    ],
    'goals'
  );
  const preferencePatch = extractByRegex(
    source,
    [
      /(?:我偏好|我喜欢|更喜欢|希望你)\s*[:：]?\s*([^。！!\n]+)/gi,
      /(?:prefer|preference)\s*[:：]?\s*([^。!?\n]+)/gi
    ],
    'preferences'
  );
  const interestPatch = extractByRegex(
    source,
    [
      /(?:兴趣|感兴趣|关注)\s*[:：]?\s*([^。！!\n]+)/gi,
      /(?:interests?)\s*[:：]?\s*([^。!?\n]+)/gi
    ],
    'interests'
  );
  const constraintPatch = extractByRegex(
    source,
    [
      /(?:限制|约束|不能|不希望)\s*[:：]?\s*([^。！!\n]+)/gi,
      /(?:constraint|constraints?)\s*[:：]?\s*([^。!?\n]+)/gi
    ],
    'constraints'
  );

  const techTerms = detectTechTerms(source);
  const techPatch = techTerms.length ? { skills: techTerms } : {};

  return mergePatches(
    skillPatch,
    stackPatch,
    goalPatch,
    preferencePatch,
    interestPatch,
    constraintPatch,
    techPatch
  );
}

export function normalizeProfilePatch(profilePatch = {}) {
  return mergeProfilePatch({}, profilePatch);
}

export function routeMemoryExtraction(extraction = {}) {
  const routed = {
    profilePatch: normalizeProfilePatch(extraction.profilePatch || {}),
    durableMemories: []
  };

  const categoryToProfileField = {
    skill: 'skills',
    stack: 'stack',
    goal: 'goals',
    preference: 'preferences',
    interest: 'interests',
    constraint: 'constraints'
  };

  for (const memory of normalizeDurableMemories(extraction.durableMemories || [])) {
    const category = String(memory.category || '').toLowerCase();
    const mappedField = categoryToProfileField[category];

    if (mappedField) {
      routed.profilePatch = mergeProfilePatch(routed.profilePatch, {
        [mappedField]: splitTerms(memory.content)
      });
      if (category !== 'goal') {
        continue;
      }
    }

    if (category === 'profile') {
      const inferred = extractProfileFromText(memory.content);
      routed.profilePatch = mergeProfilePatch(routed.profilePatch, inferred);
      continue;
    }

    routed.durableMemories.push(memory);
  }

  return {
    profilePatch: normalizeProfilePatch(routed.profilePatch),
    durableMemories: normalizeDurableMemories(routed.durableMemories)
  };
}

export function mergeMemoryExtractions(...extractions) {
  const merged = {
    profilePatch: {},
    durableMemories: []
  };

  for (const extraction of extractions) {
    const routed = routeMemoryExtraction(extraction || {});
    merged.profilePatch = mergeProfilePatch(merged.profilePatch, routed.profilePatch);
    merged.durableMemories = normalizeDurableMemories([
      ...merged.durableMemories,
      ...routed.durableMemories
    ]);
  }

  return merged;
}
