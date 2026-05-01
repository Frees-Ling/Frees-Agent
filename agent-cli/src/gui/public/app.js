// Frees-Agent Desktop GUI — VSCode-inspired Workbench
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
  attachedFiles: [],
  mascotSpecies: null,
  termHistory: [],
  termHistoryIdx: -1,
  planSteps: [],
  reasoningLevel: 'balanced',
  mcpServers: [],
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let _userScrolledUp = false;

// ── DOM refs ──
const messagesEl = $('#messages');
const welcomeEl = $('#welcomeScreen');
const welcomeStatus = $('#welcome-status');
const inputEl = $('#message-input');
const sendBtn = $('#send-btn');
const stopBtn = $('#stop-btn');
const newChatBtn = $('#new-chat-btn');
const historyList = $('#history-list');
const modelNameEl = $('#tbModelName');
const providerNameEl = $('#tbProviderName');
const memoryCountEl = $('#tbMemory');
const tokenCountEl = $('#tbTokens');
const statusDot = $('#statusDot');
const statusLabel = $('#statusLabel');
const inputStatus = $('#inputStatus');
const tbStatus = $('#tbStatus');
const activityBtns = $$('.activity-btn[data-view]');
const sidebarViews = $$('.sidebar-view');
const terminalPanel = $('#terminal-panel');
const terminalOutput = $('#terminal-output');
const terminalInput = $('#terminal-input');
const termClearBtn = $('#term-clear');
const termCloseBtn = $('#term-close');
const termToggleBtn = $('#btn-term-toggle');
const terminalStatus = $('#terminal-status');
const statusWorkspace = $('#status-workspace');
const statusModel = $('#status-model');
const statusMemoryBadge = $('#status-memory-badge');
const statusTokenBadge = $('#status-token-badge');
const statusSessionName = $('#status-session-name');
const plannerStepsEl = $('#planner-steps');
const plannerClearBtn = $('#planner-clear-btn');
const toolsListEl = $('#tools-list');
const skillsListEl = $('#skills-list');
const mcpToolsListEl = $('#mcp-tools-list');
const codeViewer = $('#code-viewer');
const codeViewerFilename = $('#code-viewer-filename');
const codeViewerLang = $('#code-viewer-lang');
const codeViewerSize = $('#code-viewer-size');
const codeViewerLines = $('#code-viewer-lines');
const codeViewerEditBtn = $('#code-viewer-edit');
let _codeViewerFilePath = '';
const rlButtons = $$('.rl-btn');
const settingProvider = $('#settingProvider');
const settingModel = $('#settingModel');
const settingTemp = $('#settingTemp');
const tempLabel = $('#tempLabel');
const settingStream = $('#settingStream');
const settingPlanner = $('#settingPlanner');
const mascotRender = $('#mascot-render');
const mascotSpeech = $('#mascot-speech');
const btnAttach = $('#btn-attach');
const fileInput = $('#file-input');
const filePreview = $('#file-preview');
const searchBar = $('#search-bar');
const searchInput = $('#search-input');
const searchCount = $('#search-count');
const searchPrevBtn = $('#search-prev');
const searchNextBtn = $('#search-next');
const searchCloseBtn = $('#search-close');
const scrollBottomBtn = $('#scroll-bottom-btn');
const sidebarSearchInput = $('#sidebar-search-input');
const sidebarSearchResults = $('#sidebar-search-results');
let _searchQuery = '';
let _searchMatches = [];
let _searchCurrentIdx = -1;
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
const rightPanel = $('#right-panel');
const rightPanelTitle = $('#right-panel-title');
const rightPanelBody = $('#rightPanelBody');
const rightResize = $('#right-resize');
const sidebarEl = $('#sidebar');
const sidebarResize = $('#sidebar-resize');
const fileTreeContainer = $('#file-tree-container');

let tauriInvoke = null;
if (isTauri) {
  import('@tauri-apps/api/core').then((m) => { tauriInvoke = m.invoke; }).catch(() => {});
}

// ═════════════════════════════════════════════════════════════════════════════
//  MASCOT
// ═════════════════════════════════════════════════════════════════════════════
const MASCOT_SPECIES = {
  cat:    { name: '小猫',  color: '#ffa500' },
  penguin:{ name: '企鹅',  color: '#0096ff' },
  rabbit: { name: '兔兔',  color: '#ffc0cb' },
  ghost:  { name: '幽灵',  color: '#b48cff' },
  dragon: { name: '小龙',  color: '#32cd64' },
  owl:    { name: '猫头鹰',color: '#d29650' },
};
const MASCOT_SPRITES = {
  cat: [
    ['  ╭────────╮  ',' ╱  ^_^     ╲ ',' │   ω      │ ',' ╰──────────╯ '],
    ['  ╭────────╮  ',' ╱  -_-     ╲ ',' │   ω      │ ',' ╰──────────╯ '],
    ['  ╭────────╮  ',' ╱  >_<     ╲ ',' │   ω      │ ',' ╰──────────╯ '],
  ],
  penguin: [
    ['  ╭────────╮  ',' │  \'‿\'     │ ',' │   ><     │ ',' ╰──────────╯ '],
    ['  ╭────────╮  ',' │  -_-     │ ',' │   ><     │ ',' ╰──────────╯ '],
    ['  ╭────────╮  ',' │  \'v\'     │ ',' │   ><     │ ',' ╰──────────╯ '],
  ],
  rabbit: [
    [' ╭┃────────┃╮ ',' │  ◕‿◕     │ ',' │   ω      │ ',' ╰──────────╯ '],
    [' ╭┃────────┃╮ ',' │  u_u     │ ',' │   ω      │ ',' ╰──────────╯ '],
    [' ╭┃────────┃╮ ',' │  ◕‿◕     │ ',' │  ~ω~     │ ',' ╰──────────╯ '],
  ],
  ghost: [
    [' ╭──────────╮ ',' │  ◕‿◕     │ ',' │   ~~     │ ',' ╰─╯─╰─╯─╰──╯ '],
    [' ╭──────────╮ ',' │  >_<     │ ',' │   ~~     │ ',' ╰─╯─╰─╯─╰──╯ '],
    [' ╭──────────╮ ',' │  ◕o◕     │ ',' │  ────    │ ',' ╰─╯─╰─╯─╰──╯ '],
  ],
  dragon: [
    [' ╱╲────────╱╲ ',' │  ^_^     │ ',' │   ω      │ ',' ╰──────────╯ '],
    [' ╱╲────────╱╲ ',' │  -_-     │ ',' │   ω      │ ',' ╰──────────╯ '],
    [' ╱╲────────╱╲ ',' │  ^_^     │ ',' │  >ω<     │ ',' ╰──────────╯ '],
  ],
  owl: [
    [' ╭╮────────╭╮ ',' │ ●  ●     │ ',' │   O      │ ',' ╰──────────╯ '],
    [' ╭╮────────╭╮ ',' │ ●  ─     │ ',' │   O      │ ',' ╰──────────╯ '],
    [' ╭╮────────╭╮ ',' │  ● ●     │ ',' │  _O_     │ ',' ╰──────────╯ '],
  ],
};
const MASCOT_GREETINGS = {
  cat: ['你好 喵~', '久等啦~', '需要帮忙？'],
  penguin: ['你好！', '嗨嗨~', '做什么呢？'],
  rabbit: ['嗨哟~', '你好呀', '兔兔来了~'],
  ghost: ['嗨~', '你好...', '我飘来了'],
  dragon: ['你好！', '来了来了', '有任务？'],
  owl: ['你好', '咕咕~', '做什么呢？'],
};
const IDLE_FRAME_SEQUENCE = [0,0,0,0,1,0,0,0,0,0,2,0,0,0,0];

function pickSpecies(userId) {
  const names = Object.keys(MASCOT_SPECIES);
  let hash = 0;
  const s = String(userId || '');
  for (let i = 0; i < s.length; i++) { hash = ((hash << 5) - hash) + s.charCodeAt(i); hash |= 0; }
  return names[Math.abs(hash) % names.length];
}

let mascotSpecies = 'cat';
let mascotFrame = 0;
let mascotAnimTimer = null;
let mascotAnimating = false;

function initMascot() {
  mascotSpecies = pickSpecies('');
  state.mascotSpecies = mascotSpecies;
  renderMascot();
  showMascotSpeech(mascotGreeting(mascotSpecies));
  startMascotIdle();
}

