import os from 'node:os';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { truncateForModel } from '../utils/json.js';

async function walk(dirPath, files = []) {
  let entries = [];
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return files;
    }
    throw error;
  }

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await walk(absolutePath, files);
    } else if (entry.isFile() && entry.name === 'SKILL.md') {
      files.push(absolutePath);
    }
  }
  return files;
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { frontmatter: {}, body: raw };
  }

  const frontmatter = {};
  for (const line of match[1].split('\n')) {
    const index = line.indexOf(':');
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    frontmatter[key] = value;
  }

  return {
    frontmatter,
    body: raw.slice(match[0].length)
  };
}

function summarizeSkillDescription(body) {
  const lines = body
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !line.startsWith('#'));
  return lines.slice(0, 3).join(' ').slice(0, 240);
}

function tokenize(text) {
  return Array.from(
    new Set(
      String(text || '')
        .toLowerCase()
        .split(/[^\p{L}\p{N}_-]+/u)
        .map(token => token.trim())
        .filter(token => token.length >= 2)
    )
  );
}

export async function loadSkills(workspaceRoot) {
  const roots = [
    path.join(os.homedir(), '.claude', 'skills'),
    workspaceRoot ? path.join(workspaceRoot, '.claude', 'skills') : '',
    workspaceRoot ? path.join(workspaceRoot, '.frees-agent', 'skills') : ''
  ].filter(Boolean);

  const fileSet = new Set();
  for (const root of roots) {
    const files = await walk(root);
    for (const file of files) {
      fileSet.add(file);
    }
  }

  const skills = [];
  const seenSlugs = new Set();
  for (const filePath of [...fileSet]) {
    const raw = await readFile(filePath, 'utf8');
    const { frontmatter, body } = parseFrontmatter(raw);
    const name = frontmatter.name || path.basename(path.dirname(filePath)).toLowerCase();
    const description = frontmatter.description || summarizeSkillDescription(body);
    const slug = path.basename(path.dirname(filePath)).toLowerCase();
    if (seenSlugs.has(slug)) {
      continue;
    }
    seenSlugs.add(slug);
    const rawAllowed = frontmatter['allowed-tools'] || '';
    const rawBlocked = frontmatter['blocked-tools'] || '';
    const parseToolList = (str) => String(str || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    skills.push({
      name,
      slug,
      description,
      content: raw,
      path: filePath,
      version: frontmatter.version || '1.0',
      allowedTools: parseToolList(rawAllowed),
      blockedTools: parseToolList(rawBlocked),
      triggers: parseToolList(frontmatter.triggers || ''),
      priority: parseInt(frontmatter.priority || '0', 10) || 0,
      models: parseToolList(frontmatter.models || ''),
    });
  }

  return skills.sort((left, right) => left.slug.localeCompare(right.slug));
}

export function selectRelevantSkills(skills, request, limit = 3) {
  const requestTokens = tokenize(request);
  const scored = [];

  for (const skill of skills) {
    let score = 0;
    const haystack = `${skill.name} ${skill.slug} ${skill.description}`.toLowerCase();

    // Score from trigger keywords (highest weight)
    if (Array.isArray(skill.triggers)) {
      for (const trigger of skill.triggers) {
        if (request.toLowerCase().includes(trigger.toLowerCase())) {
          score += 10;
        }
      }
    }

    // Score from name/slug/description
    for (const token of requestTokens) {
      if (haystack.includes(token)) {
        score += 4;
      }
      if (skill.content.toLowerCase().includes(token)) {
        score += 1;
      }
    }

    // Add priority as a base score bonus
    score += skill.priority || 0;

    if (score > 0) {
      scored.push({ skill, score });
    }
  }

  return scored
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(item => item.skill);
}

export function formatSkillContext(skills) {
  if (!skills?.length) {
    return '';
  }
  return skills
    .map(skill => {
      const header = `SKILL ${skill.slug}: ${skill.description}`;
      return `${header}\n${truncateForModel(skill.content, 3000)}`;
    })
    .join('\n\n');
}
