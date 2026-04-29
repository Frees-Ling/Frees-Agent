// 动态状态栏组件 — 兼容 readline 的跨平台单行刷新模式
// 使用 readline 原生 API 替代裸 ANSI 转义码，解决 Windows 终端兼容问题

import * as readline from 'node:readline';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';

const ENABLE_COLOR = Boolean(process.stdout.isTTY);

function rgb(r, g, b) { return `\x1b[38;2;${r};${g};${b}m`; }

export const COLORS = {
  cyan: rgb(0, 200, 255),
  green: rgb(80, 220, 140),
  yellow: rgb(255, 220, 80),
  purple: rgb(180, 120, 255),
  pink: rgb(255, 120, 180),
  orange: rgb(255, 160, 50),
  red: rgb(255, 80, 80),
  gray: rgb(120, 120, 120),
  white: rgb(220, 220, 220),
};

// 单行动态状态行 — 使用 readline API 实现跨平台光标/清行
export class StatusLine {
  constructor() {
    this._text = '';
    this._frame = 0;
    this._interval = null;
    this.active = false;
  }

  show(text) {
    if (!ENABLE_COLOR) {
      console.log(`[${text}]`);
      return;
    }
    this._text = text;
    this.active = true;
    process.stdout.write(HIDE_CURSOR);
    this._write();
    this._interval = setInterval(() => {
      this._frame = (this._frame + 1) % 4;
      if (this.active) this._write();
    }, 400);
  }

  update(text) {
    if (text) this._text = text;
    if (this.active) this._write();
  }

  hide() {
    this.active = false;
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    // 使用 readline API 确保跨平台兼容
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(SHOW_CURSOR);
  }

  _write() {
    const spinner = ['⠋', '⠙', '⠹', '⠸'][this._frame];
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(
      `${COLORS.purple}${spinner}${RESET} ${COLORS.white}${this._text}${RESET}`
    );
  }
}

// 分隔线
export function divider(title = '', options = {}) {
  const { char = '─', color = 'gray' } = options;
  const colorFn = COLORS[color] || COLORS.gray;
  const cols = process.stdout.columns || 80;
  const prefix = title ? ` ${title} ` : '';
  const lineLen = Math.max(2, cols - (prefix ? prefix.length + 2 : 2));
  const line = char.repeat(lineLen);
  if (!ENABLE_COLOR) return prefix ? `${prefix}${line}` : line;
  return `${DIM}${colorFn}${prefix}${line}${RESET}`;
}

// 信息面板
export function panel(title, content, options = {}) {
  const { borderColor = 'purple' } = options;
  const bc = COLORS[borderColor] || COLORS.purple;
  const lines = String(content || '').split('\n');
  const maxLen = lines.reduce((max, l) => Math.max(max, l.length), 0);
  const width = Math.min(maxLen + 4, (process.stdout.columns || 80) - 4);

  const top = `${bc}╭${'─'.repeat(width)}╮${RESET}`;
  const bottom = `${bc}╰${'─'.repeat(width)}╯${RESET}`;
  const body = lines.map(l => `${bc}│${RESET} ${l.padEnd(width - 2)} ${bc}│${RESET}`).join('\n');
  const header = title
    ? `${bc}│${RESET} ${BOLD}${title}${RESET}${' '.repeat(Math.max(0, width - title.length - 2))}${bc}│${RESET}\n`
    : '';

  return `${top}\n${header}${body}\n${bottom}`;
}

export { RESET, DIM, BOLD };
