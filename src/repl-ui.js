/**
 * REPL UI - 对话界面渲染
 * 处理对话显示、输入框、状态栏
 */

const termkit = require('terminal-kit');
const term = termkit.terminal;
const { getStats } = require('./tracker');

class REPLUI {
  constructor(config) {
    this.config = config;
    this.messages = [];
    this.currentInput = '';
    this.statusBar = {
      session: { tokens: 0, cost: 0 },
      total: { tokens: 0, cost: 0 },
      model: config.model,
      inputTokens: 0,
      outputTokens: 0,
      cacheHitRate: 0
    };
    this.isStreaming = false;
    this.streamingText = '';
    this.streamingTokensEst = 0; // 流式生成中的输出 token 估算值
    this.detailedStats = false; // 是否显示详细统计
  }

  /**
   * 粗略估算文本 token 数（中文≈1.5字/token，其他≈4字符/token）
   * 只用于「生成中」实时显示，最终会被接口返回的真实 usage 覆盖
   */
  _estimateTokens(text) {
    if (!text) return 0;
    const cjk = (text.match(/[㐀-鿿豈-﫿぀-ヿ]/g) || []).length;
    const rest = text.length - cjk;
    return Math.ceil(cjk / 1.5 + rest / 4);
  }

  /**
   * 初始化界面
   */
  init() {
    term.clear();
    term.grabInput({ mouse: false });

    // 绘制初始界面
    this.drawHeader();
    this.drawMessages();
    this.drawStatusBar();
    this.drawInputPrompt();
  }

  /**
   * 绘制顶部标题
   */
  drawHeader() {
    term.moveTo(1, 1);

    // 显示 APICODE Logo（和登录界面一致的样式）
    const logoLines = [
      ' █████╗ ██████╗ ██╗ ██████╗ ██████╗ ██████╗ ███████╗',
      '██╔══██╗██╔══██╗██║██╔════╝██╔═══██╗██╔══██╗██╔════╝',
      '███████║██████╔╝██║██║     ██║   ██║██║  ██║█████╗  ',
      '██╔══██║██╔═══╝ ██║██║     ██║   ██║██║  ██║██╔══╝  ',
      '██║  ██║██║     ██║╚██████╗╚██████╔╝██████╔╝███████╗',
      '╚═╝  ╚═╝╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝'
    ];

    logoLines.forEach((line, i) => {
      term.moveTo(1, 1 + i);
      term.cyan(line);
    });

    term.moveTo(1, 8);
    term.gray('模型: ').cyan(this.config.model);
    term.gray(' | 输入 /help 查看命令');
    term('\n');
    term.gray('─'.repeat(term.width));
    term('\n');
  }

  /**
   * 绘制对话历史
   */
  drawMessages() {
    const startY = 10;
    const endY = term.height - 6; // 留出输入框(3行)和状态栏(2行)的空间
    const availableHeight = endY - startY;

    // 计算需要显示的消息（从最新的开始）
    let displayMessages = [];
    let totalLines = 0;

    // 包含正在流式输出的消息
    let messagesToRender = [...this.messages];
    if (this.isStreaming && this.streamingText) {
      messagesToRender.push({
        role: 'assistant',
        content: this.streamingText,
        streaming: true
      });
    }

    // 从后向前计算能显示多少消息
    for (let i = messagesToRender.length - 1; i >= 0; i--) {
      const msg = messagesToRender[i];
      if (msg.role === 'system') continue; // 不显示系统消息

      const lines = this._countMessageLines(msg);
      if (totalLines + lines <= availableHeight) {
        displayMessages.unshift(msg);
        totalLines += lines;
      } else {
        break;
      }
    }

    // 清空消息区域
    for (let y = startY; y < endY; y++) {
      term.moveTo(1, y).eraseLine();
    }

    // 渲染消息
    let currentY = startY;
    displayMessages.forEach(msg => {
      currentY = this._renderMessage(msg, currentY, endY);
    });
  }

