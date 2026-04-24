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
    slug: 'mcp-integration',
    title: '如何接入 MCP 外部工具并配置 Frees Agent',
    filename: '16-如何接入MCP外部工具.md'
  },
  {
    slug: 'memory-long-chat',
    title: 'Frees Agent 的记忆系统与超长对话',
    filename: '07-Frees-Agent记忆与超长对话.md'
  },
  {
    slug: 'datasets',
    title: '数据集构建、清洗、标注与评测',
    filename: '08-数据集构建清洗标注与评测.md'
  },
  {
    slug: 'model-apps',
    title: '模型应用、产品化与落地路线图',
    filename: '09-模型应用产品化与落地路线图.md'
  },
  {
    slug: 'permissions',
    title: '系统权限、电脑控制与安全边界',
    filename: '10-系统权限电脑控制与安全边界.md'
  },
  {
    slug: 'load-model-step-by-step',
    title: '手把手把模型加载到 Frees Agent',
    filename: '11-手把手把模型加载到Frees-Agent.md'
  },
  {
    slug: 'extend-frees-agent',
    title: '如何拓展开发 Frees Agent',
    filename: '12-如何拓展开发Frees-Agent.md'
  },
  {
    slug: 'architecture',
    title: 'Frees Agent 项目架构说明',
    filename: '13-项目架构说明.md'
  },
  {
    slug: 'skills',
    title: 'Skill 文件支持与编写说明',
    filename: '14-Skill文件支持与编写说明.md'
  },
  {
    slug: 'source-analysis',
    title: 'Frees Agent 项目源码逐文件逐函数剖析',
    filename: '15-Frees-Agent项目源码逐文件逐函数剖析.md'
  },
  {
    slug: 'fast-project-editing',
    title: '快速项目式改造执行指南',
    filename: '17-快速项目式改造执行指南.md'
  },
  {
    slug: 'agent-memory-architecture',
    title: 'Agent Memory Architecture',
    filename: '18-agent-memory-architecture.md'
  },
  {
    slug: 'feature-config',
    title: '自动联网与新功能配置指南',
    filename: '19-自动联网与新功能配置指南.md'
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
