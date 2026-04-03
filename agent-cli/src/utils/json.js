export function extractFirstJsonObject(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // continue
    }
  }

  let inString = false;
  let escaped = false;
  let depth = 0;
  let startIndex = -1;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        startIndex = index;
      }
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0 && startIndex !== -1) {
        const candidate = text.slice(startIndex, index + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          startIndex = -1;
        }
      }
    }
  }

  return null;
}

export function truncateForModel(text, limit = 8000) {
  if (!text || text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}\n...<truncated ${text.length - limit} chars>`;
}
