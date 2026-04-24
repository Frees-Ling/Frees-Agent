import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { shortHash } from '../utils/slug.js';

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

async function readJson(filePath, fallback) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function loadTaskMemory(taskPath) {
  const data = await readJson(taskPath, { tasks: [] });
  if (!Array.isArray(data?.tasks)) {
    return { tasks: [] };
  }
  return data;
}

export async function saveTaskMemory(taskPath, tasks) {
  await writeJson(taskPath, { tasks });
}

export function inferTasksFromMessage(text) {
  const source = normalizeText(text);
  if (!source) {
    return [];
  }

  const patterns = [
    /(?:请|帮我|需要)\s*(?:实现|完成|新增|修复|优化)\s*([^。！!\n]+)/gi,
    /(?:任务|todo|待办)\s*[:：]\s*([^。！!\n]+)/gi
  ];
  const matches = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const title = normalizeText(match?.[1]);
      if (title) {
        matches.push(title);
      }
    }
  }

  if (!matches.length && source.length <= 120 && /修复|优化|实现|新增|改造/.test(source)) {
    matches.push(source);
  }

  return matches.map(title => ({
    id: shortHash(`task-${title}`),
    title,
    status: 'open',
    updatedAt: new Date().toISOString()
  }));
}

export function mergeTasks(existingTasks = [], inferredTasks = []) {
  const byId = new Map(existingTasks.map(task => [task.id, task]));
  for (const task of inferredTasks) {
    const prev = byId.get(task.id);
    byId.set(task.id, {
      ...(prev || {}),
      ...task,
      status: prev?.status || task.status || 'open',
      updatedAt: new Date().toISOString()
    });
  }
  return Array.from(byId.values())
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .slice(0, 120);
}
