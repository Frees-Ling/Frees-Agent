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

function extractAssistantText(json) {
  const message = json?.choices?.[0]?.message || {};
  const primary = normalizeMessageContent(message?.content);
  if (primary) {
    return primary;
  }
  const reasoning = normalizeMessageContent(
    message?.reasoning_content ?? json?.choices?.[0]?.reasoning_content ?? ''
  );
  if (reasoning) {
    return reasoning;
  }
  return '';
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

    const requestOnce = async finalPayload =>
      postJson(`${this.baseUrl}/chat/completions`, {
        headers: this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {},
        body: finalPayload
      });

    let json;
    try {
      json = await requestOnce(payload);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      // Some OpenAI-compatible gateways only accept temperature=1 for specific models.
      if (
        /invalid temperature/i.test(detail) &&
        /only 1 is allowed/i.test(detail) &&
        payload.temperature !== 1
      ) {
        try {
          json = await requestOnce({
            ...payload,
            temperature: 1
          });
        } catch (retryError) {
          const retryDetail = retryError instanceof Error ? retryError.message : String(retryError);
          throw new Error(
            `OpenAI 兼容接口连接失败。\n` +
              `请确认这几项：\n` +
              `1. LM Studio 或其他 OpenAI 兼容服务已经启动\n` +
              `2. 地址 ${this.baseUrl} 可访问\n` +
              `3. 模型 ${this.model} 已经在服务端加载\n` +
              `4. 可先运行: frees-agent doctor --provider openai-compatible --base-url ${this.baseUrl} --model ${this.model} --ping\n` +
              `原始错误: ${retryDetail}`
          );
        }
      } else {
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
    }

    return extractAssistantText(json);
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

    const requestStream = async finalPayload =>
      postStream(`${this.baseUrl}/chat/completions`, {
        headers: this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {},
        body: finalPayload
      });

    let stream;
    try {
      stream = await requestStream(payload);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (
        /invalid temperature/i.test(detail) &&
        /only 1 is allowed/i.test(detail) &&
        payload.temperature !== 1
      ) {
        try {
          stream = await requestStream({
            ...payload,
            temperature: 1
          });
        } catch (retryError) {
          const retryDetail = retryError instanceof Error ? retryError.message : String(retryError);
          throw new Error(
            `OpenAI 兼容接口流式连接失败。\n` +
              `请确认这几项：\n` +
              `1. LM Studio 或其他 OpenAI 兼容服务已经启动\n` +
              `2. 地址 ${this.baseUrl} 可访问\n` +
              `3. 模型 ${this.model} 已经在服务端加载\n` +
              `4. 当前服务支持 stream=true 的 chat/completions 接口\n` +
              `5. 可先运行: frees-agent doctor --provider openai-compatible --base-url ${this.baseUrl} --model ${this.model} --ping\n` +
              `原始错误: ${retryDetail}`
          );
        }
      } else {
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
        json?.choices?.[0]?.delta?.content ??
          json?.choices?.[0]?.delta?.reasoning_content ??
          json?.choices?.[0]?.message?.content ??
          json?.choices?.[0]?.message?.reasoning_content ??
          ''
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
