const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen, globalShortcut, dialog, clipboard, powerMonitor } = require('electron');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { AgentRuntime } = require('./agent/runtime');
const { buildPrompt } = require('./agent/prompt-builder');
const { MemoryStore } = require('./agent/memory-store');
const { PersonaStore } = require('./agent/persona-store');

const PET_WIDTH = 420;
const PET_MODEL_HEIGHT = 740;
const OUTPUT_WIDTH = 330;
const OUTPUT_HEIGHT = 78;
const PET_HEIGHT = PET_MODEL_HEIGHT;
const COMPOSER_WIDTH = 408;
const COMPOSER_HEIGHT = 104;
const SETTINGS_WIDTH = 288;
const SETTINGS_HEIGHT = 372;
const HISTORY_WIDTH = 420;
const HISTORY_HEIGHT = 480;
const TEXT_OUTPUT_WIDTH = 460;
const TEXT_OUTPUT_HEIGHT = 430;
const TTS_PORT = 9880;
const WORK_ACTIVITY_IDLE_SECONDS = 30;
const WORK_ACTIVITY_MINIMUM_MS = 5 * 60 * 1000;
const WORK_ACTIVITY_POLL_MS = 15 * 1000;
const MEMORY_BATCH_SIZE = 6;
const MEMORY_EXIT_TIMEOUT_MS = 25 * 1000;
const modelPath = path.join(__dirname, 'model', 'nanami.model3.json');
const bundledCorePath = path.join(__dirname, 'vendor', 'live2dcubismcore.min.js');
const ttsRoot = path.join(__dirname, 'services', 'nanami-tts');
const ttsPython = path.join(ttsRoot, 'runtime', 'python.exe');
const appIcon = path.join(__dirname, 'icon.png');

if (process.platform === 'win32') app.setAppUserModelId('com.nanami.codex-pet');

let petWindow;
let composerWindow;
let outputWindow;
let settingsWindow;
let historyWindow;
let textOutputWindow;
let tray;
let dragOrigin;
let composerHasCustomPosition = false;
let ttsProcess;
let ttsStartPromise;
let outputAcceptsMouse = false;
let petControlHover = false;
let agentRuntime;
let workActivityTimer;
let workActivityStartedAt = 0;
let nextWorkSignalAt = 0;
let memoryStore;
let personaStore;
let memoryFlushPromise;
let memoryExitInProgress = false;
const attachmentRegistry = new Map();
const petSettings = { clickThrough: false, alwaysOnTop: true, mouseFollow: true, focusMode: false, memoryEnabled: false, personaName: '', personaFile: '', volume: 1 };
const llmConfig = { baseUrl: '', apiKey: '', model: '' };

function settingsFilePath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadPetSettings() {
  try {
    const stored = JSON.parse(fs.readFileSync(settingsFilePath(), 'utf8'));
    petSettings.clickThrough = Boolean(stored.clickThrough);
    petSettings.alwaysOnTop = stored.alwaysOnTop !== false;
    petSettings.mouseFollow = stored.mouseFollow !== false;
    petSettings.focusMode = Boolean(stored.focusMode);
    petSettings.memoryEnabled = Boolean(stored.memoryEnabled);
    petSettings.personaName = typeof stored.personaName === 'string' ? stored.personaName : '';
    petSettings.personaFile = typeof stored.personaFile === 'string' ? stored.personaFile : '';
    petSettings.volume = Number.isFinite(stored.volume) ? Math.max(0, Math.min(2, stored.volume)) : 1;
    Object.assign(llmConfig, stored.llm || {});
  } catch {}
}

function savePetSettings() {
  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(settingsFilePath(), 'utf8')); } catch {}
  fs.writeFileSync(settingsFilePath(), JSON.stringify({ ...existing, ...petSettings, llm: llmConfig }, null, 2));
}

