/**
 * 响应解析器
 * 从 API 响应中提取 token 使用量和成本信息
 */

class ResponseParser {
  constructor() {
    // 模型定价表（每百万 token 的价格，单位：美元）
    this.pricing = {
      // OpenAI
      'gpt-4': { input: 30, output: 60 },
      'gpt-4-turbo': { input: 10, output: 30 },
      'gpt-4o': { input: 5, output: 15 },
      'gpt-4o-mini': { input: 0.15, output: 0.6 },
      'gpt-3.5-turbo': { input: 0.5, output: 1.5 },

      // Anthropic
      'claude-3-opus': { input: 15, output: 75 },
      'claude-3-sonnet': { input: 3, output: 15 },
      'claude-3-haiku': { input: 0.25, output: 1.25 },
      'claude-3.5-sonnet': { input: 3, output: 15 },
      'claude-opus-4': { input: 5, output: 25 },
      'claude-opus-5': { input: 5, output: 25 },

      // DeepSeek
      'deepseek': { input: 0.14, output: 0.28 },

      // Google
      'gemini-pro': { input: 0.5, output: 1.5 },
      'gemini-1.5-pro': { input: 3.5, output: 10.5 },
      'gemini-1.5-flash': { input: 0.075, output: 0.3 }
    };
  }

  /**
   * 解析 API 响应
   */
  parse({ requestBody, responseBody, statusCode, duration, endpoint }) {
    if (statusCode !== 200) {
      return null; // 只记录成功的请求
    }

    try {
      const response = JSON.parse(responseBody);

      // 检查是否有 usage 字段
      if (!response.usage) {
        return null;
      }

      // 提取 token 信息
      const usage = this.extractUsage(response.usage);
      const model = response.model || this.guessModel(endpoint);
      const cost = this.calculateCost(usage, model);

      const record = {
        requestId: this.generateId(),
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheCreationTokens: usage.cacheCreationTokens,
        totalCost: cost,
        statusCode,
        duration,
        endpoint,
        timestamp: Date.now()
      };

      return record;

    } catch (err) {
      // 不是 JSON 或解析失败
      return null;
    }
  }

  /**
   * 提取 usage 信息（兼容不同 API 格式）
   */
  extractUsage(usage) {
    return {
      // OpenAI 格式
      inputTokens: usage.prompt_tokens || usage.input_tokens || 0,
      outputTokens: usage.completion_tokens || usage.output_tokens || 0,

      // Anthropic 缓存 tokens
      cacheReadTokens: usage.cache_read_input_tokens ||
                       usage.cache_read_tokens || 0,
      cacheCreationTokens: usage.cache_creation_input_tokens ||
                           usage.cache_creation_tokens || 0
    };
  }

  /**
   * 计算成本
   */
  calculateCost(usage, model) {
    const pricing = this.getPricing(model);

    const inputCost = (usage.inputTokens * pricing.input) / 1000000;
    const outputCost = (usage.outputTokens * pricing.output) / 1000000;

    // 缓存成本（Anthropic）
    // 缓存读取通常便宜 90%，缓存写入贵 25%
    const cacheReadCost = (usage.cacheReadTokens * pricing.input * 0.1) / 1000000;
    const cacheCreationCost = (usage.cacheCreationTokens * pricing.input * 1.25) / 1000000;

    return inputCost + outputCost + cacheReadCost + cacheCreationCost;
  }

  /**
   * 获取模型定价
   */
  getPricing(model) {
    const modelLower = model.toLowerCase();

    for (const [key, value] of Object.entries(this.pricing)) {
      if (modelLower.includes(key)) {
        return value;
      }
    }

    // 未知模型，使用默认价格
    return { input: 1, output: 2 };
  }

  /**
   * 从 endpoint 猜测模型
   */
  guessModel(endpoint) {
    if (endpoint.includes('openai')) {
      return 'gpt-3.5-turbo';
    } else if (endpoint.includes('anthropic')) {
      return 'claude-3-sonnet';
    } else if (endpoint.includes('deepseek')) {
      return 'deepseek-chat';
    }
    return 'unknown';
  }

  /**
   * 生成唯一 ID
   */
  generateId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = ResponseParser;
