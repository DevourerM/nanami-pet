'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FORMAT = 'nanami-personality';
const VERSION = 1;
const MAX_IMPORT_BYTES = 8 * 1024 * 1024;
const PROMPT_FILES = {
  corePersona: 'core-persona.md',
  companionGuidelines: 'companion-guidelines.md',
  live2dEvents: 'live2d-events.md',
};

function safeName(value) {
  const cleaned = String(value || '').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ');
  return (cleaned || 'nanami-personality').slice(0, 64);
}

function cloneDiary(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry?.date) && typeof entry.content === 'string')
    .map((entry) => ({ date: entry.date, content: entry.content }));
}

class PersonaStore {
  constructor({ projectDirectory, promptDirectory, memoryStore }) {
    this.projectDirectory = projectDirectory;
    this.promptDirectory = promptDirectory;
    this.memoryStore = memoryStore;
    this.personaDirectory = path.join(projectDirectory, 'personas');
  }

  ensure() {
    fs.mkdirSync(this.personaDirectory, { recursive: true });
  }

  currentSnapshot(name = '在原七海') {
    const prompts = {};
    for (const [key, filename] of Object.entries(PROMPT_FILES)) {
      prompts[key] = fs.readFileSync(path.join(this.promptDirectory, filename), 'utf8');
    }
    return {
      format: FORMAT,
      version: VERSION,
      name: safeName(name),
      exportedAt: new Date().toISOString(),
      prompts,
      ...this.memoryStore.exportSnapshot(),
    };
  }

  normalize(snapshot) {
    if (!snapshot || snapshot.format !== FORMAT || snapshot.version !== VERSION) {
      throw new Error('不是受支持的 .mem 人格文件。');
    }
    const prompts = {};
    for (const key of Object.keys(PROMPT_FILES)) {
      if (typeof snapshot.prompts?.[key] !== 'string' || !snapshot.prompts[key].trim()) {
        throw new Error(`人格文件缺少提示词：${key}`);
      }
      prompts[key] = snapshot.prompts[key].trimEnd().concat('\n');
    }
    return {
      format: FORMAT,
      version: VERSION,
      name: safeName(snapshot.name),
      exportedAt: typeof snapshot.exportedAt === 'string' ? snapshot.exportedAt : new Date().toISOString(),
      prompts,
      memories: typeof snapshot.memories === 'string' ? snapshot.memories : '# 七海的回忆\n',
      diary: cloneDiary(snapshot.diary),
    };
  }

  readFile(filePath) {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > MAX_IMPORT_BYTES) throw new Error('人格文件无效或超过 8 MB。');
    return this.normalize(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  }

  nextCopyPath(name) {
    this.ensure();
    const base = safeName(name);
    let candidate = path.join(this.personaDirectory, `${base}.mem`);
    let index = 2;
    while (fs.existsSync(candidate)) {
      candidate = path.join(this.personaDirectory, `${base}-${index}.mem`);
      index += 1;
    }
    return candidate;
  }

  apply(snapshot) {
    const normalized = this.normalize(snapshot);
    for (const [key, filename] of Object.entries(PROMPT_FILES)) {
      fs.writeFileSync(path.join(this.promptDirectory, filename), normalized.prompts[key], 'utf8');
    }
    this.memoryStore.replaceSnapshot(normalized);
    return normalized;
  }

  importFile(filePath) {
    const snapshot = this.readFile(filePath);
    const copyPath = this.nextCopyPath(snapshot.name);
    fs.writeFileSync(copyPath, JSON.stringify(snapshot, null, 2), 'utf8');
    this.apply(snapshot);
    return { name: snapshot.name, file: path.basename(copyPath) };
  }

  ensureDefault(name) {
    this.ensure();
    const defaultPath = path.join(this.personaDirectory, 'nanami-default.mem');
    if (!fs.existsSync(defaultPath)) {
      fs.writeFileSync(defaultPath, JSON.stringify(this.currentSnapshot(name), null, 2), 'utf8');
    }
    return { name, file: path.basename(defaultPath) };
  }

  exportFile(filePath, name) {
    const snapshot = this.currentSnapshot(name);
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8');
    return { name: snapshot.name, file: path.basename(filePath) };
  }
}

module.exports = { PersonaStore };
