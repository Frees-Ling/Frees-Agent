export function getGraphemeSegmenter() {
  const cache = getGraphemeSegmenter._cache;
  if (cache) return cache;
  const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  getGraphemeSegmenter._cache = seg;
  return seg;
}
getGraphemeSegmenter._cache = null;

export function getWordSegmenter() {
  const cache = getWordSegmenter._cache;
  if (cache) return cache;
  const seg = new Intl.Segmenter(undefined, { granularity: 'word' });
  getWordSegmenter._cache = seg;
  return seg;
}
getWordSegmenter._cache = null;

export function firstGrapheme(text) {
  if (!text) return '';
  const segments = getGraphemeSegmenter().segment(text);
  return segments[Symbol.iterator]().next().value?.segment ?? '';
}

export function lastGrapheme(text) {
  if (!text) return '';
  let last = '';
  for (const { segment } of getGraphemeSegmenter().segment(text)) last = segment;
  return last;
}

const rtfCache = new Map();

export function getRelativeTimeFormat(style, numeric) {
  const key = `${style}:${numeric}`;
  let rtf = rtfCache.get(key);
  if (!rtf) {
    rtf = new Intl.RelativeTimeFormat('en', { style, numeric });
    rtfCache.set(key, rtf);
  }
  return rtf;
}

let cachedTimeZone = null;

export function getTimeZone() {
  if (!cachedTimeZone) cachedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return cachedTimeZone;
}

let cachedSystemLocaleLanguage = null;

export function getSystemLocaleLanguage() {
  if (cachedSystemLocaleLanguage === null) {
    try {
      const locale = Intl.DateTimeFormat().resolvedOptions().locale;
      cachedSystemLocaleLanguage = new Intl.Locale(locale).language;
    } catch { cachedSystemLocaleLanguage = undefined; }
  }
  return cachedSystemLocaleLanguage;
}
