import { postJson } from '../utils/http.js';

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
}
