/**
 * AI Client - 统一的 AI API 调用接口
 * 支持 OpenAI、Anthropic 等多种服务
 */

const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

class AIClient {
  constructor(config) {
    this.config = config;
    this.type = config.type || 'openai';
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.model = config.model;

    // 初始化客户端
    if (this.type === 'anthropic') {
      // Anthropic SDK 会自己在 baseURL 后拼 /v1/messages，所以这里用「根地址」（去掉末尾的 /v1）
      const base = this._normalizeBaseUrl('anthropic');
      this.client = new Anthropic({
        apiKey: this.apiKey,
        baseURL: base || undefined
      });
    } else {
      // OpenAI SDK 会在 baseURL 后拼 /chat/completions，所以 baseURL 必须以 /v1 结尾
      const base = this._normalizeBaseUrl('openai');
      this.client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: base || undefined
      });
    }
  }

  /**
   * 规范化 baseURL：
   *  - openai：确保以 /v1 结尾（SDK 会再拼 /chat/completions）
   *  - anthropic：去掉末尾 /v1（SDK 会自己拼 /v1/messages）
   */
  _normalizeBaseUrl(type) {
    let b = (this.baseUrl || '').trim();
    if (!b) return '';
    if (!/^https?:\/\//i.test(b)) b = 'https://' + b;
    b = b.replace(/\/+$/, '');
    if (type === 'anthropic') {
      return b.replace(/\/v1$/i, '');
    }
    // openai / 兼容
    return /\/v1$/i.test(b) ? b : b + '/v1';
  }

  /**
   * 发送消息（流式）
   * @param {Array} messages - 对话历史
   * @param {Object} options - 选项
   * @param {Function} onChunk - 每个 chunk 的回调
   * @param {Function} onComplete - 完成时的回调
   */
  async sendMessage(messages, options = {}, onChunk, onComplete) {
    try {
      if (this.type === 'anthropic') {
        return await this._sendAnthropicMessage(messages, options, onChunk, onComplete);
      } else {
        return await this._sendOpenAIMessage(messages, options, onChunk, onComplete);
      }
    } catch (error) {
      throw new Error(`AI API Error: ${error.message}`);
    }
  }

  /**
   * OpenAI 格式消息发送
   */
  async _sendOpenAIMessage(messages, options, onChunk, onComplete) {
    const stream = await this.client.chat.completions.create({
      model: options.model || this.model,
      messages: messages,
      stream: true,
      // 关键：要求流里带上用量统计，否则大多数 OpenAI 兼容接口不会返回 usage，会话 token 会一直是 0
      stream_options: { include_usage: true },
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || undefined
    });

    let fullText = '';
    let reasoningText = '';
    let usage = null;

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;

      // 正文（标准字段）— 流式打印
      if (delta?.content) {
        fullText += delta.content;
        if (onChunk) {
          onChunk(delta.content);
        }
      }
      // 推理内容：deepseek-reasoner / 各类「pro/思考」中转模型的思考过程。
      // 只累积到 reasoningText，不调 onChunk（即：不流式打出来），但会存入历史以保持上下文。
      if (delta?.reasoning_content) {
        reasoningText += delta.reasoning_content;
      }

      // usage 通常在最后一个 chunk（此时 choices 往往为空数组）
      if (chunk.usage) {
        const u = chunk.usage;
        const pd = u.prompt_tokens_details || {};
        usage = {
          inputTokens: u.prompt_tokens ?? u.input_tokens ?? 0,
          outputTokens: u.completion_tokens ?? u.output_tokens ?? 0,
          totalTokens: u.total_tokens ?? ((u.prompt_tokens || 0) + (u.completion_tokens || 0)),
          // cached_tokens = 缓存命中（读）；cached_creation_tokens = 缓存写入（创建）
          cacheReadTokens: pd.cached_tokens || 0,
          cacheCreationTokens: pd.cached_creation_tokens || pd.cache_creation_tokens || 0
        };
      }
    }

    // 如果流中没有 usage，通过非流式请求获取（某些 API 不在流中返回）
    if (!usage) {
      usage = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      };
    }

    // 优先返回正文；正文为空时才用推理内容兜底（避免历史里存空消息）
    // 如果两者都有，拼成「<reasoning>\n\n<content>」存入历史以保持完整上下文
    let finalText = fullText;
    if (reasoningText && fullText) {
      finalText = `<reasoning>\n${reasoningText}\n</reasoning>\n\n${fullText}`;
    } else if (!fullText && reasoningText) {
      finalText = reasoningText;
    }

    if (onComplete) {
      onComplete(finalText, usage);
    }

    return {
      content: finalText,
      usage: usage
    };
  }

  /**
   * Anthropic 格式消息发送
   */
  async _sendAnthropicMessage(messages, options, onChunk, onComplete) {
    // 转换消息格式（Anthropic 需要分离 system 消息）
    let systemMessage = '';
    const userMessages = [];

    messages.forEach(msg => {
      if (msg.role === 'system') {
        systemMessage = msg.content;
      } else {
        userMessages.push({
          role: msg.role,
          content: msg.content
        });
      }
    });

    const stream = await this.client.messages.stream({
      model: options.model || this.model,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature || 0.7,
      system: systemMessage || undefined,
      messages: userMessages
    });

    let fullText = '';

    stream.on('text', (text) => {
      fullText += text;
      if (onChunk) {
        onChunk(text);
      }
    });

    const message = await stream.finalMessage();

    const usage = {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      totalTokens: message.usage.input_tokens + message.usage.output_tokens,
      cacheCreationTokens: message.usage.cache_creation_input_tokens || 0,
      cacheReadTokens: message.usage.cache_read_input_tokens || 0
    };

    if (onComplete) {
      onComplete(fullText, usage);
    }

    return {
      content: fullText,
      usage: usage
    };
  }

  /**
   * 获取可用模型列表
   */
  async listModels() {
    try {
      if (this.type === 'anthropic') {
        // Anthropic 没有列出模型的 API，返回预设列表
        return [
          'claude-3-5-sonnet-20241022',
          'claude-3-5-sonnet-20240620',
          'claude-3-opus-20240229',
          'claude-3-sonnet-20240229',
          'claude-3-haiku-20240307'
        ];
      } else {
        const response = await this.client.models.list();
        return response.data.map(m => m.id);
      }
    } catch (error) {
      console.error('Failed to list models:', error.message);
      return [];
    }
  }
}

module.exports = AIClient;
