/**
 * apicode agent - Claude Code 风格的编码助手模式
 * 滚动式控制台：AI 可读写文件、搜索、跑命令；危险操作逐步 y/n 确认。
 * 用法: apicode agent [目录]
 */

const termkit = require('terminal-kit');
const term = termkit.terminal;
const chalk = require('chalk');
const path = require('path');
const { listApis } = require('../src/config');
const { fetchSiteModels } = require('../src/api');
const Agent = require('../src/agent');

async function ask(promptText) {
  process.stdout.write(promptText);
  term.grabInput(true);
  const input = await term.inputField({ cancelable: true }).promise;
  term.grabInput(false);
  process.stdout.write('\n');
  return (input || '').trim();
}

function printBanner(rootDir, cfgName, model) {
  console.log(chalk.cyan.bold('\n  🤖 APICODE Agent  ') + chalk.gray('（读写文件 / 搜索 / 跑命令，危险操作会先问你）'));
  console.log(chalk.gray('  ─'.repeat(40)));
  console.log('  ' + chalk.gray('工作目录: ') + chalk.white(rootDir));
  console.log('  ' + chalk.gray('接口: ') + chalk.white(cfgName) + chalk.gray('   模型: ') + chalk.white(model));
  console.log('  ' + chalk.gray('命令: /exit 退出  /clear 清空上下文  Ctrl+C 强退'));
  console.log(chalk.gray('  ─'.repeat(40)) + '\n');
}

// 选择 API 配置
async function pickConfig() {
  const apis = listApis();
  if (apis.length === 0) {
    console.log(chalk.yellow('还没有任何 API 配置。请先运行 `apicode` 添加一个配置，再用 agent 模式。'));
    return null;
  }
  if (apis.length === 1) return apis[0];
  console.log(chalk.cyan('选择一个 API 配置：'));
  apis.forEach((a, i) => console.log(`  ${i + 1}. ${a.name} - ${a.baseUrl}`));
  const c = parseInt(await ask(chalk.green(`请选择 (1-${apis.length}): `)));
  return apis[c - 1] || apis[0];
}

// 选择模型
async function pickModel(cfg) {
  console.log(chalk.gray('正在获取该站点可用模型...'));
  const probe = await fetchSiteModels(cfg.baseUrl, cfg.apiKey);
  let models = probe.models;
  if (models.length === 0) {
    console.log(chalk.red('无法获取模型列表: ') + (probe.error || '未知'));
    const m = await ask(chalk.green('手动输入模型名: '));
    return m || null;
  }
  console.log(chalk.cyan(`可用模型（共 ${models.length} 个）：`));
  models.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
  const c = parseInt(await ask(chalk.green(`请选择 (1-${models.length}): `)));
  return models[c - 1] || models[0];
}

// 危险操作确认（y=同意 / n=拒绝 / a=本次会话全部同意）
function makeConfirm(state) {
  return async ({ name, preview }) => {
    if (state.allowAll) return true;
    console.log(chalk.yellow.bold(`\n  ⚠ 需要确认：${name}`));
    preview.split('\n').forEach(line => console.log(chalk.yellow('  │ ') + line));
    const ans = (await ask(chalk.green.bold('  执行吗？(y=同意 / n=拒绝 / a=本次全部同意): '))).toLowerCase();
    if (ans === 'a') { state.allowAll = true; return true; }
    return ans === 'y' || ans === 'yes' || ans === '';
  };
}

async function runAgentMode(argv) {
  // 目录参数
  const dirArg = argv[1] && !argv[1].startsWith('-') ? argv[1] : null;
  const rootDir = path.resolve(dirArg || process.cwd());

  const cfg = await pickConfig();
  if (!cfg) process.exit(1);
  const model = await pickModel(cfg);
  if (!model) process.exit(1);

  const agent = new Agent({ type: cfg.type, baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model, rootDir });
  const state = { allowAll: false };
  const confirm = makeConfirm(state);

  printBanner(rootDir, cfg.name, model);

  const hooks = {
    onText: (t) => { if (t && t.trim()) console.log(chalk.white('\n  ' + t.replace(/\n/g, '\n  '))); },
    onToolStart: ({ name, args }) => {
      const a = JSON.stringify(args);
      console.log(chalk.blue(`  ⚙ ${name} `) + chalk.gray(a.length > 100 ? a.slice(0, 100) + '…' : a));
    },
    onToolResult: ({ name, result }) => {
      const first = String(result).split('\n')[0];
      console.log(chalk.gray(`    ↳ ${first.slice(0, 100)}`));
    },
    confirm
  };

  // 主循环
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const input = await ask(chalk.green.bold('\nYou › '));
    if (!input) continue;
    if (input === '/exit' || input === '/quit') break;
    if (input === '/clear') { agent.clear(); console.log(chalk.gray('  (已清空上下文)')); continue; }

    try {
      const res = await agent.run(input, hooks);
      console.log(chalk.gray(`\n  ── 本轮用量: 输入 ${res.usage.inputTokens} / 输出 ${res.usage.outputTokens} tokens（累计）`));
    } catch (e) {
      console.log(chalk.red(`\n  ❌ 出错: ${e.message}`));
    }
  }

  console.log(chalk.cyan('\n再见！👋\n'));
  process.exit(0);
}

module.exports = { runAgentMode };
