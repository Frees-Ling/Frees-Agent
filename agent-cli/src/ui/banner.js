const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const BLUE = '\x1b[94m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const ENABLE_COLOR = Boolean(process.stdout.isTTY);

function color(text, code) {
  if (!ENABLE_COLOR) {
    return text;
  }
  return `${code}${text}${RESET}`;
}

export function printFreesAgentBanner(runtime, options = {}) {
  const banner = [
    color('  ______                 ___              ___               __ ', CYAN),
    color(' / ____/_______  ___    /   | ____ ____  / (_)___  ____ _/ /_', CYAN),
    color('/ /_  / ___/ _ \\/ _ \\  / /| |/ __ `/ _ \\/ / / __ \\/ __ `/ __/', BLUE),
    color('/ __/ / /  /  __/  __/ / ___ / /_/ /  __/ / / / / / /_/ / /_  ', BLUE),
    color('/_/   /_/   \\___/\\___/ /_/  |_\\__, /\\___/_/_/_/ /_/\\__,_/\\__/  ', CYAN),
    color('                              /____/                           ', CYAN)
  ].join('\n');

  const mode = options.command || 'chat';
  const capabilityLine = [
    `provider=${runtime.providerName}`,
    `model=${runtime.model}`,
    `mode=${mode}`
  ].join('  ');

  const features = [
    color('Memory', GREEN),
    color('Long Context', GREEN),
    runtime.config?.systemIntegration?.computerControl
      ? color('Computer Control', YELLOW)
      : color('Computer Control (manual setup required)', YELLOW)
  ].join('  |  ');

  console.log(banner);
  console.log(color('Frees Agent 已连接模型', `${GREEN}${BOLD}`));
  console.log(color(capabilityLine, DIM));
  console.log(color(features, DIM));
  console.log('');
}
