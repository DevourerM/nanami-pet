'use strict';

const MAX_CONTENT_LENGTH = 24000;
const name = 'present_text';
const promptDirectory = 'present-text';

function shouldOffer(input) {
  return /\u7ffb\u8bd1|\u8bd1\u6210|\u6539\u5199|\u6da6\u8272|\u91cd\u5199|\u603b\u7ed3|\u6458\u8981|\u6982\u62ec|\u63d0\u53d6|\u6574\u7406|\u5f52\u7eb3|\u6e05\u5355|\u5217\u8868|\u8ba1\u5212|\u65b9\u6848|\u6b65\u9aa4|\u4ee3\u7801|\u8868\u683c|\u590d\u5236|\u4fdd\u5b58|\u5c55\u793a|\u8f93\u51fa|\u5199\u4e00|\u5199\u4e2a|draft|translate|rewrite|summari[sz]e|extract|list|plan|code|copy|show/i.test(input);
}

const definition = {
  type: 'function',
  function: {
    name,
    description: 'Present durable, copyable work output in a separate desktop window.',
    parameters: {
      type: 'object',
      properties: { content: { type: 'string', description: 'Complete user-facing result to present.' } },
      required: ['content'],
      additionalProperties: false,
    },
  },
};

function normalizeArguments(value) {
  const content = typeof value?.content === 'string' ? value.content.trim() : '';
  return content ? { content: content.slice(0, MAX_CONTENT_LENGTH) } : null;
}

function parseArguments(rawArguments) {
  try { return normalizeArguments(JSON.parse(rawArguments || '{}')); } catch { return null; }
}

function fromStructuredSkillCalls(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((call) => call?.name === name)
    .map((call) => normalizeArguments(call.arguments || call))
    .filter(Boolean)
    .map((arguments_) => ({ name, arguments: arguments_ }));
}

module.exports = { name, promptDirectory, definition, shouldOffer, parseArguments, fromStructuredSkillCalls };
