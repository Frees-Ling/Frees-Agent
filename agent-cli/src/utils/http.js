const DEFAULT_HTTP_TIMEOUT_MS = 45000;

async function request(url, { method = 'POST', headers = {}, body, timeoutMs = DEFAULT_HTTP_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timeoutHandle);
    if (error && typeof error === 'object' && error.name === 'AbortError') {
      throw new Error(`网络请求超时（${timeoutMs}ms），无法访问 ${url}。`);
    }
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`网络连接失败，无法访问 ${url}。原始错误: ${details}`);
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok) {
    const errorText = await response.text();
    const status = response.status;
    let advice = '';
    if (status === 401) advice = ' 建议: 检查 API Key 是否正确配置。';
    else if (status === 403) advice = ' 建议: API Key 权限不足，请检查账号权限。';
    else if (status === 404) advice = ' 建议: API 端点地址错误，请检查 base-url 配置。';
    else if (status === 429) advice = ' 建议: 请求频率过高，请稍后重试或降低并发。';
    else if (status >= 500) advice = ' 建议: 服务端异常，请稍后重试。';
    throw new Error(`HTTP ${status}: ${errorText.slice(0, 500)}${advice}`);
  }

  return response;
}

export async function postJson(url, { headers = {}, body, timeoutMs } = {}) {
  const response = await request(url, {
    method: 'POST',
    headers,
    body,
    timeoutMs
  });
  return response.json();
}

export async function postStream(url, { headers = {}, body, timeoutMs } = {}) {
  const response = await request(url, {
    method: 'POST',
    headers,
    body,
    timeoutMs
  });

  if (!response.body) {
    throw new Error(`服务 ${url} 没有返回可读取的流。`);
  }

  return response.body;
}

export async function consumeLineStream(stream, onLine) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex === -1) {
          break;
        }

        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
        buffer = buffer.slice(newlineIndex + 1);
        await onLine(line);
      }
    }

    buffer += decoder.decode();
    const tail = buffer.replace(/\r$/, '');
    if (tail) {
      await onLine(tail);
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSseEvent(lines) {
  const event = {
    event: 'message',
    data: ''
  };

  for (const line of lines) {
    if (!line || line.startsWith(':')) {
      continue;
    }

    const separatorIndex = line.indexOf(':');
    const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
    const value = separatorIndex === -1 ? '' : line.slice(separatorIndex + 1).trimStart();

    if (field === 'event') {
      event.event = value || 'message';
    } else if (field === 'data') {
      event.data = event.data ? `${event.data}\n${value}` : value;
    }
  }

  return event;
}

export async function consumeSseStream(stream, onEvent) {
  let eventLines = [];

  await consumeLineStream(stream, async line => {
    if (!line.trim()) {
      if (eventLines.length) {
        await onEvent(parseSseEvent(eventLines));
        eventLines = [];
      }
      return;
    }

    eventLines.push(line);
  });

  if (eventLines.length) {
    await onEvent(parseSseEvent(eventLines));
  }
}
