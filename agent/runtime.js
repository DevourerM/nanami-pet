'use strict';

const presentText = require('./tools/present-text');
const memorySearch = require('./tools/memory-search');

const EMOTIONS = new Set([
  'neutral', 'happy', 'sad', 'angry', 'surprised', 'fearful', 'disgusted',
  'joyful', 'excited', 'amused', 'shy', 'embarrassed', 'affectionate',
  'teasing', 'gentle', 'whisper', 'pleading', 'relieved', 'annoyed',
  'frustrated', 'disappointed', 'lonely', 'curious',
]);

function normalizeEmotion(value) {
  const emotion = String(value || '').trim().toLowerCase();
  return EMOTIONS.has(emotion) ? emotion : 'neutral';
}

class AgentRuntime {
  constructor({ getConfig, getPrompt, searchMemory, getMemoryBrief }) {
    this.getConfig = getConfig;
    this.getPrompt = getPrompt;
    this.searchMemory = searchMemory;
    this.getMemoryBrief = getMemoryBrief;
    this.conversation = [];
    this.skills = [presentText, memorySearch];
  }

  clearContext() {
    this.conversation = [];
  }

  selectSkills(input, source) {
    if (source !== 'user') return [];
    return this.skills.filter((skill) => skill.shouldOffer(input));
  }

  async requestCompletion(messages, tools) {
    const config = this.getConfig();
    if (!config.baseUrl || !config.apiKey || !config.model) throw new Error('请先在设置中填写 API 地址、模型和密钥。');
    const endpoint = config.baseUrl.replace(/\/$/, '').endsWith('/chat/completions')
      ? config.baseUrl.replace(/\/$/, '')
      : `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const payload = { model: config.model, messages, temperature: 0.8 };
    if (tools.length) payload.tools = tools.map((tool) => tool.definition);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(90000),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message || `LLM returned ${response.status}`);
    return body.choices?.[0]?.message || null;
  }

  parseReply(content, enabledSkillNames) {
    const match = String(content || '').match(/\{[\s\S]*\}/);
    const reply = JSON.parse(match ? match[0] : content);
    if (!reply.speech_ja || !reply.display_zh) throw new Error('LLM did not return the required JSON reply.');
    const skillCalls = presentText
      .fromStructuredSkillCalls(reply.skill_calls)
      .filter((call) => enabledSkillNames.has(call.name));
    const legacyContent = typeof reply.present_text_zh === 'string' ? reply.present_text_zh.trim() : '';
    if (legacyContent && enabledSkillNames.has('present_text')) {
      skillCalls.push({ name: 'present_text', arguments: { content: legacyContent } });
    }
    return {
      speech: String(reply.speech_ja),
      display: String(reply.display_zh),
      emotion: normalizeEmotion(reply.emotion),
      skillCalls,
    };
  }

  async respond({ input, source = 'user' }) {
    const activeSkills = this.selectSkills(input, source);
    const enabledSkillNames = new Set(activeSkills.map((skill) => skill.name));
    const memoryBrief = this.getMemoryBrief?.() || '';
    const messages = [
      { role: 'system', content: this.getPrompt({ source, skills: activeSkills, now: new Date(), memoryBrief }) },
      ...this.conversation,
      { role: 'user', content: input },
    ];
    let message;
    try {
      message = await this.requestCompletion(messages, activeSkills);
    } catch (error) {
      if (!activeSkills.length || !/tool|function/i.test(String(error.message))) throw error;
      message = await this.requestCompletion(messages, []);
    }
    if (!message) throw new Error('LLM response did not contain a message.');

    const stagedSkills = [];
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    const toolResults = await Promise.all(toolCalls.map(async (call) => {
      const skill = activeSkills.find((candidate) => candidate.name === call.function?.name);
      const arguments_ = skill ? skill.parseArguments(call.function.arguments) : null;
      if (!arguments_) return { role: 'tool', tool_call_id: call.id, content: JSON.stringify({ accepted: false }) };
      if (skill.name === presentText.name) stagedSkills.push({ name: skill.name, arguments: arguments_ });
      try {
        const result = skill.execute
          ? await skill.execute(arguments_, { searchMemory: this.searchMemory })
          : { accepted: true };
        return { role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) };
      } catch {
        return { role: 'tool', tool_call_id: call.id, content: JSON.stringify({ accepted: false, error: 'Tool unavailable.' }) };
      }
    }));
    if (toolResults.length) {
      message = await this.requestCompletion([...messages, message, ...toolResults], []);
      if (!message) throw new Error('LLM did not return a final reply after tool use.');
    }

    const reply = this.parseReply(message.content, enabledSkillNames);
    reply.skillCalls = [...stagedSkills, ...reply.skillCalls];
    this.conversation.push({ role: 'user', content: input }, { role: 'assistant', content: message.content });
    this.conversation = this.conversation.slice(-24);
    return reply;
  }
}

module.exports = { AgentRuntime };
