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
    maxDurableMemories: 80,
    autoMergeAcrossDevices: true,
    syncRoots: [],
    syncWritesToRoots: false,
    vectorMemory: {
      enabled: true,
      topK: 6
    }
  },
  conversation: {
    persistSessions: true,
    streamResponses: true,
    maxOutputTokens: 16000,
    keepRecentMessages: 12,
    summarizeAfterMessages: 18,
    maxRecentContextTokens: 12000,
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
// (base) PS E:\Frees_Ling\Code\Frees-Agent> frees-agent.cmd chat
// ╔════════════════════════════════════════════════════════════════════╗
// ║  ______                 ___              ___               __      ║
// ║ / ____/_______  ___    /   | ____ ____  / (_)___  ____ _/ /_     ║
// ║/ /_  / ___/ _ \/ _ \  / /| |/ __ `/ _ \/ / / __ \/ __ `/ __/     ║
// ║/ __/ / /  /  __/  __/ / ___ / /_/ /  __/ / / / / / /_/ / /_      ║
// ║/_/   /_/   \___/\___/ /_/  |_\__, /\___/_/_/_/ /_/\__,_/\__/      ║
// ║                              /____/                                ║
// ╚════════════════════════════════════════════════════════════════════╝
// Frees Agent 已连接模型
// Provider: openai-compatible | Model: qwen/qwen3.6-27b | Mode: chat
// Features: Streaming | Memory | Long Context | Computer Control Requires Manual Setup
// Tip: 输入 /help 查看聊天命令；如果模型连不上，先运行 frees-agent doctor --ping

// [chat] workspace indexed: 77/78 files
// [chat] loaded skills: 1
// Frees Agent Chat 已启动
// 会话: default (frees-agent-default-b05010a5)
// 输入 /help 查看命令，输入 /exit 退出。
// 如果对话失败，不要退出终端，直接看错误提示并按提示修复。
// 流式输出: 开启
// > 你都会做什么
// 用户询问“你都会做什么”，即询问我的能力。
// 根据系统提示，我是 Frees Agent，运行在终端中的资深 AI 智能体与工程助手。
// 根据工作区概览，这是一个基于 Node.js 的 CLI 项目（`agent-cli`），包含记忆系统、模型接入、工具调用等功能。
// 我应该基于系统提示中的定义（资深 AI 智能体与工程助手）以及工作区中的实际代码结构（如 `src/commands`, `src/tools`, `src/memory` 等）来回答。

// 核心能力包括：
// 1.  **代码工程与开发**：基于 Rust 等栈（用户画像），处理代码生成、调试、重构。
// 2.  **终端交互与自动化**：作为 CLI 工具运行，执行命令、管理文件。
// 3.  **记忆与上下文管理**：持久化记忆（用户画像、长期记忆）、长对话摘要。
// 4.  **模型接入**：支持多种 LLM 模型（Ollama, OpenAI 兼容等）。
// 5.  **工具调用**：联网搜索、文件操作等。

// 回答策略：
// 1.  直接列出核心能力，分类清晰。
// 2.  结合工作区文件（如 `src/memory`, `src/tools`, `src/model`）佐证我的能力来源。
// 3.  保持简洁，不重复自我介绍。

// 具体能力点：
// -   **代码开发**：编写、调试、解释代码（特别是 Rust，基于用户画像）。
// -   **项目管理**：文件操作、目录结构分析、Git 操作。
// -   **记忆系统**：记住用户偏好、项目上下文、历史对话。
// -   **工具使用**：联网搜索、本地文件读写、执行 Shell 命令。
// -   **模型适配**：支持本地模型（Ollama）和云端 API。

// 不需要读取文件，因为系统提示和工作区概览已经提供了足够的信息来概括能力。工作区概览显示了 `src/memory`, `src/tools`, `src/model` 等目录，证实了这些功能的存在。

// 回答结构：
// 1.  代码与工程辅助（核心）。
// 2.  记忆与上下文（特色）。
// 3.  工具与自动化（能力）。
// 4.  模型支持（底层）。

// 注意：用户画像中提到用户正在开发 Rust 猜数字游戏，可以顺带提一下我可以协助该项目。

// 修正：用户问的是“你都会做什么”，我应该从 Agent 的角度回答，而不是仅仅列出文件。
// 基于 `agent-cli` 的结构，我具备：
// -   **对话与推理**：处理复杂指令。
// -   **文件操作**：读写、编辑代码。
// -   **记忆管理**：持久化存储用户信息。
// -   **工具调用**：搜索、执行命令。

// 回答草稿：
// 作为 Frees Agent，我主要具备以下能力：
// 1.  **代码工程与开发**：编写、调试、重构代码（特别是 Rust），分析项目结构。
// 2.  **记忆与上下文**：持久化记忆用户偏好、项目状态和历史对话，支持长上下文。
// 3.  **工具调用与自动化**：执行 Shell 命令、文件操作、联网搜索。
// 4.  **模型接入**：支持 Ollama、OpenAI 兼容等多种模型后端。

// 可以协助你继续开发那个 Rust 猜数字游戏。

// 检查约束：
// -   准确、简洁、可执行。
// -   不重复自我介绍。
// -   默认不使用 emoji。
// -   基于工作区回答。

// 工作区中有 `src/memory`, `src/tools`, `src/model`，这证实了上述能力。
// 用户画像中有 Rust 和猜数字游戏，这证实了可以协助该项目。

// 最终回答将整合这些点。


// 作为 Frees Agent，我主要具备以下核心能力：

// 1.  **代码工程与开发**
//     *   编写、调试、重构代码（基于你的偏好，重点支持 **Rust**）。
//     *   分析项目结构、解释代码逻辑、生成单元测试。
//     *   协助你继续开发 `C:\Users\lenovo\Desktop\ai-game` 下的猜数字游戏。

// 2.  **记忆与上下文管理**
//     *   **持久化记忆**：记住你的偏好、技能栈、项目状态和历史对话摘要。
//     *   **长上下文支持**：在长对话中保持逻辑连贯，不丢失关键信息。

// 3.  **工具调用与自动化**
//     *   **文件操作**：读取、创建、编辑工作区内的文件。
//     *   **命令执行**：在终端中执行 Shell 命令（如 `cargo build`, `git status` 等）。
//     *   **联网搜索**：获取最新信息或文档。

// 4.  **模型接入**
//     *   支持接入多种 LLM 后端（如 Ollama 本地模型、OpenAI 兼容 API 等），可根据配置灵活切换。

// 你可以直接下达指令，例如：“帮我检查猜数字游戏的逻辑” 或 “搜索 Rust 最新的异步编程最佳实践”。