function applyPetSettings() {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.setIgnoreMouseEvents(petSettings.clickThrough && !petControlHover, { forward: true });
    petWindow.setAlwaysOnTop(petSettings.alwaysOnTop, petSettings.alwaysOnTop ? 'floating' : 'normal');
  }
  if (composerWindow && !composerWindow.isDestroyed()) {
    composerWindow.setAlwaysOnTop(petSettings.alwaysOnTop, petSettings.alwaysOnTop ? 'floating' : 'normal');
  }
  if (outputWindow && !outputWindow.isDestroyed()) {
    outputWindow.setIgnoreMouseEvents(!outputAcceptsMouse);
    // 作为 petWindow 的子窗口，输出始终位于角色之上；关闭置顶时两者仍会一起被其他应用覆盖。
    outputWindow.setAlwaysOnTop(petSettings.alwaysOnTop, petSettings.alwaysOnTop ? 'floating' : 'normal');
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.setAlwaysOnTop(petSettings.alwaysOnTop, petSettings.alwaysOnTop ? 'pop-up-menu' : 'normal');
  }
  if (historyWindow && !historyWindow.isDestroyed()) {
    historyWindow.setAlwaysOnTop(petSettings.alwaysOnTop, petSettings.alwaysOnTop ? 'pop-up-menu' : 'normal');
  }
  if (textOutputWindow && !textOutputWindow.isDestroyed()) {
    textOutputWindow.setAlwaysOnTop(petSettings.alwaysOnTop, petSettings.alwaysOnTop ? 'pop-up-menu' : 'normal');
  }
}

function updatePetSettings(patch) {
  if (typeof patch.clickThrough === 'boolean') petSettings.clickThrough = patch.clickThrough;
  if (typeof patch.alwaysOnTop === 'boolean') petSettings.alwaysOnTop = patch.alwaysOnTop;
  if (typeof patch.mouseFollow === 'boolean') petSettings.mouseFollow = patch.mouseFollow;
  if (typeof patch.focusMode === 'boolean') petSettings.focusMode = patch.focusMode;
  if (typeof patch.memoryEnabled === 'boolean') petSettings.memoryEnabled = patch.memoryEnabled;
  if (Number.isFinite(patch.volume)) petSettings.volume = Math.max(0, Math.min(2, patch.volume));
  if (patch.llm && typeof patch.llm === 'object') {
    for (const key of ['baseUrl', 'apiKey', 'model']) {
      if (typeof patch.llm[key] === 'string') llmConfig[key] = patch.llm[key].trim();
    }
  }
  savePetSettings();
  applyPetSettings();
  settingsWindow?.webContents.send('settings:changed', currentSettingsPayload());
  petWindow?.webContents.send('pet:settings', petSettings);
  composerWindow?.webContents.send('composer:settings', petSettings);
  return currentSettingsPayload();
}

function publishPersonaChanged() {
  const payload = currentSettingsPayload();
  settingsWindow?.webContents.send('settings:changed', payload);
  petWindow?.webContents.send('pet:settings', petSettings);
  composerWindow?.webContents.send('composer:settings', petSettings);
  return payload;
}

