import { consumeSseStream, postJson, postStream } from '../utils/http.js';

export class AnthropicClient {
  constructor({ baseUrl, apiKey, model }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateText({ systemPrompt, messages, temperature = 0.2, maxOutputTokens = 4000 }) {
    if (!this.apiKey) {
      throw new Error('Anthropic provider 需要 API Key');
    }

    const json = await postJson(`${this.baseUrl}/v1/messages`, {
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: {
        model: this.model,
        system: systemPrompt,
        temperature,
        max_tokens: maxOutputTokens,
        messages
      }
    });

    return (json?.content || [])
      .filter(block => block?.type === 'text')
      .map(block => block.text)
      .join('\n');
  }

  async streamText({
    systemPrompt,
    messages,
    temperature = 0.2,
    maxOutputTokens = 4000,
    onToken
  }) {
    if (!this.apiKey) {
      throw new Error('Anthropic provider 需要 API Key');
    }

    const stream = await postStream(`${this.baseUrl}/v1/messages`, {
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: {
        model: this.model,
        system: systemPrompt,
        temperature,
        max_tokens: maxOutputTokens,
        stream: true,
        messages
      }
    });

    let fullText = '';
    await consumeSseStream(stream, async event => {
      const data = String(event?.data || '').trim();
      if (!data || data === '[DONE]') {
        return;
      }

      let json;
      try {
        json = JSON.parse(data);
      } catch {
        return;
      }

      if (json?.type === 'error') {
        throw new Error(json?.error?.message || 'Anthropic 流式输出失败');
      }

      const delta = json?.type === 'content_block_delta' ? json?.delta?.text || '' : '';
      if (!delta) {
        return;
      }

      fullText += delta;
      if (onToken) {
        await onToken(delta);
      }
    });

    return fullText;
  }
}
