import { consumeSseStream, postJson, postStream } from '../utils/http.js';

function resolveAnthropicMessagesEndpoint(baseUrl) {
  const normalized = String(baseUrl || '').replace(/\/+$/, '');
  if (normalized.endsWith('/v1/messages')) return normalized;
  if (normalized.endsWith('/v1')) return `${normalized}/messages`;
  return `${normalized}/v1/messages`;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class AnthropicClient {
  constructor({ baseUrl, apiKey, model }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.model = model;
    this.maxRetries = 2;
  }

  async _request(payloadBuilder, stream = false) {
    const endpoint = resolveAnthropicMessagesEndpoint(this.baseUrl);
    if (!this.apiKey) throw new Error('Anthropic provider 需要 API Key');

    const headers = {
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01'
    };

    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const body = payloadBuilder();
        return stream
          ? await postStream(endpoint, { headers, body })
          : await postJson(endpoint, { headers, body });
      } catch (error) {
        lastError = error;
        const detail = error instanceof Error ? error.message : String(error);

        const isRetryable =
          detail.includes('ECONNREFUSED') ||
          detail.includes('ECONNRESET') ||
          detail.includes('ETIMEDOUT') ||
          detail.includes('fetch failed') ||
          detail.includes('529') ||
          detail.includes('429') ||
          (error && typeof error === 'object' && error.name === 'AbortError');

        if (isRetryable && attempt < this.maxRetries) {
          const backoff = Math.min(1000 * Math.pow(2, attempt), 5000);
          await sleep(backoff);
          continue;
        }

        throw error;
      }
    }
    throw lastError;
  }

  async generateText({ systemPrompt, messages, temperature = 0.2, maxOutputTokens = 200000 }) {
    const json = await this._request(() => ({
      model: this.model,
      system: systemPrompt,
      temperature,
      max_tokens: maxOutputTokens,
      messages
    }));

    return (json?.content || [])
      .filter(block => block?.type === 'text')
      .map(block => block.text)
      .join('\n');
  }

  async streamText({
    systemPrompt,
    messages,
    temperature = 0.2,
    maxOutputTokens = 16000,
    onToken
  }) {
    const stream = await this._request(() => ({
      model: this.model,
      system: systemPrompt,
      temperature,
      max_tokens: maxOutputTokens,
      stream: true,
      messages
    }), true);

    let fullText = '';
    await consumeSseStream(stream, async event => {
      const data = String(event?.data || '').trim();
      if (!data || data === '[DONE]') return;

      let json;
      try { json = JSON.parse(data); } catch { return; }

      if (json?.type === 'error') {
        throw new Error(json?.error?.message || 'Anthropic 流式输出失败');
      }

      const delta = json?.type === 'content_block_delta' ? json?.delta?.text || '' : '';
      if (!delta) return;

      fullText += delta;
      if (onToken) await onToken(delta);
    });

    return fullText;
  }
}