async function importPersona(window) {
  const result = await dialog.showOpenDialog(window || settingsWindow, {
    title: '导入人格',
    filters: [{ name: 'Nanami 人格', extensions: ['mem'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths[0]) return currentSettingsPayload();
  const persona = getPersonaStore().importFile(result.filePaths[0]);
  petSettings.personaName = persona.name;
  petSettings.personaFile = persona.file;
  agentRuntime?.clearContext();
  savePetSettings();
  return publishPersonaChanged();
}

async function exportPersona(window) {
  const result = await dialog.showSaveDialog(window || settingsWindow, {
    title: '导出人格',
    defaultPath: path.join(getPersonaStore().personaDirectory, `${currentPersona().name}.mem`),
    filters: [{ name: 'Nanami 人格', extensions: ['mem'] }],
  });
  if (result.canceled || !result.filePath) return currentSettingsPayload();
  const filePath = path.extname(result.filePath).toLowerCase() === '.mem' ? result.filePath : `${result.filePath}.mem`;
  getPersonaStore().exportFile(filePath, currentPersona().name);
  return currentSettingsPayload();
}

function getAgentRuntime() {
  if (!agentRuntime) {
    agentRuntime = new AgentRuntime({
      getConfig: () => ({ ...llmConfig }),
      getPrompt: buildPrompt,
      searchMemory: (query, scope) => getMemoryStore().search(query, scope),
      getMemoryBrief: () => (petSettings.memoryEnabled ? getMemoryStore().getCompanionBrief() : ''),
    });
  }
  return agentRuntime;
}

function getMemoryStore() {
  if (!memoryStore) {
    memoryStore = new MemoryStore(path.join(__dirname, 'memory'));
    memoryStore.ensure();
  }
  return memoryStore;
}

function getPersonaStore() {
  if (!personaStore) {
    personaStore = new PersonaStore({
      projectDirectory: __dirname,
      promptDirectory: path.join(__dirname, 'prompts'),
      memoryStore: getMemoryStore(),
    });
  }
  return personaStore;
}

function currentPersona() {
  return { name: petSettings.personaName || '在原七海', file: petSettings.personaFile || 'nanami-default.mem' };
}

function currentSettingsPayload() {
  return { ...petSettings, llm: { ...llmConfig }, persona: currentPersona() };
}

function ensureActivePersona() {
  const store = getPersonaStore();
  const existing = petSettings.personaFile && path.join(store.personaDirectory, petSettings.personaFile);
  if (existing && fs.existsSync(existing)) return;
  Object.assign(petSettings, store.ensureDefault('在原七海'));
  savePetSettings();
}

function todayLocalDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function randomWorkSignalDelay() {
  return (10 + Math.floor(Math.random() * 21)) * 60 * 1000;
}

function hasLlmConfiguration() {
  return Boolean(llmConfig.baseUrl && llmConfig.apiKey && llmConfig.model);
}

function startWorkActivityMonitor() {
  if (workActivityTimer) return;
  workActivityTimer = setInterval(() => {
    const now = Date.now();
    if (powerMonitor.getSystemIdleTime() > WORK_ACTIVITY_IDLE_SECONDS) {
      workActivityStartedAt = 0;
      nextWorkSignalAt = 0;
      return;
    }
    if (!workActivityStartedAt) {
      workActivityStartedAt = now;
      nextWorkSignalAt = now + randomWorkSignalDelay();
      return;
    }
    if (
      now - workActivityStartedAt < WORK_ACTIVITY_MINIMUM_MS
      || now < nextWorkSignalAt
      || !hasLlmConfiguration()
      || !petWindow?.isVisible()
    ) return;

    nextWorkSignalAt = now + randomWorkSignalDelay();
    petWindow.webContents.send('pet:work-activity');
  }, WORK_ACTIVITY_POLL_MS);
}

function memoryEndpoint() {
  const baseUrl = llmConfig.baseUrl.replace(/\/$/, '');
  return baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
}

function parseMemorySummary(content) {
  try {
    const match = String(content || '').match(/\{[\s\S]*\}/);
    const value = JSON.parse(match ? match[0] : content);
    return {
      diary: typeof value.diary === 'string' ? value.diary.trim().slice(0, 900) : '',
      memories: Array.isArray(value.memories)
        ? value.memories.map((item) => String(item || '').trim().slice(0, 260)).filter(Boolean).slice(0, 4)
        : [],
    };
  } catch {
    throw new Error('Memory summary did not return valid JSON.');
  }
}

async function requestMemorySummary(entries, includeMemories) {
  const record = entries.map((entry) => ({
    time: new Date(entry.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    user: entry.input,
    nanami: entry.output,
  }));
  const response = await fetch(memoryEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llmConfig.apiKey}` },
    body: JSON.stringify({
      model: llmConfig.model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: `You maintain private local memory for a Japanese-character desktop companion. Return JSON only: {"diary":"...","memories":["..."]}. Write diary in concise Chinese, first-person Nanami voice, preserving only the day's useful context. Never describe body language or use roleplay parentheses. ${includeMemories ? 'Memories contains at most 3 durable facts: user preferences, commitments, ongoing projects, relationship milestones, or important events. Exclude fleeting chatter and sensitive secrets unless the user explicitly asked to retain them.' : 'Always return an empty memories array.'}`,
        },
        { role: 'user', content: JSON.stringify(record) },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || `Memory LLM returned ${response.status}`);
  return parseMemorySummary(body.choices?.[0]?.message?.content);
}

function flushPendingMemory({ force = false, includeMemories = false } = {}) {
  if (memoryFlushPromise) return memoryFlushPromise;
  if (!hasLlmConfiguration()) return Promise.resolve({ wrote: false, diary: '' });
  const store = getMemoryStore();
  memoryFlushPromise = (async () => {
    let wrote = false;
    let latestDiary = '';
    while (true) {
      const batch = store.getNextBatch(MEMORY_BATCH_SIZE);
      if (!batch.length) break;
      const isOlderDay = batch[0].date !== todayLocalDate();
      if (!force && !isOlderDay && batch.length < MEMORY_BATCH_SIZE) break;
      const summary = await requestMemorySummary(batch, includeMemories);
      store.appendDiary(batch[0].date, summary.diary);
      if (includeMemories) store.appendMemories(summary.memories);
      store.remove(batch.map((entry) => entry.id));
      wrote = true;
      latestDiary = summary.diary;
      if (!force) break;
    }
    return { wrote, diary: latestDiary };
  })().catch((error) => {
    console.error('Nanami memory consolidation failed:', error);
    return { wrote: false, diary: '' };
  }).finally(() => {
    memoryFlushPromise = undefined;
  });
  return memoryFlushPromise;
}

async function flushMemoryBeforeQuit() {
  if (!hasLlmConfiguration() || !getMemoryStore().hasPending()) return;
  if (memoryFlushPromise) await memoryFlushPromise;
  if (getMemoryStore().hasPending()) await flushPendingMemory({ force: true, includeMemories: true });
}

async function prepareIdleConversation(eventText) {
  if (eventText !== '（长时间无交互）' || !petSettings.memoryEnabled) return eventText;
  const result = await flushPendingMemory();
  if (!result.diary) return eventText;
  return `${eventText}\n（今天已经整理的日记摘要：${result.diary}。可自然地从中找一个话题闲聊，不要复述这段摘要。）`;
}

async function respondAndSynthesize(input, source = 'user', { remember = petSettings.memoryEnabled, recordInput = input } = {}) {
  const reply = await getAgentRuntime().respond({ input, source });
  const focusMode = petSettings.focusMode;
  const audio = focusMode ? null : await ensureTtsService().then(() => synthesize(reply.speech, reply.emotion));
  const createdAt = new Date().toISOString();
  appendHistory({ input: recordInput, output: reply.display, createdAt });
  if (remember) getMemoryStore().enqueueTurn({ input: recordInput, output: reply.display, createdAt });
  showOutput(reply.display);
  if (focusMode) finishOutputPlayback();
  for (const skillCall of reply.skillCalls) {
    if (skillCall.name === 'present_text') showTextOutput(skillCall.arguments.content);
  }
  return { text: reply.display, audioBase64: audio?.toString('base64') || null, focusMode };
}

function historyFilePath() {
  return path.join(app.getPath('userData'), 'voice-history.json');
}

function readHistory() {
  try {
    const history = JSON.parse(fs.readFileSync(historyFilePath(), 'utf8'));
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

function appendHistory(entry) {
  const history = readHistory();
  history.push(entry);
  fs.writeFileSync(historyFilePath(), JSON.stringify(history.slice(-200), null, 2));
  historyWindow?.webContents.send('history:changed', readHistory());
}

function clearHistory() {
  fs.writeFileSync(historyFilePath(), '[]');
  historyWindow?.webContents.send('history:changed', []);
}

function registerAttachmentPaths(filePaths) {
  if (!Array.isArray(filePaths)) return [];
  return [...new Set(filePaths)].slice(0, 8).flatMap((filePath) => {
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size > 25 * 1024 * 1024) return [];
      const attachment = {
        id: randomUUID(),
        name: path.basename(filePath),
        size: stat.size,
        extension: path.extname(filePath).toLowerCase(),
      };
      attachmentRegistry.set(attachment.id, filePath);
      return [attachment];
    } catch {
      return [];
    }
  });
}

function registerClipboardImage(payload) {
  const rawBytes = payload?.bytes;
  if (!rawBytes || !(rawBytes instanceof ArrayBuffer || ArrayBuffer.isView(rawBytes))) return [];
  const image = Buffer.from(rawBytes);
  if (!image.length || image.length > 25 * 1024 * 1024) return [];

  const extensions = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };
  const extension = extensions[payload?.mimeType] || '.png';
  const directory = path.join(app.getPath('temp'), 'nanami-pet-attachments');
  const filename = `clipboard-${randomUUID()}${extension}`;
  const filePath = path.join(directory, filename);
  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(filePath, image, { flag: 'wx' });
    return registerAttachmentPaths([filePath]);
  } catch {
    return [];
  }
}

function getCorePath() {
  const configPath = path.join(app.getPath('userData'), 'settings.json');
  try {
    const configured = JSON.parse(fs.readFileSync(configPath, 'utf8')).cubismCorePath;
    if (configured && fs.existsSync(configured)) return configured;
  } catch {}
  return fs.existsSync(bundledCorePath) ? bundledCorePath : null;
}

function showPet() {
  if (!petWindow) return;
  petWindow.showInactive();
  outputWindow?.showInactive();
  outputWindow?.moveTop();
}

function hidePet() {
  composerWindow?.hide();
  outputWindow?.hide();
  settingsWindow?.hide();
  historyWindow?.hide();
  textOutputWindow?.hide();
  petWindow?.hide();
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isTtsReady() {
  return new Promise((resolve) => {
    const request = http.get({ host: '127.0.0.1', port: TTS_PORT, path: '/health', timeout: 500 }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode === 200));
    });
    request.on('error', () => resolve(false));
    request.on('timeout', () => request.destroy());
  });
}

