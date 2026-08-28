/**
 * REPL Agent Engine - 带工具调用能力的 REPL 引擎（滚动式输出）
 * 整合了 agent.js 的工具循环 + 原 repl-engine 的统计追踪
 */

const Agent = require('./agent');
const { addRecord } = require('./tracker');
const chalk = require('chalk');

class REPLAgentEngine {
  constructor(config) {
    this.config = config;
    this.agent = new Agent({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      type: config.type,
      rootDir: process.cwd() // 当前工作目录
    });

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
  }

  /**
   * 发送消息（带工具调用循环）
   */
  async sendMessage(userMessage, hooks = {}) {
    try {
      // 调用 agent 的工具循环
      const result = await this.agent.run(userMessage, {
        onText: hooks.onText,
        onReasoning: hooks.onReasoning,
        onToolStart: hooks.onToolStart,
        onToolResult: hooks.onToolResult,
        confirm: hooks.confirm,
        signal: hooks.signal  // 传递 AbortSignal
      });

      const usage = result.usage;

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

      if (hooks.onComplete) {
        hooks.onComplete(result.content, usage, this.sessionStats);
      }

      return {
        content: result.content,
        usage: usage,
        sessionStats: this.sessionStats
      };

    } catch (error) {
      // 如果是中断错误，不抛出，静默处理
      if (error.name === 'AbortError' || error.code === 'ABORT_ERR') {
        return {
          content: '（请求已中断）',
          usage: this.agent.usage,
          sessionStats: this.sessionStats
        };
      }
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

    const openaiPrices = {
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-4-turbo': { input: 0.01, output: 0.03 },
      'gpt-4o': { input: 0.005, output: 0.015 },
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 }
    };

    const anthropicPrices = {
      'claude-3-opus': { input: 0.015, output: 0.075 },
      'claude-3-sonnet': { input: 0.003, output: 0.015 },
      'claude-3-haiku': { input: 0.00025, output: 0.00125 },
      'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
      'claude-3.5-sonnet': { input: 0.003, output: 0.015 }
    };

    const deepseekPrices = {
      'deepseek-chat': { input: 0.00014, output: 0.00028 },
      'deepseek-coder': { input: 0.00014, output: 0.00028 }
    };

    const allPrices = { ...openaiPrices, ...anthropicPrices, ...deepseekPrices };

    for (const [key, price] of Object.entries(allPrices)) {
      if (modelLower.includes(key)) {
        return price;
      }
    }

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
   * 清空会话
   */
  clearSession() {
    this.agent.clear();
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
    // 切换前留存当前对话历史，切换后继续同一上下文（不清空）
    const prevMessages = this.agent ? this.agent.messages : null;
    this.config.model = newModel;
    this.agent = new Agent({
      baseUrl: this.config.baseUrl,
      apiKey: this.config.apiKey,
      model: newModel,
      type: this.config.type,
      rootDir: process.cwd()
    });
    // 恢复上下文：Anthropic 直接沿用；OpenAI 保留新模型的 system 提示再接上旧对话
    if (prevMessages && prevMessages.length) {
      if (this.agent.type === 'anthropic') {
        this.agent.messages = prevMessages;
      } else {
        const history = prevMessages.filter(m => m.role !== 'system');
        this.agent.messages = [this.agent.messages[0], ...history];
      }
    }
  }
}

module.exports = REPLAgentEngine;
