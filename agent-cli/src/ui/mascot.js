// Frees-Agent 桌宠系统 — 可爱的终端伴侣
// 6 物种 + 3 帧动画 + 对话气泡 + 情绪反应

import { stringWidth } from '../utils/truncate.js';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

const SPECIES = {
  cat: { name: '小猫', color: '\x1b[38;2;255;165;0m' },    // 橙
  penguin: { name: '企鹅', color: '\x1b[38;2;0;150;255m' }, // 蓝
  rabbit: { name: '兔兔', color: '\x1b[38;2;255;192;203m' },// 粉
  ghost: { name: '幽灵', color: '\x1b[38;2;180;140;255m' }, // 紫
  dragon: { name: '小龙', color: '\x1b[38;2;50;205;100m' }, // 绿
  owl: { name: '猫头鹰', color: '\x1b[38;2;210;150;80m' },  // 棕
};

const SPRITES = {
  // ── 小猫 ──
  cat: [
    // Frame 0: 正常
    [
      '  ╭────────╮  ',  // 14
      ' ╱  ^_^     ╲ ',  // 14
      ' │   ω      │ ',  // 14
      ' ╰──────────╯ ',  // 14
    ],
    // Frame 1: 眨眼
    [
      '  ╭────────╮  ',
      ' ╱  -_-     ╲ ',
      ' │   ω      │ ',
      ' ╰──────────╯ ',
    ],
    // Frame 2: 惊讶
    [
      '  ╭────────╮  ',
      ' ╱  >_<     ╲ ',
      ' │   ω      │ ',
      ' ╰──────────╯ ',
    ],
  ],

  // ── 企鹅 ──
  penguin: [
    // Frame 0: 正常
    [
      '  ╭────────╮  ',
      ' │  \'‿\'     │ ',
      ' │   ><     │ ',
      ' ╰──────────╯ ',
    ],
    // Frame 1: 眨眼
    [
      '  ╭────────╮  ',
      ' │  -_-     │ ',
      ' │   ><     │ ',
      ' ╰──────────╯ ',
    ],
    // Frame 2: 张嘴
    [
      '  ╭────────╮  ',
      ' │  \'v\'     │ ',
      ' │   ><     │ ',
      ' ╰──────────╯ ',
    ],
  ],

  // ── 兔兔 ──
  rabbit: [
    // Frame 0: 正常
    [
      ' ╭┃────────┃╮ ',
      ' │  ◕‿◕     │ ',
      ' │   ω      │ ',
      ' ╰──────────╯ ',
    ],
    // Frame 1: 眨眼
    [
      ' ╭┃────────┃╮ ',
      ' │  u_u     │ ',
      ' │   ω      │ ',
      ' ╰──────────╯ ',
    ],
    // Frame 2: 开心
    [
      ' ╭┃────────┃╮ ',
      ' │  ◕‿◕     │ ',
      ' │  ~ω~     │ ',
      ' ╰──────────╯ ',
    ],
  ],

  // ── 幽灵 ──
  ghost: [
    // Frame 0: 正常
    [
      ' ╭──────────╮ ',
      ' │  ◕‿◕     │ ',
      ' │   ~~     │ ',
      ' ╰─╯─╰─╯─╰──╯ ',
    ],
    // Frame 1: 吓人
    [
      ' ╭──────────╮ ',
      ' │  >_<     │ ',
      ' │   ~~     │ ',
      ' ╰─╯─╰─╯─╰──╯ ',
    ],
    // Frame 2: 卖萌
    [
      ' ╭──────────╮ ',
      ' │  ◕o◕     │ ',
      ' │  ────    │ ',
      ' ╰─╯─╰─╯─╰──╯ ',
    ],
  ],

  // ── 小龙 ──
  dragon: [
    // Frame 0: 正常
    [
      ' ╱╲────────╱╲ ',
      ' │  ^_^     │ ',
      ' │   ω      │ ',
      ' ╰──────────╯ ',
    ],
    // Frame 1: 眨眼
    [
      ' ╱╲────────╱╲ ',
      ' │  -_-     │ ',
      ' │   ω      │ ',
      ' ╰──────────╯ ',
    ],
    // Frame 2: 喷火
    [
      ' ╱╲────────╱╲ ',
      ' │  ^_^     │ ',
      ' │  >ω<     │ ',
      ' ╰──────────╯ ',
    ],
  ],

  // ── 猫头鹰 ──
  owl: [
    // Frame 0: 正常
    [
      ' ╭╮────────╭╮ ',
      ' │ ●  ●     │ ',
      ' │   O      │ ',
      ' ╰──────────╯ ',
    ],
    // Frame 1: 眨眼
    [
      ' ╭╮────────╭╮ ',
      ' │ ●  ─     │ ',
      ' │   O      │ ',
      ' ╰──────────╯ ',
    ],
    // Frame 2: 歪头
    [
      ' ╭╮────────╭╮ ',
      ' │  ● ●     │ ',
      ' │  _O_     │ ',
      ' ╰──────────╯ ',
    ],
  ],
};

