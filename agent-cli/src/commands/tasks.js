import { TaskQueue } from '../tasks/queue.js';

// Singleton queue shared across commands
let _globalQueue = null;

export function getTaskQueue() {
  if (!_globalQueue) {
    _globalQueue = new TaskQueue({ concurrency: 2 });
  }
  return _globalQueue;
}

const STATUS_COLORS = {
  pending: '\x1b[33m',     // yellow
  running: '\x1b[36m',     // cyan
  completed: '\x1b[32m',   // green
  failed: '\x1b[31m',      // red
  cancelled: '\x1b[90m',   // gray
};
const RESET = '\x1b[0m';

function colorStatus(status) {
  const c = STATUS_COLORS[status] || '';
  return `${c}${status}${RESET}`;
}

function formatDuration(startedAt, completedAt) {
  if (!startedAt) return '-';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export async function runTasksCommand({ subcommand, args }) {
  const queue = getTaskQueue();

  switch (subcommand) {
    case 'list':
    case 'ls': {
      const { pending, running, completed } = queue.list();
      console.log('\n任务队列:');
      console.log('─────────');

      if (!pending.length && !running.length && !completed.length) {
        console.log('(空)');
        break;
      }

      if (running.length) {
        console.log(`\n\x1b[36m● 运行中 (${running.length}):\x1b[0m`);
        for (const t of running) {
          const dur = formatDuration(t.startedAt);
          const prog = t.progress.total > 0 ? ` [${t.progress.current}/${t.progress.total}]` : '';
          console.log(`  ${t.id.slice(0, 20)}  ${colorStatus(t.status)}  ${dur}  ${t.name}${prog}`);
          if (t.progress.message) console.log(`    └> ${t.progress.message}`);
        }
      }

      if (pending.length) {
        console.log(`\n\x1b[33m● 等待中 (${pending.length}):\x1b[0m`);
        for (const t of pending) {
          console.log(`  ${t.id.slice(0, 20)}  ${colorStatus(t.status)}  ${t.name}  (优先级: ${t.priority})`);
        }
      }

      if (completed.length) {
        console.log(`\n\x1b[32m● 已完成 (${completed.length}):\x1b[0m`);
        for (const t of completed.slice(-10)) {
          const dur = formatDuration(t.startedAt, t.completedAt);
          console.log(`  ${t.id.slice(0, 20)}  ${colorStatus(t.status)}  ${dur}  ${t.name}`);
        }
      }
      console.log('');
      break;
    }

    case 'status': {
      const s = queue.stats;
      console.log(`任务队列状态:
  等待中:  ${s.pending}
  运行中:  ${s.running}
  已完成:  ${s.completed}
  总计:    ${s.total}`);
      break;
    }

    case 'cancel': {
      const taskId = args?.[0];
      if (!taskId) {
        console.log('\x1b[33m用法: frees-agent tasks cancel <taskId>\x1b[0m');
        return;
      }
      const ok = queue.cancel(taskId);
      console.log(ok ? `\x1b[32m已取消任务: ${taskId.slice(0, 20)}\x1b[0m` : `\x1b[31m未找到任务: ${taskId.slice(0, 20)}\x1b[0m`);
      break;
    }

    case 'clear': {
      queue.clear();
      console.log('\x1b[32m已清空所有等待中的任务\x1b[0m');
      break;
    }

    default:
      console.log('\x1b[33m任务管理命令:\x1b[0m');
      console.log('  frees-agent tasks list       列出所有任务');
      console.log('  frees-agent tasks status     查看队列状态');
      console.log('  frees-agent tasks cancel <id> 取消任务');
      console.log('  frees-agent tasks clear      清空等待中的任务');
  }
}
