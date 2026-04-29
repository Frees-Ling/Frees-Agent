const CJK_RE = /[ᄀ-ᅟ⺀-꓏가-힯豈-﫿︐-︙︰-﹯！-｠￠-￦]/;
const WIDE_RE = /[\u{1F000}-\u{1F9FF}\u{20000}-\u{2FA1F}]/u;

let segmenter = null;
function getSegmenter() {
  if (!segmenter && typeof Intl.Segmenter === 'function') {
    segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  }
  return segmenter;
}

export function stringWidth(str) {
  if (!str) return 0;
  let width = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code === 0x1b) {
      while (i < str.length && str.charCodeAt(i) !== 0x6d) i++;
      continue;
    }
    const char = str[i];
    if (CJK_RE.test(char) || WIDE_RE.test(char)) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

export function truncatePathMiddle(path, maxLength) {
  if (stringWidth(path) <= maxLength) return path;
  if (maxLength <= 0) return '…';
  if (maxLength < 5) return truncateToWidth(path, maxLength);

  const lastSlash = path.lastIndexOf('/');
  const filename = lastSlash >= 0 ? path.slice(lastSlash) : path;
  const directory = lastSlash >= 0 ? path.slice(0, lastSlash) : '';
  const filenameWidth = stringWidth(filename);

  if (filenameWidth >= maxLength - 1) return truncateStartToWidth(path, maxLength);

  const availableForDir = maxLength - 1 - filenameWidth;
  if (availableForDir <= 0) return truncateStartToWidth(filename, maxLength);

  const truncatedDir = truncateToWidthNoEllipsis(directory, availableForDir);
  return truncatedDir + '…' + filename;
}

export function truncateToWidth(text, maxWidth) {
  if (stringWidth(text) <= maxWidth) return text;
  if (maxWidth <= 1) return '…';

  let width = 0;
  let result = '';
  const seg = getSegmenter();

  if (seg) {
    for (const { segment: s } of seg.segment(text)) {
      const segWidth = stringWidth(s);
      if (width + segWidth > maxWidth - 1) break;
      result += s;
      width += segWidth;
    }
  } else {
    for (const char of text) {
      const charWidth = stringWidth(char);
      if (width + charWidth > maxWidth - 1) break;
      result += char;
      width += charWidth;
    }
  }

  return result + '…';
}

export function truncateStartToWidth(text, maxWidth) {
  if (stringWidth(text) <= maxWidth) return text;
  if (maxWidth <= 1) return '…';

  const seg = getSegmenter();
  let segments;

  if (seg) {
    segments = [...seg.segment(text)];
  } else {
    segments = [...text].map(char => ({ segment: char }));
  }

  let width = 0;
  let startIdx = segments.length;
  for (let i = segments.length - 1; i >= 0; i--) {
    const segWidth = stringWidth(segments[i].segment);
    if (width + segWidth > maxWidth - 1) break;
    width += segWidth;
    startIdx = i;
  }

  return '…' + segments.slice(startIdx).map(s => s.segment).join('');
}

export function truncateToWidthNoEllipsis(text, maxWidth) {
  if (stringWidth(text) <= maxWidth) return text;
  if (maxWidth <= 0) return '';

  let width = 0;
  let result = '';
  const seg = getSegmenter();

  if (seg) {
    for (const { segment: s } of seg.segment(text)) {
      const segWidth = stringWidth(s);
      if (width + segWidth > maxWidth) break;
      result += s;
      width += segWidth;
    }
  } else {
    for (const char of text) {
      const charWidth = stringWidth(char);
      if (width + charWidth > maxWidth) break;
      result += char;
      width += charWidth;
    }
  }

  return result;
}

export function truncate(str, maxWidth, singleLine = false) {
  let result = str;

  if (singleLine) {
    const firstNewline = str.indexOf('\n');
    if (firstNewline !== -1) {
      result = str.substring(0, firstNewline);
      if (stringWidth(result) + 1 > maxWidth) return truncateToWidth(result, maxWidth);
      return `${result}…`;
    }
  }

  if (stringWidth(result) <= maxWidth) return result;
  return truncateToWidth(result, maxWidth);
}

export function wrapText(text, width) {
  const lines = [];
  let currentLine = '';
  let currentWidth = 0;
  const seg = getSegmenter();
  const segments = seg ? [...seg.segment(text)] : [...text].map(char => ({ segment: char }));

  for (const { segment: s } of segments) {
    const segWidth = stringWidth(s);
    if (currentWidth + segWidth <= width) {
      currentLine += s;
      currentWidth += segWidth;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = s;
      currentWidth = segWidth;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}
