import { consumeLineStream, postJson, postStream } from '../utils/http.js';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class OllamaClient {
  constructor({ baseUrl, model }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.model = model;
    this.maxRetries = 2;
  }

  async _request(payloadBuilder, stream = false) {
    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const body = payloadBuilder();
        return stream
          ? await postStream(`${this.baseUrl}/api/chat`, { body })
          : await postJson(`${this.baseUrl}/api/chat`, { body });
      } catch (error) {
        lastError = error;
        const detail = error instanceof Error ? error.message : String(error);

        const isRetryable =
          detail.includes('ECONNREFUSED') ||
          detail.includes('ECONNRESET') ||
          detail.includes('ETIMEDOUT') ||
          detail.includes('fetch failed') ||
          (error && typeof error === 'object' && error.name === 'AbortError');

        if (isRetryable && attempt < this.maxRetries) {
          const backoff = Math.min(1000 * Math.pow(2, attempt), 5000);
          await sleep(backoff);
          continue;
        }

        const streamLabel = stream ? '流式' : '';
        throw new Error(
          `Ollama ${streamLabel}连接失败。\n` +
            `请确认这几项：\n` +
            `1. Ollama 已经启动\n` +
            `2. 地址 ${this.baseUrl} 可访问\n` +
            `3. 模型 ${this.model} 已经 pull 完成\n` +
            `4. 可先运行: frees-agent doctor --provider ollama --model ${this.model} --ping\n` +
            `原始错误: ${detail}`
        );
      }
    }
    throw lastError;
  }

  _buildMessages(systemPrompt, messages) {
    return [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...messages
    ];
  }

  async generateText({ systemPrompt, messages, temperature = 0.2, maxOutputTokens = 16000 }) {
    const json = await this._request(() => ({
      model: this.model,
      stream: false,
      options: { temperature, num_predict: maxOutputTokens },
      messages: this._buildMessages(systemPrompt, messages)
    }));

    return json?.message?.content || '';
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
      stream: true,
      options: { temperature, num_predict: maxOutputTokens },
      messages: this._buildMessages(systemPrompt, messages)
    }), true);

    let fullText = '';
    await consumeLineStream(stream, async line => {
      const trimmed = String(line || '').trim();
      if (!trimmed) return;

      let json;
      try { json = JSON.parse(trimmed); } catch { return; }

      const delta = json?.message?.content || '';
      if (!delta) return;

      fullText += delta;
      if (onToken) await onToken(delta);
    });

    return fullText;
  }
}
