const FETCH_TIMEOUT_MS = 15000;
const MAX_RESPONSE_BYTES = 512 * 1024; // 512KB

/**
 * Fetch a URL and return its content as text.
 * Handles HTML pages, JSON APIs, and plain text.
 */
export async function fetchUrl(url, options = {}) {
  const { timeoutMs = FETCH_TIMEOUT_MS, maxBytes = MAX_RESPONSE_BYTES } = options;

  if (!url || typeof url !== 'string') {
    throw new Error('url 参数必填');
  }

  // Basic URL validation
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`无效的 URL: ${url}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`不支持的协议: ${parsed.protocol}（仅支持 http/https）`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Frees-Agent/1.0',
        accept: 'text/html,application/json,text/plain,*/*',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const isText = /text\/|application\/json|application\/xml|\+xml|\+json/.test(contentType);

    if (!isText) {
      const truncated = contentType.slice(0, 60);
      throw new Error(`不支持的内容类型: ${truncated}（仅支持文本/HTML/JSON）`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = '';
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.length;
      if (totalBytes > maxBytes) {
        result += decoder.decode(value.subarray(0, maxBytes - (totalBytes - value.length)), { stream: true });
        result += '\n\n[内容截断：响应超过最大大小]';
        reader.cancel();
        break;
      }

      result += decoder.decode(value, { stream: true });
    }

    result += decoder.decode(); // flush

    return {
      url,
      status: response.status,
      contentType,
      content: result,
      truncated: totalBytes > maxBytes,
      size: totalBytes,
    };
  } catch (error) {
    if (error && typeof error === 'object' && error.name === 'AbortError') {
      throw new Error(`获取 URL 超时（${timeoutMs}ms）: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Simple markdown-like extraction from HTML.
 * Strips tags, extracts title, preserves links.
 */
export function htmlToBasicText(html) {
  if (!html) return '';

  let text = html;

  // Extract title
  const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';

  // Remove scripts and styles
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ');

  // Replace links with [text](url)
  text = text.replace(/<a[^>]+href="([^"]+)"[^>]*>([^<]*)<\/a>/gi, '[$2]($1)');

  // Replace images with [img: alt]
  text = text.replace(/<img[^>]+alt="([^"]*)"[^>]*>/gi, '[img: $1]');

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode common entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');

  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();

  // Limit length
  if (text.length > 10000) {
    text = text.slice(0, 10000) + '\n\n[内容截断]';
  }

  return title ? `# ${title}\n\n${text}` : text;
}
