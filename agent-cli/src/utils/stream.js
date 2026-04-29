// 流式令牌批处理器 —— 解决输出"一卡一卡"问题
// 将小块令牌批量缓冲，按定时器刷新到 stdout，实现平滑输出

import { stdout } from 'node:process';

const DEFAULT_FLUSH_INTERVAL_MS = 30; // 30ms 刷新间隔，人眼感觉流畅
const MAX_BUFFER_SIZE = 512;          // 最大缓冲字符数（超限立即刷新）

export class StreamBatcher {
  constructor({ onFlush, intervalMs = DEFAULT_FLUSH_INTERVAL_MS, maxSize = MAX_BUFFER_SIZE } = {}) {
    this.buffer = '';
    this.intervalMs = intervalMs;
    this.maxSize = maxSize;
    this.onFlush = onFlush;
    this.timer = null;
    this.destroyed = false;
  }

  write(chunk) {
    if (this.destroyed || !chunk) return;
    this.buffer += String(chunk);

    if (this.buffer.length >= this.maxSize) {
      this.flush();
      return;
    }

    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.intervalMs);
      // 使用 unref 让定时器不阻止进程退出
      if (this.timer.unref) this.timer.unref();
    }
  }

  flush() {
    if (this.destroyed) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.buffer) return;

    const data = this.buffer;
    this.buffer = '';

    if (this.onFlush) {
      this.onFlush(data);
    } else {
      stdout.write(data);
    }
  }

  end() {
    this.flush();
    this.destroyed = true;
  }

  destroy() {
    this.destroyed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.buffer = '';
  }
}

// 创建一个适配 onToken 的批处理包装器
// 用法: 将原有的 onToken 传入此函数，返回包装后的 onToken
export function createSmoothTokenHandler(onToken) {
  let fullText = '';
  let lastFlushLength = 0;

  const batcher = new StreamBatcher({
    onFlush: (chunk) => {
      if (onToken) onToken(chunk);
    },
    intervalMs: 30
  });

  return {
    handler: (token) => {
      fullText += token;
      batcher.write(token);
    },
    end: () => {
      batcher.end();
      return fullText;
    },
    getFullText: () => fullText
  };
}
