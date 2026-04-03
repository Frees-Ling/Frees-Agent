export async function postJson(url, { headers = {}, body }) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`网络连接失败，无法访问 ${url}。原始错误: ${details}`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return response.json();
}
