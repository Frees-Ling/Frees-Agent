// System information utilities — provides current time/date/platform to the AI model
import os from 'node:os';

export function getSystemInfo() {
  const now = new Date();
  return {
    timestamp: now.toISOString(),
    date: now.toLocaleDateString(),
    time: now.toLocaleTimeString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    platform: process.platform,
    osType: os.type(),
    osRelease: os.release(),
    hostname: os.hostname(),
    arch: process.arch,
    nodeVersion: process.version,
    isTTY: Boolean(process.stdout.isTTY),
    cwd: process.cwd(),
    memory: {
      free: os.freemem(),
      total: os.totalmem(),
    },
    loadAvg: os.loadavg(),
  };
}

export function formatSystemInfo(info) {
  const data = info || getSystemInfo();
  return [
    `Current Time: ${data.date} ${data.time} (${data.timezone})`,
    `Platform: ${data.platform} (${data.arch})`,
    `OS: ${data.osType} ${data.osRelease}`,
    `Host: ${data.hostname}`,
    `CWD: ${data.cwd}`,
  ].join('\n');
}

export function injectSystemClock(text) {
  const info = formatSystemInfo();
  return `${text}\n\n## System Context\n${info}`;
}
