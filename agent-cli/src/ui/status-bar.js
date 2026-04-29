// 动态状态栏组件 — 显示会话/模型/用量信息

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const REVERSE = '\x1b[7m';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const CLEAR_LINE = '\x1b[2K';
const CARRIAGE_RETURN = '\r';

function rgb(r, g, b) { return `\x1b[38;2;${r};${g};${b}m`; }
function bgRgb(r, g, b) { return `\x1b[48;2;${r};${g};${b}m`; }

const ENABLE_COLOR = Boolean(process.stdout.isTTY);

const COLORS = {
  cyan: rgb(0, 200, 255),
  green: rgb(80, 220, 140),
  yellow: rgb(255, 220, 80),
  purple: rgb(180, 120, 255),
  pink: rgb(255, 120, 180),
  orange: rgb(255, 160, 50),
  red: rgb(255, 80, 80),
  gray: rgb(120, 120, 120),
  white: rgb(220, 220, 220),
  bgDark: bgRgb(25, 25, 35),
  bgHighlight: bgRgb(40, 40, 55),
};

export class StatusBar {
  constructor({ modelName = '', sessionName = '', mode = 'chat' } = {}) {
    this.modelName = modelName;
    this.sessionName = sessionName;
    this.mode = mode;
    this.tokenCount = 0;
    this.messageCount = 0;
    this.statusText = '';
    this.visible = false;
    this._interval = null;
    this._spinnerFrame = 0;
  }

  update(updates) {
    if (updates.modelName !== undefined) this.modelName = updates.modelName;
    if (updates.sessionName !== undefined) this.sessionName = updates.sessionName;
    if (updates.mode !== undefined) this.mode = updates.mode;
    if (updates.tokenCount !== undefined) this.tokenCount = updates.tokenCount;
    if (updates.messageCount !== undefined) this.messageCount = updates.messageCount;
    if (updates.statusText !== undefined) this.statusText = updates.statusText;
    if (this.visible) this.render();
  }

  show() {
    if (!ENABLE_COLOR || this.visible) return;
    this.visible = true;
    process.stdout.write(HIDE_CURSOR);
    this.render();
    this._startSpinner();
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this._stopSpinner();
    process.stdout.write(SHOW_CURSOR);
    process.stdout.write(`${CLEAR_LINE}${CARRIAGE_RETURN}`);
  }

  _startSpinner() {
    if (this._interval) return;
    this._interval = setInterval(() => {
      this._spinnerFrame = (this._spinnerFrame + 1) % 4;
      if (this.visible) this.render();
    }, 500);
  }

  _stopSpinner() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  render() {
    if (!ENABLE_COLOR || !this.visible) return;

    const cols = process.stdout.columns || 80;
    const spinner = ['⠋', '⠙', '⠹', '⠸'][this._spinnerFrame];

    const leftParts = [];
    if (this.statusText) {
      leftParts.push(`${COLORS.purple}${spinner}${RESET} ${COLORS.white}${this.statusText}${RESET}`);
    }

    const rightParts = [];
    if (this.modelName) {
      rightParts.push(`${COLORS.cyan}${this.modelName}${RESET}`);
    }
    if (this.sessionName) {
      rightParts.push(`${COLORS.gray}${this.sessionName}${RESET}`);
    }
    if (this.messageCount > 0) {
      rightParts.push(`${COLORS.yellow}${this.messageCount}msgs${RESET}`);
    }
    if (this.tokenCount > 0) {
      rightParts.push(`${COLORS.orange}${this.tokenCount}tok${RESET}`);
    }

    const left = leftParts.join(' ');
    const right = rightParts.join(' ');

    // Strip ANSI for width calculation
    const stripAnsi = (s) => s.replace(/\x1b\[\d+(;\d+)*m/g, '');
    const leftWidth = stripAnsi(left).length;
    const rightWidth = stripAnsi(right).length;

    const gap = Math.max(1, cols - leftWidth - rightWidth - 2);
    const line = `${COLORS.bgDark} ${left}${' '.repeat(gap)}${right} ${RESET}`;

    process.stdout.write(`${CLEAR_LINE}${CARRIAGE_RETURN}${line}`);
  }

  // 显示短暂的状态消息（自动消失）
  flash(text, durationMs = 2000) {
    const prev = this.statusText;
    this.statusText = text;
    this.render();
    setTimeout(() => {
      if (this.statusText === text) {
        this.statusText = prev;
        if (this.visible) this.render();
      }
    }, durationMs);
  }

  dispose() {
    this.hide();
  }
}

// 单行状态（非持久，用于命令输出中的状态行）
export function statusLine(text, options = {}) {
  const { color = 'gray' } = options;
  const colorFn = COLORS[color] || COLORS.gray;
  if (!ENABLE_COLOR) return `[${text}]`;
  return `${DIM}${colorFn}${text}${RESET}`;
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

// 面板（带边框的信息框）
export function panel(title, content, options = {}) {
  const { borderColor = 'purple' } = options;
  const bc = COLORS[borderColor] || COLORS.purple;
  const lines = String(content || '').split('\n');
  const maxLen = lines.reduce((max, l) => Math.max(max, l.length), 0);
  const width = Math.min(maxLen + 4, (process.stdout.columns || 80) - 4);

  const top = `${bc}╭${'─'.repeat(width)}╮${RESET}`;
  const bottom = `${bc}╰${'─'.repeat(width)}╯${RESET}`;
  const body = lines.map(l => `${bc}│${RESET} ${l.padEnd(width - 2)} ${bc}│${RESET}`).join('\n');
  const header = title ? `${bc}│${RESET} ${BOLD}${title}${RESET}${' '.repeat(Math.max(0, width - title.length - 2))}${bc}│${RESET}\n` : '';

  return `${top}\n${header}${body}\n${bottom}`;
}

export { COLORS, RESET, DIM, BOLD };
