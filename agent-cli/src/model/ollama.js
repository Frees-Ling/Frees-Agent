import { postJson } from '../utils/http.js';

export class OllamaClient {
  constructor({ baseUrl, model }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.model = model;
  }

  async generateText({ systemPrompt, messages, temperature = 0.2, maxOutputTokens = 4000 }) {
    const json = await postJson(`${this.baseUrl}/api/chat`, {
      body: {
        model: this.model,
        stream: false,
        options: {
          temperature,
          num_predict: maxOutputTokens
        },
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          ...messages
        ]
      }
    });

    return json?.message?.content || '';
  }
}
