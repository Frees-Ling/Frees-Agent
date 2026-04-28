import { loadConfig } from '../config.js';
import { AnthropicClient } from './anthropic.js';
import { OllamaClient } from './ollama.js';
import { OpenAICompatibleClient } from './openai-compatible.js';

const PROVIDER_PRIORITY = ['ollama', 'openai-compatible', 'mcp', 'anthropic'];
const PROVIDER_PROBE_TIMEOUT_MS = 12000;

function getApiKey({ apiKey, apiKeyEnv, configKeyEnv }) {
  if (apiKey) {
    return apiKey;
  }
  // Backward-compatible behavior:
  // if config mistakenly puts a real key in apiKeyEnv, use it directly.
  if (typeof apiKeyEnv === 'string') {
    const trimmed = apiKeyEnv.trim();
    if (
      trimmed &&
      (trimmed.startsWith('sk-') ||
        trimmed.startsWith('tvly-') ||
        trimmed.startsWith('Bearer ') ||
        trimmed.length > 40)
    ) {
      return trimmed;
    }
  }
  const envName = apiKeyEnv || configKeyEnv;
  if (!envName) {
    return undefined;
  }
  return process.env[envName];
}

export async function resolveModelRuntime(options = {}) {
  const { config, path } = await loadConfig(options.configPath);
  const providerName = options.provider || config.defaultProvider || 'ollama';
  const providerConfig = config.providers?.[providerName] || {};
  const model = options.model || providerConfig.model || config.defaultModel;
  const mcpServerConfig =
    providerName === 'mcp' && providerConfig.server
      ? config.mcpServers?.[providerConfig.server]
      : undefined;
  const baseUrl =
    options.baseUrl ||
    providerConfig.baseUrl ||
    mcpServerConfig?.baseUrl ||
    (providerName === 'ollama'
      ? 'http://127.0.0.1:11434'
      : providerName === 'anthropic'
        ? 'https://api.anthropic.com'
        : 'https://api.openai.com/v1');

  const apiKey = getApiKey({
    apiKey: options.apiKey,
    apiKeyEnv: options.apiKeyEnv || providerConfig.apiKey,
    configKeyEnv: providerConfig.apiKeyEnv
  });

  return {
    config,
    configPath: path,
    providerName,
    providerProtocol: providerConfig.protocol || '',
    model,
    baseUrl,
    apiKey
  };
}

function isLikelyAnthropicEndpoint(baseUrl) {
  const normalized = String(baseUrl || '').toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.includes('anthropic.com')) {
    return true;
  }
  if (normalized.endsWith('/v1/messages')) {
    return true;
  }
  return false;
}

function resolveAnthropicTransport(runtime) {
  const explicit = String(runtime.providerProtocol || '').trim().toLowerCase();
  if (explicit === 'openai-compatible' || explicit === 'openai') {
    return 'openai-compatible';
  }
  if (explicit === 'anthropic') {
    return 'anthropic';
  }
  return isLikelyAnthropicEndpoint(runtime.baseUrl) ? 'anthropic' : 'openai-compatible';
}

function instantiateClient(runtime) {
  if (runtime.providerName === 'ollama') {
    return new OllamaClient({
      baseUrl: runtime.baseUrl,
      model: runtime.model
    });
  }
  if (runtime.providerName === 'anthropic') {
    const transport = resolveAnthropicTransport(runtime);
    if (transport === 'openai-compatible') {
      return new OpenAICompatibleClient({
        baseUrl: runtime.baseUrl,
        apiKey: runtime.apiKey,
        model: runtime.model
      });
    }
    return new AnthropicClient({
      baseUrl: runtime.baseUrl,
      apiKey: runtime.apiKey,
      model: runtime.model
    });
  }
  if (runtime.providerName === 'openai-compatible' || runtime.providerName === 'mcp') {
    return new OpenAICompatibleClient({
      baseUrl: runtime.baseUrl,
      apiKey: runtime.apiKey,
      model: runtime.model
    });
  }
  throw new Error(`不支持的 provider: ${runtime.providerName}`);
}

async function pingClient(client) {
  const response = await client.generateText({
    systemPrompt: 'You are a connectivity checker.',
    messages: [{ role: 'user', content: 'Reply with exactly: PONG' }],
    temperature: 0,
    maxOutputTokens: 16
  });
  const normalized = String(response || '').trim();
  if (!normalized) {
    throw new Error('连接探测失败：模型返回空内容。');
  }
  return normalized;
}

async function pingClientWithTimeout(client, timeoutMs = PROVIDER_PROBE_TIMEOUT_MS) {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`连接探测超时（${timeoutMs}ms）`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([pingClient(client), timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function resolveFallbackProviders(config, preferred) {
  const configured = Object.keys(config.providers || {});
  const sorted = PROVIDER_PRIORITY.filter(name => configured.includes(name));
  const remaining = configured.filter(name => !sorted.includes(name));
  const queue = [...sorted, ...remaining];
  if (preferred && queue.includes(preferred)) {
    return [preferred, ...queue.filter(item => item !== preferred)];
  }
  return queue;
}

export async function createModelClient(options = {}) {
  const runtime = await resolveModelRuntime(options);
  const providerExplicit = options.provider !== undefined && options.provider !== null;
  const autoFallback =
    options.autoProvider ??
    (providerExplicit ? false : undefined) ??
    runtime.config.conversation?.autoProviderFallback ??
    false;

  if (!autoFallback) {
    return {
      client: instantiateClient(runtime),
      runtime
    };
  }

  const providerQueue = resolveFallbackProviders(runtime.config, runtime.providerName);
  const probeTasks = await Promise.all(
    providerQueue.map(async providerName => {
      const providerRuntime = await resolveModelRuntime({
        ...options,
        provider: providerName
      });
      const client = instantiateClient(providerRuntime);
      return {
        providerName,
        providerRuntime,
        client
      };
    })
  );

  const errors = [];
  const attempts = probeTasks.map(task =>
    pingClientWithTimeout(task.client)
      .then(() => ({
        ok: true,
        providerName: task.providerName,
        providerRuntime: task.providerRuntime,
        client: task.client
      }))
      .catch(error => {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${task.providerName}: ${message}`);
        throw error;
      })
  );

  try {
    const winner = await Promise.any(attempts);
    return {
      client: winner.client,
      runtime: winner.providerRuntime
    };
  } catch {
    throw new Error(
      `所有 provider 自动回退均不可用。\n${errors.map(item => `- ${item}`).join('\n')}`
    );
  }
}

export async function createRoleModelClient(options = {}, role = 'planner') {
  const base = await resolveModelRuntime(options);
  const roleConfig = base.config.roles?.[role] || {};
  return createModelClient({
    ...options,
    provider: roleConfig.provider || options.provider || base.providerName,
    model: roleConfig.model || options.model || base.model,
    autoProvider: true
  });
}
