/**
 * REPL Simple UI - 简洁滚动输出界面
 */

const termkit = require('terminal-kit');
const term = termkit.terminal;
const chalk = require('chalk');
const { getStats } = require('./tracker');
const { styleTag, uiPrefixFor, DEFAULT_STYLE } = require('./styles');

class REPLFixedUI {
  constructor(config) {
    this.config = config;
    // 表达风格：uiPrefix 只加在信息类提示上；报错与危险确认保持原样
    this.styleId = (config && config.style) || DEFAULT_STYLE;
    this.uiPrefix = uiPrefixFor(this.styleId);
    this.sessionStats = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      cost: 0,
      messageCount: 0
    };
    this.inputBuffer = '';
  }

  /**
   * 初始化
   */
  init() {
    term.clear();
    term.grabInput({ mouse: false });
    this.printHeader();
    // 不在这里打印统计，等第一次 updateStats 时再打
    this.drawInputLine();
  }

  /**
   * 打印 header
   */
  printHeader() {
    const logo = [
      ' █████╗ ██████╗ ██╗ ██████╗ ██████╗ ██████╗ ███████╗',
      '██╔══██╗██╔══██╗██║██╔════╝██╔═══██╗██╔══██╗██╔════╝',
      '███████║██████╔╝██║██║     ██║   ██║██║  ██║█████╗  ',
      '██╔══██║██╔═══╝ ██║██║     ██║   ██║██║  ██║██╔══╝  ',
      '██║  ██║██║     ██║╚██████╗╚██████╔╝██████╔╝███████╗',
      '╚═╝  ╚═╝╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝'
    ];
    logo.forEach(line => console.log(chalk.cyan(line)));
    console.log(chalk.gray(`\n模型: ${chalk.cyan(this.config.model)} | 输入 ${chalk.yellow('/help')} 查看命令\n`));
  }

  /**
   * 切换 UI 侧的风格呈现（前缀 + 统计栏标签）；不影响报错与确认文案
   */
  setUiStyle(id) {
    this.styleId = id || DEFAULT_STYLE;
    this.config.style = this.styleId;
    this.uiPrefix = uiPrefixFor(this.styleId);
  }

  /**
   * 打印统计栏
   */
  printStats() {
    const totalStats = getStats({ days: 365 });
    const s = this.sessionStats;
    const t = totalStats;

    const sessionTokens = s.totalTokens.toLocaleString();
    const sessionCost = s.cost.toFixed(4);
    const totalTokens = (t.totalInputTokens + t.totalOutputTokens).toLocaleString();
    const totalCost = t.totalCost.toFixed(4);
    // 默认风格不加后缀，保持这一行与原来一致；非默认才追加，避免窄终端换行
    const styleSuffix = this.styleId !== DEFAULT_STYLE ? `│ ${styleTag(this.styleId)} ` : '';

    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.bgGray.black(
      ` 📊 会话: ${sessionTokens} tokens ($${sessionCost}) │ ` +
      `总计: ${totalTokens} tokens ($${totalCost}) ` + styleSuffix
    ));
    console.log(chalk.gray('─'.repeat(60)));
  }

  /**
   * 绘制输入行提示（清除行后重绘）
   */
  drawInputLine() {
    term.eraseLine();
    term.column(1);
    term.green('> ');
    term(this.inputBuffer);
  }

  /**
   * 更新输入（重绘当前行）
   */
  updateInput(text) {
    this.inputBuffer = text;
    // 清除当前行并重绘
    term.eraseLine();
    term.column(1);
    term.green('> ');
    term(this.inputBuffer);
  }

  /**
   * 打印到内容区
   */
  print(text) {
    // 先清除当前输入行
    term.eraseLine();
    term.column(1);
    // 打印内容
    console.log(text);
    // 重绘输入行
    this.drawInputLine();
  }

  /**
   * 更新统计
   */
  updateStats(sessionStats) {
    this.sessionStats = { ...sessionStats };
    // 清除输入行
    term.eraseLine();
    term.column(1);
    // 打印统计
    this.printStats();
    // 重绘输入行
    this.drawInputLine();
  }

  /**
   * 显示错误
   */
  showError(message) {
    this.print(chalk.red.bold('❌ 错误: ') + chalk.red(message));
  }

  /**
   * 显示信息（信息类提示，可带风格前缀）
   */
  showInfo(message) {
    this.print(chalk.cyan.bold(this.uiPrefix + 'ℹ️  ') + chalk.cyan(message));
  }

  /**
   * 清理
   */
  cleanup() {
    term.grabInput(false);
    term.styleReset();
  }
}

module.exports = REPLFixedUI;
