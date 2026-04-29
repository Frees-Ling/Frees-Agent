import { getRelativeTimeFormat, getTimeZone } from './intl.js';

export function formatFileSize(sizeInBytes) {
  const kb = sizeInBytes / 1024;
  if (kb < 1) return `${sizeInBytes} bytes`;
  if (kb < 1024) return `${kb.toFixed(1).replace(/\.0$/, '')}KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1).replace(/\.0$/, '')}MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1).replace(/\.0$/, '')}GB`;
}

export function formatSecondsShort(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatDuration(ms, options = {}) {
  if (ms < 60000) {
    if (ms === 0) return '0s';
    if (ms < 1) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 1000)}s`;
  }

  let days = Math.floor(ms / 86400000);
  let hours = Math.floor((ms % 86400000) / 3600000);
  let minutes = Math.floor((ms % 3600000) / 60000);
  let seconds = Math.round((ms % 60000) / 1000);

  if (seconds === 60) { seconds = 0; minutes++; }
  if (minutes === 60) { minutes = 0; hours++; }
  if (hours === 24) { hours = 0; days++; }

  const hide = options.hideTrailingZeros;

  if (options.mostSignificantOnly) {
    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }

  if (days > 0) {
    if (hide && hours === 0 && minutes === 0) return `${days}d`;
    if (hide && minutes === 0) return `${days}d ${hours}h`;
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    if (hide && minutes === 0 && seconds === 0) return `${hours}h`;
    if (hide && seconds === 0) return `${hours}h ${minutes}m`;
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    if (hide && seconds === 0) return `${minutes}m`;
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function getNumberFormatter(useConsistentDecimals) {
  const cache = getNumberFormatter._cache || (getNumberFormatter._cache = {});
  const key = useConsistentDecimals ? 'consistent' : 'inconsistent';
  if (!cache[key]) {
    cache[key] = new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 1,
      minimumFractionDigits: useConsistentDecimals ? 1 : 0,
    });
  }
  return cache[key];
}
getNumberFormatter._cache = null;

export function formatNumber(number) {
  const useConsistentDecimals = number >= 1000;
  return getNumberFormatter(useConsistentDecimals).format(number).toLowerCase();
}

export function formatTokens(count) {
  return formatNumber(count).replace('.0', '');
}

export function formatRelativeTime(date, options = {}) {
  const { style = 'narrow', numeric = 'always', now = new Date() } = options;
  const diffInMs = date.getTime() - now.getTime();
  const diffInSeconds = Math.trunc(diffInMs / 1000);

  const intervals = [
    { unit: 'year', seconds: 31536000, shortUnit: 'y' },
    { unit: 'month', seconds: 2592000, shortUnit: 'mo' },
    { unit: 'week', seconds: 604800, shortUnit: 'w' },
    { unit: 'day', seconds: 86400, shortUnit: 'd' },
    { unit: 'hour', seconds: 3600, shortUnit: 'h' },
    { unit: 'minute', seconds: 60, shortUnit: 'm' },
    { unit: 'second', seconds: 1, shortUnit: 's' },
  ];

  for (const { unit, seconds, shortUnit } of intervals) {
    if (Math.abs(diffInSeconds) >= seconds) {
      const value = Math.trunc(diffInSeconds / seconds);
      if (style === 'narrow') {
        return diffInSeconds < 0 ? `${Math.abs(value)}${shortUnit} ago` : `in ${value}${shortUnit}`;
      }
      return getRelativeTimeFormat('long', numeric).format(value, unit);
    }
  }

  if (style === 'narrow') return diffInSeconds <= 0 ? '0s ago' : 'in 0s';
  return getRelativeTimeFormat(style, numeric).format(0, 'second');
}

export function formatRelativeTimeAgo(date, options = {}) {
  const { now = new Date(), ...restOptions } = options;
  if (date > now) return formatRelativeTime(date, { ...restOptions, now });
  return formatRelativeTime(date, { ...restOptions, numeric: 'always', now });
}

export function formatResetTime(timestampInSeconds, showTimezone = false, showTime = true) {
  if (!timestampInSeconds) return undefined;
  const date = new Date(timestampInSeconds * 1000);
  const now = new Date();
  const minutes = date.getMinutes();
  const hoursUntilReset = (date.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntilReset > 24) {
    const dateOptions = {
      month: 'short', day: 'numeric',
      hour: showTime ? 'numeric' : undefined,
      minute: !showTime || minutes === 0 ? undefined : '2-digit',
      hour12: true,
    };
    if (date.getFullYear() !== now.getFullYear()) dateOptions.year = 'numeric';
    const dateString = date.toLocaleString('en-US', dateOptions);
    return dateString.replace(/ ([AP]M)/i, (_, ampm) => ampm.toLowerCase()) +
      (showTimezone ? ` (${getTimeZone()})` : '');
  }

  const timeString = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: minutes === 0 ? undefined : '2-digit',
    hour12: true,
  });
  return timeString.replace(/ ([AP]M)/i, (_, ampm) => ampm.toLowerCase()) +
    (showTimezone ? ` (${getTimeZone()})` : '');
}