  /**
   * 计算消息占用的行数
   */
  _countMessageLines(msg) {
    const prefix = msg.role === 'user' ? 'You: ' : 'AI: ';
    const maxWidth = term.width - 2;
    const lines = this._wrapText(msg.content, maxWidth - prefix.length);
    return lines.length + 1; // +1 for spacing
  }

  /**
   * 渲染单条消息
   */
  _renderMessage(msg, startY, maxY) {
    if (startY >= maxY) return startY;

    const maxWidth = term.width - 2;
    let y = startY;

    // 渲染角色标签
    term.moveTo(1, y);
    if (msg.role === 'user') {
      term.bold.green('You: ');
    } else {
      term.bold.cyan('AI: ');
      if (msg.streaming) {
        term.gray('▋'); // 流式输出指示器
      }
    }

    // 渲染消息内容
    const prefixLen = msg.role === 'user' ? 5 : (msg.streaming ? 5 : 4);
    const lines = this._wrapText(msg.content, maxWidth - prefixLen);

    term.moveTo(prefixLen + 1, y);
    term(lines[0] || '');
    y++;

    for (let i = 1; i < lines.length && y < maxY; i++) {
      term.moveTo(prefixLen + 1, y);
      term(lines[i]);
      y++;
    }

    y++; // 消息间空行
    return y;
  }

