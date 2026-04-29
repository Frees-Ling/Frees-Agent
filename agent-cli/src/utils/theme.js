const THEMES = {
  dark: {
    autoAccept: 'rgb(175,135,255)',
    bashBorder: 'rgb(253,93,177)',
    claude: 'rgb(215,119,87)',
    claudeShimmer: 'rgb(235,159,127)',
    permission: 'rgb(177,185,249)',
    planMode: 'rgb(72,150,140)',
    ide: 'rgb(71,130,200)',
    promptBorder: 'rgb(136,136,136)',
    promptBorderShimmer: 'rgb(166,166,166)',
    text: 'rgb(255,255,255)',
    inverseText: 'rgb(0,0,0)',
    inactive: 'rgb(153,153,153)',
    inactiveShimmer: 'rgb(193,193,193)',
    subtle: 'rgb(80,80,80)',
    suggestion: 'rgb(177,185,249)',
    remember: 'rgb(177,185,249)',
    background: 'rgb(0,204,204)',
    success: 'rgb(78,186,101)',
    error: 'rgb(255,107,128)',
    warning: 'rgb(255,193,7)',
    warningShimmer: 'rgb(255,223,57)',
    diffAdded: 'rgb(34,92,43)',
    diffRemoved: 'rgb(122,41,54)',
    diffAddedDimmed: 'rgb(71,88,74)',
    diffRemovedDimmed: 'rgb(105,72,77)',
    diffAddedWord: 'rgb(56,166,96)',
    diffRemovedWord: 'rgb(179,89,107)',
    fastMode: 'rgb(255,120,20)',
    fastModeShimmer: 'rgb(255,165,70)',
  },
  light: {
    autoAccept: 'rgb(135,0,255)',
    bashBorder: 'rgb(255,0,135)',
    claude: 'rgb(215,119,87)',
    claudeShimmer: 'rgb(245,149,117)',
    permission: 'rgb(87,105,247)',
    planMode: 'rgb(0,102,102)',
    ide: 'rgb(71,130,200)',
    promptBorder: 'rgb(153,153,153)',
    promptBorderShimmer: 'rgb(183,183,183)',
    text: 'rgb(0,0,0)',
    inverseText: 'rgb(255,255,255)',
    inactive: 'rgb(102,102,102)',
    inactiveShimmer: 'rgb(142,142,142)',
    subtle: 'rgb(175,175,175)',
    suggestion: 'rgb(87,105,247)',
    remember: 'rgb(0,0,255)',
    background: 'rgb(0,153,153)',
    success: 'rgb(44,122,57)',
    error: 'rgb(171,43,63)',
    warning: 'rgb(150,108,30)',
    warningShimmer: 'rgb(200,158,80)',
    diffAdded: 'rgb(105,219,124)',
    diffRemoved: 'rgb(255,168,180)',
    diffAddedDimmed: 'rgb(199,225,203)',
    diffRemovedDimmed: 'rgb(253,210,216)',
    diffAddedWord: 'rgb(47,157,68)',
    diffRemovedWord: 'rgb(209,69,75)',
    fastMode: 'rgb(255,106,0)',
    fastModeShimmer: 'rgb(255,150,50)',
  },
  'dark-ansi': {
    autoAccept: 'ansi:magentaBright',
    bashBorder: 'ansi:magentaBright',
    claude: 'ansi:redBright',
    claudeShimmer: 'ansi:yellowBright',
    permission: 'ansi:blueBright',
    planMode: 'ansi:cyanBright',
    ide: 'ansi:blue',
    promptBorder: 'ansi:white',
    promptBorderShimmer: 'ansi:whiteBright',
    text: 'ansi:whiteBright',
    inverseText: 'ansi:black',
    inactive: 'ansi:white',
    inactiveShimmer: 'ansi:whiteBright',
    subtle: 'ansi:white',
    suggestion: 'ansi:blueBright',
    remember: 'ansi:blueBright',
    background: 'ansi:cyanBright',
    success: 'ansi:greenBright',
    error: 'ansi:redBright',
    warning: 'ansi:yellowBright',
    warningShimmer: 'ansi:yellowBright',
    diffAdded: 'ansi:green',
    diffRemoved: 'ansi:red',
    diffAddedDimmed: 'ansi:green',
    diffRemovedDimmed: 'ansi:red',
    diffAddedWord: 'ansi:greenBright',
    diffRemovedWord: 'ansi:redBright',
    fastMode: 'ansi:redBright',
    fastModeShimmer: 'ansi:redBright',
  },
  'light-ansi': {
    autoAccept: 'ansi:magenta',
    bashBorder: 'ansi:magenta',
    claude: 'ansi:redBright',
    claudeShimmer: 'ansi:yellowBright',
    permission: 'ansi:blue',
    planMode: 'ansi:cyan',
    ide: 'ansi:blueBright',
    promptBorder: 'ansi:white',
    promptBorderShimmer: 'ansi:whiteBright',
    text: 'ansi:black',
    inverseText: 'ansi:white',
    inactive: 'ansi:blackBright',
    inactiveShimmer: 'ansi:white',
    subtle: 'ansi:blackBright',
    suggestion: 'ansi:blue',
    remember: 'ansi:blue',
    background: 'ansi:cyan',
    success: 'ansi:green',
    error: 'ansi:red',
    warning: 'ansi:yellow',
    warningShimmer: 'ansi:yellowBright',
    diffAdded: 'ansi:green',
    diffRemoved: 'ansi:red',
    diffAddedDimmed: 'ansi:green',
    diffRemovedDimmed: 'ansi:red',
    diffAddedWord: 'ansi:greenBright',
    diffRemovedWord: 'ansi:redBright',
    fastMode: 'ansi:red',
    fastModeShimmer: 'ansi:redBright',
  },
};

const THEME_NAMES = Object.freeze(['dark', 'light', 'dark-ansi', 'light-ansi']);

const ANSI_COLOR_MAP = {
  black: 0, red: 1, green: 2, yellow: 3, blue: 4, magenta: 5, cyan: 6, white: 7,
  blackBright: 8, redBright: 9, greenBright: 10, yellowBright: 11, blueBright: 12, magentaBright: 13, cyanBright: 14, whiteBright: 15,
};

export function getTheme(themeName) {
  if (THEMES[themeName]) return THEMES[themeName];
  return THEMES.dark;
}

export function getThemeNames() {
  return THEME_NAMES;
}

export function themeColorToAnsi(color) {
  const rgbMatch = String(color).match(/rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    return `\x1b[38;2;${r};${g};${b}m`;
  }
  const ansiMatch = String(color).match(/^ansi:(\w+)$/);
  if (ansiMatch) {
    const code = ANSI_COLOR_MAP[ansiMatch[1]];
    if (code !== undefined) {
      return code < 8 ? `\x1b[3${code}m` : `\x1b[9${code - 8}m`;
    }
  }
  return '\x1b[35m';
}

export function applyTheme(text, colorKey, themeName) {
  if (!text) return '';
  const theme = getTheme(themeName);
  const color = theme[colorKey];
  if (!color) return String(text);
  const ansi = themeColorToAnsi(color);
  return `${ansi}${text}\x1b[0m`;
}

export function wrapAnsi(text, colorKey, themeName) {
  return applyTheme(text, colorKey, themeName);
}