async function ensureTtsService() {
  if (await isTtsReady()) return;
  if (ttsStartPromise) return ttsStartPromise;
  if (!fs.existsSync(ttsPython)) throw new Error(`TTS runtime is missing: ${ttsPython}`);

  ttsStartPromise = (async () => {
    ttsProcess = spawn(ttsPython, ['tts_server.py'], {
      cwd: ttsRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    ttsProcess.stdout.on('data', (data) => process.stdout.write(`[nanami-tts] ${data}`));
    ttsProcess.stderr.on('data', (data) => process.stderr.write(`[nanami-tts] ${data}`));
    ttsProcess.once('error', (error) => console.error('Unable to start Nanami TTS:', error));

    for (let attempt = 0; attempt < 90; attempt += 1) {
      if (await isTtsReady()) return;
      await delay(1000);
    }
    throw new Error('Nanami TTS did not become ready within 90 seconds.');
  })().catch((error) => {
    ttsStartPromise = undefined;
    throw error;
  });
  return ttsStartPromise;
}

function synthesize(text, emotion = 'neutral') {
  const body = Buffer.from(JSON.stringify({ text, emotion, speed: 1.0, seed: -1 }));
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port: TTS_PORT,
      path: '/tts',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
      timeout: 180000,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const responseBody = Buffer.concat(chunks);
        if (response.statusCode !== 200) {
          reject(new Error(`TTS returned ${response.statusCode}: ${responseBody.toString('utf8')}`));
          return;
        }
        resolve(responseBody);
      });
    });
    request.on('error', reject);
    request.on('timeout', () => request.destroy(new Error('TTS request timed out.')));
    request.end(body);
  });
}

