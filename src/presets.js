/**
 * 常用官方/中转 API 的预设地址。
 * 添加配置时可直接选服务商，自动填好「请求地址 + 接口协议」，省得手敲。
 * baseUrl 一律填 API 根地址（带版本号的要带全），程序会自动拼 /models、/chat/completions。
 */

const API_PRESETS = [
  { key: 'deepseek',    name: 'DeepSeek 深度求索', baseUrl: 'https://api.deepseek.com',                                type: 'openai',    note: '国内可直连' },
  { key: 'qwen',        name: '通义千问 Qwen',      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',        type: 'openai',    note: '国内可直连' },
  { key: 'glm',         name: '智谱 GLM',           baseUrl: 'https://open.bigmodel.cn/api/paas/v4',                    type: 'openai',    note: '国内可直连' },
  { key: 'kimi',        name: '月之暗面 Kimi',      baseUrl: 'https://api.moonshot.cn',                                 type: 'openai',    note: '国内可直连' },
  { key: 'siliconflow', name: '硅基流动 SiliconFlow', baseUrl: 'https://api.siliconflow.cn',                           type: 'openai',    note: '国内可直连' },
  { key: 'volces',      name: '火山方舟 豆包',       baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',                type: 'openai',    note: '国内可直连' },
  { key: 'minimax',     name: 'MiniMax',            baseUrl: 'https://api.minimax.chat/v1',                             type: 'openai',    note: '国内可直连' },
  { key: 'openai',      name: 'OpenAI 官方',        baseUrl: 'https://api.openai.com',                                  type: 'openai',    note: '⚠ 国内需代理，直连会超时' },
  { key: 'anthropic',   name: 'Anthropic Claude 官方', baseUrl: 'https://api.anthropic.com',                           type: 'anthropic', note: '⚠ 国内需代理；无 /models 接口' },
  { key: 'gemini',      name: 'Google Gemini（兼容）', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', type: 'openai', note: '⚠ 国内需代理' },
  { key: 'openrouter',  name: 'OpenRouter 聚合',    baseUrl: 'https://openrouter.ai/api/v1',                            type: 'openai',    note: '聚合多家模型' }
];

module.exports = { API_PRESETS };
