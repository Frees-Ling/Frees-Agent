// Frees-Agent 启动横幅 — 现代设计 + 系统状态总览
import { Mascot } from './mascot.js';
import { divider } from './status-bar.js';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

function rgb(r, g, b) { return `\x1b[38;2;${r};${g};${b}m`; }

const ENABLE_COLOR = Boolean(process.stdout.isTTY);

// 品牌色
const CYAN = rgb(0, 200, 255);
const PURPLE = rgb(160, 100, 255);
const PINK = rgb(255, 80, 180);
const GREEN = rgb(80, 220, 140);
const YELLOW = rgb(255, 220, 80);
const GRAY = rgb(120, 120, 120);
const WHITE = rgb(220, 220, 220);
const BORDER = rgb(120, 80, 200);

const LOGO = [
  '    ╔════════════════════════════════════════════════════╗',
  '    ║       ███████╗██████╗ ███████╗███████╗███████╗     ║',
  '    ║       ██╔════╝██╔══██╗██╔════╝██╔════╝██╔════╝     ║',
  '    ║       █████╗  ██████╔╝█████╗  ███████╗███████╗     ║',
  '    ║       ██╔══╝  ██╔══██╗██╔══╝  ╚════██║╚════██║     ║',
  '    ║       ██║     ██║  ██║███████╗███████║███████║     ║',
  '    ║       ╚═╝     ╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝     ║',
  '    ║      █████╗  ██████╗ ███████╗███╗   ██╗████████╗   ║',
  '    ║     ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝   ║',
  '    ║     ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║      ║',
  '    ║     ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║      ║',
  '    ║     ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║      ║',
  '    ║     ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝      ║',
  '    ║                                                    ║',
  '    ╚════════════════════════════════════════════════════╝',
];

export function printFreesAgentBanner(runtime, options = {}) {
  const mode = options.command || 'chat';
  const isTTY = Boolean(process.stdout.isTTY);

  if (!isTTY) {
    console.log(`[Frees-Agent] ${runtime.providerName}/${runtime.model} (${mode})`);
    return;
  }

  // Logo — block characters in cyan, border in purple
  for (const line of LOGO) {
    const colored = line
      .split('')
      .map(ch => {
        if ('║╔╚╗╝═'.includes(ch)) return `${BORDER}${ch}${RESET}`;
        if (ch === '█') return `${CYAN}${ch}${RESET}`;
        if (ch === '▓') return `${rgb(0,150,255)}${ch}${RESET}`;
        return ch;
      })
      .join('');
    console.log(colored);
  }

  // 标签行
  const version = 'v1.1.3';
  console.log('');
  console.log(`  ${DIM}Frees-Agent${RESET} ${PURPLE}${version}${RESET}`);

  // 状态信息
  const dot = (c) => `${c}●${RESET}`;
  console.log(`  ${dot(rgb(100,200,255))} ${DIM}Provider${RESET} ${WHITE}${runtime.providerName}${RESET}   ${dot(rgb(100,255,160))} ${DIM}Model${RESET} ${WHITE}${runtime.model}${RESET}   ${dot(YELLOW)} ${DIM}Mode${RESET} ${WHITE}${mode}${RESET}`);

  // 功能徽章
  const badge = (text, color) => `${DIM}[${RESET}${color}${text}${RESET}${DIM}]${RESET}`;
  console.log(`  ${badge('Stream', rgb(0,200,255))} ${badge('Memory', PURPLE)} ${badge('MCP', YELLOW)} ${badge('Tools', GREEN)} ${badge('Skills', PINK)} ${badge('Vision', rgb(255,100,100))}`);

  // 桌宠
  const mascot = new Mascot({ species: 'cat' });
  console.log('');
  const mascotLine = mascot.renderWithBubble(mascot.getGreeting(), { colored: true, frame: 0 });
  for (const line of mascotLine.split('\n')) {
    console.log(`  ${line}`);
  }

  console.log('');
  console.log(`  ${DIM}${GRAY}输入 /help 查看命令 | /exit 退出 | 直接输入开始对话${RESET}`);
  console.log(divider('', { color: 'gray', char: '─' }));
  console.log('');
}

export function printMiniBanner(text, options = {}) {
  const { color = 'purple' } = options;
  const c = { purple: PURPLE, cyan: CYAN, green: GREEN }[color] || PURPLE;
  if (!ENABLE_COLOR) return console.log(`--- ${text} ---`);
  console.log(`${DIM}${c}──${RESET} ${c}${text}${RESET} ${DIM}${c}──${RESET}`);
}
