'use strict';

const fs = require('node:fs');
const path = require('node:path');

const promptRoot = path.join(__dirname, '..', 'prompts');
const skillRoot = path.join(__dirname, 'skills');

function read(relativePath) {
  return fs.readFileSync(relativePath, 'utf8').trim();
}

function formatCurrentTime(now) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(now);
}

function buildPrompt({ source, skills, now = new Date(), memoryBrief = '' }) {
  const sections = [
    read(path.join(promptRoot, 'core-persona.md')),
    read(path.join(promptRoot, 'companion-guidelines.md')),
    `当前本地时间：${formatCurrentTime(now)}。只在时间确实相关时自然使用这项信息。`,
    read(path.join(promptRoot, 'output-contract.md')),
  ];
  if (memoryBrief) {
    sections.push(`以下是少量长期连续性线索，仅在当前话题自然相关时使用；不要逐条复述、不要暗示在监控用户、不要据此编造细节：\n${memoryBrief}`);
  }
  if (source === 'event') sections.push(read(path.join(promptRoot, 'live2d-events.md')));
  for (const skill of skills) sections.push(read(path.join(skillRoot, skill.promptDirectory || skill.name, 'SKILL.md')));
  return sections.join('\n\n');
}

module.exports = { buildPrompt };
