/**
 * REPL Agent Engine - 带工具调用能力的 REPL 引擎（滚动式输出）
 * 整合了 agent.js 的工具循环 + 原 repl-engine 的统计追踪
 */

const Agent = require('./agent');
const { addRecord } = require('./tracker');
const { readSkillBody, isSkillRecordSafe } = require('./skills');
const chalk = require('chalk');

class REPLAgentEngine {
  constructor(config) {
    this.config = config;
    this.agent = new Agent({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      type: config.type,
      rootDir: process.cwd(), // 当前工作目录
      skills: Array.isArray(config.skills) ? config.skills : [], // 本机技能表（进 system prompt + 供 load_skill 查表）
      style: config.style || 'code' // 表达风格（只追加提示词末尾的风格段落）
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

    // 技能队列：用户选中但尚未随消息发出的技能
    this.pendingSkills = [];
    // 已随消息进入对话历史的技能名（正文此后每轮都会重发，/clear 才移除）
    this.loadedSkillNames = [];
  }

  /**
   * 选入技能：读取 SKILL.md 正文放进待发送队列，等下一条用户消息一起发出。
   * 先过 isSkillRecordSafe：记录必须确实是「技能根 / <技能目录> / SKILL.md」，
   * 手搓或越界的记录直接拒掉，不去碰文件系统。
   * @returns {{ok:boolean, name?:string, chars?:number, reason?:'no-skill'|'pending'|'already'|'read-fail', error?:string}}
   */
  queueSkill(skill) {
    if (!skill || !skill.name || !isSkillRecordSafe(skill)) return { ok: false, reason: 'no-skill' };
    const name = skill.name;
    if (this.pendingSkills.some(s => s.name === name)) return { ok: false, reason: 'pending', name };
    if (this.loadedSkillNames.includes(name)) return { ok: false, reason: 'already', name };

    let r;
    try {
      r = readSkillBody(skill);
    } catch (e) {
      return { ok: false, reason: 'read-fail', name, error: e.message };
    }
    this.pendingSkills.push({ name, body: r.body, chars: r.body.length });
    return { ok: true, name, chars: r.body.length };
  }

  getPendingSkills() {
    return this.pendingSkills.map(s => ({ name: s.name, chars: s.chars }));
  }

  getLoadedSkills() {
    return this.loadedSkillNames.slice();
  }

  /**
   * 把待发送技能拼到用户消息最前面（一次性：发出后记入已加载）。
   * 队列为空时原样返回，保证老行为零变化。
   */
  _composeMessage(userMessage) {
    if (this.pendingSkills.length === 0) return userMessage;

    const blocks = this.pendingSkills.map(s =>
      `【已加载技能：${s.name}】以下是该技能 SKILL.md 的完整指令，请在本次任务中严格遵循：\n\n${s.body}`
    );
    const names = this.pendingSkills.map(s => s.name);
    this.pendingSkills = [];
    names.forEach(n => { if (!this.loadedSkillNames.includes(n)) this.loadedSkillNames.push(n); });

    return blocks.join('\n\n') + '\n\n【用户消息】\n' + userMessage;
  }

  /**
   * 发送消息（带工具调用循环）
   */
  async sendMessage(userMessage, hooks = {}) {
    try {
      // 调用 agent 的工具循环（待发送的技能正文会拼在消息前面一起发出）
      const result = await this.agent.run(this._composeMessage(userMessage), {
        onText: hooks.onText,
        onReasoning: hooks.onReasoning,
        onNotice: hooks.onNotice,
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
    // 新会话：技能队列与「已进上下文」记录一并作废（正文随历史一起清掉）
    this.pendingSkills = [];
    this.loadedSkillNames = [];
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
      rootDir: process.cwd(),
      skills: Array.isArray(this.config.skills) ? this.config.skills : [],
      style: this.config.style || 'code'
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

  /**
   * 会话中热更新技能表（/skills 重新扫描后调用），透传给 Agent 重建 system prompt。
   */
  setSkills(skills) {
    this.config.skills = Array.isArray(skills) ? skills : [];
    if (this.agent) this.agent.setSkills(this.config.skills);
  }

  getSkills() {
    return Array.isArray(this.config.skills) ? this.config.skills : [];
  }

  /**
   * 切换表达风格（/style）：透传给 Agent 重建 system prompt。
   * 风格是全局偏好，不随 clearSession 清除。
   */
  setStyle(id) {
    this.config.style = id || 'code';
    if (this.agent) this.agent.setStyle(this.config.style);
    return this.config.style;
  }

  getStyle() {
    return this.config.style || 'code';
  }
}

module.exports = REPLAgentEngine;
