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
    throw new Error(
      '联网搜索需要配置 TAVILY_API_KEY。\n' +
      '  方式1: set TAVILY_API_KEY=your_key_here\n' +
      '  方式2: 在配置文件的 mcpServers.tavily.env.TAVILY_API_KEY 中设置\n' +
      '  申请地址: https://app.tavily.com/home'
    );
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

// 判断是否需要联网搜索 — 覆盖日常查询场景
export function shouldUseWebSearch(message = '') {
  const text = String(message || '').toLowerCase();
  if (!text) return false;

  // 中文生活查询
  const cnPatterns = [
    '天气', '新闻', '最新', '今天', '明天', '本周',
    '汇率', '股票', '股价', '金价', '油价',
    '地铁', '公交', '路况', '限行',
    '上映', '票房', '热搜', '热门',
    '百科', '是谁', '什么是', '怎么样',
    '价格', '多少', '哪里', '怎么',
    '上海', '北京', '深圳', '广州', '杭州',
  ];

  // 英文查询
  const enPatterns = [
    'weather', 'news', 'today', 'latest', 'price',
    'stock', 'rate', 'forecast', 'trending',
    'what is', 'who is', 'how to', 'where is',
  ];

  // 特殊句式
  const questionPatterns = [
    /^(查|搜|找|看|帮我查|帮我搜|帮我找|帮我看看)\s*.+/i,
    /^.*(怎么[样样]|什么情况|怎么回事|啥情况).*$/i,
  ];

  // 带网址的
  if (/https?:\/\/[^\s]+/.test(text)) return true;

  // 超过 2 个关键词命中即触发联网
  let hits = 0;
  for (const kw of cnPatterns) { if (text.includes(kw)) hits++; }
  for (const kw of enPatterns) { if (text.includes(kw)) hits++; }
  if (hits >= 2) return true;

  // 单个核心关键词
  if (cnPatterns.some(kw => text.includes(kw))) return true;
  if (enPatterns.some(kw => text.includes(kw))) return true;

  // 疑问句式
  if (questionPatterns.some(p => p.test(text))) return true;

  return false;
}