function createPetWindow() {
  const workArea = screen.getPrimaryDisplay().workArea;
  petWindow = new BrowserWindow({
    width: PET_WIDTH,
    height: PET_HEIGHT,
    x: workArea.x + workArea.width - PET_WIDTH - 18,
    y: workArea.y + workArea.height - PET_HEIGHT - 18,
    icon: appIcon,
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: petSettings.alwaysOnTop,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  applyPetSettings();
  petWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  petWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      hidePet();
    }
  });
  petWindow.on('hide', () => {
    composerWindow?.hide();
    outputWindow?.hide();
  });
  petWindow.on('moved', () => positionOutputWindow());
}

function initialOutputBounds() {
  const [x, y] = petWindow.getPosition();
  const workArea = screen.getDisplayNearestPoint({ x, y }).workArea;
  return {
    x: Math.max(workArea.x + 12, Math.min(workArea.x + workArea.width - OUTPUT_WIDTH - 12, x + (PET_WIDTH - OUTPUT_WIDTH) / 2)),
    y: Math.min(workArea.y + workArea.height - OUTPUT_HEIGHT - 12, y + PET_MODEL_HEIGHT - OUTPUT_HEIGHT - 6),
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
  };
}

function positionOutputWindow() {
  if (outputWindow && !outputWindow.isDestroyed()) outputWindow.setBounds(initialOutputBounds());
}

function createOutputWindow() {
  outputWindow = new BrowserWindow({
    ...initialOutputBounds(),
    icon: appIcon,
    parent: petWindow,
    modal: false,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  outputWindow.setIgnoreMouseEvents(true);
  applyPetSettings();
  outputWindow.loadFile(path.join(__dirname, 'renderer', 'output.html'));
  outputWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      outputWindow.hide();
    }
  });
}

