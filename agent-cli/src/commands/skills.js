import path from 'node:path';
import { formatSkillContext, loadSkills } from '../skills/loader.js';

export async function runSkillsCommand(options) {
  const workspaceRoot = path.resolve(options.workspace || process.cwd());
  const skills = await loadSkills(workspaceRoot);

  if (!skills.length) {
    console.log(`在 ${workspaceRoot} 下没有找到 skill 文件。`);
    console.log('约定路径示例: .claude/skills/<skill-name>/SKILL.md');
    return;
  }

  if (options.topic) {
    const skill = skills.find(
      item => item.slug === options.topic || item.name === options.topic
    );
    if (!skill) {
      throw new Error(`没有找到 skill: ${options.topic}`);
    }
    console.log(`# ${skill.slug}`);
    console.log(`# path: ${skill.path}`);
    console.log('');
    console.log(formatSkillContext([skill]));
    return;
  }

  console.log(`工作区: ${workspaceRoot}`);
  for (const skill of skills) {
    console.log(`- ${skill.slug}: ${skill.description}`);
  }
}