function renderMascot() {
  if (!mascotRender) return;
  const species = mascotSpecies || 'cat';
  const frames = MASCOT_SPRITES[species] || MASCOT_SPRITES.cat;
  const frame = frames[mascotFrame % frames.length];
  const color = MASCOT_SPECIES[species]?.color || '#ffa500';
  mascotRender.textContent = frame.join('\n');
  mascotRender.style.color = color;
  mascotRender.style.textShadow = `0 0 8px ${color}44`;
}

function showMascotSpeech(text) {
  if (!mascotSpeech) return;
  mascotSpeech.textContent = text || '';
  mascotSpeech.classList.remove('hidden');
  mascotSpeech.style.animation = 'none';
  void mascotSpeech.offsetHeight;
  mascotSpeech.style.animation = 'fadeInUp 0.3s ease';
}

function hideMascotSpeech() { if (mascotSpeech) mascotSpeech.classList.add('hidden'); }

function startMascotIdle() {
  if (mascotAnimating) return;
  mascotAnimating = true;
  let step = 0;
  function tick() {
    if (!mascotAnimating) return;
    mascotFrame = IDLE_FRAME_SEQUENCE[step % IDLE_FRAME_SEQUENCE.length];
    step++;
    renderMascot();
    mascotAnimTimer = setTimeout(tick, 800 + Math.random() * 400);
  }
  tick();
}

function stopMascotIdle() {
  mascotAnimating = false;
  if (mascotAnimTimer) { clearTimeout(mascotAnimTimer); mascotAnimTimer = null; }
}

function setMascotFrame(frameIndex) { mascotFrame = frameIndex; renderMascot(); }

function getMascotReaction(type) {
  const reactions = {
    thinking: { cat: '让我想想喵~', penguin: '处理中...', rabbit: '兔兔思考中', ghost: '让我想想...', dragon: '思考中！', owl: '咕咕...开始' },
    done:     { cat: '搞定啦喵~', penguin: '完成啦！', rabbit: '兔兔完成啦~', ghost: '完成咯~', dragon: '搞定！', owl: '搞定咕~' },
    confused: { cat: '诶？喵...', penguin: '咦？', rabbit: '兔兔不懂...', ghost: '嗯？？', dragon: '唔？？', owl: '咕？不懂' },
  };
  const species = mascotSpecies || 'cat';
  return (reactions[type] || reactions.done)[species] || '...';
}

function mascotGreeting(species) {
  const list = MASCOT_GREETINGS[species] || MASCOT_GREETINGS.cat;
  return list[Math.floor(Math.random() * list.length)];
}

// ═════════════════════════════════════════════════════════════════════════════
//  UTILITY
// ═════════════════════════════════════════════════════════════════════════════
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, s = bytes;
  while (s >= 1024 && i < units.length - 1) { s /= 1024; i++; }
  return s.toFixed(1) + ' ' + units[i];
}

function formatUptime(seconds) {
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d > 0 ? d + '天' : '', h > 0 ? h + '小时' : '', m + '分钟'].filter(Boolean).join('');
}

function getFileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  const m = {
    js:'📜',ts:'📘',jsx:'⚛',tsx:'⚛',json:'📋',md:'📝',txt:'📄',html:'🌐',css:'🎨',
    py:'🐍',java:'☕',go:'🔵',rs:'🦀',c:'⚙',cpp:'⚙',sh:'💻',bash:'💻',
    yml:'⚙',yaml:'⚙',toml:'⚙',png:'🖼',jpg:'🖼',svg:'🖼',pdf:'📕',
    zip:'📦',tar:'📦',gz:'📦',mp3:'🎵',mp4:'🎬',
  };
  return m[ext] || '📄';
}

function setStatus(text, type) {
  state.status = type;
  if (statusLabel) statusLabel.textContent = text;
  if (statusDot) statusDot.className = 'status-dot ' + (type || 'idle');
  if (tbStatus) tbStatus.textContent = text;
}

// ═════════════════════════════════════════════════════════════════════════════
//  ACTIVITY BAR — View switching
// ═════════════════════════════════════════════════════════════════════════════
function switchSidebarView(viewId) {
  activityBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.view === viewId));
  sidebarViews.forEach((v) => v.classList.toggle('active', v.id === viewId));
  sidebarEl.classList.remove('hidden');
  if (viewId === 'sidebar-files') setTimeout(fetchFileTree, 50);
  if (viewId === 'sidebar-settings') { fetchConfigForSettings(); fetchMcpServers(); }
  if (viewId === 'sidebar-tools') renderToolsView();
}

// ═════════════════════════════════════════════════════════════════════════════
//  TERMINAL
// ═════════════════════════════════════════════════════════════════════════════
let _termAbortController = null;

function toggleTerminal() {
  const hidden = terminalPanel.classList.contains('hidden');
  if (hidden) { terminalPanel.classList.remove('hidden'); setTimeout(() => terminalInput.focus(), 50); }
  else terminalPanel.classList.add('hidden');
}

function termExecCommand(cmd) {
  if (!cmd.trim() || !state.connected) return;
  const cmdLine = document.createElement('div');
  cmdLine.className = 'term-output-line';
  cmdLine.innerHTML = `<span style="color:var(--green)">$</span> ${escapeHtml(cmd)}`;
  terminalOutput.appendChild(cmdLine);
  terminalStatus.textContent = '运行中...';
  sendWs({ type: 'shell_exec', command: cmd });
}

function appendTerminalOutput(text) {
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line) continue;
    const el = document.createElement('div');
    el.className = 'term-output-line';
    el.textContent = line;
    terminalOutput.appendChild(el);
  }
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

function handleTermDone(code) {
  const statusLine = document.createElement('div');
  statusLine.className = 'term-output-line';
  statusLine.innerHTML = `<span style="color:${code === 0 ? 'var(--green)' : 'var(--red)'}">进程结束，退出码: ${code}</span>`;
  terminalOutput.appendChild(statusLine);
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
  terminalStatus.textContent = `完成 (${code})`;
  _termAbortController = null;
}

function clearTerminal() { terminalOutput.innerHTML = ''; }

// ═════════════════════════════════════════════════════════════════════════════
//  PLANNER VIEW
// ═════════════════════════════════════════════════════════════════════════════
function renderPlanSteps(steps) {
  if (!plannerStepsEl) return;
  state.planSteps = steps || [];
  if (!steps || !steps.length) {
    plannerStepsEl.innerHTML = '<div class="panel-empty">尚无活动任务</div>';
    return;
  }
  switchSidebarView('sidebar-planner');
  plannerStepsEl.innerHTML = steps.map((s, i) => {
    const done = s.status === 'done' || s.status === 'completed';
    const active = s.status === 'in_progress';
    const failed = s.status === 'failed';
    const statusIcon = done ? '✓' : active ? '◌' : failed ? '✗' : '○';
    const statusClass = done ? 'step-done' : active ? 'step-active' : failed ? 'step-failed' : 'step-pending';
    return `<div class="planner-step ${statusClass}" data-index="${i}">
      <span class="step-icon">${statusIcon}</span>
      <span class="step-desc">${escapeHtml(s.description || s.id || `步骤 ${i + 1}`)}</span>
      <span class="step-status-badge">${s.status || 'pending'}</span>
    </div>`;
  }).join('');
}

function clearPlanSteps() { state.planSteps = []; renderPlanSteps([]); }

// ═════════════════════════════════════════════════════════════════════════════
//  CODE VIEWER
// ═════════════════════════════════════════════════════════════════════════════
function openCodeViewer(filePath) {
  if (!codeViewer) return;
  _codeViewerFilePath = filePath;
  codeViewerFilename.textContent = filePath.split('/').pop() || filePath;
  codeViewer.classList.remove('hidden');
  fetch(`/api/files/content?path=${encodeURIComponent(filePath)}`)
    .then((r) => r.ok ? r.json() : null)
    .then((data) => {
      if (!data) {
        codeViewerLines.innerHTML = '<tr><td class="code-line-num"></td><td class="code-line-content" style="color:var(--red)">无法加载文件</td></tr>';
        return;
      }
      codeViewerLang.textContent = data.language || 'text';
      codeViewerSize.textContent = data.size ? formatBytes(data.size) : '';
      const lines = (data.content || '').split('\n');
      codeViewerLines.innerHTML = lines.map((line, i) =>
        `<tr><td class="code-line-num">${i + 1}</td><td class="code-line-content">${escapeHtml(line) || ' '}</td></tr>`
      ).join('');
    })
    .catch(() => {
      codeViewerLines.innerHTML = '<tr><td class="code-line-num"></td><td class="code-line-content" style="color:var(--red)">加载失败</td></tr>';
    });
}

