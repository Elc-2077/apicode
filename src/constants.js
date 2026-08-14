// 支持的平台
const PLATFORMS = {
  openai: {
    name: 'OpenAI',
    models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'gpt-4o']
  },
  anthropic: {
    name: 'Anthropic',
    models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'claude-3.5-sonnet']
  },
  google: {
    name: 'Google',
    models: ['gemini-pro', 'gemini-ultra', 'palm-2']
  },
  cohere: {
    name: 'Cohere',
    models: ['command', 'command-light']
  },
  other: {
    name: 'Other',
    models: []
  }
};

// 所有模型列表
const MODELS = [
  // OpenAI
  { platform: 'openai', name: 'gpt-4' },
  { platform: 'openai', name: 'gpt-4-turbo' },
  { platform: 'openai', name: 'gpt-4o' },
  { platform: 'openai', name: 'gpt-3.5-turbo' },
  // Anthropic
  { platform: 'anthropic', name: 'claude-3-opus' },
  { platform: 'anthropic', name: 'claude-3-sonnet' },
  { platform: 'anthropic', name: 'claude-3-haiku' },
  { platform: 'anthropic', name: 'claude-3.5-sonnet' },
  { platform: 'anthropic', name: 'claude-fable-5' },
  { platform: 'anthropic', name: 'claude-opus-5' },
  // Google
  { platform: 'google', name: 'gemini-pro' },
  { platform: 'google', name: 'gemini-ultra' },
  { platform: 'google', name: 'gemini-1.5-pro' },
  // Cohere
  { platform: 'cohere', name: 'command' },
  { platform: 'cohere', name: 'command-light' }
];

module.exports = {
  PLATFORMS,
  MODELS
};
