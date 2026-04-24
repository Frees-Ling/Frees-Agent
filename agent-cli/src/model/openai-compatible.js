import { consumeSseStream, postJson, postStream } from '../utils/http.js';

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

  async generateText({ systemPrompt, messages, temperature = 0.2, maxOutputTokens = 16000 }) {
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

    let json;
    try {
      json = await postJson(`${this.baseUrl}/chat/completions`, {
        headers: this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {},
        body: payload
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `OpenAI 兼容接口连接失败。\n` +
          `请确认这几项：\n` +
          `1. LM Studio 或其他 OpenAI 兼容服务已经启动\n` +
          `2. 地址 ${this.baseUrl} 可访问\n` +
          `3. 模型 ${this.model} 已经在服务端加载\n` +
          `4. 可先运行: frees-agent doctor --provider openai-compatible --base-url ${this.baseUrl} --model ${this.model} --ping\n` +
          `原始错误: ${detail}`
      );
    }

    return normalizeMessageContent(json?.choices?.[0]?.message?.content);
  }

  async streamText({
    systemPrompt,
    messages,
    temperature = 0.2,
    maxOutputTokens = 16000,
    onToken
  }) {
    const payload = {
      model: this.model,
      temperature,
      max_tokens: maxOutputTokens,
      stream: true,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...messages.map(message => ({
          role: message.role,
          content: message.content
        }))
      ]
    };

    let stream;
    try {
      stream = await postStream(`${this.baseUrl}/chat/completions`, {
        headers: this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {},
        body: payload
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `OpenAI 兼容接口流式连接失败。\n` +
          `请确认这几项：\n` +
          `1. LM Studio 或其他 OpenAI 兼容服务已经启动\n` +
          `2. 地址 ${this.baseUrl} 可访问\n` +
          `3. 模型 ${this.model} 已经在服务端加载\n` +
          `4. 当前服务支持 stream=true 的 chat/completions 接口\n` +
          `5. 可先运行: frees-agent doctor --provider openai-compatible --base-url ${this.baseUrl} --model ${this.model} --ping\n` +
          `原始错误: ${detail}`
      );
    }

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

      const delta = normalizeMessageContent(
        json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.message?.content ?? ''
      );

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
