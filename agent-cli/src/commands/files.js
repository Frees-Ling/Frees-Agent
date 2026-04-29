import path from 'node:path';
import { listFiles } from '../workspace/queries.js';
import { scanWorkspace } from '../workspace/indexer.js';

export async function runFilesCommand(options) {
  const workspaceRoot = options.workspace;
  if (!workspaceRoot) {
    console.log('需要指定工作区目录');
    return;
  }

  const resolvedRoot = path.resolve(workspaceRoot);
  const index = await scanWorkspace(resolvedRoot, options.config || {});

  const limit = options.limit || 100;
  const pattern = options.pattern || '**';
  const prefix = options.prefix || '.';

  const files = listFiles(index, { pattern, pathPrefix: prefix, limit });

  if (files.length === 0) {
    console.log(`工作区 "${resolvedRoot}" 中没有找到匹配的文件。`);
    return;
  }

  const loadedCount = files.filter(f => f.loaded).length;
  const totalSize = files.reduce((s, f) => s + f.size, 0);

  console.log(`工作区: ${resolvedRoot}`);
  console.log(`文件数: ${files.length} (已载入: ${loadedCount})`);
  console.log(`总大小: ${formatSize(totalSize)}`);
  console.log('');

  for (const file of files) {
    const icon = file.loaded ? '+' : '-';
    console.log(`  ${icon} ${file.path} (${formatSize(file.size)})`);
  }

  if (files.length >= limit) {
    console.log(`\n... 仅显示前 ${limit} 个文件，使用 --limit 调整`);
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
