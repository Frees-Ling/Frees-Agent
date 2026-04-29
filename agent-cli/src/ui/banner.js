// Frees Agent 启动横幅 — 现代渐变风格 + 系统状态总览
import { Mascot } from './mascot.js';
import { divider } from './status-bar.js';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

function rgb(r, g, b) { return `\x1b[38;2;${r};${g};${b}m`; }
function bgRgb(r, g, b) { return `\x1b[48;2;${r};${g};${b}m`; }

const ENABLE_COLOR = Boolean(process.stdout.isTTY);

// 渐变色阶
const GRADIENT_CYAN = [
  rgb(0, 180, 255), rgb(0, 200, 255), rgb(60, 210, 255),
  rgb(120, 220, 255), rgb(60, 210, 255), rgb(0, 200, 255), rgb(0, 180, 255),
];
const GRADIENT_PINK = [
  rgb(255, 100, 160), rgb(255, 130, 180), rgb(255, 160, 200),
  rgb(255, 130, 180), rgb(255, 100, 160),
];
const GRADIENT_PURPLE = [
  rgb(160, 100, 255), rgb(180, 130, 255), rgb(200, 160, 255),
  rgb(180, 130, 255), rgb(160, 100, 255),
];

function applyGradient(text, gradient) {
  if (!ENABLE_COLOR || !gradient.length) return text;
  return text.split('').map((ch, i) => `${gradient[i % gradient.length]}${ch}${RESET}`).join('');
}

const LOGO = [
  '    ╔═══════════════════════════════════════════╗',
  '    ║    ____                  __               ║',
  '    ║   / __/___  ___  ____  / /_____  ____     ║',
  '    ║  / /_/ __ \\/ _ \\/ __ \\/ __/ __ \\/ __ \\    ║',
  '    ║ / __/ /_/ /  __/ / / / /_/ /_/ / / / /    ║',
  '    ║/_/  \\____/\\___/_/ /_/\\__/\\____/_/ /_/     ║',
  '    ║                                           ║',
  '    ╚═══════════════════════════════════════════╝',
];

export function printFreesAgentBanner(runtime, options = {}) {
  const mode = options.command || 'chat';
  const isTTY = Boolean(process.stdout.isTTY);

  if (!isTTY) {
    console.log(`[Frees Agent] ${runtime.providerName}/${runtime.model} (${mode})`);
    return;
  }

  // ── Logo 行 ──
  const borderColor = rgb(120, 80, 200);
  const logoLines = LOGO.map(line => {
    return line
      .split('')
      .map(ch => {
        if ('║╔╚╗╝═' .includes(ch)) return `${borderColor}${ch}${RESET}`;
        if (/[a-zA-Z_/\\]/.test(ch)) {
          return `${rgb(0, 200, 255)}${ch}${RESET}`;
        }
        return ch;
      })
      .join('');
  });

  // 徽章行
  const version = 'v1.1.3';
  const tagLine = `${DIM}Frees Agent${RESET} ${rgb(120,80,200)}${version}${RESET}`;

  // 状态信息
  const providerTag = `${rgb(100,200,255)}●${RESET} ${DIM}Provider${RESET} ${rgb(200,200,200)}${runtime.providerName}${RESET}`;
  const modelTag = `${rgb(100,255,160)}●${RESET} ${DIM}Model${RESET} ${rgb(200,200,200)}${runtime.model}${RESET}`;
  const modeTag = `${rgb(255,220,80)}●${RESET} ${DIM}Mode${RESET} ${rgb(200,200,200)}${mode}${RESET}`;

  // 功能徽章
  const badge = (text, color) => `${DIM}[${RESET}${color}${text}${RESET}${DIM}]${RESET}`;
  const featureBadges = [
    badge('Stream', rgb(0,200,255)),
    badge('Memory', rgb(180,120,255)),
    badge('MCP', rgb(255,160,50)),
    badge('Tools', rgb(80,220,140)),
    badge('Skills', rgb(255,120,180)),
  ].join(' ');

  // ── 输出 ──
  for (const line of logoLines) console.log(line);
  console.log('');
  console.log(`  ${tagLine}`);
  console.log(`  ${providerTag}   ${modelTag}   ${modeTag}`);
  console.log(`  ${featureBadges}`);

  // 桌宠
  const mascot = new Mascot({ species: 'cat' });
  console.log('');
  const mascotLine = mascot.renderWithBubble(mascot.getGreeting(), { colored: true, frame: 0 });
  for (const line of mascotLine.split('\n')) {
    console.log(`  ${line}`);
  }

  // 提示行
  console.log('');
  console.log(`  ${DIM}${rgb(120,120,120)}输入 /help 查看命令 | /exit 退出 | 直接输入开始对话${RESET}`);
  console.log(divider('', { color: 'gray', char: '─' }));
  console.log('');
}

// 小型状态更新横幅（对话中显示）
export function printMiniBanner(text, options = {}) {
  const { color = 'purple' } = options;
  const c = { purple: rgb(180,120,255), cyan: rgb(0,200,255), green: rgb(80,220,140) }[color] || rgb(180,120,255);
  if (!ENABLE_COLOR) return console.log(`--- ${text} ---`);
  console.log(`${DIM}${c}──${RESET} ${c}${text}${RESET} ${DIM}${c}──${RESET}`);
}