function showOutput(text) {
  if (!outputWindow || outputWindow.isDestroyed()) createOutputWindow();
  if (petWindow?.isVisible()) outputWindow.showInactive();
  if (petSettings.alwaysOnTop) outputWindow.setAlwaysOnTop(true, 'floating');
  outputWindow.moveTop();
  outputWindow.webContents.send('output:show', text);
}

function finishOutputPlayback() {
  outputWindow?.webContents.send('output:playback-ended');
}

function initialComposerBounds() {
  const [x, y] = petWindow.getPosition();
  const workArea = screen.getDisplayNearestPoint({ x, y }).workArea;
  return {
    x: Math.max(workArea.x + 12, x - COMPOSER_WIDTH - 14),
    y: Math.min(workArea.y + workArea.height - COMPOSER_HEIGHT - 12, y + PET_HEIGHT - COMPOSER_HEIGHT - 44),
    width: COMPOSER_WIDTH,
    height: COMPOSER_HEIGHT,
  };
}

function createComposerWindow() {
  composerWindow = new BrowserWindow({
    ...initialComposerBounds(),
    icon: appIcon,
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    hasShadow: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  applyPetSettings();
  composerWindow.loadFile(path.join(__dirname, 'renderer', 'composer.html'));
  composerWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      composerWindow.hide();
    }
  });
  composerWindow.on('moved', () => { composerHasCustomPosition = true; });
}

function showComposer() {
  if (!composerWindow || composerWindow.isDestroyed()) createComposerWindow();
  if (!composerHasCustomPosition) composerWindow.setBounds(initialComposerBounds());
  composerWindow.show();
  composerWindow.focus();
  composerWindow.webContents.send('composer:open');
  composerWindow.webContents.send('composer:focus');
}

function toggleComposer() {
  if (composerWindow && !composerWindow.isDestroyed() && composerWindow.isVisible()) {
    composerWindow.webContents.send('composer:request-close');
    return false;
  }
  showComposer();
  return true;
}

function initialSettingsBounds() {
  const [x, y] = petWindow.getPosition();
  const workArea = screen.getDisplayNearestPoint({ x, y }).workArea;
  return {
    x: Math.max(workArea.x + 12, x - SETTINGS_WIDTH - 12),
    y: Math.min(workArea.y + workArea.height - SETTINGS_HEIGHT - 12, y + PET_HEIGHT - SETTINGS_HEIGHT - 92),
    width: SETTINGS_WIDTH,
    height: SETTINGS_HEIGHT,
  };
}

function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    ...initialSettingsBounds(),
    icon: appIcon,
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    hasShadow: true,
    alwaysOnTop: petSettings.alwaysOnTop,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  settingsWindow.setIgnoreMouseEvents(false);
  applyPetSettings();
  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      settingsWindow.hide();
    }
  });
}

function toggleSettings() {
  if (!settingsWindow || settingsWindow.isDestroyed()) createSettingsWindow();
  if (settingsWindow.isVisible()) {
    settingsWindow.hide();
    return false;
  }
  settingsWindow.setIgnoreMouseEvents(false);
  settingsWindow.setAlwaysOnTop(petSettings.alwaysOnTop, petSettings.alwaysOnTop ? 'pop-up-menu' : 'normal');
  settingsWindow.show();
  settingsWindow.moveTop();
  settingsWindow.focus();
  settingsWindow.webContents.send('settings:changed', currentSettingsPayload());
  return true;
}

function initialHistoryBounds() {
  const [x, y] = petWindow.getPosition();
  const workArea = screen.getDisplayNearestPoint({ x, y }).workArea;
  return {
    x: Math.max(workArea.x + 12, x - HISTORY_WIDTH - 14),
    y: Math.max(workArea.y + 12, y + PET_HEIGHT - HISTORY_HEIGHT - 28),
    width: HISTORY_WIDTH,
    height: HISTORY_HEIGHT,
  };
}

function createHistoryWindow() {
  historyWindow = new BrowserWindow({
    ...initialHistoryBounds(),
    icon: appIcon,
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    hasShadow: true,
    alwaysOnTop: petSettings.alwaysOnTop,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  applyPetSettings();
  historyWindow.loadFile(path.join(__dirname, 'renderer', 'history.html'));
  historyWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      historyWindow.hide();
    }
  });
}

