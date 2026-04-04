import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_CONFIG = {
  defaultProvider: 'openai-compatible',
  defaultModel: 'qwen/qwen3.5-9b',
  providers: {
    ollama: {
      baseUrl: 'http://127.0.0.1:11434',
      model: 'qwen2.5-coder:7b'
    },
    'openai-compatible': {
      baseUrl: 'http://127.0.0.1:1234/v1',
      apiKeyEnv: 'OPENAI_API_KEY',
      model: 'qwen/qwen3.5-9b'
    },
    anthropic: {
      baseUrl: 'https://api.anthropic.com',
      apiKeyEnv: 'ANTHROPIC_API_KEY',
      model: 'claude-sonnet-4-5'
    },
    mcp: {
      baseUrl: 'http://127.0.0.1:1234/v1',
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
        TAVILY_API_KEY: 'YOUR_TAVILY_API_KEY'
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
    maxDurableMemories: 80
  },
  conversation: {
    persistSessions: true,
    streamResponses: true,
    keepRecentMessages: 12,
    summarizeAfterMessages: 18,
    maxSummaryChars: 6000,
    defaultSessionName: 'default'
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
