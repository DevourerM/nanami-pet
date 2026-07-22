const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const outputPath = process.argv.find((argument) => argument.toLowerCase().endsWith('.png'));
if (!outputPath) throw new Error('Usage: electron scripts/capture-preview.js <output.png>');

ipcMain.handle('pet:bootstrap', () => ({
  modelUrl: pathToFileURL(path.join(root, 'model', 'nanami.model3.json')).href,
  coreUrl: pathToFileURL(path.join(root, 'vendor', 'live2dcubismcore.min.js')).href,
  expectedCorePath: path.join(root, 'vendor', 'live2dcubismcore.min.js'),
}));
ipcMain.on('pet:move', () => {});
ipcMain.on('pet:menu', () => {});

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 420,
    height: 740,
    show: false,
    transparent: true,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(root, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  await window.loadFile(path.join(root, 'renderer', 'index.html'));
  setTimeout(async () => {
    fs.writeFileSync(outputPath, (await window.capturePage()).toPNG());
    app.quit();
  }, 5000);
});
