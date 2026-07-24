'use strict';

const name = 'search_memory';
const promptDirectory = 'search-memory';

function shouldOffer(input) {
  return /之前|以前|上次|昨天|前天|记得|回忆|日记|我们聊过|你还记得|过去|当时|曾经|previous|remember|memory|diary/i.test(input);
}

const definition = {
  type: 'function',
  function: {
    name,
    description: 'Search Nanami\'s local diary and important memories only when past context is relevant.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Short search phrase about the requested past context.' },
        scope: { type: 'string', enum: ['all', 'diary', 'memories'], description: 'Preferred memory source.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
};

function parseArguments(rawArguments) {
  try {
    const value = JSON.parse(rawArguments || '{}');
    const query = typeof value.query === 'string' ? value.query.trim().slice(0, 160) : '';
    const scope = ['all', 'diary', 'memories'].includes(value.scope) ? value.scope : 'all';
    return query ? { query, scope } : null;
  } catch {
    return null;
  }
}

async function execute(arguments_, context) {
  if (!context.searchMemory) return { found: false, entries: [] };
  return context.searchMemory(arguments_.query, arguments_.scope);
}

module.exports = { name, promptDirectory, definition, shouldOffer, parseArguments, execute };
