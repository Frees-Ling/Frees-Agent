import { readFile } from 'node:fs/promises';
import { DOCS, findDoc, getDocsRoot, resolveDocPath } from '../docs/registry.js';

export async function runDocsCommand(options) {
  if (!options.topic) {
    console.log(`Frees Agent 文档目录: ${getDocsRoot()}`);
    console.log('');
    for (const doc of DOCS) {
      console.log(`- ${doc.slug}: ${doc.title}`);
    }
    return;
  }

  const doc = findDoc(options.topic);
  if (!doc) {
    throw new Error(`未找到文档主题: ${options.topic}`);
  }

  const filePath = resolveDocPath(doc);
  const content = await readFile(filePath, 'utf8');
  console.log(`# ${doc.title}`);
  console.log(`# path: ${filePath}`);
  console.log('');
  console.log(content);
}
