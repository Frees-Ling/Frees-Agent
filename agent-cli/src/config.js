import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_CONFIG = {
  defaultProvider: 'openai-compatible',
  defaultModel: 'qwen/qwen3.5-9b',
  providers: {
    ollama: {
      baseUrl: 'http://127.0.0.1:11434',
      model: 'qwen2.5-coder:7b'
    },
    'openai-compatible': {
      baseUrl: 'http://127.0.0.1:1234/v1',// http://127.0.0.1:1234/v1
      apiKey: '',
      apiKeyEnv: 'OPENAI_API_KEY',
      model: 'qwen/qwen3.6-27b'
    },
    anthropic: {
      baseUrl: 'https://api.moonshot.cn/v1',
      apiKey: 'sk-TR3voqvwMLF9rT38AeIxUuHfPoPMeP7qWbxnqNySuj7kQm1j',
      apiKeyEnv: 'sk-TR3voqvwMLF9rT38AeIxUuHfPoPMeP7qWbxnqNySuj7kQm1j',
      model: 'kimi-k2.6'
    },//sk-29aeab513e764eb08a964adf8ac6c93e
    mcp: {
      baseUrl: 'http://127.0.0.1:1234/v1',
      apiKey: '',
      apiKeyEnv: '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',
      model: 'qwen/qwen3.5-9b',
      server: 'tavily'
    }
  },
  mcpServers: {
    tavily: {
      command: 'npx',
      args: ['@tavily/mcp'],
      env: {
        TAVILY_API_KEY: 'vly-dev-2eeZkg-uvzDyDhZb41ffLx5YQitQYJ1gfLsq4WU4BxfJ9aQxk'
      },
      baseUrl: 'http://127.0.0.1:1234/v1'
    }
  },
  localModels: [
    {
      id: 'qwen-coder-gguf',
      backend: 'ollama',
      format: 'gguf',
      note:
        'Ollama/llama.cpp/LM Studio 常见本地格式。若是切割模型，可记录第一片或目录，例如 model-00001-of-00004.gguf。'
    },
    {
      id: 'qwen-coder-mlx',
      backend: 'openai-compatible',
      format: 'mlx',
      note: 'Apple Silicon 上常见，可通过本地 OpenAI 兼容服务暴露给 CLI。'
    },
    {
      id: 'qwen-coder-safetensors',
      backend: 'openai-compatible',
      format: 'safetensors',
      note: '可通过 vLLM/TGI 等本地服务，以 OpenAI 兼容 API 对接。'
    }
  ],
  workspace: {
    ignore: [
      '.git',
      'node_modules',
      'dist',
      'build',
      'coverage',
      '.next',
      '.nuxt',
      '.turbo',
      '.idea',
      '.vscode'
    ],
    maxFileBytes: 1024 * 1024,
    maxWorkspaceBytes: 24 * 1024 * 1024
  },
  memory: {
    enabled: true,
    autoExtract: true,
    includeUserProfile: true,
    includeDurableMemories: true,
    maxDurableMemories: 80,
    autoMergeAcrossDevices: true,
    syncRoots: [],
    syncWritesToRoots: false,
    vectorMemory: {
      enabled: true,
      topK: 6
    },
    embeddings: {
      enabled: true,
      provider: 'fnv',
      cacheSize: 500
    }
  },
  conversation: {
    persistSessions: true,
    streamResponses: true,
    maxOutputTokens: 16000,
    keepRecentMessages: 12,
    summarizeAfterMessages: 18,
    maxRecentContextTokens: 2800,
    maxHistoryMessages: 10,
    hardContextCap: 3200,
    maxSummaryChars: 6000,
    defaultSessionName: 'default',
    planningEnabled: true,
    reflectionEnabled: true,
    autoProviderFallback: true,
    autoContinueOnCutoff: true
  },
  roles: {
    planner: {
      provider: '',
      model: ''
    },
    critic: {
      provider: '',
      model: ''
    }
  },
  tools: {
    enabledInChat: true,
    allowShellInChat: false,
    webSearch: {
      enabled: true,
      provider: 'tavily',
      maxResults: 5
    }
  },
  systemIntegration: {
    computerControl: false,
    requiresManualApproval: true,
    shellExecution: false,
    accessibilityGuidedSetup: true
  }
};

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (!isObject(base) || !isObject(override)) {
    return override ?? base;
  }

  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) {
      continue;
    }
    if (isObject(value) && isObject(base[key])) {
      merged[key] = deepMerge(base[key], value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

export function getDefaultConfig() {
  return structuredClone(DEFAULT_CONFIG);
}

export function getDefaultConfigPath() {
  const homeOverride = process.env.FREES_AGENT_HOME;
  if (homeOverride) {
    return path.join(path.resolve(homeOverride), 'config.json');
  }
  // XDG_CONFIG_HOME on Linux/macOS
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  if (xdgConfig) {
    return path.join(xdgConfig, 'frees-agent', 'config.json');
  }
  // macOS: ~/Library/Application Support
  if (process.platform === 'darwin') {
    const home = process.env.HOME;
    if (home) {
      return path.join(home, 'Library', 'Application Support', 'frees-agent', 'config.json');
    }
  }
  // Windows: %APPDATA%
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    if (appData) {
      return path.join(appData, 'frees-agent', 'config.json');
    }
  }
  // Fallback: project-local .frees-agent
  return path.resolve(process.cwd(), '.frees-agent', 'config.json');
}

export function getConfigPath(explicitPath) {
  return explicitPath || process.env.AI_AGENT_CONFIG || getDefaultConfigPath();
}

export async function loadConfig(explicitPath) {
  const configPath = getConfigPath(explicitPath);
  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      path: configPath,
      config: deepMerge(getDefaultConfig(), parsed)
    };
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return {
        path: configPath,
        config: getDefaultConfig()
      };
    }
    throw new Error(`读取配置失败: ${configPath}`);
  }
}

