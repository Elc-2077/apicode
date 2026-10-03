const inquirer = require('inquirer');
const chalk = require('chalk');
const Table = require('cli-table3');
const { getStats, listRecords } = require('../tracker');
const { listApis } = require('../config');

module.exports = async function usageStats() {
  console.clear();
  console.log(chalk.bold.blue('\n📈 用量统计\n'));

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: '选择查询方式:',
      choices: [
        { name: '📊 总体统计', value: 'overall' },
        { name: '📅 按时间段统计', value: 'period' },
        { name: '🔍 按平台统计', value: 'platform' },
        { name: '🤖 按模型统计', value: 'model' },
        { name: '📋 最近记录', value: 'recent' },
        { name: '🔙 返回主菜单', value: 'back' }
      ]
    }
  ]);

  switch (action) {
    case 'overall':
      await showOverallStats();
      break;
    case 'period':
      await showPeriodStats();
      break;
    case 'platform':
      await showPlatformStats();
      break;
    case 'model':
      await showModelStats();
      break;
    case 'recent':
      await showRecentRecords();
      break;
    case 'back':
      return;
  }
};

async function showOverallStats() {
  console.log(chalk.yellow('\n📊 总体统计\n'));

  const stats = getStats({});

  if (stats.records.length === 0) {
    console.log(chalk.dim('还没有任何记录'));
    return;
  }

  console.log(chalk.cyan('总调用次数:'), chalk.bold(stats.totalCalls));
  console.log(chalk.cyan('输入Token:'), chalk.bold(stats.totalInputTokens.toLocaleString()));
  console.log(chalk.cyan('输出Token:'), chalk.bold(stats.totalOutputTokens.toLocaleString()));
  console.log(chalk.cyan('总Token:'), chalk.bold((stats.totalInputTokens + stats.totalOutputTokens).toLocaleString()));

  if (stats.totalCost > 0) {
    console.log(chalk.cyan('总成本:'), chalk.green.bold(`$${stats.totalCost.toFixed(4)}`));
  }

  // 按平台统计
  if (Object.keys(stats.byPlatform).length > 0) {
    console.log(chalk.bold('\n📱 按平台:'));
    const table = new Table({
      head: [chalk.cyan('平台'), chalk.cyan('调用次数'), chalk.cyan('总Token'), chalk.cyan('成本')],
      colWidths: [20, 15, 20, 15]
    });

    for (const [platform, data] of Object.entries(stats.byPlatform)) {
      table.push([
        platform,
        data.calls,
        data.tokens.toLocaleString(),
        data.cost > 0 ? `$${data.cost.toFixed(4)}` : '-'
      ]);
    }

    console.log(table.toString());
  }

  // 按模型统计
  if (Object.keys(stats.byModel).length > 0) {
    console.log(chalk.bold('\n🤖 按模型 (Top 10):'));
    const table = new Table({
      head: [chalk.cyan('模型'), chalk.cyan('调用次数'), chalk.cyan('总Token'), chalk.cyan('成本')],
      colWidths: [30, 15, 20, 15]
    });

    const sortedModels = Object.entries(stats.byModel)
      .sort((a, b) => b[1].calls - a[1].calls)
      .slice(0, 10);

    sortedModels.forEach(([model, data]) => {
      table.push([
        model,
        data.calls,
        data.tokens.toLocaleString(),
        data.cost > 0 ? `$${data.cost.toFixed(4)}` : '-'
      ]);
    });

    console.log(table.toString());
  }
}

async function showPeriodStats() {
  const { period } = await inquirer.prompt([
    {
      type: 'list',
      name: 'period',
      message: '选择时间段:',
      choices: [
        { name: '今天', value: 1 },
        { name: '最近3天', value: 3 },
        { name: '最近7天', value: 7 },
        { name: '最近30天', value: 30 },
        { name: '自定义日期范围', value: 'custom' }
      ]
    }
  ]);

  let options = {};

  if (period === 'custom') {
    const dates = await inquirer.prompt([
      {
        type: 'input',
        name: 'from',
        message: '开始日期 (YYYY-MM-DD):',
        validate: input => {
          return /^\d{4}-\d{2}-\d{2}$/.test(input) || '请输入正确的日期格式';
        }
      },
      {
        type: 'input',
        name: 'to',
        message: '结束日期 (YYYY-MM-DD):',
        validate: input => {
          return /^\d{4}-\d{2}-\d{2}$/.test(input) || '请输入正确的日期格式';
        }
      }
    ]);
    options = { from: dates.from, to: dates.to };
  } else {
    options = { days: period };
  }

  const stats = getStats(options);

  if (stats.records.length === 0) {
    console.log(chalk.yellow('\n该时间段没有记录'));
    return;
  }

  console.log(chalk.yellow(`\n📅 时间段统计 (${stats.records.length} 条记录)\n`));

  console.log(chalk.cyan('总调用次数:'), chalk.bold(stats.totalCalls));
  console.log(chalk.cyan('输入Token:'), chalk.bold(stats.totalInputTokens.toLocaleString()));
  console.log(chalk.cyan('输出Token:'), chalk.bold(stats.totalOutputTokens.toLocaleString()));
  console.log(chalk.cyan('总Token:'), chalk.bold((stats.totalInputTokens + stats.totalOutputTokens).toLocaleString()));

  if (stats.totalCost > 0) {
    console.log(chalk.cyan('总成本:'), chalk.green.bold(`$${stats.totalCost.toFixed(4)}`));
  }

  // 平台分布
  if (Object.keys(stats.byPlatform).length > 0) {
    console.log(chalk.bold('\n平台分布:'));
    for (const [platform, data] of Object.entries(stats.byPlatform)) {
      const percentage = ((data.calls / stats.totalCalls) * 100).toFixed(1);
      console.log(chalk.yellow(`  ${platform}:`), `${data.calls} 次 (${percentage}%)`);
    }
  }
}