function closeCodeViewer() {
  if (codeViewer) codeViewer.classList.add('hidden');
  _codeViewerFilePath = '';
}

function editCodeInChat() {
  if (_codeViewerFilePath && inputEl) {
    const existing = inputEl.value.trim();
    inputEl.value = (existing ? existing + ' ' : '') + '修改文件 ' + _codeViewerFilePath;
    inputEl.focus();
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + 'px';
    closeCodeViewer();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  TOOLS & AGENTS VIEW
// ═════════════════════════════════════════════════════════════════════════════
function renderToolsView() {
  if (toolsListEl) {
    toolsListEl.innerHTML = state.tools.length
      ? state.tools.map((t) => `<div class="tools-item"><span class="tools-item-icon">🔧</span><span>${escapeHtml(t.name || t)}</span></div>`).join('')
      : '<div class="panel-empty">暂无工具</div>';
  }
  if (skillsListEl) {
    skillsListEl.innerHTML = state.skills.length
      ? state.skills.map((s) => `<div class="tools-item"><span class="tools-item-icon">📋</span><span>${escapeHtml(s.name || s.slug || s)}</span></div>`).join('')
      : '<div class="panel-empty">暂无技能</div>';
  }
  renderMcpToolsView();
}

async function renderMcpToolsView() {
  if (!mcpToolsListEl) return;
  try {
    const r = await fetch('/api/mcp/servers');
    if (!r.ok) return;
    const d = await r.json();
    state.mcpServers = d.servers || [];
    mcpToolsListEl.innerHTML = state.mcpServers.length
      ? state.mcpServers.map((s) =>
          `<div class="tools-item">
            <span class="tools-item-icon">🔌</span>
            <span>${escapeHtml(s.name)}</span>
            <span class="tools-item-env">${s.env || 0} env</span>
            <span class="tools-item-status ${s.enabled ? 'status-on' : 'status-off'}">${s.enabled ? '在线' : '离线'}</span>
          </div>`
        ).join('')
      : '<div class="panel-empty">暂无 MCP</div>';
  } catch { mcpToolsListEl.innerHTML = '<div class="panel-empty">加载失败</div>'; }
}

// ═════════════════════════════════════════════════════════════════════════════
//  REASONING LEVEL
// ═════════════════════════════════════════════════════════════════════════════
function setReasoningLevel(level) {
  state.reasoningLevel = level;
  rlButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.level === level));
  switch (level) {
    case 'quick':
      saveSetting('temperature', 0.3);
      saveSetting('planner', false);
      break;
    case 'balanced':
      saveSetting('temperature', 0.7);
      saveSetting('planner', true);
      break;
    case 'deep':
      saveSetting('temperature', 1.0);
      saveSetting('planner', true);
      break;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  WEBSOCKET
// ═════════════════════════════════════════════════════════════════════════════
let ws = null;
let wsReconnectTimer = null;

function connectWs() {
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
  if (ws) { try { ws.close(); } catch {} ws = null; }
  const host = isTauri ? 'localhost' : location.hostname;
  const port = location.port || '7780';
  ws = new WebSocket(`ws://${host}:${port}`);
  ws.onopen = () => {
    state.connected = true;
    setStatus('已连接', 'idle');
    if (welcomeStatus) welcomeStatus.textContent = '已连接';
    fetchConfig();
    fetchSkills();
    fetchTools();
    loadHistory();
    if (ws._pingTimer) clearInterval(ws._pingTimer);
    ws._pingTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
    }, 25000);
  };
  ws.onclose = () => {
    state.connected = false;
    setStatus('已断开', 'error');
    if (ws._pingTimer) { clearInterval(ws._pingTimer); ws._pingTimer = null; }
    wsReconnectTimer = setTimeout(connectWs, 3000);
  };
  ws.onerror = () => {
    setStatus('连接失败', 'error');
    if (welcomeStatus) welcomeStatus.textContent = '连接失败，正在重试...';
  };
  ws.onmessage = (e) => { try { handleWsMsg(JSON.parse(e.data)); } catch {} };
}

function handleWsMsg(msg) {
  switch (msg.type) {
    case 'token': appendToken(msg.data); break;
    case 'done': finishMessage(msg.data); break;
    case 'error': showError(msg.message); break;
    case 'tool_call': addToolCall(msg.name, msg.args); break;
    case 'tool_result': {
      const last = messagesEl.querySelector('.tool-call:last-child');
      if (last) updateToolCall(last, msg.message || `✓ ${msg.name}`);
      break;
    }
    case 'diffs': if (msg.diffs && msg.diffs.length) renderDiffs(msg.diffs); break;
    case 'memory': updateMemoryCount(msg.memoryCount); if (msg.tokenCount !== undefined) tokenCountEl.textContent = msg.tokenCount; break;
    case 'files_changed': setTimeout(fetchFileTree, 500); break;
    case 'pong': break;
    case 'plan_steps': if (msg.steps) renderPlanSteps(msg.steps); break;
    case 'shell_output': appendTerminalOutput(msg.data); break;
    case 'shell_start': terminalStatus.textContent = '运行中...'; break;
    case 'shell_done': handleTermDone(msg.code); break;
    case 'shell_error':
      terminalStatus.textContent = '错误';
      const errLine = document.createElement('div');
      errLine.className = 'term-output-line error';
      errLine.textContent = `错误: ${msg.message}`;
      terminalOutput.appendChild(errLine);
      terminalOutput.scrollTop = terminalOutput.scrollHeight;
      break;
  }
}

function sendWs(data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

// ═════════════════════════════════════════════════════════════════════════════
//  MARKDOWN RENDERER
// ═════════════════════════════════════════════════════════════════════════════
function renderMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
    '<div class="code-header"><span>' + (lang || 'code') + '</span><button class="copy-btn" onclick="window._copyCode(this)">复制</button></div><pre><code>' + code.trim() + '</code></pre>'
  );
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/\*\*(\S[^*\n]*\S)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(\S[^*\n]*\S)\*/g, '<em>$1</em>');
  html = html.replace(/~~(\S[^~\n]*\S)~~/g, '<del>$1</del>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Tables
  html = html.replace(/((?:^\|.+\|\s*$\n?)+)/gm, (match) => {
    const rows = match.trim().split('\n').filter(l => l.trim());
    if (rows.length < 2) return match;
    const dataRows = rows.filter(r => !/^\|[\s:-]+\|/.test(r));
    if (!dataRows.length) return match;
    let table = '<table>';
    const hCells = dataRows[0].slice(1, -1).split('|').map(c => c.trim());
    table += '<thead><tr>' + hCells.map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>';
    for (let i = 1; i < dataRows.length; i++) {
      const cells = dataRows[i].slice(1, -1).split('|').map(c => c.trim());
      if (cells.every(c => /^-+$/.test(c))) continue;
      table += '<tr>' + cells.map(c => '<td>' + c + '</td>').join('') + '</tr>';
    }
    table += '</tbody></table>';
    return table;
  });
  html = html.replace(/^- (.+)$/gm, '<li>__UL__$1</li>');
  html = html.replace(/((?:<li>__UL__.*<\/li>\n?)+)/g, '<ul>$1</ul>').replace(/__UL__/g, '');
  html = html.replace(/^\d+\. (.+)$/gm, '<li>__OL__$1</li>');
  html = html.replace(/((?:<li>__OL__.*<\/li>\n?)+)/g, '<ol>$1</ol>').replace(/__OL__/g, '');
  // Paragraphs
  const parts = html.split(/\n\n+/);
  html = parts.map((block) => {
    const t = block.trim();
    if (!t) return '';
    if (/^<(h[123]|ul|ol|table|blockquote|pre|div|p\b)/i.test(t)) return t;
    return '<p>' + t.replace(/\n/g, '<br>') + '</p>';
  }).join('\n');
  return html;
}

