import { loadConfig } from '../config.js';
import { AnthropicClient } from './anthropic.js';
import { OllamaClient } from './ollama.js';
import { OpenAICompatibleClient } from './openai-compatible.js';

const PROVIDER_PRIORITY = ['ollama', 'openai-compatible', 'mcp', 'anthropic'];

function getApiKey({ apiKey, apiKeyEnv, configKeyEnv }) {
  if (apiKey) {
    return apiKey;
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
    apiKeyEnv: options.apiKeyEnv,
    configKeyEnv: providerConfig.apiKeyEnv
  });

  return {
    config,
    configPath: path,
    providerName,
    model,
    baseUrl,
    apiKey
  };
}

function instantiateClient(runtime) {
  if (runtime.providerName === 'ollama') {
    return new OllamaClient({
      baseUrl: runtime.baseUrl,
      model: runtime.model
    });
  }
  if (runtime.providerName === 'anthropic') {
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
  return String(response || '').trim();
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
  const autoFallback =
    options.autoProvider ??
    runtime.config.conversation?.autoProviderFallback ??
    false;

  if (!autoFallback) {
    return {
      client: instantiateClient(runtime),
      runtime
    };
  }

  const providerQueue = resolveFallbackProviders(runtime.config, runtime.providerName);
  const errors = [];

  for (const providerName of providerQueue) {
    const providerRuntime = await resolveModelRuntime({
      ...options,
      provider: providerName
    });
    const client = instantiateClient(providerRuntime);
    try {
      await pingClient(client);
      return {
        client,
        runtime: providerRuntime
      };
    } catch (error) {
      errors.push(
        `${providerName}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  throw new Error(
    `所有 provider 自动回退均不可用。\n${errors.map(item => `- ${item}`).join('\n')}`
  );
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