export async function writeDefaultConfig(explicitPath, { force = false } = {}) {
  const configPath = getConfigPath(explicitPath);
  const configDir = path.dirname(configPath);
  await mkdir(configDir, { recursive: true });

  if (!force) {
    try {
      await readFile(configPath, 'utf8');
      throw new Error(`配置文件已存在: ${configPath}，如需覆盖请使用 --force`);
    } catch (error) {
      if (!error || typeof error !== 'object' || error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  await writeFile(configPath, `${JSON.stringify(getDefaultConfig(), null, 2)}\n`, 'utf8');
  return configPath;
}

export function getDefaultConfigPathForProfile(profileName = 'default') {
  const homeOverride = process.env.FREES_AGENT_HOME;
  if (homeOverride) {
    return path.join(path.resolve(homeOverride), `${profileName}.json`);
  }
  // Determine config directory based on platform
  let configDir;
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  if (xdgConfig) {
    configDir = path.join(xdgConfig, 'frees-agent');
  } else if (process.platform === 'darwin') {
    configDir = process.env.HOME
      ? path.join(process.env.HOME, 'Library', 'Application Support', 'frees-agent')
      : path.resolve(process.cwd(), '.frees-agent');
  } else if (process.platform === 'win32') {
    configDir = process.env.APPDATA
      ? path.join(process.env.APPDATA, 'frees-agent')
      : path.resolve(process.cwd(), '.frees-agent');
  } else {
    configDir = path.resolve(process.cwd(), '.frees-agent');
  }
  if (profileName === 'default') {
    return path.join(configDir, 'config.json');
  }
  return path.join(configDir, `config-${profileName}.json`);
}

export function expandEnvVars(value) {
  if (typeof value === 'string') {
    return value.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] || '');
  }
  if (Array.isArray(value)) {
    return value.map(expandEnvVars);
  }
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = expandEnvVars(val);
    }
    return result;
  }
  return value;
}

const CONFIG_SCHEMA = {
  defaultProvider: { type: 'string', required: false },
  defaultModel: { type: 'string', required: false },
  providers: { type: 'object', required: false },
  mcpServers: {
    type: 'object',
    required: false,
    validate: (value) => {
      if (!value || typeof value !== 'object') return [];
      const errors = [];
      for (const [name, config] of Object.entries(value)) {
        if (!config.command && !config.url) {
          errors.push(`mcpServers.${name}: 需要 command 或 url`);
        }
        if (config.timeoutMs !== undefined && (typeof config.timeoutMs !== 'number' || config.timeoutMs < 1000)) {
          errors.push(`mcpServers.${name}.timeoutMs: 必须 >= 1000`);
        }
      }
      return errors;
    }
  }
};

export function validateConfig(config) {
  const errors = [];
  for (const [key, schema] of Object.entries(CONFIG_SCHEMA)) {
    const value = config[key];
    if (value === undefined || value === null) {
      if (schema.required) {
        errors.push(`缺少必要配置: ${key}`);
      }
      continue;
    }
    if (schema.type === 'string' && typeof value !== 'string') {
      errors.push(`${key}: 应为字符串`);
    }
    if (schema.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
      errors.push(`${key}: 应为对象`);
    }
    if (schema.validate) {
      const schemaErrors = schema.validate(value);
      errors.push(...schemaErrors);
    }
  }
  return errors;
}

export function getFreesAgentVersion() {
  const pkgPath = path.resolve(__dirname, '..', 'package.json');
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf8')).version || '0.1.0';
  } catch {
    return '0.1.0';
  }
}

export function getFreesAgentHome() {
  if (process.env.FREES_AGENT_HOME) return path.resolve(process.env.FREES_AGENT_HOME);
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  if (xdgConfig) return path.join(xdgConfig, 'frees-agent');
  if (process.platform === 'darwin') {
    const home = process.env.HOME;
    if (home) return path.join(home, 'Library', 'Application Support', 'frees-agent');
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    if (appData) return path.join(appData, 'frees-agent');
  }
  return path.resolve(process.cwd(), '.frees-agent');
}
