'use strict';

const fs = require('node:fs');
const path = require('node:path');

const promptRoot = path.join(__dirname, '..', 'prompts');
const skillRoot = path.join(__dirname, 'skills');

function read(relativePath) {
  return fs.readFileSync(relativePath, 'utf8').trim();
}

function buildPrompt({ source, skills }) {
  const sections = [
    read(path.join(promptRoot, 'core-persona.md')),
    read(path.join(promptRoot, 'output-contract.md')),
  ];
  if (source === 'event') sections.push(read(path.join(promptRoot, 'live2d-events.md')));
  for (const skill of skills) sections.push(read(path.join(skillRoot, skill.promptDirectory || skill.name, 'SKILL.md')));
  return sections.join('\n\n');
}

module.exports = { buildPrompt };