async function showPlatformStats() {
  const stats = getStats({});

  if (stats.records.length === 0) {
    console.log(chalk.yellow('\n还没有任何记录'));
    return;
  }

  const platforms = Object.keys(stats.byPlatform);

  const { platform } = await inquirer.prompt([
    {
      type: 'list',
      name: 'platform',
      message: '选择平台:',
      choices: platforms
    }
  ]);

  const platformStats = getStats({ platform });

  console.log(chalk.yellow(`\n🔍 ${platform} 平台统计\n`));

  console.log(chalk.cyan('调用次数:'), chalk.bold(platformStats.totalCalls));
  console.log(chalk.cyan('输入Token:'), chalk.bold(platformStats.totalInputTokens.toLocaleString()));
  console.log(chalk.cyan('输出Token:'), chalk.bold(platformStats.totalOutputTokens.toLocaleString()));
  console.log(chalk.cyan('总Token:'), chalk.bold((platformStats.totalInputTokens + platformStats.totalOutputTokens).toLocaleString()));

  if (platformStats.totalCost > 0) {
    console.log(chalk.cyan('总成本:'), chalk.green.bold(`$${platformStats.totalCost.toFixed(4)}`));
  }

  // 模型分布
  if (Object.keys(platformStats.byModel).length > 0) {
    console.log(chalk.bold('\n该平台的模型使用情况:'));
    const table = new Table({
      head: [chalk.cyan('模型'), chalk.cyan('调用次数'), chalk.cyan('总Token'), chalk.cyan('成本')],
      colWidths: [30, 15, 20, 15]
    });

    for (const [model, data] of Object.entries(platformStats.byModel)) {
      table.push([
        model,
        data.calls,
        data.tokens.toLocaleString(),
        data.cost > 0 ? `$${data.cost.toFixed(4)}` : '-'
      ]);
    }

    console.log(table.toString());
  }
}

async function showModelStats() {
  const stats = getStats({});

  if (stats.records.length === 0) {
    console.log(chalk.yellow('\n还没有任何记录'));
    return;
  }

  const models = Object.keys(stats.byModel);

  const { model } = await inquirer.prompt([
    {
      type: 'list',
      name: 'model',
      message: '选择模型:',
      choices: models
    }
  ]);

  const modelStats = getStats({ model });

  console.log(chalk.yellow(`\n🤖 ${model} 模型统计\n`));

  console.log(chalk.cyan('调用次数:'), chalk.bold(modelStats.totalCalls));
  console.log(chalk.cyan('输入Token:'), chalk.bold(modelStats.totalInputTokens.toLocaleString()));
  console.log(chalk.cyan('输出Token:'), chalk.bold(modelStats.totalOutputTokens.toLocaleString()));
  console.log(chalk.cyan('总Token:'), chalk.bold((modelStats.totalInputTokens + modelStats.totalOutputTokens).toLocaleString()));
  console.log(chalk.cyan('平均每次输入:'), chalk.bold(Math.round(modelStats.totalInputTokens / modelStats.totalCalls)));
  console.log(chalk.cyan('平均每次输出:'), chalk.bold(Math.round(modelStats.totalOutputTokens / modelStats.totalCalls)));

  if (modelStats.totalCost > 0) {
    console.log(chalk.cyan('总成本:'), chalk.green.bold(`$${modelStats.totalCost.toFixed(4)}`));
    console.log(chalk.cyan('平均每次成本:'), chalk.green.bold(`$${(modelStats.totalCost / modelStats.totalCalls).toFixed(4)}`));
  }
}

async function showRecentRecords() {
  const { limit } = await inquirer.prompt([
    {
      type: 'number',
      name: 'limit',
      message: '显示多少条记录:',
      default: 10,
      validate: input => input > 0 && input <= 100 || '请输入1-100之间的数字'
    }
  ]);

  const records = listRecords({ limit });

  if (records.length === 0) {
    console.log(chalk.yellow('\n还没有任何记录'));
    return;
  }

  console.log(chalk.yellow(`\n📋 最近 ${records.length} 条记录\n`));

  const table = new Table({
    head: [
      chalk.cyan('时间'),
      chalk.cyan('平台'),
      chalk.cyan('模型'),
      chalk.cyan('输入'),
      chalk.cyan('输出'),
      chalk.cyan('成本'),
      chalk.cyan('备注')
    ],
    colWidths: [20, 12, 20, 10, 10, 10, 25]
  });

  records.forEach(record => {
    const time = new Date(record.timestamp).toLocaleString();
    const cost = record.cost ? `$${record.cost.toFixed(4)}` : '-';
    const note = record.note ? record.note.substring(0, 22) : '-';
    table.push([
      time,
      record.platform,
      record.model,
      record.inputTokens.toLocaleString(),
      record.outputTokens.toLocaleString(),
      cost,
      note
    ]);
  });

  console.log(table.toString());
}
