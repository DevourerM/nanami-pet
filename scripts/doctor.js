const fs = require('node:fs');
const path = require('node:path');

const petRoot = path.resolve(__dirname, '..');
const model = path.join(petRoot, 'model', 'nanami.model3.json');
const core = path.join(petRoot, 'vendor', 'live2dcubismcore.min.js');
const checks = [
  ['七海 Cubism 模型', model],
  ['Cubism Core（需用户从官方 SDK 提取）', core],
];
let failed = false;
for (const [label, filename] of checks) {
  const exists = fs.existsSync(filename);
  console.log(`${exists ? 'OK' : '缺失'}  ${label}: ${filename}`);
  failed ||= !exists;
}
process.exitCode = failed ? 1 : 0;