  /**
   * 文本换行
   */
  _wrapText(text, maxWidth) {
    if (!text) return [''];

    const lines = [];
    const paragraphs = text.split('\n');

    paragraphs.forEach(para => {
      if (para.length === 0) {
        lines.push('');
        return;
      }

      const words = para.split(' ');
      let currentLine = '';

      words.forEach(word => {
        if (currentLine.length + word.length + 1 <= maxWidth) {
          currentLine += (currentLine ? ' ' : '') + word;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      });

      if (currentLine) lines.push(currentLine);
    });

    return lines.length > 0 ? lines : [''];
  }

  /**
   * 绘制状态栏
   */
  drawStatusBar() {
    const y = term.height - 1;

    term.moveTo(1, y);
    term.eraseLine();

    if (this.detailedStats) {
      // 详细统计模式
      this._drawDetailedStats(y);
    } else {
      // 简洁模式
      this._drawSimpleStats(y);
    }
  }

  /**
   * 绘制简洁统计
   */
  _drawSimpleStats(y) {
    term.moveTo(1, y);
    term.bgGray.black(
      ` 📊 会话: ${this._formatNumber(this.statusBar.session.tokens)} tokens ` +
      `($${this.statusBar.session.cost.toFixed(4)}) │ ` +
      `总计: ${this._formatNumber(this.statusBar.total.tokens)} tokens ` +
      `($${this.statusBar.total.cost.toFixed(4)}) `
    );
    if (this.isStreaming) {
      term.bgGray.yellow(`│ ⏳ 生成中 ~${this._formatNumber(this.streamingTokensEst)} tokens `);
    }
  }

  /**
   * 绘制详细统计
   */
  _drawDetailedStats(y) {
    term.moveTo(1, y);
    term.bgGray.black(
      ` 📊 会话: ${this._formatNumber(this.statusBar.session.tokens)} tokens ` +
      `($${this.statusBar.session.cost.toFixed(4)}) │ ` +
      `输入: ${this._formatNumber(this.statusBar.inputTokens)} │ ` +
      `输出: ${this._formatNumber(this.statusBar.outputTokens)} │ ` +
      `缓存命中: ${this.statusBar.cacheHitRate.toFixed(1)}% `
    );
    if (this.isStreaming) {
      term.bgGray.yellow(`│ ⏳ 生成中 ~${this._formatNumber(this.streamingTokensEst)} tokens `);
    }
  }

  /**
   * 格式化数字（添加千分位）
   */
  _formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /**
   * 绘制输入提示
   */
  drawInputPrompt() {
    const inputY = term.height - 3;
    const separatorY = inputY - 1;

    // 绘制输入框上方分隔线
    term.moveTo(1, separatorY);
    term.eraseLine();
    term.gray('─'.repeat(term.width));

    // 清空输入行和下一行
    term.moveTo(1, inputY);
    term.eraseLine();
    term.moveTo(1, inputY + 1);
    term.eraseLine();

    // 输入框
    term.moveTo(1, inputY);
    term.green('> ');
    term(this.currentInput);

    // 绘制输入框下方分隔线
    term.moveTo(1, inputY + 1);
    term.gray('─'.repeat(term.width));

    // 确保光标在正确位置
    term.moveTo(3 + this.currentInput.length, inputY);
    term.styleReset();
  }

  /**
   * 添加用户消息
   */
  addUserMessage(content) {
    this.messages.push({ role: 'user', content });
    this.currentInput = '';
    this.drawMessages();
    this.drawInputPrompt();
  }

  /**
   * 开始流式输出
   */
  startStreaming() {
    this.isStreaming = true;
    this.streamingText = '';
    this.streamingTokensEst = 0;
    this.drawStatusBar();
  }

  /**
   * 添加流式文本块
   */
  addStreamChunk(chunk) {
    this.streamingText += chunk;
    this.streamingTokensEst = this._estimateTokens(this.streamingText);
    this.drawMessages();
    this.drawStatusBar(); // 实时刷新状态栏里的「生成中」token 估算
  }

  /**
   * 完成流式输出
   */
  finishStreaming(fullText) {
    this.isStreaming = false;
    this.messages.push({ role: 'assistant', content: fullText });
    this.streamingText = '';
    this.streamingTokensEst = 0;
    this.drawMessages();
  }

  /**
   * 更新状态栏
   */
  updateStats(sessionStats, totalStats) {
    this.statusBar.session = {
      tokens: sessionStats.totalTokens,
      cost: sessionStats.cost
    };

    this.statusBar.total = {
      tokens: totalStats.totalInputTokens + totalStats.totalOutputTokens,
      cost: totalStats.totalCost
    };

    this.statusBar.inputTokens = sessionStats.inputTokens;
    this.statusBar.outputTokens = sessionStats.outputTokens;

    // 计算缓存命中率
    const cacheTotal = sessionStats.cacheCreationTokens + sessionStats.cacheReadTokens;
    this.statusBar.cacheHitRate = cacheTotal > 0
      ? (sessionStats.cacheReadTokens / cacheTotal) * 100
      : 0;

    this.drawStatusBar();
  }

  /**
   * 切换统计详细程度
   */
  toggleDetailedStats() {
    this.detailedStats = !this.detailedStats;
    this.drawStatusBar();
  }

  /**
   * 更新输入
   */
  updateInput(input) {
    this.currentInput = input;

    const inputY = term.height - 3;

    // 清空整行
    term.moveTo(1, inputY);
    term.eraseLine();

    // 重新绘制
    term.moveTo(1, inputY);
    term.green('> ');
    term(this.currentInput);

    // 确保光标在正确位置
    term.moveTo(3 + this.currentInput.length, inputY);
  }

  /**
   * 显示错误
   */
  showError(message) {
    const y = term.height - 2;
    term.moveTo(1, y);
    term.eraseLine();
    term.red.bold('❌ 错误: ');
    term.red(message);

    setTimeout(() => {
      term.moveTo(1, y);
      term.eraseLine();
      this.drawInputPrompt();
    }, 3000);
  }

  /**
   * 显示信息
   */
  showInfo(message) {
    const y = term.height - 2;
    term.moveTo(1, y);
    term.eraseLine();
    term.cyan.bold('ℹ️  ');
    term.cyan(message);

    setTimeout(() => {
      term.moveTo(1, y);
      term.eraseLine();
      this.drawInputPrompt();
    }, 2000);
  }

  /**
   * 清理界面
   */
  cleanup() {
    term.grabInput(false);
    term.styleReset();
  }

  /**
   * 刷新整个界面
   */
  refresh() {
    term.clear();
    this.drawHeader();
    this.drawMessages();
    this.drawStatusBar();
    this.drawInputPrompt();
  }
}

module.exports = REPLUI;
