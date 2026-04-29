// 进度指示器 — 更好的 spinner、进度条、thinking 动画

const RESET = '\x1b[0m';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const CLEAR_LINE = '\x1b[2K';
const CARRIAGE_RETURN = '\r';

const ENABLE_COLOR = Boolean(process.stdout.isTTY);

function rgb(r, g, b) { return `\x1b[38;2;${r};${g};${b}m`; }

const CYAN = rgb(0, 200, 255);
const GREEN = rgb(80, 220, 140);
const YELLOW = rgb(255, 220, 80);
const PURPLE = rgb(180, 120, 255);
const PINK = rgb(255, 120, 180);
const ORANGE = rgb(255, 160, 50);
const GRAY = rgb(120, 120, 120);

// 不同场景的 spinner 帧
const SPINNERS = {
  dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  arrow: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
  pulse: ['█', '▓', '▒', '░', '▒', '▓'],
  bar: ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█', '▇', '▆', '▅', '▄', '▃', '▂'],
};

export class Spinner {
  constructor({ text = '', style = 'dots', color = 'purple' } = {}) {
    this.text = text;
    this.frames = SPINNERS[style] || SPINNERS.dots;
    this.color = { dots: PURPLE, arrow: CYAN, pulse: GREEN, bar: ORANGE }[style] || PURPLE;
    this.frameIndex = 0;
    this._interval = null;
    this.running = false;
  }

  start(text) {
    if (text) this.text = text;
    if (!ENABLE_COLOR || this.running) return this;
    this.running = true;
    process.stdout.write(HIDE_CURSOR);
    this._tick();
    this._interval = setInterval(() => this._tick(), 100);
    return this;
  }

  _tick() {
    if (!this.running) return;
    const frame = this.frames[this.frameIndex % this.frames.length];
    this.frameIndex++;
    process.stdout.write(`${CLEAR_LINE}${CARRIAGE_RETURN}${this.color}${frame}${RESET} ${this.text}`);
  }

  stop(finalText) {
    if (!this.running) return;
    this.running = false;
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    process.stdout.write(`${CLEAR_LINE}${CARRIAGE_RETURN}`);
    if (finalText) {
      console.log(`${GREEN}✓${RESET} ${finalText}`);
    }
    process.stdout.write(SHOW_CURSOR);
  }

  succeed(text) {
    this.stop(text || this.text);
  }

  fail(text) {
    if (!this.running) return;
    this.running = false;
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    process.stdout.write(`${CLEAR_LINE}${CARRIAGE_RETURN}`);
    if (text) {
      console.log(`${rgb(255,80,80)}✗${RESET} ${text}`);
    }
    process.stdout.write(SHOW_CURSOR);
  }
}

// Thinking 动画 — 用于 AI 推理时的闪烁提示
export class ThinkingIndicator {
  constructor({ frames: customFrames } = {}) {
    this.frames = customFrames || ['◐', '◓', '◑', '◒'];
    this.index = 0;
    this._interval = null;
    this.running = false;
    this.startTime = 0;
  }

  start(text = '思考中') {
    if (!ENABLE_COLOR || this.running) return;
    this.running = true;
    this.startTime = Date.now();
    process.stdout.write(HIDE_CURSOR);
    this._tick(text);
    this._interval = setInterval(() => this._tick(text), 200);
  }

  _tick(text) {
    if (!this.running) return;
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const frame = this.frames[this.index % this.frames.length];
    this.index++;
    process.stdout.write(`${CLEAR_LINE}${CARRIAGE_RETURN}${PURPLE}${frame}${RESET} ${GRAY}${text}${RESET} ${GRAY}${elapsed}s${RESET}`);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    process.stdout.write(`${CLEAR_LINE}${CARRIAGE_RETURN}`);
    process.stdout.write(SHOW_CURSOR);
  }
}

// 进度条 (百分比)
export class ProgressBar {
  constructor({ total = 100, width = 20, prefix = '' } = {}) {
    this.total = total;
    this.current = 0;
    this.width = width;
    this.prefix = prefix;
    this.running = false;
  }

  start(prefix) {
    if (prefix) this.prefix = prefix;
    if (!ENABLE_COLOR) return;
    this.running = true;
    process.stdout.write(HIDE_CURSOR);
    this.render();
  }

  update(current, total) {
    if (total !== undefined) this.total = total;
    this.current = current;
    if (this.running) this.render();
  }

  render() {
    if (!this.running) return;
    const pct = Math.min(1, Math.max(0, this.current / this.total));
    const filled = Math.round(pct * this.width);
    const empty = this.width - filled;
    const bar = `${GREEN}${'█'.repeat(filled)}${RESET}${GRAY}${'█'.repeat(empty)}${RESET}`;
    const pctText = `${YELLOW}${(pct * 100).toFixed(0)}%${RESET}`;
    process.stdout.write(`${CLEAR_LINE}${CARRIAGE_RETURN}${this.prefix} ${bar} ${pctText}`);
  }

  stop(finalText) {
    if (!this.running) return;
    this.running = false;
    process.stdout.write(`${CLEAR_LINE}${CARRIAGE_RETURN}`);
    if (finalText) {
      console.log(`${GREEN}✓${RESET} ${finalText}`);
    }
    process.stdout.write(SHOW_CURSOR);
  }
}

export { SPINNERS, CLEAR_LINE, CARRIAGE_RETURN };