window._copyCode = function (btn) {
  const header = btn.closest('.code-header');
  if (!header) return;
  const pre = header.nextElementSibling;
  if (!pre) return;
  const code = pre.textContent;
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).catch(() => fallbackCopy(code));
  else fallbackCopy(code);
  btn.textContent = '已复制';
  btn.classList.add('copied');
  setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('copied'); }, 2000);
};

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
}

// ═════════════════════════════════════════════════════════════════════════════
//  MESSAGE ACTIONS
// ═════════════════════════════════════════════════════════════════════════════
function addMessageActions(el, content) {
  const actions = document.createElement('div');
  actions.className = 'message-actions';
  const copyBtn = document.createElement('button');
  copyBtn.className = 'msg-action-btn'; copyBtn.textContent = '复制'; copyBtn.title = '复制消息';
  copyBtn.addEventListener('click', () => {
    copyToClipboard(el._full || el.textContent || '');
    copyBtn.textContent = '已复制';
    setTimeout(() => { copyBtn.textContent = '复制'; }, 2000);
  });
  actions.appendChild(copyBtn);
  if (el.classList.contains('assistant')) {
    const regenBtn = document.createElement('button');
    regenBtn.className = 'msg-action-btn'; regenBtn.textContent = '重新生成'; regenBtn.title = '重新生成回复';
    regenBtn.addEventListener('click', () => {
      const prev = el.previousElementSibling;
      if (prev && prev.classList.contains('user')) {
        el.remove();
        sendMessage(prev.textContent || '');
      }
    });
    actions.appendChild(regenBtn);
  }
  const delBtn = document.createElement('button');
  delBtn.className = 'msg-action-btn'; delBtn.textContent = '删除'; delBtn.title = '删除消息';
  delBtn.addEventListener('click', () => el.remove());
  actions.appendChild(delBtn);
  el.appendChild(actions);
}

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  else fallbackCopy(text);
}

// ═════════════════════════════════════════════════════════════════════════════
//  FILE ATTACHMENT
// ═════════════════════════════════════════════════════════════════════════════
function handleFileSelect(files) {
  for (const file of files) {
    if (state.attachedFiles.length >= 10) break;
    const reader = new FileReader();
    reader.onload = (e) => {
      state.attachedFiles.push({ name: file.name, size: file.size, type: file.type || 'application/octet-stream', data: e.target.result.split(',')[1] });
      renderFilePreview();
    };
    reader.readAsDataURL(file);
  }
}

function removeFile(index) { state.attachedFiles.splice(index, 1); renderFilePreview(); }

function renderFilePreview() {
  if (!filePreview) return;
  if (!state.attachedFiles.length) { filePreview.classList.add('hidden'); filePreview.innerHTML = ''; return; }
  filePreview.classList.remove('hidden');
  filePreview.innerHTML = state.attachedFiles.map((f, i) =>
    '<span class="file-chip">' + getFileIcon(f.name) + ' ' + escapeHtml(f.name) + ' <span style="color:var(--text-muted);font-size:10px">' + formatBytes(f.size) + '</span><span class="remove-file" data-index="' + i + '">✕</span></span>'
  ).join('');
  filePreview.querySelectorAll('.remove-file').forEach((el) => {
    el.addEventListener('click', () => removeFile(parseInt(el.dataset.index)));
  });
}

// ═════════════════════════════════════════════════════════════════════════════
//  TOAST
// ═════════════════════════════════════════════════════════════════════════════
function showToast(message, type = 'info', duration = 3000) {
  const existing = document.querySelector('.toast-notification');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast-notification toast-' + type;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-visible'));
  setTimeout(() => { toast.classList.remove('toast-visible'); setTimeout(() => toast.remove(), 300); }, duration);
}

// ═════════════════════════════════════════════════════════════════════════════
//  MESSAGES
// ═════════════════════════════════════════════════════════════════════════════
function isNearBottom() { return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 150; }

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
  _userScrolledUp = false;
  if (scrollBottomBtn) scrollBottomBtn.classList.add('hidden');
}

function handleScroll() {
  const near = isNearBottom();
  if (near) { _userScrolledUp = false; if (scrollBottomBtn) scrollBottomBtn.classList.add('hidden'); }
  else if (state.streaming) { _userScrolledUp = true; if (scrollBottomBtn) scrollBottomBtn.classList.remove('hidden'); }
}

function addMessage(role, content) {
  if (welcomeEl && !welcomeEl.classList.contains('hidden')) welcomeEl.classList.add('hidden');
  const el = document.createElement('div');
  el.className = 'message ' + role;
  el._full = content;
  el.innerHTML = role === 'assistant' ? renderMarkdown(content) : escapeHtml(content);
  addMessageActions(el, content);
  messagesEl.appendChild(el);
  if (!_userScrolledUp) scrollToBottom();
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
  if (!_userScrolledUp) scrollToBottom();
}

