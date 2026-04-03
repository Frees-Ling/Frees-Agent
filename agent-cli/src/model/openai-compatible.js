import { postJson } from '../utils/http.js';

function normalizeMessageContent(content) {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map(part => (typeof part === 'string' ? part : part?.text || ''))
      .join('\n');
  }
  return String(content ?? '');
}

export class OpenAICompatibleClient {
  constructor({ baseUrl, apiKey, model }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateText({ systemPrompt, messages, temperature = 0.2, maxOutputTokens = 4000 }) {
    const payload = {
      model: this.model,
      temperature,
      max_tokens: maxOutputTokens,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...messages.map(message => ({
          role: message.role,
          content: message.content
        }))
      ]
    };

    const json = await postJson(`${this.baseUrl}/chat/completions`, {
      headers: this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {},
      body: payload
    });

    return normalizeMessageContent(json?.choices?.[0]?.message?.content);
  }
}
