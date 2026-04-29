export function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function plural(n, word, pluralWord = word + 's') {
  return n === 1 ? word : pluralWord;
}

export function firstLineOf(s) {
  const nl = s.indexOf('\n');
  return nl === -1 ? s : s.slice(0, nl);
}

export function countCharInString(str, char, start = 0) {
  let count = 0;
  let i = str.indexOf(char, start);
  while (i !== -1) {
    count++;
    i = str.indexOf(char, i + 1);
  }
  return count;
}

export function normalizeFullWidthDigits(input) {
  return input.replace(/[０-９]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );
}

export function normalizeFullWidthSpace(input) {
  return input.replace(/　/g, ' ');
}

export function safeJoinLines(lines, delimiter = ',', maxSize = 2 ** 25) {
  const truncationMarker = '...[truncated]';
  let result = '';
  for (const line of lines) {
    const delimiterToAdd = result ? delimiter : '';
    const fullAddition = delimiterToAdd + line;
    if (result.length + fullAddition.length <= maxSize) {
      result += fullAddition;
    } else {
      const remainingSpace = maxSize - result.length - delimiterToAdd.length - truncationMarker.length;
      if (remainingSpace > 0) {
        result += delimiterToAdd + line.slice(0, remainingSpace) + truncationMarker;
      } else {
        result += truncationMarker;
      }
      return result;
    }
  }
  return result;
}

export class EndTruncatingAccumulator {
  constructor(maxSize = 2 ** 25) {
    this.maxSize = maxSize;
    this.content = '';
    this.isTruncated = false;
    this.totalBytesReceived = 0;
  }

  append(data) {
    const str = typeof data === 'string' ? data : data.toString();
    this.totalBytesReceived += str.length;
    if (this.isTruncated && this.content.length >= this.maxSize) return;
    if (this.content.length + str.length > this.maxSize) {
      const remainingSpace = this.maxSize - this.content.length;
      if (remainingSpace > 0) this.content += str.slice(0, remainingSpace);
      this.isTruncated = true;
    } else {
      this.content += str;
    }
  }

  toString() {
    if (!this.isTruncated) return this.content;
    const truncatedBytes = this.totalBytesReceived - this.maxSize;
    const truncatedKB = Math.round(truncatedBytes / 1024);
    return this.content + `\n... [output truncated - ${truncatedKB}KB removed]`;
  }

  clear() {
    this.content = '';
    this.isTruncated = false;
    this.totalBytesReceived = 0;
  }

  get length() { return this.content.length; }
  get truncated() { return this.isTruncated; }
  get totalBytes() { return this.totalBytesReceived; }
}

export function truncateToLines(text, maxLines) {
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join('\n') + '…';
}
