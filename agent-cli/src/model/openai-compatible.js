import { consumeSseStream, postJson, postStream } from '../utils/http.js';

function normalizeMessageContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(part => (typeof part === 'string' ? part : part?.text || '')).join('\n');
  }
  return String(content ?? '');
}

function sanitizeVisibleText(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();
}

function isQwen3ReasoningModel(model) {
  const name = String(model || '').toLowerCase();
  return /qwen\/qwen3|qwen3\./i.test(name) || /qwen3/i.test(name);
}

function extractAssistantText(json) {
  const message = json?.choices?.[0]?.message || {};
  const content = normalizeMessageContent(message?.content);
  const reasoning = normalizeMessageContent(message?.reasoning_content);

  if (content && content.trim()) return sanitizeVisibleText(content);
  if (reasoning && reasoning.trim()) {
    return sanitizeVisibleText(
      reasoning.replace(/^here'?s a thinking process[:：]?/i, '').trim()
    );
  }
  return '';
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildErrorUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, '');
}

function buildErrorMessage(detail, baseUrl, model) {
  const url = buildErrorUrl(baseUrl);
  return (
    `OpenAI 兼容接口连接失败。\n` +
    `请确认这几项：\n` +
    `1. LM Studio 或其他 OpenAI 兼容服务已经启动\n` +
    `2. 地址 ${url} 可访问\n` +
    `3. 模型 ${model} 已经在服务端加载\n` +
    `4. 可先运行: frees-agent doctor --provider openai-compatible --base-url ${url} --model ${model} --ping\n` +
    `原始错误: ${detail}`
  );
}

export class OpenAICompatibleClient {
  constructor({ baseUrl, apiKey, model }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.model = model;
    this.maxRetries = 2;
  }

  async _request(payload, stream = false) {
    if (isQwen3ReasoningModel(this.model)) {
      payload.chat_template_kwargs = {
        ...(payload.chat_template_kwargs || {}),
        enable_thinking: false
      };
    }

    if (stream) payload.stream = true;

    const requestFn = async finalPayload => {
      const url = `${this.baseUrl}/chat/completions`;
      const headers = this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {};

      if (stream) {
        return postStream(url, { headers, body: finalPayload });
      }
      return postJson(url, { headers, body: finalPayload });
    };

    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await requestFn(payload);
      } catch (error) {
        lastError = error;
        const detail = error instanceof Error ? error.message : String(error);

        // Retry on network/server errors
        const isRetryable =
          detail.includes('ECONNREFUSED') ||
          detail.includes('ECONNRESET') ||
          detail.includes('ETIMEDOUT') ||
          detail.includes('fetch failed') ||
          detail.includes('network') ||
          detail.includes('超时') ||
          (error && typeof error === 'object' && error.name === 'AbortError') ||
          detail.includes('500') ||
          detail.includes('502') ||
          detail.includes('503');

        // Temperature=1 retry for models that require it (not retryable, just fallback)
        if (
          !isRetryable &&
          /invalid temperature/i.test(detail) &&
          /only 1 is allowed/i.test(detail) &&
          payload.temperature !== 1
        ) {
          try {
            return await requestFn({ ...payload, temperature: 1 });
          } catch (retryError) {
            const retryDetail = retryError instanceof Error ? retryError.message : String(retryError);
            throw new Error(buildErrorMessage(retryDetail, this.baseUrl, this.model));
          }
        }

        if (isRetryable && attempt < this.maxRetries) {
          const backoff = Math.min(1000 * Math.pow(2, attempt), 5000);
          await sleep(backoff);
          continue;
        }

        throw new Error(buildErrorMessage(detail, this.baseUrl, this.model));
      }
    }

    throw lastError;
  }

  async generateText({ systemPrompt, messages, temperature = 0.2, maxOutputTokens = 16000 }) {
    const payload = {
      model: this.model,
      temperature,
      max_tokens: maxOutputTokens,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...messages.map(msg => ({ role: msg.role, content: msg.content }))
      ]
    };

    const json = await this._request(payload, false);
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
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...messages.map(msg => ({ role: msg.role, content: msg.content }))
      ]
    };

    let stream;
    try {
      stream = await this._request(payload, true);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      // Check if this is a temperature issue
      if (
        /invalid temperature/i.test(detail) &&
        /only 1 is allowed/i.test(detail) &&
        payload.temperature !== 1
      ) {
        try {
          stream = await this._request({ ...payload, temperature: 1 }, true);
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
    let inThinkBlock = false;

    function filterThinkChunk(inputChunk) {
      let chunk = String(inputChunk || '');
      if (!chunk) return '';

      if (inThinkBlock) {
        const end = chunk.toLowerCase().indexOf('</think>');
        if (end === -1) return '';
        inThinkBlock = false;
        chunk = chunk.slice(end + '</think>'.length);
      }

      let output = '';
      while (chunk.length) {
        const lower = chunk.toLowerCase();
        const start = lower.indexOf('<think>');
        if (start === -1) { output += chunk; break; }
        output += chunk.slice(0, start);
        const rest = chunk.slice(start + '<think>'.length);
        const restLower = rest.toLowerCase();
        const end = restLower.indexOf('</think>');
        if (end === -1) { inThinkBlock = true; chunk = ''; break; }
        chunk = rest.slice(end + '</think>'.length);
      }
      return output;
    }

    await consumeSseStream(stream, async event => {
      const data = String(event?.data || '').trim();
      if (!data || data === '[DONE]') return;

      let json;
      try { json = JSON.parse(data); } catch { return; }

      const delta = normalizeMessageContent(
        json?.choices?.[0]?.delta?.content ??
          json?.choices?.[0]?.message?.content ??
          ''
      );

      if (!delta) return;
      const visibleDelta = filterThinkChunk(delta);
      if (!visibleDelta) return;

      fullText += visibleDelta;
      if (onToken) await onToken(visibleDelta);
    });

    return sanitizeVisibleText(fullText);
  }
}
