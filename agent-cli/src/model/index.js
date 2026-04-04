import { loadConfig } from '../config.js';
import { AnthropicClient } from './anthropic.js';
import { OllamaClient } from './ollama.js';
import { OpenAICompatibleClient } from './openai-compatible.js';

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

export async function createModelClient(options = {}) {
  const runtime = await resolveModelRuntime(options);
  let client = null;

  if (runtime.providerName === 'ollama') {
    client = new OllamaClient({
      baseUrl: runtime.baseUrl,
      model: runtime.model
    });
  } else if (runtime.providerName === 'anthropic') {
    client = new AnthropicClient({
      baseUrl: runtime.baseUrl,
      apiKey: runtime.apiKey,
      model: runtime.model
    });
  } else if (runtime.providerName === 'openai-compatible' || runtime.providerName === 'mcp') {
    client = new OpenAICompatibleClient({
      baseUrl: runtime.baseUrl,
      apiKey: runtime.apiKey,
      model: runtime.model
    });
  } else {
    throw new Error(`不支持的 provider: ${runtime.providerName}`);
  }

  return {
    client,
    runtime
  };
}
