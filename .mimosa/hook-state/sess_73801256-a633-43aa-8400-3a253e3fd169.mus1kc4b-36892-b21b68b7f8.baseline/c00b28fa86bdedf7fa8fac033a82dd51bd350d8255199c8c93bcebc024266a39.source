/**
 * REPL Scroll UI - 滚动式输出界面（替代固定高度 TUI）
 * 避免中文折行错乱，支持长文本和工具输出
 */

const termkit = require('terminal-kit');
const term = termkit.terminal;
const chalk = require('chalk');
const { getStats } = require('./tracker');

class REPLScrollUI {
  constructor(config) {
    this.config = config;
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
   * 初始化（打印欢迎信息）
   */
  init() {
    term.clear();
    this.printHeader();
  }

  /**
   * 打印顶部标题
   */
  printHeader() {
    const logo = [
      ' █████╗ ██████╗ ██╗ ██████╗ ██████╗ ██████╗ ███████╗',
      '██╔══██╗██╔══██╗██║██╔════╝██╔═══██╗██╔══██╗██╔════╝',
      '███████║██████╔╝██║██║     ██║   ██║██║  ██║█████╗  ',
      '██╔══██║██╔═══╝ ██║██║     ██║   ██║██║  ██║██╔══╝  ',
      '██║  ██║██║     ██║╚██████╗╚██████╔╝██████╔╝███████╗',
      '╚═╝  ╚═╝╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝'
    ].map(line => chalk.cyan(line)).join('\n');

    console.log(logo);
    console.log(chalk.gray(`\n模型: ${chalk.cyan(this.config.model)} | 输入 ${chalk.yellow('/help')} 查看命令\n`));
    console.log(chalk.gray('═'.repeat(60)));
  }

  /**
   * 更新统计
   */
  updateStats(sessionStats) {
    this.sessionStats = { ...sessionStats };
  }

  /**
   * 打印统计栏（带分隔线，仿 Claude Code 风格）
   */
  printStats() {
    const totalStats = getStats({ days: 365 });
    const s = this.sessionStats;
    const t = totalStats;

    const sessionTokens = s.totalTokens.toLocaleString();
    const sessionCost = s.cost.toFixed(4);
    const totalTokens = (t.totalInputTokens + t.totalOutputTokens).toLocaleString();
    const totalCost = t.totalCost.toFixed(4);

    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.bgGray.black(
      ` 📊 会话: ${sessionTokens} tokens ($${sessionCost}) │ ` +
      `总计: ${totalTokens} tokens ($${totalCost}) `
    ));
    console.log(chalk.gray('─'.repeat(60)));
  }

  /**
   * 显示错误
   */
  showError(message) {
    console.log(chalk.red.bold('❌ 错误: ') + chalk.red(message));
  }

  /**
   * 显示信息
   */
  showInfo(message) {
    console.log(chalk.cyan.bold('ℹ️  ') + chalk.cyan(message));
  }

  /**
   * 清理
   */
  cleanup() {
    term.grabInput(false);
    term.styleReset();
  }
}

module.exports = REPLScrollUI;
