/**
 * Agent - 带工具调用的对话循环（类似 Claude Code 的 agentic loop）
 * 模型输出 tool_calls → 本地执行工具 → 把结果回灌 → 反复，直到模型给出最终回答。
 * 同时支持 OpenAI 兼容接口（function calling）和 Anthropic（tool_use）。
 */

const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { TOOL_SCHEMAS, executeTool } = require('./agent-tools');

function buildSystemPrompt(modelName) {
  return `你是一个专业的编码助手，当前使用的模型是 ${modelName}。你可以读写文件、搜索代码、执行终端命令来完成用户的编程任务。
准则：
- 动手前先用 read_file / list_dir / glob / grep 了解现状，不要凭空猜测文件内容。
- 修改已有文件优先用 edit_file（精确替换）；新建文件用 write_file。
- 每一步只做必要的操作，危险操作会由用户确认，被拒绝时换方案或询问。
- 完成后用简洁中文说明你做了什么。
- 当用户询问你是什么模型时，直接回答：我是 ${modelName}。`;
}

function normalizeBaseUrl(baseUrl, type) {
  let b = (baseUrl || '').trim();
  if (!b) return undefined;
  if (!/^https?:\/\//i.test(b)) b = 'https://' + b;
  b = b.replace(/\/+$/, '');
  if (type === 'anthropic') return b.replace(/\/v1$/i, '') || undefined;
  return /\/v1$/i.test(b) ? b : b + '/v1';
}

function toOpenAITools() {
  return TOOL_SCHEMAS.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
}
function toAnthropicTools() {
  return TOOL_SCHEMAS.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }));
}

class Agent {
  constructor(config) {
    this.config = config;
    this.type = config.type || 'openai';
    this.model = config.model;
    this.rootDir = config.rootDir || process.cwd();
    this.maxSteps = config.maxSteps || 25;

    // 动态生成系统提示（包含模型名）
    this.systemPrompt = buildSystemPrompt(this.model);

    if (this.type === 'anthropic') {
      this.client = new Anthropic({ apiKey: config.apiKey, baseURL: normalizeBaseUrl(config.baseUrl, 'anthropic') });
    } else {
      this.client = new OpenAI({ apiKey: config.apiKey, baseURL: normalizeBaseUrl(config.baseUrl, 'openai') });
    }

    // 对话历史（跨轮保留，形成上下文）
    this.messages = this.type === 'anthropic' ? [] : [{ role: 'system', content: this.systemPrompt }];
    this.usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }

  _ctx(hooks) {
    return { rootDir: this.rootDir, confirm: hooks.confirm };
  }

  /**
   * 跑一轮用户输入直到给出最终回答。
   * hooks: { onText(text), onToolStart({name,args}), onToolResult({name,result}), confirm({name,args,preview}), signal(AbortSignal) }
   */
  async run(userMessage, hooks = {}) {
    if (this.type === 'anthropic') return this._runAnthropic(userMessage, hooks);
    return this._runOpenAI(userMessage, hooks);
  }

