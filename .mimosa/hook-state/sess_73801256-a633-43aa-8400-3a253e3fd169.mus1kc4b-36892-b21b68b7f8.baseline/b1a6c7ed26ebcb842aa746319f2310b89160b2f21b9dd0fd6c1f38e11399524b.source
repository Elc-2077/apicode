const inquirer = require('inquirer');
const chalk = require('chalk');
const Table = require('cli-table3');
const { listApis, getApi } = require('../config');
const { queryApi } = require('../api');

module.exports = async function queryStatus() {
  console.clear();
  console.log(chalk.bold.blue('\n🔍 查询API状态\n'));

  const apis = listApis();

  if (apis.length === 0) {
    console.log(chalk.yellow('还没有配置任何API'));
    console.log(chalk.dim('请先在 "API 管理" 中添加API'));
    return;
  }

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: '选择查询方式:',
      choices: [
        { name: '🔍 查询单个API', value: 'single' },
        { name: '📊 批量查询所有API', value: 'batch' },
        { name: '🏷️  按分组查询', value: 'group' },
        { name: '🔙 返回主菜单', value: 'back' }
      ]
    }
  ]);

  switch (action) {
    case 'single':
      await querySingleApi(apis);
      break;
    case 'batch':
      await queryBatchApis(apis);
      break;
    case 'group':
      await queryByGroup(apis);
      break;
    case 'back':
      return;
  }
};

async function querySingleApi(apis) {
  const { name } = await inquirer.prompt([
    {
      type: 'list',
      name: 'name',
      message: '选择要查询的API:',
      choices: apis.map(api => ({
        name: `${api.name} (${api.type}${api.group ? ` - ${api.group}` : ''})`,
        value: api.name
      }))
    }
  ]);

  const api = getApi(name);
  console.log(chalk.yellow(`\n🔄 查询 "${api.name}" 信息中...\n`));

  const result = await queryApi(api);

  if (result.status === 'error') {
    console.log(chalk.red('✗ 查询失败'));
    console.log(chalk.red(`错误: ${result.error}`));
    if (result.details) {
      console.log(chalk.dim(JSON.stringify(result.details, null, 2)));
    }
    return;
  }

  console.log(chalk.green('✓ 查询成功\n'));

  // 显示余额信息
  if (result.balance) {
    console.log(chalk.bold.blue('💰 余额信息:'));
    displayBalance(result.balance);
    console.log();
  }

  // 显示使用量信息
  if (result.usage) {
    console.log(chalk.bold.blue('📊 使用量信息:'));
    displayUsage(result.usage);
    console.log();
  }

  // 显示模型列表
  if (result.models && result.models.length > 0) {
    console.log(chalk.bold.blue(`📋 可用模型 (${result.models.length}):\n`));

    const table = new Table({
      head: [chalk.cyan('模型ID'), chalk.cyan('拥有者'), chalk.cyan('创建时间')],
      colWidths: [45, 20, 15]
    });

    result.models.slice(0, 10).forEach(model => {
      const created = model.created ? new Date(model.created * 1000).toLocaleDateString() : '-';
      table.push([
        model.id,
        model.owned_by || '-',
        created
      ]);
    });

    console.log(table.toString());

    if (result.models.length > 10) {
      console.log(chalk.dim(`\n显示前10个模型，共${result.models.length}个`));
    }
  }

  if (result.message) {
    console.log(chalk.dim(`\n${result.message}`));
  }
}

async function queryBatchApis(apis) {
  console.log(chalk.yellow('\n📊 批量查询所有API\n'));

  const results = [];

  for (const api of apis) {
    console.log(chalk.dim(`查询 ${api.name}...`));
    const result = await queryApi(api);
    results.push({
      api,
      result
    });
  }

  console.log(chalk.green('\n✓ 查询完成\n'));

  // 显示汇总表格
  const table = new Table({
    head: [
      chalk.cyan('API名称'),
      chalk.cyan('分组'),
      chalk.cyan('状态'),
      chalk.cyan('模型数'),
      chalk.cyan('余额/额度')
    ],
    colWidths: [20, 15, 10, 10, 25]
  });

  results.forEach(({ api, result }) => {
    const status = result.status === 'ok' ? chalk.green('正常') : chalk.red('失败');
    const modelCount = result.models ? result.models.length : '-';
    const balance = result.balance ? extractBalanceInfo(result.balance) : '-';

    table.push([
      api.name,
      api.group || '-',
      status,
      modelCount,
      balance
    ]);
  });

  console.log(table.toString());
}

async function queryByGroup(apis) {
  // 获取所有分组
  const groups = [...new Set(apis.map(api => api.group).filter(Boolean))];

  if (groups.length === 0) {
    console.log(chalk.yellow('\n还没有配置任何分组'));
    console.log(chalk.dim('在添加API时可以设置分组'));
    return;
  }

  const { group } = await inquirer.prompt([
    {
      type: 'list',
      name: 'group',
      message: '选择要查询的分组:',
      choices: groups
    }
  ]);

  const groupApis = apis.filter(api => api.group === group);
  console.log(chalk.yellow(`\n📊 查询分组 "${group}" (${groupApis.length}个API)\n`));

  const results = [];

  for (const api of groupApis) {
    console.log(chalk.dim(`查询 ${api.name}...`));
    const result = await queryApi(api);
    results.push({
      api,
      result
    });
  }

  console.log(chalk.green('\n✓ 查询完成\n'));

  // 显示分组统计
  displayGroupStats(group, results);
}

function displayBalance(balance) {
  if (typeof balance === 'object') {
    for (const [key, value] of Object.entries(balance)) {
      console.log(chalk.cyan(`  ${key}:`), value);
    }
  } else {
    console.log(chalk.cyan('  余额:'), balance);
  }
}

function displayUsage(usage) {
  if (typeof usage === 'object') {
    for (const [key, value] of Object.entries(usage)) {
      console.log(chalk.cyan(`  ${key}:`), value);
    }
  } else {
    console.log(chalk.cyan('  使用量:'), usage);
  }
}

function extractBalanceInfo(balance) {
  if (!balance) return '-';

  if (balance.total_granted !== undefined) {
    return `$${balance.total_granted}`;
  }

  if (balance.balance !== undefined) {
    return `$${balance.balance}`;
  }

  return JSON.stringify(balance).substring(0, 20) + '...';
}

function displayGroupStats(group, results) {
  const table = new Table({
    head: [
      chalk.cyan('API名称'),
      chalk.cyan('状态'),
      chalk.cyan('模型数'),
      chalk.cyan('余额/额度')
    ],
    colWidths: [25, 10, 10, 25]
  });

  let successCount = 0;
  let totalModels = 0;

  results.forEach(({ api, result }) => {
    const status = result.status === 'ok' ? (successCount++, chalk.green('正常')) : chalk.red('失败');
    const modelCount = result.models ? (totalModels += result.models.length, result.models.length) : '-';
    const balance = result.balance ? extractBalanceInfo(result.balance) : '-';

    table.push([
      api.name,
      status,
      modelCount,
      balance
    ]);
  });

  console.log(table.toString());

  console.log(chalk.bold(`\n分组统计:`));
  console.log(chalk.cyan(`  总API数: ${results.length}`));
  console.log(chalk.green(`  正常: ${successCount}`));
  console.log(chalk.red(`  失败: ${results.length - successCount}`));
  console.log(chalk.cyan(`  总模型数: ${totalModels}`));
}
