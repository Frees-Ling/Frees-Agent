async function request(url, { method = 'POST', headers = {}, body } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`网络连接失败，无法访问 ${url}。原始错误: ${details}`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return response;
}

export async function postJson(url, { headers = {}, body }) {
  const response = await request(url, {
    method: 'POST',
    headers,
    body
  });
  return response.json();
}

export async function postStream(url, { headers = {}, body }) {
  const response = await request(url, {
    method: 'POST',
    headers,
    body
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
