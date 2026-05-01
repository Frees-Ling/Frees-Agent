import { spawnSync } from 'node:child_process';

/**
 * Git 工具集 — 为 Frees-Agent 提供原生 git 操作，绕过 bash 安全限制。
 *
 * 所有工具以子进程方式调用 git，返回结构化结果。
 * 使用 spawnSync 避免 shell 转义问题。
 */

function execGit(args, cwd) {
  try {
    const result = spawnSync('git', args, {
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
      windowsHide: true,
    });
    if (result.error) throw result.error;
    const output = (result.stdout || '').trimEnd();
    if (result.status !== 0) {
      const stderr = (result.stderr || '').trimEnd() || `git 退出码 ${result.status}`;
      if (stderr.includes('not a git repository') || stderr.includes('Not a git repository')) {
        return { ok: false, data: '', error: '当前目录不是 git 仓库' };
      }
      return { ok: false, data: output, error: stderr };
    }
    return { ok: true, data: output };
    return { ok: true, data: output.trimEnd() };
  } catch (err) {
    const stderr = err.stderr || err.message || '未知错误';
    // 非 git 仓库
    if (stderr.includes('not a git repository') || stderr.includes('Not a git repository')) {
      return { ok: false, data: '', error: '当前目录不是 git 仓库' };
    }
    return { ok: false, data: (err.stdout || '').trimEnd(), error: stderr.trimEnd() };
  }
}

/**
 * git_status — 工作区变更概览
 * 返回已修改/已暂存/未跟踪的文件列表
 */
export function gitStatus({ cwd } = {}) {
  const result = execGit(['status', '--porcelain'], cwd);
  if (!result.ok) return result;

  const files = {
    staged: [],     // 已暂存
    modified: [],   // 已修改未暂存
    untracked: [],  // 未跟踪
    conflicted: [], // 冲突
  };

  for (const line of result.data.split('\n')) {
    if (!line.trim()) continue;
    const status = line.slice(0, 2);
    const file = line.slice(3);
    if (status[0] === '?' && status[1] === '?') {
      files.untracked.push(file);
    } else if (status[0] === 'U' || status[1] === 'U' || status === 'DD' || status === 'AA') {
      files.conflicted.push(file);
    } else if (status[0] !== ' ') {
      files.staged.push(file);
    } else if (status[1] !== ' ') {
      files.modified.push(file);
    }
  }

  // Also get current branch
  const branchResult = execGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  const branch = branchResult.ok ? branchResult.data : 'unknown';

  return { ok: true, data: { branch, files, raw: result.data } };
}

/**
 * git_diff — 查看差异
 * @param {Object} opts
 * @param {boolean} opts.staged - 查看已暂存的差异（--cached）
 * @param {string} opts.path - 指定文件路径
 * @param {number} opts.contextLines - 上下文行数（默认 3）
 */
export function gitDiff({ staged, path: filePath, contextLines = 3, cwd } = {}) {
  const args = ['diff'];
  if (staged) args.push('--cached');
  if (contextLines != null) args.push(`-U${contextLines}`);
  args.push('--');
  if (filePath) args.push(filePath);

  const result = execGit(args, cwd);
  if (!result.ok && result.error) return result;
  if (!result.data) return { ok: true, data: { raw: '', changed: false, stats: { files: 0, added: 0, removed: 0, totalLines: 0 }, files: [] } };

  // Parse stats
  const lines = result.data.split('\n');
  const added = lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
  const removed = lines.filter(l => l.startsWith('-') && !l.startsWith('---')).length;
  const files = new Set();
  for (const l of lines) {
    const m = l.match(/^diff --git a\/(.+?) b\//);
    if (m) files.add(m[1]);
  }

  return {
    ok: true,
    data: result.data,
    changed: result.data.length > 0,
    stats: { files: files.size, added, removed, totalLines: lines.length },
    files: [...files],
  };
}

/**
 * git_commit — 提交暂存的变更
 * @param {string} message - 提交信息
 */
export function gitCommit({ message, cwd } = {}) {
  if (!message || !message.trim()) {
    return { ok: false, error: '提交信息不能为空' };
  }
  const result = execGit(['commit', '-m', message], cwd);
  if (!result.ok) return result;
  // 解析 commit hash
  const hashMatch = result.data.match(/\[[\w-]+ ([a-f0-9]+)\]/);
  return {
    ok: true,
    data: {
      hash: hashMatch ? hashMatch[1] : 'unknown',
      message: result.data,
    },
  };
}

/**
 * git_log — 查看提交历史
 * @param {number} opts.maxCount - 最大条数（默认 10）
 * @param {string} opts.path - 指定文件路径
 * @param {string} opts.branch - 指定分支
 */
export function gitLog({ maxCount = 10, path: filePath, branch, cwd } = {}) {
  const args = ['log', '--oneline', '--decorate', `--max-count=${Math.max(1, Math.min(100, maxCount))}`, '--format=%H|%h|%an|%ar|%s'];
  if (branch) args.unshift('log', branch);
  if (filePath) args.push('--', filePath);

  const result = execGit(args, cwd);
  if (!result.ok) return result;
  if (!result.data.trim()) {
    return { ok: true, data: { entries: [], total: 0, raw: '' } };
  }

  const entries = result.data.split('\n').filter(Boolean).map(line => {
    const parts = line.split('|');
    return {
      hash: parts[0] || '',
      shortHash: parts[1] || '',
      author: parts[2] || '',
      date: parts[3] || '',
      subject: parts.slice(4).join('|') || '',
    };
  });

  return { ok: true, data: { entries, total: entries.length, raw: result.data } };
}

/**
 * git_branch — 分支列表
 */
export function gitBranch({ cwd } = {}) {
  const result = execGit(['branch', '-a'], cwd);
  if (!result.ok) return result;

  const branches = result.data.split('\n').filter(Boolean).map(line => {
    const current = line.trim().startsWith('*');
    return { name: line.trim().replace(/^\*?\s*/, ''), current };
  });

  return { ok: true, data: { branches, current: branches.find(b => b.current)?.name || 'unknown' } };
}

/**
 * git_checkout — 切换分支或恢复文件
 */
export function gitCheckout({ branch, target, cwd } = {}) {
  const args = ['checkout'];
  if (branch) args.push(branch);
  if (target) args.push(target);
  if (!branch && !target) return { ok: false, error: '需要指定 branch 或 target' };

  const result = execGit(args, cwd);
  if (!result.ok) return result;
  return { ok: true, data: result.data };
}

/**
 * git_add — 暂存文件
 */
export function gitAdd({ files = ['.'], cwd } = {}) {
  const result = execGit(['add', ...files], cwd);
  if (!result.ok) return result;
  return { ok: true, data: files.length > 1 ? `已暂存 ${files.length} 个文件` : `已暂存 ${files[0]}` };
}

/**
 * 获取工具列表供 tools.js 注册
 */
export function getGitToolList() {
  return [
    { name: 'git_status', description: '查看 git 工作区状态（分支、已修改、已暂存、未跟踪文件）' },
    { name: 'git_diff', description: '查看文件差异（支持 --staged 查看已暂存 diff，指定 path 查看特定文件）' },
    { name: 'git_commit', description: '提交所有已暂存的变更，需要提供 message' },
    { name: 'git_log', description: '查看提交历史（maxCount 控制条数，path 过滤文件）' },
    { name: 'git_branch', description: '列出所有本地和远程分支' },
    { name: 'git_checkout', description: '切换分支（branch）或恢复文件（target）' },
    { name: 'git_add', description: '暂存文件（files 数组，默认 ["."] 暂存全部）' },
  ];
}
