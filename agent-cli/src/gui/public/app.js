// Frees-Agent Desktop GUI — supports both Tauri (native) and Web (browser) modes

const isTauri = typeof window !== 'undefined' && window.__TAURI_INTERNALS__;

const state = {
  streaming: false,
  connected: false,
  status: 'idle',
  currentSessionId: null,
  sessions: [],
  skills: [],
  tools: [],
  abortController: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ── DOM refs ──
const messagesEl = $('#messages');
const welcomeEl = $('#welcomeScreen');
const inputEl = $('#message-input');
const sendBtn = $('#send-btn');
const stopBtn = $('#stop-btn');
const newChatBtn = $('#new-chat-btn');
const historyList = $('#history-list');
const skillsPanel = $('#panel-skills');
const toolsPanel = $('#panel-tools');
const modelNameEl = $('#modelName');
const providerNameEl = $('#providerName');
const memoryCountEl = $('#memoryCount');
const tokenCountEl = $('#tokenCount');
const statusDot = $('#statusDot');
const statusLabel = $('#statusLabel');
const inputStatus = $('#inputStatus');
const btnSettings = $('#btn-settings');
const btnSystem = $('#btn-system');
const systemPanel = $('#system-panel');
const settingsPanel = $('#settings-panel');
const overlay = $('#overlay');

const sysPlatform = $('#sysPlatform');
const sysArch = $('#sysArch');
const sysOS = $('#sysOS');
const sysHostname = $('#sysHostname');
const sysUptime = $('#sysUptime');
const sysCPU = $('#sysCPU');
const memBar = $('#memBar');
const memText = $('#memText');
const diskBar = $('#diskBar');
const diskText = $('#diskText');
const sysProcesses = $('#sysProcesses');

const settingProvider = $('#settingProvider');
const settingModel = $('#settingModel');
const settingTemp = $('#settingTemp');
const tempLabel = $('#tempLabel');
const settingStream = $('#settingStream');
const settingPlanner = $('#settingPlanner');

// ── Tauri API ──
let tauriInvoke = null;
if (isTauri) {
  import('@tauri-apps/api/core').then((m) => { tauriInvoke = m.invoke; }).catch(() => {});
}

// ── Utility ──
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let s = bytes;
  while (s >= 1024 && i < units.length - 1) { s /= 1024; i++; }
  return s.toFixed(1) + ' ' + units[i];
}

function formatUptime(seconds) {
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(d + '天');
  if (h > 0) parts.push(h + '小时');
  parts.push(m + '分钟');
  return parts.join(' ');
}

// ── Status ──
function setStatus(text, type) {
  state.status = type;
  statusLabel.textContent = text;
  statusDot.className = 'status-dot ' + (type || 'idle');
}

// ── WebSocket ──
let ws = null;
let wsReconnectTimer = null;

function connectWs() {
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
  if (ws) { try { ws.close(); } catch {} ws = null; }

  const host = isTauri ? 'localhost' : location.hostname;
  const port = location.port || '7780';
  const url = `ws://${host}:${port}`;

  ws = new WebSocket(url);
  ws.onopen = () => {
    state.connected = true;
    setStatus('就绪', 'idle');
    fetchConfig();
    fetchSkills();
    fetchTools();
    loadHistory();
  };
  ws.onclose = () => {
    state.connected = false;
    setStatus('已断开', 'error');
    wsReconnectTimer = setTimeout(connectWs, 3000);
  };
  ws.onerror = () => {
    setStatus('连接失败', 'error');
  };
  ws.onmessage = (e) => {
    try { handleWsMsg(JSON.parse(e.data)); } catch {}
  };
}

function handleWsMsg(msg) {
  switch (msg.type) {
    case 'token':
      appendToken(msg.data);
      break;
    case 'done':
      finishMessage(msg.data);
      break;
    case 'error':
      showError(msg.message);
      break;
    case 'tool_call':
      addToolCall(msg.name, msg.args);
      break;
    case 'tool_result': {
      const last = messagesEl.querySelector('.tool-call:last-child');
      if (last) updateToolCall(last, msg.message || `✓ ${msg.name}`);
      break;
    }
    case 'memory':
      updateMemoryCount(msg.memoryCount);
      if (msg.tokenCount !== undefined) {
        tokenCountEl.textContent = msg.tokenCount + ' tokens';
      }
      break;
    case 'pong':
      break;
  }
}

