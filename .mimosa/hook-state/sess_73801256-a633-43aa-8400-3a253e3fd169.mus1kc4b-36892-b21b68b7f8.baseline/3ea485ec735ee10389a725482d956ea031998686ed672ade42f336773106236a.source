/**
 * REPL Engine - REPL 核心逻辑
 * 管理对话历史、消息发送、统计追踪
 */

const AIClient = require('./ai-client');
const { addRecord } = require('./tracker');

class REPLEngine {
  constructor(config) {
    this.config = config;
    this.client = new AIClient(config);

    // 对话历史
    this.messages = [];

    // 会话统计
    this.sessionStats = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      cost: 0,
      messageCount: 0
    };

    // 系统提示（可选）
    if (config.systemPrompt) {
      this.messages.push({
        role: 'system',
        content: config.systemPrompt
      });
    }
  }

  /**
   * 发送用户消息并获取回复
   */
  async sendMessage(userMessage, onChunk, onComplete) {
    // 添加用户消息到历史
    this.messages.push({
      role: 'user',
      content: userMessage
    });

    let assistantMessage = '';
    let usage = null;

    try {
      // 调用 AI API
      const result = await this.client.sendMessage(
        this.messages,
        { model: this.config.model },
        (chunk) => {
          assistantMessage += chunk;
          if (onChunk) {
            onChunk(chunk);
          }
        },
        (fullText, usageData) => {
          usage = usageData;
        }
      );

      assistantMessage = result.content;
      usage = result.usage;

      // 添加助手回复到历史
      this.messages.push({
        role: 'assistant',
        content: assistantMessage
      });

      // 更新会话统计
      this.sessionStats.inputTokens += usage.inputTokens;
      this.sessionStats.outputTokens += usage.outputTokens;
      this.sessionStats.totalTokens += usage.totalTokens;
      this.sessionStats.cacheCreationTokens += usage.cacheCreationTokens || 0;
      this.sessionStats.cacheReadTokens += usage.cacheReadTokens || 0;
      this.sessionStats.messageCount++;

      // 计算成本
      const cost = this._calculateCost(usage);
      this.sessionStats.cost += cost;

      // 保存到本地记录
      this._saveRecord(usage, cost);

      if (onComplete) {
        onComplete(assistantMessage, usage, this.sessionStats);
      }

      return {
        content: assistantMessage,
        usage: usage,
        sessionStats: this.sessionStats
      };

    } catch (error) {
      // 发生错误时，移除刚添加的用户消息
      this.messages.pop();
      throw error;
    }
  }

  /**
   * 计算成本
   */
  _calculateCost(usage) {
    const prices = this._getModelPrices();
    if (!prices) return 0;

    const inputCost = (usage.inputTokens / 1000) * prices.input;
    const outputCost = (usage.outputTokens / 1000) * prices.output;

    // 缓存读取通常是折扣价（如果有的话）
    let cacheCost = 0;
    if (usage.cacheReadTokens && prices.cacheRead) {
      cacheCost = (usage.cacheReadTokens / 1000) * prices.cacheRead;
    }

    return inputCost + outputCost + cacheCost;
  }

  /**
   * 获取模型价格（每1K tokens，单位：美元）
   */
  _getModelPrices() {
    const modelLower = this.config.model.toLowerCase();

    // OpenAI 价格
    const openaiPrices = {
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-4-turbo': { input: 0.01, output: 0.03 },
      'gpt-4o': { input: 0.005, output: 0.015 },
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 }
    };

    // Anthropic 价格
    const anthropicPrices = {
      'claude-3-opus': { input: 0.015, output: 0.075 },
      'claude-3-sonnet': { input: 0.003, output: 0.015 },
      'claude-3-haiku': { input: 0.00025, output: 0.00125 },
      'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
      'claude-3.5-sonnet': { input: 0.003, output: 0.015 }
    };

    // DeepSeek 价格
    const deepseekPrices = {
      'deepseek-chat': { input: 0.00014, output: 0.00028 },
      'deepseek-coder': { input: 0.00014, output: 0.00028 }
    };

    const allPrices = { ...openaiPrices, ...anthropicPrices, ...deepseekPrices };

    // 精确匹配
    for (const [key, price] of Object.entries(allPrices)) {
      if (modelLower.includes(key)) {
        return price;
      }
    }

    // 默认价格（如果找不到）
    return { input: 0.001, output: 0.002 };
  }

  /**
   * 保存记录到本地
   */
  _saveRecord(usage, cost) {
    try {
      addRecord({
        platform: this.config.type || 'openai',
        model: this.config.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cost: cost,
        note: 'REPL session',
        apiName: this.config.name
      });
    } catch (error) {
      console.error('Failed to save record:', error.message);
    }
  }

  /**
   * 获取会话统计
   */
  getSessionStats() {
    return { ...this.sessionStats };
  }

  /**
   * 获取对话历史
   */
  getMessages() {
    return [...this.messages];
  }

  /**
   * 清空会话
   */
  clearSession() {
    // 保留系统提示
    const systemMessages = this.messages.filter(m => m.role === 'system');
    this.messages = systemMessages;

    this.sessionStats = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      cost: 0,
      messageCount: 0
    };
  }

  /**
   * 切换模型
   */
  switchModel(newModel) {
    this.config.model = newModel;
    this.client = new AIClient(this.config);
  }

  /**
   * 导出会话
   */
  exportSession() {
    return {
      messages: this.messages,
      stats: this.sessionStats,
      config: {
        model: this.config.model,
        type: this.config.type
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 加载会话
   */
  loadSession(sessionData) {
    this.messages = sessionData.messages || [];
    this.sessionStats = sessionData.stats || {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      cost: 0,
      messageCount: 0
    };
  }
}

module.exports = REPLEngine;