function toggleHistory() {
  if (!historyWindow || historyWindow.isDestroyed()) createHistoryWindow();
  if (historyWindow.isVisible()) {
    historyWindow.hide();
    return false;
  }
  historyWindow.show();
  historyWindow.moveTop();
  historyWindow.webContents.send('history:changed', readHistory());
  return true;
}

function initialTextOutputBounds() {
  const [x, y] = petWindow.getPosition();
  const workArea = screen.getDisplayNearestPoint({ x, y }).workArea;
  return {
    x: Math.max(workArea.x + 12, x - TEXT_OUTPUT_WIDTH - 14),
    y: Math.max(workArea.y + 12, y + 20),
    width: TEXT_OUTPUT_WIDTH,
    height: TEXT_OUTPUT_HEIGHT,
  };
}

function createTextOutputWindow() {
  textOutputWindow = new BrowserWindow({
    ...initialTextOutputBounds(),
    icon: appIcon,
    transparent: true,
    frame: false,
    resizable: true,
    minWidth: 320,
    minHeight: 240,
    movable: true,
    hasShadow: true,
    alwaysOnTop: petSettings.alwaysOnTop,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  applyPetSettings();
  textOutputWindow.loadFile(path.join(__dirname, 'renderer', 'text-output.html'));
  textOutputWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      textOutputWindow.hide();
    }
  });
}

function showTextOutput(text) {
  if (!textOutputWindow || textOutputWindow.isDestroyed()) createTextOutputWindow();
  const present = () => {
    if (!textOutputWindow || textOutputWindow.isDestroyed()) return;
    textOutputWindow.setAlwaysOnTop(petSettings.alwaysOnTop, petSettings.alwaysOnTop ? 'pop-up-menu' : 'normal');
    textOutputWindow.showInactive();
    textOutputWindow.moveTop();
    textOutputWindow.webContents.send('text-output:show', text);
  };
  if (textOutputWindow.webContents.isLoading()) textOutputWindow.webContents.once('did-finish-load', present);
  else present();
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(appIcon));
  tray.setToolTip('七海 · Codex 宠物');
  tray.on('click', showPet);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示七海', click: showPet },
    { label: '隐藏七海', click: hidePet },
    { label: '设置', click: toggleSettings },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]));
}

ipcMain.handle('pet:bootstrap', () => ({
  modelUrl: pathToFileURL(modelPath).href,
  coreUrl: getCorePath() ? pathToFileURL(getCorePath()).href : null,
  expectedCorePath: bundledCorePath,
  petWidth: PET_WIDTH,
  petModelHeight: PET_MODEL_HEIGHT,
  settings: { ...petSettings },
}));