function finishMessage(full) {
  if (currentAssistantEl) {
    currentAssistantEl.classList.remove('stream-cursor');
    currentAssistantEl._full = full;
    currentAssistantEl.innerHTML = renderMarkdown(full);
    addMessageActions(currentAssistantEl, full);
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
  setInputStatus('');
  setMascotFrame(0);
  showMascotSpeech(getMascotReaction('done'));
}

function showError(msg) {
  if (welcomeEl && !welcomeEl.classList.contains('hidden')) welcomeEl.classList.add('hidden');
  const el = document.createElement('div');
  el.className = 'message error';
  el.textContent = '错误: ' + msg;
  messagesEl.appendChild(el);
  if (!_userScrolledUp) scrollToBottom();
  if (state.streaming) {
    state.streaming = false; state.abortController = null; currentAssistantEl = null;
    sendBtn.classList.remove('hidden'); stopBtn.classList.add('hidden');
    sendBtn.disabled = false; inputEl.disabled = false; setStatus('就绪', 'idle');
  }
  setInputStatus('');
  showMascotSpeech(getMascotReaction('confused'));
}

function addToolCall(name, args) {
  if (welcomeEl && !welcomeEl.classList.contains('hidden')) welcomeEl.classList.add('hidden');
  const el = document.createElement('div');
  el.className = 'tool-call loading';
  el.textContent = '🔧 调用 ' + name + (args && typeof args === 'object' && Object.keys(args).length ? ' …' : '');
  messagesEl.appendChild(el);
  if (!_userScrolledUp) scrollToBottom();
  return el;
}

function updateToolCall(el, status) {
  if (el) { el.classList.remove('loading'); el.textContent = status.startsWith('🔧') ? status : '🔧 ' + status; }
}

function setInputStatus(text) { if (inputStatus) inputStatus.textContent = text; }

// ═════════════════════════════════════════════════════════════════════════════
//  CHAT
// ═════════════════════════════════════════════════════════════════════════════
function sendMessage(text) {
  if (!text.trim() || state.streaming) return;
  if (!state.connected) { showError('未连接到服务器'); return; }
  let msg = text.trim();
  if (state.attachedFiles.length) {
    const fileList = state.attachedFiles.map((f) => `[文件] ${f.name} (${formatBytes(f.size)})`).join('\n');
    msg = msg ? fileList + '\n\n' + msg : fileList;
  }
  addMessage('user', msg);
  state.streaming = true;
  sendBtn.classList.add('hidden');
  stopBtn.classList.remove('hidden');
  inputEl.disabled = true;
  currentAssistantEl = null;
  setStatus('思考中...', 'busy');
  setInputStatus('AI 正在思考...');
  setMascotFrame(2);
  showMascotSpeech(getMascotReaction('thinking'));
  state.attachedFiles = [];
  renderFilePreview();
  inputEl.value = '';
  inputEl.style.height = 'auto';
  sendWs({ type: 'chat', message: msg, files: [] });
}

function stopGeneration() {
  if (!state.streaming) return;
  state.streaming = false;
  if (currentAssistantEl) {
    currentAssistantEl.classList.remove('stream-cursor');
    currentAssistantEl.innerHTML = currentAssistantEl._full ? renderMarkdown(currentAssistantEl._full) : '';
    addMessageActions(currentAssistantEl, currentAssistantEl._full || '');
    currentAssistantEl = null;
  }
  sendBtn.classList.remove('hidden');
  stopBtn.classList.add('hidden');
  sendBtn.disabled = false;
  inputEl.disabled = false;
  setStatus('已停止', 'idle');
  setInputStatus('');
  sendWs({ type: 'stop' });
}

// ═════════════════════════════════════════════════════════════════════════════
//  SIDEBAR: SKILLS / TOOLS / FILE TREE
// ═════════════════════════════════════════════════════════════════════════════

// File tree
async function fetchFileTree() {
  if (!fileTreeContainer) return;
  try {
    const r = await fetch('/api/files');
    if (!r.ok) return;
    const d = await r.json();
    renderFileTree(d.tree || []);
  } catch {}
}

function renderFileTree(tree) {
  if (!fileTreeContainer) return;
  if (!tree || !tree.length) { fileTreeContainer.innerHTML = '<div class="panel-empty">暂无文件</div>'; return; }
  fileTreeContainer.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'file-tree';
  container.appendChild(buildTreeNodes(tree, 0));
  fileTreeContainer.appendChild(container);
}

function buildTreeNodes(nodes, depth) {
  const ul = document.createElement('ul');
  ul.className = 'file-tree-list';
  if (depth === 0) ul.style.paddingLeft = '0';
  for (const node of nodes) {
    const li = document.createElement('li');
    li.className = 'file-tree-item';
    if (node.isDir) {
      const folder = document.createElement('div');
      folder.className = 'file-tree-folder';
      folder.style.paddingLeft = (depth * 16) + 'px';
      folder.innerHTML = '<span class="folder-toggle">▾</span><span class="folder-icon">📁</span><span class="folder-name">' + escapeHtml(node.name) + '</span>';
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'folder-children';
      if (node.children && node.children.length) childrenContainer.appendChild(buildTreeNodes(node.children, depth + 1));
      folder.addEventListener('click', () => {
        const isCollapsed = childrenContainer.style.display === 'none';
        childrenContainer.style.display = isCollapsed ? '' : 'none';
        folder.querySelector('.folder-toggle').textContent = isCollapsed ? '▾' : '▸';
      });
      li.appendChild(folder);
      li.appendChild(childrenContainer);
    } else {
      const file = document.createElement('div');
      file.className = 'file-tree-file';
      file.style.paddingLeft = (depth * 16 + 24) + 'px';
      file.textContent = node.name;
      file.title = node.path;
      file.addEventListener('click', () => openCodeViewer(node.path));
      li.appendChild(file);
    }
    ul.appendChild(li);
  }
  return ul;
}

// Memory / Skills panels (for sidebar footer buttons)
function toggleMemoryPanel() {
  let memPanel = $('#panel-memories');
  if (!memPanel) {
    const template = $('#memory-panel-template');
    if (template) {
      memPanel = template.content.cloneNode(true).querySelector('.sidebar-panel-content');
      memPanel.id = 'panel-memories';
      memPanel.style.display = 'block';
      sidebarEl.querySelector('.sidebar-footer-row').after(memPanel);
    }
  }
  if (memPanel) {
    const hidden = memPanel.style.display === 'none' || !memPanel.style.display;
    memPanel.style.display = hidden ? 'block' : 'none';
    if (hidden) fetchMemories();
  }
}

function toggleSkillsPanel() {
  let skillsPanel = $('#panel-skills');
  if (!skillsPanel) {
    const template = $('#skills-panel-template');
    if (template) {
      skillsPanel = template.content.cloneNode(true).querySelector('.sidebar-panel-content');
      skillsPanel.id = 'panel-skills';
      skillsPanel.style.display = 'block';
      sidebarEl.querySelector('.sidebar-footer-row').after(skillsPanel);
    }
  }
  if (skillsPanel) {
    const hidden = skillsPanel.style.display === 'none' || !skillsPanel.style.display;
    skillsPanel.style.display = hidden ? 'block' : 'none';
    if (hidden) renderSkillsPanel();
  }
}

async function fetchMemories() {
  const memPanel = $('#panel-memories');
  if (!memPanel) return;
  try {
    const r = await fetch('/api/memory');
    if (!r.ok) return;
    const d = await r.json();
    renderMemories(d.memories || []);
  } catch {}
}

function renderMemories(memories) {
  const memPanel = $('#panel-memories');
  if (!memPanel) return;
  if (!memories.length) { memPanel.innerHTML = '<div class="panel-empty">暂无记忆</div>'; return; }
  memPanel.innerHTML = memories.map((m) => {
    const text = m.content || m.text || '';
    const relevance = m.relevance || m.score || '';
    const time = m.timestamp ? new Date(m.timestamp).toLocaleString('zh-CN') : '';
    return '<div class="memory-item">' +
      (time ? '<span class="memory-time">' + escapeHtml(time) + '</span>' : '') +
      '<span class="memory-text">' + escapeHtml(text).slice(0, 200) + (text.length > 200 ? '…' : '') + '</span>' +
      (relevance ? '<span class="memory-score">相关度: ' + Number(relevance).toFixed(2) + '</span>' : '') +
    '</div>';
  }).join('');
}

function renderSkillsPanel() {
  const panel = $('#panel-skills');
  if (!panel) return;
  panel.innerHTML = state.skills.length
    ? state.skills.map((s) => '<div class="skill-item">' + escapeHtml(s.name || s.slug || s) + '</div>').join('')
    : '<div class="panel-empty">暂无技能</div>';
}

// ═════════════════════════════════════════════════════════════════════════════
//  DIFFS VIEWER
// ═════════════════════════════════════════════════════════════════════════════
let _diffContainer = null;
let _diffCount = 0;

function ensureDiffContainer() {
  if (_diffContainer && document.body.contains(_diffContainer)) return _diffContainer;
  const template = $('#diff-viewer-template');
  if (template) {
    _diffContainer = template.content.cloneNode(true).querySelector('.diff-viewer');
    _diffContainer.id = 'diff-viewer';
    document.body.appendChild(_diffContainer);
    _diffContainer.querySelector('.diff-viewer-clear').addEventListener('click', () => {
      _diffContainer.querySelector('.diff-viewer-body').innerHTML = '';
      _diffContainer.classList.add('hidden');
      _diffCount = 0;
      updateDiffBadge();
    });
    return _diffContainer;
  }
  _diffContainer = document.createElement('div');
  _diffContainer.id = 'diff-viewer';
  _diffContainer.className = 'diff-viewer hidden';
  _diffContainer.innerHTML = '<div class="diff-viewer-header"><span class="diff-viewer-title">📝 文件变更</span><div class="diff-viewer-actions"><button class="diff-viewer-clear" title="清空">✕</button></div></div><div class="diff-viewer-body"></div>';
  document.body.appendChild(_diffContainer);
  _diffContainer.querySelector('.diff-viewer-clear').addEventListener('click', () => {
    _diffContainer.querySelector('.diff-viewer-body').innerHTML = '';
    _diffContainer.classList.add('hidden');
    _diffCount = 0;
    updateDiffBadge();
  });
  return _diffContainer;
}

function updateDiffBadge() {
  let badge = document.getElementById('diffBadge');
  if (_diffCount > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'diffBadge';
      badge.className = 'badge badge-purple diff-badge';
      badge.title = '点击查看文件变更 (Ctrl+Shift+D)';
      badge.addEventListener('click', () => ensureDiffContainer().classList.toggle('hidden'));
      const tbRight = $('#toolbar-right');
      if (tbRight) tbRight.appendChild(badge);
    }
    badge.textContent = '变更 ' + _diffCount;
    badge.style.display = '';
  } else {
    if (badge) badge.style.display = 'none';
  }
}

function renderDiffs(diffs) {
  const container = ensureDiffContainer();
  const body = container.querySelector('.diff-viewer-body');
  for (const d of diffs) {
    _diffCount++;
    const diffEl = document.createElement('div');
    diffEl.className = 'diff-entry';
    const header = document.createElement('div');
    header.className = 'diff-entry-header';
    const fileName = d.filePath || '未知文件';
    const shortName = fileName.split('/').pop();
    header.innerHTML = '<span class="diff-file-icon">📄</span><span class="diff-file-name" title="' + escapeHtml(fileName) + '">' + escapeHtml(shortName) + '</span><span class="diff-stats"><span class="diff-add">+' + (d.added || 0) + '</span><span class="diff-rem">-' + (d.removed || 0) + '</span></span><button class="diff-toggle-btn" title="展开/折叠">▾</button>';
    const content = document.createElement('div');
    content.className = 'diff-entry-content';
    if (d.diff) {
      let inHeader = true;
      for (const line of d.diff.split('\n')) {
        if (line.startsWith('@@')) { inHeader = false; const le = document.createElement('div'); le.className = 'diff-line diff-hunk-header'; le.textContent = line; content.appendChild(le); continue; }
        if (inHeader) continue;
        const le = document.createElement('div');
        if (line.startsWith('+')) { le.className = 'diff-line diff-add-line'; le.textContent = line; }
        else if (line.startsWith('-')) { le.className = 'diff-line diff-rem-line'; le.textContent = line; }
        else { le.className = 'diff-line diff-ctx-line'; le.textContent = line; }
        content.appendChild(le);
      }
    }
    diffEl.appendChild(header);
    diffEl.appendChild(content);
    body.appendChild(diffEl);
    header.addEventListener('click', () => {
      const hidden = content.style.display === 'none';
      content.style.display = hidden ? '' : 'none';
      header.querySelector('.diff-toggle-btn').textContent = hidden ? '▾' : '▸';
    });
  }
  container.classList.remove('hidden');
  updateDiffBadge();
}