function createBubble(text, { maxWidth = 30 } = {}) {
  const lines = [];
  const words = String(text || '').split(' ');
  let currentLine = '';
  for (const word of words) {
    const candidate = currentLine ? currentLine + ' ' + word : word;
    if (stringWidth(candidate) <= maxWidth) {
      currentLine = candidate;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  if (!lines.length) lines.push('...');

  const widths = lines.map(l => stringWidth(l));
  const max = Math.max(...widths);
  const bubble = [];
  bubble.push(` ╭${'─'.repeat(max + 2)}╮ `);
  for (const line of lines) {
    const pad = max - stringWidth(line);
    bubble.push(` │ ${line}${' '.repeat(pad)} │ `);
  }
  bubble.push(` ╰${'─'.repeat(max + 2)}╯ `);
  return bubble;
}

function selectSpecies(userId = '') {
  const names = Object.keys(SPECIES);
  let hash = 0;
  for (const char of userId) {
    hash = ((hash << 5) - hash) + char.charCodeAt(0);
    hash |= 0;
  }
  return names[Math.abs(hash) % names.length];
}

export class Mascot {
  constructor({ species, name } = {}) {
    this.species = species || 'cat';
    this.speciesConfig = SPECIES[this.species] || SPECIES.cat;
    this.displayName = name || this.speciesConfig.name;
    this.sprites = SPRITES[this.species] || SPRITES.cat;
    this.frameIndex = 0;
    this.animating = false;
    this.animationTimer = null;
    this.lastBubble = null;
  }

  get color() { return this.speciesConfig.color; }

  render(frame) {
    const frames = this.sprites;
    const index = frame !== undefined ? frame : this.frameIndex;
    return frames[index % frames.length];
  }

  renderColored(frame) {
    const lines = this.render(frame);
    return lines.map(line => `${this.color}${line}${RESET}`).join('\n');
  }

  renderWithBubble(text, { frame, colored = true } = {}) {
    const bubble = createBubble(text);
    const spriteLines = colored ? this.renderColored(frame).split('\n') : this.render(frame);
    this.lastBubble = text;

    const maxLines = Math.max(bubble.length, spriteLines.length);
    const result = [];
    for (let i = 0; i < maxLines; i++) {
      const bLine = i < bubble.length ? bubble[i] : ' '.repeat(bubble[0].length);
      const sLine = i < spriteLines.length ? spriteLines[i] : '';
      result.push(`${bLine}  ${sLine}`);
    }
    return result.join('\n');
  }

  renderInline() {
    const face = this.sprites[0][1];
    return `${this.color}${face.trim()}${RESET}`;
  }

  getGreeting(userName) {
    const greetings = {
      cat: ['你好 喵~', '久等啦~', '需要帮忙？'],
      penguin: ['你好！', '嗨嗨~', '做什么呢？'],
      rabbit: ['嗨哟~', '你好呀', '兔兔来了~'],
      ghost: ['嗨~', '你好...', '我飘来了'],
      dragon: ['你好！', '来了来了', '有任务？'],
      owl: ['你好', '咕咕~', '做什么呢？'],
    };
    const list = greetings[this.species] || greetings.cat;
    const greeting = list[Math.floor(Math.random() * list.length)];
    return userName ? `${userName}，${greeting}` : greeting;
  }

  getThinkingReaction() {
    const map = {
      cat: '让我想想... 喵', penguin: '嗯... 让我想想', rabbit: '兔兔正在思考...',
      ghost: '让我想想...', dragon: '思考中...', owl: '咕... 让我想想',
    };
    return `${this.color}●${RESET} ${map[this.species] || '思考中...'}`;
  }

  getHappyReaction() {
    const map = {
      cat: '好哒！喵~', penguin: '好耶！', rabbit: '好棒棒~',
      ghost: '太好啦~', dragon: '完成啦！', owl: '搞定啦 咕~',
    };
    return map[this.species] || '太好啦！';
  }

  getConfusedReaction() {
    const map = {
      cat: '诶？不太明白 喵...', penguin: '嗯？没太懂...', rabbit: '兔兔有点困惑...',
      ghost: '啥？', dragon: '唔？什么意思呀', owl: '咕？没听懂...',
    };
    return map[this.species] || '没太明白...';
  }

  getWorkingReaction() {
    const map = {
      cat: '在处理了 喵~', penguin: '正在处理中！', rabbit: '兔兔在努力...',
      ghost: '努力中...', dragon: '火力全开！', owl: '咕咕咕 处理中...',
    };
    return map[this.species] || '处理中...';
  }

  startIdleAnimation(onFrame) {
    if (this.animating) return () => {};
    this.animating = true;
    const IDLE_SEQUENCE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0];
    let step = 0;
    const tick = () => {
      if (!this.animating) return;
      this.frameIndex = IDLE_SEQUENCE[step % IDLE_SEQUENCE.length];
      step++;
      if (onFrame) onFrame(this.frameIndex);
      this.animationTimer = setTimeout(tick, 800 + Math.random() * 400);
    };
    tick();
    return () => this.stopAnimation();
  }

  stopAnimation() {
    this.animating = false;
    if (this.animationTimer) {
      clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }
  }
}

// ─── 颜色常量与格式化函数 ───

const COLOR = {
  reset: RESET, bold: BOLD, dim: DIM,
  cyan: '\x1b[36m', blue: '\x1b[94m', green: '\x1b[32m',
  yellow: '\x1b[33m', magenta: '\x1b[35m', red: '\x1b[31m',
  white: '\x1b[97m',
  bgBlue: '\x1b[44m', bgGreen: '\x1b[42m', bgDim: '\x1b[48;2;30;30;30m',
  orange: '\x1b[38;2;255;165;0m', pink: '\x1b[38;2;255;192;203m',
  purple: '\x1b[38;2;180;140;255m',
};

export function c(text, colorCode) { return `${colorCode}${text}${RESET}`; }

export function formatUserMessage(text) {
  const icon = `${COLOR.bgBlue}${COLOR.white} 你 ${RESET}`;
  const prefix = `${COLOR.cyan}┃${RESET} `;
  const lines = String(text || '').split('\n');
  const body = lines.map(l => `${prefix}${l}`).join('\n');
  return ['', icon, body, ''].join('\n');
}

export function formatAssistantMessage(text, mascot) {
  const lines = String(text || '').split('\n');
  const formatted = lines.map(line => ` ${line}`).join('\n');
  if (mascot) {
    const header = `${mascot.color}${mascot.displayName}${RESET} ${DIM}${mascot.species}${RESET}`;
    return ['', header, `${COLOR.green}${formatted}${RESET}`, ''].join('\n');
  }
  return ['', `${COLOR.green}╱╱ 助手${RESET}`, `${COLOR.green}${formatted}${RESET}`, ''].join('\n');
}

export function formatThinking() {
  const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  return {
    frame: () => { const f = spinner[i]; i = (i + 1) % spinner.length; return `${COLOR.yellow}${f}${RESET}`; },
    start: () => { i = 0; },
  };
}

export function formatError(text) { return `${COLOR.red}✗${RESET} ${COLOR.red}${text}${RESET}`; }
export function formatSuccess(text) { return `${COLOR.green}✓${RESET} ${COLOR.green}${text}${RESET}`; }
export function formatHint(text) { return `${DIM}${COLOR.white}${text}${RESET}`; }

export { COLOR as colors, SPECIES, selectSpecies, createBubble };

Mascot.SPECIES = SPECIES;
Mascot.SPRITES = SPRITES;