ipcMain.on('pet:move', (_event, { start, deltaX, deltaY }) => {
  if (start) dragOrigin = petWindow?.getPosition();
  if (!dragOrigin || !Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;
  petWindow?.setPosition(Math.round(dragOrigin[0] + deltaX), Math.round(dragOrigin[1] + deltaY));
});

ipcMain.on('pet:menu', (_event, { x, y }) => {
  Menu.buildFromTemplate([
    { label: '隐藏', click: hidePet },
    {
      label: '设置',
      submenu: [
        { label: '鼠标穿透', type: 'checkbox', checked: petSettings.clickThrough, click: (item) => updatePetSettings({ clickThrough: item.checked }) },
        { label: '保持在最前', type: 'checkbox', checked: petSettings.alwaysOnTop, click: (item) => updatePetSettings({ alwaysOnTop: item.checked }) },
        { label: '视线跟随鼠标', type: 'checkbox', checked: petSettings.mouseFollow, click: (item) => updatePetSettings({ mouseFollow: item.checked }) },
      ],
    },
    { label: '重新加载模型', click: () => petWindow?.reload() },
    { type: 'separator' },
    {
      label: '退出宠物',
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]).popup({ window: petWindow, x, y });
});

ipcMain.handle('composer:toggle', () => toggleComposer());
ipcMain.handle('conversation:event', async (_event, eventText) => {
  if (typeof eventText !== 'string' || !eventText.trim()) return false;
  const originalEvent = eventText.trim().slice(0, 100);
  const preparedEvent = await prepareIdleConversation(originalEvent);
  return respondAndSynthesize(preparedEvent, 'event', {
    remember: petSettings.memoryEnabled && originalEvent !== '（入场）',
    recordInput: originalEvent,
  });
});
ipcMain.on('conversation:playback-ended', finishOutputPlayback);
ipcMain.on('output:mouse-events', (_event, enabled) => {
  outputAcceptsMouse = Boolean(enabled);
  outputWindow?.setIgnoreMouseEvents(!outputAcceptsMouse);
});
ipcMain.on('pet:activity', () => petWindow?.webContents.send('pet:activity'));
ipcMain.on('pet:controls-hover', (_event, active) => {
  const nextHover = Boolean(active);
  if (petControlHover === nextHover) return;
  petControlHover = nextHover;
  if (petSettings.clickThrough) petWindow?.setIgnoreMouseEvents(!petControlHover, { forward: true });
});
ipcMain.handle('composer:pick-files', async (event) => {
  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender) || composerWindow, {
    properties: ['openFile', 'multiSelections'],
  });
  return result.canceled ? [] : registerAttachmentPaths(result.filePaths);
});
ipcMain.handle('composer:register-files', (_event, filePaths) => registerAttachmentPaths(filePaths));
ipcMain.handle('composer:register-clipboard-image', (_event, payload) => registerClipboardImage(payload));
ipcMain.handle('composer:hide', () => composerWindow?.hide());
ipcMain.handle('settings:toggle', () => toggleSettings());
ipcMain.handle('memory:toggle', () => updatePetSettings({ memoryEnabled: !petSettings.memoryEnabled }));
ipcMain.handle('settings:get', () => currentSettingsPayload());
ipcMain.handle('settings:update', (_event, patch) => updatePetSettings(patch || {}));
ipcMain.handle('persona:import', (event) => importPersona(BrowserWindow.fromWebContents(event.sender)));
ipcMain.handle('persona:export', (event) => exportPersona(BrowserWindow.fromWebContents(event.sender)));
ipcMain.handle('settings:hide', () => settingsWindow?.hide());
ipcMain.handle('history:get', () => readHistory());
ipcMain.handle('history:clear', () => { clearHistory(); return []; });
ipcMain.handle('history:hide', () => historyWindow?.hide());
ipcMain.handle('history:toggle', () => toggleHistory());
ipcMain.handle('text-output:copy', (_event, text) => {
  if (typeof text === 'string') clipboard.writeText(text);
  return true;
});
ipcMain.handle('text-output:hide', () => textOutputWindow?.hide());
ipcMain.handle('conversation:clear', () => { agentRuntime?.clearContext(); return true; });

ipcMain.handle('tts:synthesize', async (_event, text) => {
  if (typeof text !== 'string' || !text.trim()) throw new Error('请输入要让七海说的话。');
  const normalized = text.trim();
  if (normalized.length > 500) throw new Error('单次文本不能超过 500 个字符。');
  return respondAndSynthesize(normalized);
});

app.whenReady().then(() => {
  loadPetSettings();
  getMemoryStore();
  ensureActivePersona();
  clearHistory();
  createPetWindow();
  createOutputWindow();
  outputWindow.showInactive();
  outputWindow.moveTop();
  createTray();
  globalShortcut.register('CommandOrControl+Alt+N', toggleSettings);
  startWorkActivityMonitor();
  if (!petSettings.focusMode) ensureTtsService().catch((error) => console.error('Nanami TTS startup failed:', error));
  app.on('activate', showPet);
});

app.on('before-quit', (event) => {
  if (memoryExitInProgress || !hasLlmConfiguration() || !getMemoryStore().hasPending()) return;
  event.preventDefault();
  memoryExitInProgress = true;
  Promise.race([
    flushMemoryBeforeQuit(),
    delay(MEMORY_EXIT_TIMEOUT_MS),
  ]).catch((error) => console.error('Nanami final memory flush failed:', error)).finally(() => {
    memoryExitInProgress = false;
    app.isQuiting = true;
    app.quit();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (workActivityTimer) clearInterval(workActivityTimer);
  if (ttsProcess && !ttsProcess.killed) ttsProcess.kill();
});
app.on('window-all-closed', (event) => event.preventDefault());