  async _runOpenAI(userMessage, hooks) {
    this.messages.push({ role: 'user', content: userMessage });
    const tools = toOpenAITools();

    for (let step = 0; step < this.maxSteps; step++) {
      const requestOptions = {
        model: this.model,
        messages: this.messages,
        tools,
        tool_choice: 'auto',
        max_tokens: 4096,
        stream: true,
        stream_options: { include_usage: true }
      };

      // 如果提供了 AbortSignal，传递给请求
      if (hooks.signal) {
        requestOptions.signal = hooks.signal;
      }

      let stream;
      try {
        stream = await this.client.chat.completions.create(requestOptions);
      } catch (error) {
        if (error.name === 'AbortError' || error.code === 'ABORT_ERR') {
          return { content: '（请求已中断）', usage: this.usage };
        }
        throw error;
      }

      // 处理流式响应
      let textContent = '';
      let toolCalls = [];
      let currentToolCall = null;
      let usageData = null;

      try {
        for await (const chunk of stream) {
          // 检查是否被中断
          if (hooks.signal && hooks.signal.aborted) {
            return { content: '（请求已中断）', usage: this.usage };
          }

          const delta = chunk.choices?.[0]?.delta;

          // 文本内容
          if (delta?.content) {
            textContent += delta.content;
            if (hooks.onText) hooks.onText(delta.content);
          }

          // 工具调用
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.index !== undefined) {
                if (!toolCalls[tc.index]) {
                  toolCalls[tc.index] = {
                    id: tc.id || '',
                    type: 'function',
                    function: { name: '', arguments: '' }
                  };
                }
                if (tc.id) toolCalls[tc.index].id = tc.id;
                if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name;
                if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
              }
            }
          }

          // usage 信息
          if (chunk.usage) {
            usageData = chunk.usage;
          }
        }
      } catch (error) {
        if (error.name === 'AbortError' || error.code === 'ABORT_ERR') {
          return { content: '（请求已中断）', usage: this.usage };
        }
        throw error;
      }

      // 更新 usage
      if (usageData) {
        this.usage.inputTokens += usageData.prompt_tokens || 0;
        this.usage.outputTokens += usageData.completion_tokens || 0;
        this.usage.totalTokens += usageData.total_tokens || 0;
      }

      // 构建消息对象
      const msg = {
        role: 'assistant',
        content: textContent || null
      };

      if (toolCalls.length > 0) {
        msg.tool_calls = toolCalls;
        // 规范化：有 tool_calls 时 content 必须是 null
        msg.content = null;
      }

      // 把助手这一步加入历史
      this.messages.push(msg);

      // 如果没有工具调用，返回结果
      if (toolCalls.length === 0) {
        return { content: textContent || '', usage: this.usage };
      }

      // 执行工具
      for (const call of toolCalls) {
        let args = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch (e) { args = {}; }
        if (hooks.onToolStart) hooks.onToolStart({ name: call.function.name, args });
        const result = await executeTool(call.function.name, args, this._ctx(hooks));
        if (hooks.onToolResult) hooks.onToolResult({ name: call.function.name, result });
        this.messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
    }
    return { content: '（已达到最大步数上限，停止）', usage: this.usage };
  }

  async _runAnthropic(userMessage, hooks) {
    this.messages.push({ role: 'user', content: userMessage });
    const tools = toAnthropicTools();

    for (let step = 0; step < this.maxSteps; step++) {
      const requestOptions = {
        model: this.model,
        max_tokens: 4096,
        system: this.systemPrompt,
        tools,
        messages: this.messages
      };

      // 如果提供了 AbortSignal，传递给请求
      if (hooks.signal) {
        requestOptions.signal = hooks.signal;
      }

      let resp;
      try {
        resp = await this.client.messages.create(requestOptions);
      } catch (error) {
        if (error.name === 'AbortError' || error.code === 'ABORT_ERR') {
          return { content: '（请求已中断）', usage: this.usage };
        }
        throw error;
      }
      if (resp.usage) {
        this.usage.inputTokens += resp.usage.input_tokens || 0;
        this.usage.outputTokens += resp.usage.output_tokens || 0;
        this.usage.totalTokens += (resp.usage.input_tokens || 0) + (resp.usage.output_tokens || 0);
      }

      // 收集文字块和工具请求块
      const toolUses = [];
      let textOut = '';
      for (const block of resp.content) {
        if (block.type === 'text') textOut += block.text;
        else if (block.type === 'tool_use') toolUses.push(block);
      }
      this.messages.push({ role: 'assistant', content: resp.content });
      if (textOut && hooks.onText) hooks.onText(textOut);

      if (toolUses.length === 0 || resp.stop_reason !== 'tool_use') {
        return { content: textOut, usage: this.usage };
      }

      const toolResults = [];
      for (const tu of toolUses) {
        if (hooks.onToolStart) hooks.onToolStart({ name: tu.name, args: tu.input });
        const result = await executeTool(tu.name, tu.input || {}, this._ctx(hooks));
        if (hooks.onToolResult) hooks.onToolResult({ name: tu.name, result });
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result });
      }
      this.messages.push({ role: 'user', content: toolResults });
    }
    return { content: '（已达到最大步数上限，停止）', usage: this.usage };
  }

  clear() {
    this.messages = this.type === 'anthropic' ? [] : [{ role: 'system', content: this.systemPrompt }];
  }
}

module.exports = Agent;
