import { readFileSync, writeFileSync } from 'node:fs';

/**
 * 上下文感知搜索替换工具
 *
 * 比 replace_in_file 更健壮：支持通过前后文行（context lines）精确定位，
 * 解决格式化后精确匹配失败的问题。支持正则模式、精确模式、自动规范化。
 */

/**
 * 规范化文本中的引号和空格差异
 */
function normalizeText(text) {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '  ')
    .replace(/[ \t]+$/gm, '')  // 行尾空格
    .replace(/\n{3,}/g, '\n\n'); // 超长空行压缩
}

/**
 * 精确搜索并替换 — 搜索整个文件文本
 */
function exactSearch(content, oldText) {
  const idx = content.indexOf(oldText);
  if (idx === -1) return null;
  return { start: idx, end: idx + oldText.length, match: oldText };
}

/**
 * 规范化搜索 — 规范化后匹配
 */
function normalizedSearch(content, oldText) {
  const normalizedContent = normalizeText(content);
  const normalizedOld = normalizeText(oldText);
  const idx = normalizedContent.indexOf(normalizedOld);
  if (idx === -1) return null;
  return { start: idx, end: idx + normalizedOld.length, match: content.slice(idx, idx + normalizedOld.length) };
}

/**
 * 上下文感知搜索 — 用前后文行辅助定位
 */
function contextSearch(content, oldText, contextLines = []) {
  if (!contextLines || contextLines.length === 0) return null;

  const lines = content.split('\n');
  const oldLines = oldText.split('\n');

  for (let i = 0; i <= lines.length - oldLines.length; i++) {
    // 检查该位置是否匹配 oldText
    let match = true;
    for (let j = 0; j < oldLines.length; j++) {
      if (lines[i + j].trim() !== oldLines[j].trim()) {
        match = false;
        break;
      }
    }
    if (!match) continue;

    // 检查 context lines（如果有提供）
    let contextMatch = true;
    for (const ctx of contextLines) {
      const ctxTrimmed = ctx.trim();
      if (!ctxTrimmed) continue;

      // 向前查找
      let found = false;
      for (let k = Math.max(0, i - 20); k < i; k++) {
        if (lines[k].includes(ctxTrimmed)) { found = true; break; }
      }
      // 向后查找
      for (let k = i + oldLines.length; k < Math.min(lines.length, i + oldLines.length + 20); k++) {
        if (lines[k].includes(ctxTrimmed)) { found = true; break; }
      }
      if (!found) { contextMatch = false; break; }
    }

    if (contextMatch) {
      const startLine = i;
      const start = lines.slice(0, i).join('\n').length + (i > 0 ? 1 : 0);
      const end = start + oldLines.join('\n').length;
      return { start, end, match: lines.slice(i, i + oldLines.length).join('\n'), line: startLine };
    }
  }
  return null;
}

/**
 * 行级别搜索 — 按行号精确匹配
 */
function lineSearch(content, oldText, startLine) {
  if (startLine == null) return null;
  const lines = content.split('\n');
  const oldLines = oldText.split('\n');

  if (startLine < 0 || startLine + oldLines.length > lines.length) return null;

  for (let j = 0; j < oldLines.length; j++) {
    if (lines[startLine + j].trim() !== oldLines[j].trim()) {
      // 尝试规范化匹配
      if (normalizeText(lines[startLine + j]) !== normalizeText(oldLines[j])) {
        return null;
      }
    }
  }

  const start = lines.slice(0, startLine).join('\n').length + (startLine > 0 ? 1 : 0);
  const end = start + oldLines.join('\n').length;
  return { start, end, match: lines.slice(startLine, startLine + oldLines.length).join('\n'), line: startLine };
}

/**
 * search_and_replace — 上下文感知搜索替换
 *
 * @param {Object} opts
 * @param {string} opts.filePath - 文件路径
 * @param {string} opts.oldText - 要替换的旧文本
 * @param {string} opts.newText - 新文本
 * @param {string[]} opts.contextLines - 辅助定位的前后文行（可选）
 * @param {number} opts.startLine - 起始行号（0-indexed，可选）
 * @param {boolean} opts.regex - 是否启用正则模式（默认 false）
 * @param {boolean} opts.replaceAll - 是否替换所有匹配（默认 false）
 * @returns {{ ok: boolean, data?: object, error?: string }}
 */
export function searchAndReplace({ filePath, oldText, newText, contextLines, startLine, regex = false, replaceAll = false }) {
  if (!filePath) return { ok: false, error: 'filePath 是必需的' };
  if (oldText == null) return { ok: false, error: 'oldText 是必需的' };
  if (newText == null) return { ok: false, error: 'newText 是必需的' };

  // 读取文件
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch (err) {
    return { ok: false, error: `无法读取文件: ${err.message}` };
  }

  // 正则模式
  if (regex) {
    try {
      const flags = replaceAll ? 'gs' : 's';
      const re = new RegExp(oldText, flags);
      const match = content.match(re);
      if (!match) return { ok: false, error: '正则未匹配到任何内容' };
      const result = content.replace(re, newText);
      writeFileSync(filePath, result, 'utf8');
      return {
        ok: true,
        data: { replaced: true, matchCount: 1, filePath },
      };
    } catch (err) {
      return { ok: false, error: `正则错误: ${err.message}` };
    }
  }

  // 多策略搜索
  let match = null;
  let strategy = '';

  // 策略 1: 精确匹配
  match = exactSearch(content, oldText);
  if (match) strategy = 'exact';

  // 策略 2: 上下文辅助
  if (!match) {
    match = contextSearch(content, oldText, contextLines);
    if (match) strategy = 'context';
  }

  // 策略 3: 行号定位
  if (!match) {
    match = lineSearch(content, oldText, startLine);
    if (match) strategy = 'line';
  }

  // 策略 4: 规范化匹配
  if (!match) {
    match = normalizedSearch(content, oldText);
    if (match) strategy = 'normalized';
  }

  if (!match) {
    return { ok: false, error: `在 ${filePath} 中未找到匹配内容。尝试提供更多前后文行（contextLines）辅助定位。` };
  }

  // 执行替换
  const before = content.slice(0, match.start);
  const after = content.slice(match.end);

  // 替换所有匹配
  if (replaceAll) {
    let remaining = content;
    let count = 0;
    let result = '';
    const searchFn = (c) => {
      const m = exactSearch(c, oldText) || normalizedSearch(c, oldText);
      return m;
    };

    while (true) {
      const m = searchFn(remaining);
      if (!m) { result += remaining; break; }
      result += remaining.slice(0, m.start) + newText;
      remaining = remaining.slice(m.end);
      count++;
    }

    writeFileSync(filePath, result, 'utf8');
    return { ok: true, data: { replaced: true, matchCount: count, filePath, strategy } };
  }

  // 单次替换
  const result = before + newText + after;
  writeFileSync(filePath, result, 'utf8');

  return {
    ok: true,
    data: {
      replaced: result !== content,
      matchCount: 1,
      filePath,
      strategy,
      matchLine: match.line != null ? match.line + 1 : undefined,
    },
  };
}
