import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DOCS = [
  {
    slug: 'index',
    title: '文档总览',
    filename: 'README.md'
  },
  {
    slug: 'llm-basics',
    title: '什么是 LLM 模型与 AI 智能体',
    filename: '01-什么是LLM模型与AI智能体.md'
  },
  {
    slug: 'train-llm',
    title: '如何训练自己的 LLM 模型',
    filename: '02-如何训练属于自己的LLM模型.md'
  },
  {
    slug: 'lm-studio-finetune',
    title: '如何对 LM Studio 下载的模型进行二次训练',
    filename: '03-LM-Studio模型二次训练.md'
  },
  {
    slug: 'train-best-practice',
    title: '如何把模型训练到尽量稳定好用',
    filename: '04-如何把模型训练到尽量稳定好用.md'
  },
  {
    slug: 'training-troubleshooting',
    title: '训练模型的常见问题与解决方案',
    filename: '05-训练模型常见问题与解决方案.md'
  },
  {
    slug: 'load-models',
    title: '如何加载模型与接入自己的本地模型或云端 API',
    filename: '06-如何加载模型与接入自己的模型或云端API.md'
  },
  {
    slug: 'memory-long-chat',
    title: 'Frees Agent 的记忆系统与超长对话',
    filename: '07-Frees-Agent记忆与超长对话.md'
  }
];

export function getDocsRoot() {
  return path.resolve(__dirname, '../../docs');
}

export function resolveDocPath(doc) {
  return path.join(getDocsRoot(), doc.filename);
}

export function findDoc(topic) {
  if (!topic) {
    return null;
  }
  const normalized = String(topic).trim().toLowerCase();
  return (
    DOCS.find(doc => doc.slug === normalized) ||
    DOCS.find(doc => doc.filename.toLowerCase() === normalized) ||
    DOCS.find(doc => doc.title.toLowerCase().includes(normalized))
  );
}
