'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const MAX_SEARCH_RESULTS = 12;
const MAX_RESULT_CHARS = 5000;

function localDate(value) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function lines(value) {
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

class MemoryStore {
  constructor(rootDirectory) {
    this.rootDirectory = rootDirectory;
    this.diaryDirectory = path.join(rootDirectory, 'diary');
    this.pendingPath = path.join(rootDirectory, 'pending.json');
    this.memoriesPath = path.join(rootDirectory, 'memories.md');
  }

  ensure() {
    fs.mkdirSync(this.diaryDirectory, { recursive: true });
    if (!fs.existsSync(this.memoriesPath)) fs.writeFileSync(this.memoriesPath, '# 七海的回忆\n', 'utf8');
  }

  readPending() {
    this.ensure();
    try {
      const entries = JSON.parse(fs.readFileSync(this.pendingPath, 'utf8'));
      return Array.isArray(entries) ? entries : [];
    } catch {
      return [];
    }
  }

  writePending(entries) {
    this.ensure();
    fs.writeFileSync(this.pendingPath, JSON.stringify(entries, null, 2), 'utf8');
  }

  enqueueTurn({ input, output, createdAt = new Date().toISOString() }) {
    const entries = this.readPending();
    entries.push({
      id: randomUUID(),
      date: localDate(createdAt),
      createdAt,
      input: String(input || '').trim().slice(0, 1200),
      output: String(output || '').trim().slice(0, 1200),
    });
    this.writePending(entries.slice(-240));
  }

  getNextBatch(limit) {
    const pending = this.readPending();
    if (!pending.length) return [];
    const date = pending[0].date;
    return pending.filter((entry) => entry.date === date).slice(0, limit);
  }

  remove(ids) {
    const removeSet = new Set(ids);
    this.writePending(this.readPending().filter((entry) => !removeSet.has(entry.id)));
  }

  appendDiary(date, summary) {
    const content = String(summary || '').trim();
    if (!content) return;
    this.ensure();
    const filename = path.join(this.diaryDirectory, `${date}.md`);
    if (!fs.existsSync(filename)) fs.writeFileSync(filename, `# ${date} 日记\n`, 'utf8');
    fs.appendFileSync(filename, `\n- ${content.replace(/\s*\n\s*/g, ' ')}\n`, 'utf8');
  }

  appendMemories(memories) {
    if (!Array.isArray(memories) || !memories.length) return;
    this.ensure();
    const known = new Set(lines(fs.readFileSync(this.memoriesPath, 'utf8')).filter((line) => line.startsWith('- ')).map((line) => line.slice(2)));
    const additions = memories
      .map((item) => String(item || '').trim().replace(/\s+/g, ' '))
      .filter((item) => item && !known.has(item))
      .slice(0, 4);
    if (additions.length) fs.appendFileSync(this.memoriesPath, `\n${additions.map((item) => `- ${item}`).join('\n')}\n`, 'utf8');
  }

  hasPending() {
    return this.readPending().length > 0;
  }

  getCompanionBrief() {
    this.ensure();
    const memories = lines(fs.readFileSync(this.memoriesPath, 'utf8'))
      .filter((line) => line.startsWith('- '))
      .slice(-3)
      .map((line) => line.slice(2));
    return memories.join('\n').slice(0, 900);
  }

  exportSnapshot() {
    this.ensure();
    const diary = fs.readdirSync(this.diaryDirectory)
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
      .sort()
      .map((name) => ({
        date: name.slice(0, -3),
        content: fs.readFileSync(path.join(this.diaryDirectory, name), 'utf8'),
      }));
    return {
      memories: fs.readFileSync(this.memoriesPath, 'utf8'),
      diary,
    };
  }

  replaceSnapshot({ memories, diary }) {
    this.ensure();
    const safeMemories = typeof memories === 'string' && memories.trim()
      ? memories.trimEnd().concat('\n')
      : '# 七海的回忆\n';
    const safeDiary = Array.isArray(diary) ? diary : [];
    const normalizedDiary = safeDiary
      .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry?.date) && typeof entry.content === 'string')
      .map((entry) => ({ date: entry.date, content: entry.content.trimEnd().concat('\n') }));
    for (const name of fs.readdirSync(this.diaryDirectory)) {
      if (/^\d{4}-\d{2}-\d{2}\.md$/.test(name)) fs.unlinkSync(path.join(this.diaryDirectory, name));
    }
    fs.writeFileSync(this.memoriesPath, safeMemories, 'utf8');
    for (const entry of normalizedDiary) {
      fs.writeFileSync(path.join(this.diaryDirectory, `${entry.date}.md`), entry.content, 'utf8');
    }
    this.writePending([]);
  }

  search(query, scope = 'all') {
    this.ensure();
    const terms = String(query || '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
    const candidates = [];
    if (scope !== 'diary') {
      for (const line of lines(fs.readFileSync(this.memoriesPath, 'utf8'))) {
        if (line.startsWith('- ')) candidates.push({ source: '长期回忆', value: line.slice(2), weight: 2 });
      }
    }
    if (scope !== 'memories') {
      const files = fs.readdirSync(this.diaryDirectory)
        .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
        .sort()
        .slice(-14)
        .reverse();
      for (const name of files) {
        for (const line of lines(fs.readFileSync(path.join(this.diaryDirectory, name), 'utf8'))) {
          if (line.startsWith('- ')) candidates.push({ source: `日记 ${name.slice(0, -3)}`, value: line.slice(2), weight: 0 });
        }
      }
    }
    const scored = candidates
      .map((candidate, index) => ({
        ...candidate,
        index,
        score: candidate.weight + terms.reduce((total, term) => total + (candidate.value.toLowerCase().includes(term) ? 3 : 0), 0),
      }))
      .sort((left, right) => right.score - left.score || left.index - right.index)
    const matched = scored.filter((candidate) => !terms.length || candidate.score > candidate.weight);
    const selected = (matched.length ? matched : scored).slice(0, MAX_SEARCH_RESULTS);
    const results = [];
    let length = 0;
    for (const candidate of selected) {
      const line = `[${candidate.source}] ${candidate.value}`;
      if (length + line.length > MAX_RESULT_CHARS) break;
      results.push(line);
      length += line.length;
    }
    return { found: results.length > 0, entries: results, query: String(query || '').slice(0, 160) };
  }
}

module.exports = { MemoryStore };
