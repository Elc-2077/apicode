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

  // 移除 content 和 tool_calls 都为空的助手消息；这类消息会让接口报
  // 400 Invalid assistant message: content or tool_calls must be set。
  // 同时连带丢弃紧跟其后、因此失去对应 tool_call 的 tool 结果消息。
  // 用于自动修复之前已被污染、持续 400 的会话。
  _sanitizeOpenAIMessages() {
    const cleaned = [];
    for (let i = 0; i < this.messages.length; i++) {
      const m = this.messages[i];
      if (m && m.role === 'assistant') {
        const hasText = (typeof m.content === 'string' && m.content.trim() !== '')
          || (Array.isArray(m.content) && m.content.length > 0);
        const hasCalls = Array.isArray(m.tool_calls) && m.tool_calls.length > 0;
        if (!hasText && !hasCalls) {
          // 跳过这条空助手消息，并丢弃紧随其后、已无对应 tool_call 的 tool 消息
          while (i + 1 < this.messages.length && this.messages[i + 1] && this.messages[i + 1].role === 'tool') i++;
          continue;
        }
      }
      cleaned.push(m);
    }
    this.messages = cleaned;
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
      // 发送前清洗历史，剔除可能残留的空助手消息（及其失去归属的 tool 消息），
      // 避免历史一旦被污染就每轮 400。
      this._sanitizeOpenAIMessages();

      const requestOptions = {
        model: this.model,
        messages: this.messages,
        tools,
        tool_choice: 'auto',
        max_tokens: 32000,
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
      let reasoningContent = '';   // 推理模型的思考内容（不作为最终答案，仅展示/兜底）
      let toolCalls = [];
      let currentToolCall = null;
      let usageData = null;
      let finishReason = null;     // 结束原因：length 表示被 max_tokens 截断

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

          // 推理内容：DeepSeek-R1 用 reasoning_content，部分网关（如 OpenRouter）用 reasoning。
          // 单独收集并通过 onReasoning 展示，避免被当成「空响应」而提前结束回合。
          const reasoningDelta = delta?.reasoning_content ?? delta?.reasoning;
          if (reasoningDelta) {
            reasoningContent += reasoningDelta;
            if (hooks.onReasoning) hooks.onReasoning(reasoningDelta);
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

          // 结束原因（最后一个 chunk 带上）
          if (chunk.choices?.[0]?.finish_reason) {
            finishReason = chunk.choices[0].finish_reason;
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

      // 被 max_tokens 截断时提示用户：历史已保留，直接输入「继续」即可接着往下做
      if (finishReason === 'length' && hooks.onNotice) {
        hooks.onNotice('\n⚠️ 输出被 max_tokens 截断（finish_reason=length），本轮内容可能不完整。直接输入「继续」即可接着输出，或调高 max_tokens。');
      }

      // 兜底：推理模型（DeepSeek-R1/o1 等）可能这一步只产出思考内容 reasoning_content，
      // 而正文 content 为空（常见于正文被 max_tokens 截断）。既没有工具调用时，就把思考内容
      // 当作回答返回，避免「假空」提前结束回合，也避免写入 content/tool_calls 皆空的助手消息。
      const finalText = textContent || (toolCalls.length === 0 ? reasoningContent : '');

      // 构建消息对象
      const msg = {
        role: 'assistant',
        content: finalText || null
      };

      if (toolCalls.length > 0) {
        msg.tool_calls = toolCalls;
        // 规范化：有 tool_calls 时 content 必须是 null
        msg.content = null;
      }

      // 只有当助手消息真正有内容或工具调用时才写入历史。
      // 否则会往历史塞一条 content 和 tool_calls 都为空的助手消息，
      // 下一轮就会被接口拒绝：400 content or tool_calls must be set。
      const hasText = typeof msg.content === 'string' && msg.content.trim() !== '';
      const hasCalls = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
      if (hasText || hasCalls) {
        this.messages.push(msg);
      }

      // 如果没有工具调用，返回结果
      if (toolCalls.length === 0) {
        return { content: finalText || '（模型本轮未返回任何内容，可能是空响应或被中断，已跳过写入历史）', usage: this.usage };
      }

      // 执行工具，缓存图像数据
      const toolMessages = [];
      const imageDataCache = new Map(); // 缓存图像数据，避免重复读取

      for (const call of toolCalls) {
        let args = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch (e) { args = {}; }
        if (hooks.onToolStart) hooks.onToolStart({ name: call.function.name, args });
        const result = await executeTool(call.function.name, args, this._ctx(hooks));
        if (hooks.onToolResult) hooks.onToolResult({ name: call.function.name, result });

        // 处理图像结果 - OpenAI 需要特殊格式
        if (call.function.name === 'read_image') {
          try {
            const imageData = JSON.parse(result);
            if (imageData.type === 'image') {
              // 缓存图像数据供后续使用
              imageDataCache.set(call.id, imageData);
              // OpenAI: tool 消息返回文本确认，图像通过 user 消息传递
              toolMessages.push({ role: 'tool', tool_call_id: call.id, content: `已读取图像: ${imageData.path}` });
              continue;
            }
          } catch (e) {
            // 不是 JSON 或解析失败，保持原样
          }
        }

        toolMessages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }

      // 添加所有 tool 消息
      this.messages.push(...toolMessages);

      // 如果有图像数据，通过 user 消息传递图像内容
      if (imageDataCache.size > 0) {
        const userContent = [];

        for (const [callId, imageData] of imageDataCache) {
          userContent.push({
            type: 'image_url',
            image_url: {
              url: `data:${imageData.source.media_type};base64,${imageData.source.data}`
            }
          });
        }

        if (userContent.length > 0) {
          // 添加文本提示和图像
          userContent.unshift({ type: 'text', text: '这是你请求读取的图像：' });
          this.messages.push({ role: 'user', content: userContent });
        }
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
        max_tokens: 32000,
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
      // 只有当返回了内容块时才写入历史，避免空 content 数组污染历史导致后续 400
      if (Array.isArray(resp.content) && resp.content.length > 0) {
        this.messages.push({ role: 'assistant', content: resp.content });
      }
      if (textOut && hooks.onText) hooks.onText(textOut);

      // 安全策略拒绝（Fable 5 / Opus 5 等：HTTP 200 但 stop_reason=refusal），
      // 明确告知用户原因，而不是安静地空结束
      if (resp.stop_reason === 'refusal') {
        const detail = resp.stop_details?.explanation
          || (resp.stop_details?.category ? `类别：${resp.stop_details.category}` : '');
        const suffix = detail ? `：${detail}` : '';
        if (hooks.onNotice) hooks.onNotice(`\n⛔ 模型拒绝了本次请求（stop_reason=refusal）${suffix}`);
        return { content: textOut || `（请求被安全策略拒绝${suffix}）`, usage: this.usage };
      }

      // 被 max_tokens 截断时提示：历史已保留，直接输入「继续」即可接着往下做
      if (resp.stop_reason === 'max_tokens' && hooks.onNotice) {
        hooks.onNotice('\n⚠️ 输出被 max_tokens 截断（stop_reason=max_tokens），本轮内容可能不完整。直接输入「继续」即可接着输出，或调高 max_tokens。');
      }

      if (toolUses.length === 0 || resp.stop_reason !== 'tool_use') {
        return { content: textOut, usage: this.usage };
      }

      const toolResults = [];
      for (const tu of toolUses) {
        if (hooks.onToolStart) hooks.onToolStart({ name: tu.name, args: tu.input });
        const result = await executeTool(tu.name, tu.input || {}, this._ctx(hooks));
        if (hooks.onToolResult) hooks.onToolResult({ name: tu.name, result });

        // 处理图像结果 - Anthropic 原生支持
        let toolContent = result;
        if (tu.name === 'read_image') {
          try {
            const imageData = JSON.parse(result);
            if (imageData.type === 'image') {
              // Anthropic 接受数组格式，包含文本和图像
              toolResults.push({
                type: 'tool_result',
                tool_use_id: tu.id,
                content: [
                  { type: 'text', text: `已读取图像: ${imageData.path}` },
                  { type: 'image', source: imageData.source }
                ]
              });
              continue;
            }
          } catch (e) {
            // 不是 JSON 或解析失败，保持原样
          }
        }

        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: toolContent });
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