// Session management
function loadHistory() {
  fetch('/api/sessions')
    .then((r) => r.ok ? r.json() : { sessions: [] })
    .then((d) => { state.sessions = d.sessions || []; renderHistory(); })
    .catch(() => {});
}

function renderHistory() {
  if (!historyList) return;
  if (!state.sessions.length) { historyList.innerHTML = '<div class="panel-empty">暂无对话历史</div>'; return; }
  historyList.innerHTML = state.sessions.map((s) =>
    '<div class="history-item' + (s.id === state.currentSessionId ? ' active' : '') + '" data-id="' + escapeHtml(s.id) + '">' +
      '<span class="history-item-name">' + escapeHtml(s.name || s.id || '对话') + '</span>' +
      '<span class="history-item-actions"><button class="history-rename-btn" title="重命名">✎</button><button class="history-delete-btn" title="删除">✕</button></span>' +
    '</div>'
  ).join('');
  historyList.querySelectorAll('.history-item').forEach((el) => {
    const id = el.dataset.id;
    el.addEventListener('click', (e) => { if (e.target.closest('.history-item-actions')) return; loadSession(id); });
    el.querySelector('.history-rename-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const nameEl = el.querySelector('.history-item-name');
      const newName = prompt('重命名对话:', nameEl.textContent);
      if (newName && newName.trim() && newName.trim() !== nameEl.textContent) renameSession(id, newName.trim());
    });
    el.querySelector('.history-delete-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('确定删除此对话？')) deleteSession(id);
    });
  });
}

async function renameSession(id, name) {
  try {
    const r = await fetch('/api/sessions/' + encodeURIComponent(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    if (r.ok) { const s = state.sessions.find((x) => x.id === id); if (s) s.name = name; renderHistory(); showToast('已重命名', 'success', 1500); }
  } catch {}
}

async function deleteSession(id) {
  try {
    const r = await fetch('/api/sessions/' + encodeURIComponent(id), { method: 'DELETE' });
    if (r.ok) {
      state.sessions = state.sessions.filter((x) => x.id !== id);
      if (state.currentSessionId === id) { state.currentSessionId = null; messagesEl.innerHTML = ''; if (welcomeEl) welcomeEl.classList.remove('hidden'); }
      renderHistory(); showToast('已删除对话', 'info', 1500);
    }
  } catch {}
}

async function createNewSession() {
  try {
    const r = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '新对话 ' + (state.sessions.length + 1) }) });
    if (r.ok) {
      const d = await r.json();
      if (d.session) { state.sessions.unshift({ id: d.session.id, name: d.session.name || '新对话', messages: [] }); state.currentSessionId = d.session.id; messagesEl.innerHTML = ''; if (welcomeEl) welcomeEl.classList.remove('hidden'); renderHistory(); showToast('已创建新对话', 'success', 1500); }
    }
  } catch {}
}

function loadSession(id) {
  state.currentSessionId = id;
  renderHistory();
  messagesEl.innerHTML = '';
  welcomeEl && welcomeEl.classList.add('hidden');
  fetch('/api/sessions/' + encodeURIComponent(id))
    .then((r) => r.ok ? r.json() : null)
    .then((data) => { if (data && data.messages) data.messages.forEach((m) => { if (m.role === 'tool') addToolCall(m.name, m.args); else addMessage(m.role, m.content); }); })
    .catch(() => {});
}

// ═════════════════════════════════════════════════════════════════════════════
//  SYSTEM PANEL
// ═════════════════════════════════════════════════════════════════════════════
function openSystemPanel() {
  rightPanelTitle.textContent = '系统监控';
  const template = $('#system-panel-template');
  rightPanelBody.innerHTML = template ? template.innerHTML : '<div class="panel-empty">系统信息不可用</div>';
  rightPanel.classList.remove('hidden');
  rightResize.classList.remove('hidden');
  refreshSystemInfo();
}

async function refreshSystemInfo() {
  if (isTauri && tauriInvoke) { try { const info = await tauriInvoke('system_info'); if (info) applySystemInfo(info); return; } catch {} }
  try { const res = await fetch('/api/system'); if (res.ok) applySystemInfo(await res.json()); } catch {}
}

function applySystemInfo(info) {
  const f = (id) => $(id);
  if (f('#sysPlatform')) f('#sysPlatform').textContent = info.platform || '—';
  if (f('#sysArch')) f('#sysArch').textContent = info.arch || '—';
  if (f('#sysOS')) f('#sysOS').textContent = info.os_version || info.os || info.platform || '—';
  if (f('#sysHostname')) f('#sysHostname').textContent = info.hostname || '—';
  if (f('#sysUptime')) f('#sysUptime').textContent = info.uptime ? formatUptime(info.uptime) : '—';
  if (f('#sysCPU')) f('#sysCPU').textContent = info.cpu || info.cpu_brand || '—';
  if (f('#sysProcesses')) f('#sysProcesses').textContent = info.processes != null ? String(info.processes) : '—';
  if (info.memory_total && info.memory_used != null && f('#memBar') && f('#memText')) {
    const pct = Math.min(100, Math.round((info.memory_used / info.memory_total) * 100));
    f('#memBar').style.width = pct + '%';
    f('#memBar').className = 'bar-fill' + (pct > 80 ? ' danger' : pct > 60 ? ' warning' : '');
    f('#memText').textContent = formatBytes(info.memory_used) + ' / ' + formatBytes(info.memory_total);
  }
  if (info.disk_total && info.disk_used != null && f('#diskBar') && f('#diskText')) {
    const pct = Math.min(100, Math.round((info.disk_used / info.disk_total) * 100));
    f('#diskBar').style.width = pct + '%';
    f('#diskBar').className = 'bar-fill' + (pct > 80 ? ' danger' : pct > 60 ? ' warning' : '');
    f('#diskText').textContent = formatBytes(info.disk_used) + ' / ' + formatBytes(info.disk_total);
  }
}

function closeRightPanel() { rightPanel.classList.add('hidden'); rightResize.classList.add('hidden'); }

// ═════════════════════════════════════════════════════════════════════════════
//  SETTINGS
// ═════════════════════════════════════════════════════════════════════════════
function fetchConfigForSettings() {
  fetch('/api/config')
    .then((r) => r.ok ? r.json() : null)
    .then((cfg) => {
      if (!cfg) return;
      if (cfg.provider) settingProvider.value = cfg.provider;
      if (cfg.model) settingModel.value = cfg.model;
      if (cfg.temperature != null) { settingTemp.value = cfg.temperature; tempLabel.textContent = cfg.temperature; }
      if (cfg.stream != null) settingStream.checked = cfg.stream;
      if (cfg.planner != null) settingPlanner.checked = cfg.planner;
    })
    .catch(() => {});
}

