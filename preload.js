const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petHost', {
  bootstrap: () => ipcRenderer.invoke('pet:bootstrap'),
  move: (start, deltaX, deltaY) => ipcRenderer.send('pet:move', { start, deltaX, deltaY }),
  menu: (x, y) => ipcRenderer.send('pet:menu', { x, y }),
  toggleComposer: () => ipcRenderer.invoke('composer:toggle'),
  toggleSettings: () => ipcRenderer.invoke('settings:toggle'),
  synthesizeEvent: (eventText) => ipcRenderer.invoke('conversation:event', eventText),
  completePlayback: () => ipcRenderer.send('conversation:playback-ended'),
  onSettingsChanged: (callback) => ipcRenderer.on('pet:settings', (_event, settings) => callback(settings)),
  onActivity: (callback) => ipcRenderer.on('pet:activity', callback),
});

contextBridge.exposeInMainWorld('composerHost', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  synthesize: (text) => ipcRenderer.invoke('tts:synthesize', text),
  pickFiles: () => ipcRenderer.invoke('composer:pick-files'),
  registerFiles: (paths) => ipcRenderer.invoke('composer:register-files', paths),
  activity: () => ipcRenderer.send('pet:activity'),
  completePlayback: () => ipcRenderer.send('conversation:playback-ended'),
  hide: () => ipcRenderer.invoke('composer:hide'),
  onFocus: (callback) => ipcRenderer.on('composer:focus', callback),
  onOpen: (callback) => ipcRenderer.on('composer:open', callback),
  onSettingsChanged: (callback) => ipcRenderer.on('composer:settings', (_event, settings) => callback(settings)),
  onCloseRequest: (callback) => ipcRenderer.on('composer:request-close', callback),
});

contextBridge.exposeInMainWorld('outputHost', {
  onShow: (callback) => ipcRenderer.on('output:show', (_event, text) => callback(text)),
  onPlaybackEnded: (callback) => ipcRenderer.on('output:playback-ended', callback),
  setMouseEvents: (enabled) => ipcRenderer.send('output:mouse-events', enabled),
});

contextBridge.exposeInMainWorld('settingsHost', {
  get: () => ipcRenderer.invoke('settings:get'),
  update: (patch) => ipcRenderer.invoke('settings:update', patch),
  clearContext: () => ipcRenderer.invoke('conversation:clear'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  hide: () => ipcRenderer.invoke('settings:hide'),
  onChanged: (callback) => ipcRenderer.on('settings:changed', (_event, settings) => callback(settings)),
  toggleHistory: () => ipcRenderer.invoke('history:toggle'),
});

contextBridge.exposeInMainWorld('historyHost', {
  get: () => ipcRenderer.invoke('history:get'),
  hide: () => ipcRenderer.invoke('history:hide'),
  onChanged: (callback) => ipcRenderer.on('history:changed', (_event, history) => callback(history)),
});
