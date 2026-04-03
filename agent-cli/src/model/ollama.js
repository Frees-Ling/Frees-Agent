import { consumeLineStream, postJson, postStream } from '../utils/http.js';

export class OllamaClient {
  constructor({ baseUrl, model }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.model = model;
  }

  async generateText({ systemPrompt, messages, temperature = 0.2, maxOutputTokens = 4000 }) {
    let json;
    try {
      json = await postJson(`${this.baseUrl}/api/chat`, {
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
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Ollama 连接失败。\n` +
          `请确认这几项：\n` +
          `1. Ollama 已经启动\n` +
          `2. 地址 ${this.baseUrl} 可访问\n` +
          `3. 模型 ${this.model} 已经 pull 完成\n` +
          `4. 可先运行: frees-agent doctor --provider ollama --model ${this.model} --ping\n` +
          `原始错误: ${detail}`
      );
    }

    return json?.message?.content || '';
  }

  async streamText({
    systemPrompt,
    messages,
    temperature = 0.2,
    maxOutputTokens = 4000,
    onToken
  }) {
    let stream;
    try {
      stream = await postStream(`${this.baseUrl}/api/chat`, {
        body: {
          model: this.model,
          stream: true,
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
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Ollama 流式连接失败。\n` +
          `请确认这几项：\n` +
          `1. Ollama 已经启动\n` +
          `2. 地址 ${this.baseUrl} 可访问\n` +
          `3. 模型 ${this.model} 已经 pull 完成\n` +
          `4. 当前 Ollama 版本支持 stream=true\n` +
          `5. 可先运行: frees-agent doctor --provider ollama --model ${this.model} --ping\n` +
          `原始错误: ${detail}`
      );
    }

    let fullText = '';
    await consumeLineStream(stream, async line => {
      const trimmed = String(line || '').trim();
      if (!trimmed) {
        return;
      }

      let json;
      try {
        json = JSON.parse(trimmed);
      } catch {
        return;
      }

      const delta = json?.message?.content || '';
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