async function saveSetting(key, value) {
  try {
    const r = await fetch('/api/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: value }) });
    if (r.ok) {
      fetchConfig(); // Refresh toolbar/status display immediately
      // If provider changed, update model field with new provider's default
      if (key === 'provider') {
        setTimeout(fetchConfigForSettings, 200);
      }
    }
  } catch { /* non-critical */ }
}

async function fetchMcpServers() {
  try { const r = await fetch('/api/mcp/servers'); if (r.ok) renderMcpServers((await r.json()).servers || []); } catch {}
}

function renderMcpServers(servers) {
  const list = $('#mcp-server-list');
  if (!list) return;
  if (!servers.length) { list.innerHTML = '<div class="panel-empty">暂无 MCP 服务器</div>'; return; }
  list.innerHTML = servers.map((s) =>
    '<div class="mcp-server-item">' +
      '<div class="mcp-server-info"><span class="mcp-server-name">' + escapeHtml(s.name) + '</span><span class="mcp-server-command">' + escapeHtml(s.command) + (s.args?.length ? ' ' + escapeHtml(s.args.join(' ')) : '') + '</span></div>' +
      '<div class="mcp-server-actions"><span class="mcp-server-env-badge">' + (s.env || 0) + ' env</span><button class="mcp-server-delete-btn" data-name="' + escapeHtml(s.name) + '" title="删除">✕</button></div>' +
    '</div>'
  ).join('');
  list.querySelectorAll('.mcp-server-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.name;
      if (confirm('确定删除 MCP 服务器「' + name + '」？')) {
        try { const r = await fetch('/api/mcp/servers/' + encodeURIComponent(name), { method: 'DELETE' }); if (r.ok) { fetchMcpServers(); showToast('已删除 MCP 服务器: ' + name, 'success', 2000); } } catch {}
      }
    });
  });
}

// ═════════════════════════════════════════════════════════════════════════════
//  REST API POLLING
// ═════════════════════════════════════════════════════════════════════════════
let _initPollTimer = null;

async function fetchConfig() {
  try {
    const r = await fetch('/api/config');
    if (!r.ok) return;
    const d = await r.json();
    modelNameEl.textContent = d.model || '—';
    providerNameEl.textContent = d.provider || '';
    statusModel.textContent = d.model || '—';
    if (d.memoryCount != null) { memoryCountEl.textContent = '记忆 ' + d.memoryCount; statusMemoryBadge.textContent = '🧠 ' + d.memoryCount; }
    if (d.tokenCount != null) { tokenCountEl.textContent = String(d.tokenCount); statusTokenBadge.textContent = '✦ ' + d.tokenCount; }
    if (d.initDone) {
      if (_initPollTimer) { clearInterval(_initPollTimer); _initPollTimer = null; }
      fetchSkills(); fetchTools(); loadHistory();
      setStatus('就绪', 'idle');
      if (welcomeStatus) welcomeStatus.textContent = '已连接';
      fetchMemories(); fetchFileTree();
      showMascotSpeech(mascotGreeting(mascotSpecies || 'cat'));
      sendBtn.disabled = false;
    } else {
      setStatus('初始化中...', 'connecting');
      if (welcomeStatus) welcomeStatus.textContent = '初始化中...';
      showMascotSpeech('正在初始化服务...');
      if (!_initPollTimer) _initPollTimer = setInterval(fetchConfig, 2000);
    }
  } catch {}
}

async function fetchSkills() {
  try { const r = await fetch('/api/skills'); if (r.ok) state.skills = (await r.json()).skills || []; } catch {}
}

async function fetchTools() {
  try { const r = await fetch('/api/tools'); if (r.ok) state.tools = (await r.json()).tools || []; } catch {}
}

function updateMemoryCount(count) {
  if (count != null) { memoryCountEl.textContent = '记忆 ' + count; statusMemoryBadge.textContent = '🧠 ' + count; }
  else { fetch('/api/config').then((r) => r.ok ? r.json() : null).then((d) => { if (d && d.memoryCount != null) { memoryCountEl.textContent = '记忆 ' + d.memoryCount; statusMemoryBadge.textContent = '🧠 ' + d.memoryCount; } }).catch(() => {}); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  SIDEBAR SEARCH
// ═════════════════════════════════════════════════════════════════════════════
if (sidebarSearchInput && sidebarSearchResults) {
  sidebarSearchInput.addEventListener('input', () => {
    const q = sidebarSearchInput.value.trim().toLowerCase();
    if (!q) { sidebarSearchResults.innerHTML = '<div class="panel-empty">输入关键词搜索</div>'; return; }
    const msgs = messagesEl.querySelectorAll('.message');
    const results = [];
    msgs.forEach((el) => {
      const text = (el._full || el.textContent || '').toLowerCase();
      if (text.includes(q)) results.push(el);
    });
    if (!results.length) { sidebarSearchResults.innerHTML = '<div class="panel-empty">无匹配结果</div>'; return; }
    sidebarSearchResults.innerHTML = results.map((el, i) => {
      const preview = (el._full || el.textContent || '').slice(0, 100);
      return '<div class="history-item" data-idx="' + i + '">' + escapeHtml(preview) + '</div>';
    }).join('');
    sidebarSearchResults.querySelectorAll('.history-item').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx);
        if (results[idx]) { results[idx].scrollIntoView({ behavior: 'smooth', block: 'center' }); switchSidebarView('sidebar-chat'); }
      });
    });
  });
}

// ═════════════════════════════════════════════════════════════════════════════
//  TEXTAREA auto-resize
// ═════════════════════════════════════════════════════════════════════════════
function initTextarea() {
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + 'px';
  });
}

// ═════════════════════════════════════════════════════════════════════════════
//  RESIZE HANDLERS
// ═════════════════════════════════════════════════════════════════════════════
function initResizeHandlers() {
  let isResizing = false;
  sidebarResize.addEventListener('mousedown', (e) => {
    isResizing = true;
    sidebarResize.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const startX = e.clientX;
    const startWidth = sidebarEl.offsetWidth;
    const onMove = (e2) => { if (!isResizing) return; const w = Math.max(180, Math.min(500, startWidth + (e2.clientX - startX))); sidebarEl.style.width = w + 'px'; };
    const onUp = () => { isResizing = false; sidebarResize.classList.remove('resizing'); document.body.style.cursor = ''; document.body.style.userSelect = ''; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
  const termResize = $('#terminal-resize');
  if (termResize) {
    let isTermResizing = false;
    termResize.addEventListener('mousedown', (e) => {
      isTermResizing = true;
      termResize.classList.add('resizing');
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      const startY = e.clientY;
      const startHeight = terminalPanel.offsetHeight;
      const onMove = (e2) => { if (!isTermResizing) return; const h = Math.max(100, Math.min(window.innerHeight * 0.6, startHeight - (e2.clientY - startY))); terminalPanel.style.height = h + 'px'; terminalPanel.style.flex = 'none'; };
      const onUp = () => { isTermResizing = false; termResize.classList.remove('resizing'); document.body.style.cursor = ''; document.body.style.userSelect = ''; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  EVENTS
// ═════════════════════════════════════════════════════════════════════════════
function initEvents() {
  sendBtn.addEventListener('click', () => sendMessage(inputEl.value));
  inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(inputEl.value); } });
  stopBtn.addEventListener('click', stopGeneration);
  newChatBtn.addEventListener('click', createNewSession);

  // Activity Bar
  activityBtns.forEach((btn) => btn.addEventListener('click', () => switchSidebarView(btn.dataset.view)));

  // Terminal
  termToggleBtn.addEventListener('click', toggleTerminal);
  termCloseBtn.addEventListener('click', () => terminalPanel.classList.add('hidden'));
  termClearBtn.addEventListener('click', clearTerminal);
  terminalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = terminalInput.value;
      terminalInput.value = '';
      state.termHistory.push(cmd);
      state.termHistoryIdx = state.termHistory.length;
      termExecCommand(cmd);
    }
    if (e.key === 'ArrowUp') { if (state.termHistoryIdx > 0) { state.termHistoryIdx--; terminalInput.value = state.termHistory[state.termHistoryIdx] || ''; } e.preventDefault(); }
    if (e.key === 'ArrowDown') {
      if (state.termHistoryIdx < state.termHistory.length - 1) { state.termHistoryIdx++; terminalInput.value = state.termHistory[state.termHistoryIdx] || ''; }
      else { state.termHistoryIdx = state.termHistory.length; terminalInput.value = ''; }
      e.preventDefault();
    }
  });

  // System panel
  $('#btn-activity-system')?.addEventListener('click', openSystemPanel);

  // Close panels
  $$('.close-panel').forEach((btn) => btn.addEventListener('click', () => { const p = btn.closest('.right-panel'); if (p) closeRightPanel(); else closeAllPanels(); }));
  $('#overlay').addEventListener('click', closeAllPanels);

  // Sidebar memory/skills toggles
  $('#btn-sidebar-memory')?.addEventListener('click', toggleMemoryPanel);
  $('#btn-sidebar-skills')?.addEventListener('click', toggleSkillsPanel);

  // Sidebar refresh buttons
  $$('.sidebar-refresh-btn').forEach((btn) => btn.addEventListener('click', () => { if (btn.dataset.action === 'refresh-files') fetchFileTree(); }));

  // MCP add
  $('#mcp-add-btn')?.addEventListener('click', () => {
    const name = prompt('MCP 服务器名称:');
    if (!name) return;
    const command = prompt('运行命令 (如: npx):');
    if (!command) return;
    const argsStr = prompt('参数 (空格分隔，可选):', '');
    const args = argsStr ? argsStr.split(' ').filter(Boolean) : [];
    fetch('/api/mcp/servers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, command, args, env: {} }) })
      .then((r) => { if (r.ok) { fetchMcpServers(); showToast('已添加 MCP 服务器: ' + name, 'success', 2000); } })
      .catch(() => {});
  });

  // Settings
  settingProvider.addEventListener('change', () => saveSetting('provider', settingProvider.value));
  settingModel.addEventListener('change', () => saveSetting('model', settingModel.value));
  settingTemp.addEventListener('input', () => { tempLabel.textContent = settingTemp.value; saveSetting('temperature', parseFloat(settingTemp.value)); });
  settingStream.addEventListener('change', () => saveSetting('stream', settingStream.checked));
  settingPlanner.addEventListener('change', () => saveSetting('planner', settingPlanner.checked));

  // File attachment
  if (btnAttach && fileInput) {
    btnAttach.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => { if (fileInput.files && fileInput.files.length) { handleFileSelect(fileInput.files); fileInput.value = ''; } });
  }

  // Drag-and-drop
  const inputArea = $('#input-area');
  if (inputArea) {
    inputArea.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
    inputArea.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files && e.dataTransfer.files.length) handleFileSelect(e.dataTransfer.files); });
  }

  // Input status
  inputEl.addEventListener('focus', () => { if (!state.streaming) setInputStatus('输入中...'); });
  inputEl.addEventListener('blur', () => { if (!state.streaming && !inputEl.value.trim()) setInputStatus(''); });
  inputEl.addEventListener('input', () => { if (!state.streaming && inputEl.value.trim()) setInputStatus('输入中...'); });

  // Scroll
  messagesEl.addEventListener('scroll', handleScroll);
  if (scrollBottomBtn) scrollBottomBtn.addEventListener('click', scrollToBottom);

  // ── New features: Planner, Code Viewer, Reasoning Level, Tools ──
  if (plannerClearBtn) plannerClearBtn.addEventListener('click', clearPlanSteps);
  if (codeViewerEditBtn) codeViewerEditBtn.addEventListener('click', editCodeInChat);
  if (codeViewer) codeViewer.querySelectorAll('.close-panel').forEach((btn) => btn.addEventListener('click', closeCodeViewer));
  rlButtons.forEach((btn) => btn.addEventListener('click', () => setReasoningLevel(btn.dataset.level)));
  $$('[data-action="refresh-tools"]').forEach((btn) => btn.addEventListener('click', renderToolsView));
}