function sendWs(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// ── Markdown ──
function renderMarkdown(text) {
  let html = escapeHtml(text);

  // Code blocks
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const label = lang || 'code';
    return '<div class="code-header"><span>' + label + '</span><button class="copy-btn" onclick="copyCode(this)">复制</button></div><pre><code>' + code.trim() + '</code></pre>';
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Blockquotes (each line)
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Bold & italic
  html = html.replace(/\*\*(\S[^*\n]*\S)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(\S[^*\n]*\S)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Tables
  html = html.replace(/((?:^\|.+\|\s*$\n?)+)/gm, (match) => {
    const rows = match.trim().split('\n').filter(l => l.trim());
    if (rows.length < 2) return match;
    const isSep = (r) => /^\|[\s:-]+\|/.test(r);
    const headerRow = rows[0];
    // skip separator rows
    const dataRows = rows.filter(r => !isSep(r));
    if (dataRows.length < 1) return match;
    let table = '<table>';
    // header
    const hCells = headerRow.slice(1, -1).split('|').map(c => c.trim());
    table += '<thead><tr>' + hCells.map(c => '<th>' + c + '</th>').join('') + '</tr></thead>';
    // body
    table += '<tbody>';
    for (let i = 1; i < dataRows.length; i++) {
      const cells = dataRows[i].slice(1, -1).split('|').map(c => c.trim());
      if (cells.every(c => /^-+$/.test(c))) continue;
      table += '<tr>' + cells.map(c => '<td>' + c + '</td>').join('') + '</tr>';
    }
    table += '</tbody></table>';
    return table;
  });

  // Lists
  html = html.replace(/^- (.+)$/gm, '<li data-list="ul">$1</li>');
  html = html.replace(/((?:<li data-list="ul">.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li data-list="ol">$1</li>');
  html = html.replace(/((?:<li data-list="ol">.*<\/li>\n?)+)/g, '<ol>$1</ol>');
  html = html.replace(/ data-list="[uo]l"/g, '');

  // Paragraphs — wrap remaining text blocks
  const parts = html.split(/\n\n+/);
  html = parts.map((block) => {
    const t = block.trim();
    if (!t) return '';
    if (/^<(h[123]|ul|ol|table|blockquote|pre|div|p\b)/i.test(t)) return t;
    if (/^<\/(ul|ol|table)>/i.test(t)) return t;
    return '<p>' + t.replace(/\n/g, '<br>') + '</p>';
  }).join('\n');

  return html;
}

// Copy button handler (global for inline onclick)
window.copyCode = function (btn) {
  const header = btn.closest('.code-header');
  if (!header) return;
  const pre = header.nextElementSibling;
  if (!pre) return;
  const code = pre.textContent;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).catch(() => fallbackCopy(code));
  } else {
    fallbackCopy(code);
  }
  btn.textContent = '已复制';
  btn.classList.add('copied');
  setTimeout(() => {
    btn.textContent = '复制';
    btn.classList.remove('copied');
  }, 2000);
};

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

// ── Messages ──
function addMessage(role, content) {
  if (welcomeEl && !welcomeEl.classList.contains('hidden')) {
    welcomeEl.classList.add('hidden');
  }
  const el = document.createElement('div');
  el.className = 'message ' + role;
  if (role === 'assistant') {
    el.innerHTML = renderMarkdown(content);
  } else {
    el.textContent = content;
  }
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

let currentAssistantEl = null;

function appendToken(token) {
  if (!currentAssistantEl) {
    const el = document.createElement('div');
    el.className = 'message assistant stream-cursor';
    el._full = '';
    messagesEl.appendChild(el);
    currentAssistantEl = el;
  }
  currentAssistantEl._full += token;
  currentAssistantEl.innerHTML = renderMarkdown(currentAssistantEl._full);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function finishMessage(full) {
  if (currentAssistantEl) {
    currentAssistantEl.classList.remove('stream-cursor');
    currentAssistantEl._full = full;
    currentAssistantEl.innerHTML = renderMarkdown(full);
    currentAssistantEl = null;
  }
  state.streaming = false;
  state.abortController = null;
  sendBtn.classList.remove('hidden');
  stopBtn.classList.add('hidden');
  sendBtn.disabled = false;
  inputEl.disabled = false;
  inputEl.focus();
  setStatus('就绪', 'idle');
  updateMemoryCount();
}

function showError(msg) {
  if (welcomeEl && !welcomeEl.classList.contains('hidden')) {
    welcomeEl.classList.add('hidden');
  }
  const el = document.createElement('div');
  el.className = 'message error';
  el.textContent = '错误: ' + msg;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  if (state.streaming) {
    state.streaming = false;
    state.abortController = null;
    currentAssistantEl = null;
    sendBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    sendBtn.disabled = false;
    inputEl.disabled = false;
    setStatus('就绪', 'idle');
  }
}

function addToolCall(name, args) {
  if (welcomeEl && !welcomeEl.classList.contains('hidden')) {
    welcomeEl.classList.add('hidden');
  }
  const el = document.createElement('div');
  el.className = 'tool-call';
  const a = args && typeof args === 'object' ? Object.keys(args).length : false;
  el.textContent = '🔧 调用 ' + name + (a ? ' …' : '');
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

function updateToolCall(el, status) {
  if (el) {
    el.textContent = status.startsWith('🔧') ? status : '🔧 ' + status;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

// ── Chat ──
async function sendMessage(text) {
  if (!text.trim() || state.streaming) return;
  if (!state.connected) { showError('未连接到服务器'); return; }

  addMessage('user', text.trim());
  state.streaming = true;
  sendBtn.classList.add('hidden');
  stopBtn.classList.remove('hidden');
  inputEl.disabled = true;
  currentAssistantEl = null;
  setStatus('思考中...', 'busy');

  const msg = text.trim();
  inputEl.value = '';
  inputEl.style.height = 'auto';

  sendWs({ type: 'chat', message: msg });
}

function stopGeneration() {
  if (!state.streaming) return;
  state.streaming = false;
  if (currentAssistantEl) {
    currentAssistantEl.classList.remove('stream-cursor');
    currentAssistantEl.innerHTML = currentAssistantEl._full
      ? renderMarkdown(currentAssistantEl._full)
      : '';
    currentAssistantEl = null;
  }
  sendBtn.classList.remove('hidden');
  stopBtn.classList.add('hidden');
  sendBtn.disabled = false;
  inputEl.disabled = false;
  setStatus('已停止', 'idle');
  // Tell server to abort
  sendWs({ type: 'stop' });
}

// ── Sidebar: Skills / Tools ──
function renderSkills() {
  if (!skillsPanel) return;
  if (!state.skills.length) {
    skillsPanel.innerHTML = '<div class="panel-empty">暂无技能</div>';
    return;
  }
  skillsPanel.innerHTML = state.skills.map((s) =>
    '<div class="skill-item">' + escapeHtml(s.name || s.slug || s) + '</div>'
  ).join('');
}

function renderTools() {
  if (!toolsPanel) return;
  if (!state.tools.length) {
    toolsPanel.innerHTML = '<div class="panel-empty">暂无工具</div>';
    return;
  }
  toolsPanel.innerHTML = state.tools.map((t) =>
    '<div class="tool-item">' + escapeHtml(t.name || t) + '</div>'
  ).join('');
}

// ── Sidebar: History ──
function loadHistory() {
  fetch('/api/sessions')
    .then((r) => r.ok ? r.json() : { sessions: [] })
    .then((d) => { state.sessions = d.sessions || []; renderHistory(); })
    .catch(() => {});
}

function renderHistory() {
  if (!historyList) return;
  if (!state.sessions.length) {
    historyList.innerHTML = '<div class="panel-empty">暂无对话历史</div>';
    return;
  }
  historyList.innerHTML = state.sessions.map((s) =>
    '<div class="history-item' + (s.id === state.currentSessionId ? ' active' : '') + '" data-id="' + escapeHtml(s.id) + '">' + escapeHtml(s.name || s.id || '对话') + '</div>'
  ).join('');

  historyList.querySelectorAll('.history-item').forEach((el) => {
    el.addEventListener('click', () => loadSession(el.dataset.id));
  });
}

function loadSession(id) {
  state.currentSessionId = id;
  renderHistory();
  messagesEl.innerHTML = '';
  welcomeEl && welcomeEl.classList.add('hidden');

  fetch('/api/sessions/' + encodeURIComponent(id))
    .then((r) => r.ok ? r.json() : null)
    .then((data) => {
      if (data && data.messages) {
        data.messages.forEach((m) => {
          if (m.role === 'tool') {
            addToolCall(m.name, m.args);
          } else {
            addMessage(m.role, m.content);
          }
        });
      }
    })
    .catch(() => {});
}

// ── Sidebar toggles ──
function initSidebarToggles() {
  $$('.sidebar-section-title').forEach((title) => {
    title.addEventListener('click', () => {
      const id = title.dataset.toggle;
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      const isHidden = target.style.display === 'none';
      target.style.display = isHidden ? '' : 'none';
    });
  });
}

// ── System Panel ──
function openSystemPanel() {
  systemPanel.classList.remove('hidden');
  overlay.classList.remove('hidden');
  refreshSystemInfo();
}

async function refreshSystemInfo() {
  if (isTauri && tauriInvoke) {
    try {
      const info = await tauriInvoke('system_info');
      if (info) applySystemInfo(info);
      return;
    } catch {}
  }
  // Fallback: REST API
  try {
    const res = await fetch('/api/system');
    if (res.ok) {
      const data = await res.json();
      applySystemInfo(data);
    }
  } catch {}
}

function applySystemInfo(info) {
  sysPlatform.textContent = info.platform || '—';
  sysArch.textContent = info.arch || '—';
  sysOS.textContent = info.os_version || info.os || info.platform || '—';
  sysHostname.textContent = info.hostname || '—';
  sysUptime.textContent = info.uptime ? formatUptime(info.uptime) : '—';
  sysCPU.textContent = info.cpu || info.cpu_brand || '—';
  sysProcesses.textContent = info.processes != null ? String(info.processes) : '—';

  // Memory bar
  if (info.memory_total && info.memory_used != null) {
    const pct = Math.min(100, Math.round((info.memory_used / info.memory_total) * 100));
    memBar.style.width = pct + '%';
    memBar.className = 'bar-fill' + (pct > 80 ? ' danger' : pct > 60 ? ' warning' : '');
    memText.textContent = formatBytes(info.memory_used) + ' / ' + formatBytes(info.memory_total);
  } else {
    memBar.style.width = '0%';
    memText.textContent = '—';
  }

  // Disk bar
  if (info.disk_total && info.disk_used != null) {
    const pct = Math.min(100, Math.round((info.disk_used / info.disk_total) * 100));
    diskBar.style.width = pct + '%';
    diskBar.className = 'bar-fill' + (pct > 80 ? ' danger' : pct > 60 ? ' warning' : '');
    diskText.textContent = formatBytes(info.disk_used) + ' / ' + formatBytes(info.disk_total);
  } else {
    diskBar.style.width = '0%';
    diskText.textContent = '—';
  }
}

// ── Settings Panel ──
function openSettingsPanel() {
  settingsPanel.classList.remove('hidden');
  overlay.classList.remove('hidden');
  // Load current settings from server
  fetch('/api/config')
    .then((r) => r.ok ? r.json() : null)
    .then((cfg) => {
      if (!cfg) return;
      if (cfg.provider) settingProvider.value = cfg.provider;
      if (cfg.model) settingModel.value = cfg.model;
      if (cfg.temperature != null) {
        settingTemp.value = cfg.temperature;
        tempLabel.textContent = cfg.temperature;
      }
      if (cfg.stream != null) settingStream.checked = cfg.stream;
      if (cfg.planner != null) settingPlanner.checked = cfg.planner;
    })
    .catch(() => {});
}

function saveSetting(key, value) {
  fetch('/api/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [key]: value }),
  }).catch(() => {});
}

function closeAllPanels() {
  systemPanel.classList.add('hidden');
  settingsPanel.classList.add('hidden');
  overlay.classList.add('hidden');
}

// ── REST API ──
async function fetchConfig() {
  try {
    const r = await fetch('/api/config');
    if (!r.ok) return;
    const d = await r.json();
    modelNameEl.textContent = d.model || '—';
    providerNameEl.textContent = d.provider || '';
    if (d.memoryCount != null) memoryCountEl.textContent = '记忆 ' + d.memoryCount;
    if (d.tokenCount != null) tokenCountEl.textContent = d.tokenCount + ' tokens';
  } catch {}
}

async function fetchSkills() {
  try {
    const r = await fetch('/api/skills');
    if (!r.ok) return;
    const d = await r.json();
    state.skills = d.skills || [];
    renderSkills();
  } catch {}
}

async function fetchTools() {
  try {
    const r = await fetch('/api/tools');
    if (!r.ok) return;
    const d = await r.json();
    state.tools = d.tools || [];
    renderTools();
  } catch {}
}

function updateMemoryCount(count) {
  if (count != null) {
    memoryCountEl.textContent = '记忆 ' + count;
  } else {
    // Refresh from server
    fetch('/api/config')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d && d.memoryCount != null) memoryCountEl.textContent = '记忆 ' + d.memoryCount;
      })
      .catch(() => {});
  }
}

// ── Textarea auto-resize ──
function initTextarea() {
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + 'px';
  });
}

// ── Events ──
function initEvents() {
  sendBtn.addEventListener('click', () => sendMessage(inputEl.value));

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputEl.value);
    }
  });

  stopBtn.addEventListener('click', stopGeneration);

  newChatBtn.addEventListener('click', () => {
    messagesEl.innerHTML = '';
    if (welcomeEl) welcomeEl.classList.remove('hidden');
    state.currentSessionId = null;
    historyList && historyList.querySelectorAll('.history-item').forEach((el) => el.classList.remove('active'));
  });

  btnSettings.addEventListener('click', openSettingsPanel);
  btnSystem.addEventListener('click', openSystemPanel);

  $$('.close-panel').forEach((btn) => {
    btn.addEventListener('click', closeAllPanels);
  });
  overlay.addEventListener('click', closeAllPanels);

  // Settings changes
  settingProvider.addEventListener('change', () => {
    saveSetting('provider', settingProvider.value);
    providerNameEl.textContent = settingProvider.options[settingProvider.selectedIndex].text;
  });
  settingModel.addEventListener('change', () => {
    saveSetting('model', settingModel.value);
    modelNameEl.textContent = settingModel.value || '—';
  });
  settingTemp.addEventListener('input', () => {
    tempLabel.textContent = settingTemp.value;
    saveSetting('temperature', parseFloat(settingTemp.value));
  });
  settingStream.addEventListener('change', () => {
    saveSetting('stream', settingStream.checked);
  });
  settingPlanner.addEventListener('change', () => {
    saveSetting('planner', settingPlanner.checked);
  });
}

// ── Tauri-only keyboard shortcuts ──
if (isTauri) {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'F') {
      e.preventDefault();
      inputEl.focus();
    }
    if (e.ctrlKey && e.key === 'w' && !e.shiftKey) {
      e.preventDefault();
      import('@tauri-apps/api/window')
        .then((m) => m.getCurrentWindow().hide())
        .catch(() => {});
    }
  });
}

// ── Init ──
function init() {
  initSidebarToggles();
  initTextarea();
  initEvents();

  if (isTauri) {
    setStatus('就绪', 'idle');
    loadHistory();
    fetchSkills();
    fetchTools();
    // Try WebSocket for chat (Express server started alongside Tauri)
    connectWs();
  } else {
    setStatus('连接中...', 'idle');
    connectWs();
  }
}

document.addEventListener('DOMContentLoaded', init);
