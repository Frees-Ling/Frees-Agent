import { postJson } from '../utils/http.js';

function getTavilyApiKey(config) {
  return (
    process.env.TAVILY_API_KEY ||
    config?.mcpServers?.tavily?.env?.TAVILY_API_KEY ||
    ''
  );
}

export async function searchWebWithTavily(query, config, { maxResults = 5 } = {}) {
  const apiKey = getTavilyApiKey(config);
  if (!apiKey) {
    throw new Error('未配置 TAVILY_API_KEY，无法执行联网检索。');
  }

  const response = await postJson('https://api.tavily.com/search', {
    body: {
      api_key: apiKey,
      query,
      max_results: maxResults,
      include_answer: true
    }
  });

  return {
    answer: response?.answer || '',
    results: (response?.results || []).map(item => ({
      title: item?.title || '',
      url: item?.url || '',
      content: item?.content || ''
    }))
  };
}

export function shouldUseWebSearch(message = '') {
  const text = String(message || '').toLowerCase();
  if (!text) {
    return false;
  }
  const keywords = [
    '最新',
    '今天',
    '新闻',
    '联网',
    '实时',
    'price',
    'news',
    'today',
    'latest'
  ];
  return keywords.some(keyword => text.includes(keyword));
}