function closeAllPanels() { closeRightPanel(); }

// ═════════════════════════════════════════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ═════════════════════════════════════════════════════════════════════════════
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const isCtrl = e.ctrlKey || e.metaKey;
    const isInput = e.target === inputEl || e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA';

    if (isInput) {
      if (isCtrl && e.key === 'l') { e.preventDefault(); newChatBtn.click(); }
      return;
    }

    if (e.key === 'Escape') {
      if (!rightPanel.classList.contains('hidden')) { closeRightPanel(); e.preventDefault(); }
      if (searchBar && !searchBar.classList.contains('hidden')) { closeSearch(); e.preventDefault(); }
      if (_diffContainer && !_diffContainer.classList.contains('hidden')) { _diffContainer.classList.add('hidden'); e.preventDefault(); }
      return;
    }

    if (isCtrl && ['1','2','3','4','5','6'].includes(e.key)) {
      e.preventDefault();
      switchSidebarView(['sidebar-chat','sidebar-files','sidebar-search','sidebar-settings','sidebar-planner','sidebar-tools'][parseInt(e.key) - 1]);
    }
    if (isCtrl && e.key === '`') { e.preventDefault(); toggleTerminal(); }
    if (isCtrl && e.key === 'f') { e.preventDefault(); toggleSearch(); }
    if (isCtrl && e.key === 'l') { e.preventDefault(); newChatBtn.click(); }
    if (isCtrl && e.key === ',') { e.preventDefault(); switchSidebarView('sidebar-settings'); }
    if (isCtrl && e.shiftKey && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); openSystemPanel(); }
    if (isCtrl && e.key === 'i') { e.preventDefault(); inputEl.focus(); }
    if (isCtrl && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      if (_diffContainer) { const hidden = _diffContainer.classList.contains('hidden'); _diffContainer.classList.toggle('hidden'); if (hidden && _diffCount === 0) _diffContainer.classList.add('hidden'); }
    }
  });
}

// ═════════════════════════════════════════════════════════════════════════════
//  SEARCH (inline in messages)
// ═════════════════════════════════════════════════════════════════════════════
function toggleSearch() {
  if (!searchBar) return;
  const hidden = searchBar.classList.contains('hidden');
  if (hidden) { searchBar.classList.remove('hidden'); searchInput.value = _searchQuery || ''; searchInput.focus(); searchInput.select(); }
  else closeSearch();
}

function closeSearch() {
  if (searchBar) searchBar.classList.add('hidden');
  if (searchInput) searchInput.value = '';
  _searchQuery = ''; _searchMatches = []; _searchCurrentIdx = -1;
  if (searchCount) searchCount.textContent = '';
  clearSearchHighlights();
}

function performSearch(query) {
  _searchQuery = query;
  clearSearchHighlights();
  if (!query.trim()) { _searchMatches = []; _searchCurrentIdx = -1; if (searchCount) searchCount.textContent = ''; return; }
  const msgs = messagesEl.querySelectorAll('.message');
  _searchMatches = [];
  const lowerQuery = query.toLowerCase();
  msgs.forEach((el) => { const text = (el._full || el.textContent || '').toLowerCase(); if (text.includes(lowerQuery)) { _searchMatches.push(el); el.classList.add('search-match'); } });
  _searchCurrentIdx = _searchMatches.length > 0 ? 0 : -1;
  updateSearchUI();
  if (_searchMatches.length > 0) scrollToSearchMatch(0);
}

function clearSearchHighlights() {
  messagesEl.querySelectorAll('.search-match').forEach((el) => el.classList.remove('search-match'));
  messagesEl.querySelectorAll('.search-active').forEach((el) => el.classList.remove('search-active'));
}

function scrollToSearchMatch(index) {
  if (index < 0 || index >= _searchMatches.length) return;
  const el = _searchMatches[index];
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('search-active');
  setTimeout(() => { _searchMatches.forEach((e) => e.classList.remove('search-active')); if (_searchMatches[index]) _searchMatches[index].classList.add('search-active'); }, 50);
}

function updateSearchUI() {
  if (!searchCount) return;
  searchCount.textContent = _searchMatches.length === 0 ? (_searchQuery ? '无匹配' : '') : `${_searchCurrentIdx + 1}/${_searchMatches.length}`;
}

function searchPrevFn() {
  if (_searchMatches.length === 0) return;
  _searchCurrentIdx = (_searchCurrentIdx - 1 + _searchMatches.length) % _searchMatches.length;
  updateSearchUI();
  scrollToSearchMatch(_searchCurrentIdx);
}

function searchNextFn() {
  if (_searchMatches.length === 0) return;
  _searchCurrentIdx = (_searchCurrentIdx + 1) % _searchMatches.length;
  updateSearchUI();
  scrollToSearchMatch(_searchCurrentIdx);
}

// ═════════════════════════════════════════════════════════════════════════════
//  INIT
// ═════════════════════════════════════════════════════════════════════════════
function init() {
  initMascot();
  initTextarea();
  initEvents();
  initKeyboardShortcuts();
  initResizeHandlers();
  switchSidebarView('sidebar-chat');
  if (isTauri) { setStatus('就绪', 'idle'); loadHistory(); fetchSkills(); fetchTools(); connectWs(); }
  else { setStatus('连接中...', 'idle'); connectWs(); }
}

document.addEventListener('DOMContentLoaded', init);
