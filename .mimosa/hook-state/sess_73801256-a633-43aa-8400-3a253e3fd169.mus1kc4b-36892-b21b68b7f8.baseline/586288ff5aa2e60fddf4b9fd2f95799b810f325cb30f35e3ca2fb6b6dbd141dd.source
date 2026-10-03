const inquirer = require('inquirer');
const chalk = require('chalk');
const path = require('path');
const os = require('os');
const { resetData } = require('../tracker');
const { loadConfig, saveConfig } = require('../config');

module.exports = async function settings() {
  console.clear();
  console.log(chalk.bold.blue('\n⚙️  设置\n'));

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: '选择操作:',
      choices: [
        { name: '📂 查看数据存储位置', value: 'location' },
        { name: '📊 查看统计信息', value: 'info' },
        { name: '🔄 重置调用记录', value: 'reset-records' },
        { name: '⚠️  重置所有配置', value: 'reset-all' },
        { name: '❓ 关于APISTAT', value: 'about' },
        { name: '🔙 返回主菜单', value: 'back' }
      ]
    }
  ]);

  switch (action) {
    case 'location':
      showDataLocation();
      break;
    case 'info':
      showInfo();
      break;
    case 'reset-records':
      await resetRecords();
      break;
    case 'reset-all':
      await resetAll();
      break;
    case 'about':
      showAbout();
      break;
    case 'back':
      return;
  }
};

function showDataLocation() {
  const dataDir = path.join(os.homedir(), '.api-usage-tracker');

  console.log(chalk.yellow('\n📂 数据存储位置\n'));

  console.log(chalk.cyan('配置目录:'));
  console.log(chalk.bold(`  ${dataDir}`));
  console.log();

  console.log(chalk.cyan('配置文件:'));
  console.log(chalk.bold(`  ${path.join(dataDir, 'config.json')}`));
  console.log(chalk.dim('  存储所有API配置信息'));
  console.log();

  console.log(chalk.cyan('调用记录:'));
  console.log(chalk.bold(`  ${path.join(dataDir, 'records.json')}`));
  console.log(chalk.dim('  存储所有手动记录的API调用'));
  console.log();

  console.log(chalk.dim('提示: 你可以直接复制这些文件进行备份'));
}

function showInfo() {
  const { listApis } = require('../config');
  const { loadRecords } = require('../tracker');

  const apis = listApis();
  const records = loadRecords();

  // 统计分组
  const groups = [...new Set(apis.map(api => api.group).filter(Boolean))];
  const groupedApis = apis.filter(api => api.group);
  const ungroupedApis = apis.filter(api => !api.group);

  // 统计类型
  const types = {};
  apis.forEach(api => {
    types[api.type] = (types[api.type] || 0) + 1;
  });

  console.log(chalk.yellow('\n📊 统计信息\n'));

  console.log(chalk.bold.cyan('API配置:'));
  console.log(chalk.cyan(`  总数: ${apis.length}`));
  console.log(chalk.cyan(`  已分组: ${groupedApis.length}`));
  console.log(chalk.cyan(`  未分组: ${ungroupedApis.length}`));
  console.log(chalk.cyan(`  分组数: ${groups.length}`));
  console.log();

  if (Object.keys(types).length > 0) {
    console.log(chalk.bold.cyan('按类型:'));
    for (const [type, count] of Object.entries(types)) {
      console.log(chalk.cyan(`  ${type}: ${count}`));
    }
    console.log();
  }

  console.log(chalk.bold.cyan('调用记录:'));
  console.log(chalk.cyan(`  总记录数: ${records.length}`));

  if (records.length > 0) {
    const firstRecord = new Date(records[0].timestamp);
    const lastRecord = new Date(records[records.length - 1].timestamp);
    console.log(chalk.cyan(`  最早记录: ${firstRecord.toLocaleString()}`));
    console.log(chalk.cyan(`  最新记录: ${lastRecord.toLocaleString()}`));
  }
}

async function resetRecords() {
  console.log(chalk.yellow('\n⚠️  重置调用记录\n'));
  console.log(chalk.red('警告: 这将删除所有手动记录的API调用数据'));
  console.log(chalk.dim('API配置不会受影响\n'));

  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: '确定要重置所有调用记录吗?',
      default: false
    }
  ]);

  if (!confirmed) {
    console.log(chalk.dim('已取消'));
    return;
  }

  const { doubleConfirm } = await inquirer.prompt([
    {
      type: 'input',
      name: 'doubleConfirm',
      message: '请输入 "RESET" 确认删除:',
      validate: input => input === 'RESET' || '请输入 RESET 确认'
    }
  ]);

  if (doubleConfirm === 'RESET') {
    try {
      resetData();
      console.log(chalk.green('\n✓ 调用记录已重置'));
    } catch (error) {
      console.log(chalk.red(`\n✗ 重置失败: ${error.message}`));
    }
  }
}

async function resetAll() {
  console.log(chalk.yellow('\n⚠️  重置所有配置\n'));
  console.log(chalk.red('警告: 这将删除所有数据，包括:'));
  console.log(chalk.red('  - 所有API配置'));
  console.log(chalk.red('  - 所有分组信息'));
  console.log(chalk.red('  - 所有调用记录'));
  console.log(chalk.dim('\n此操作不可恢复！\n'));

  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: '确定要重置所有数据吗?',
      default: false
    }
  ]);

  if (!confirmed) {
    console.log(chalk.dim('已取消'));
    return;
  }

  const { doubleConfirm } = await inquirer.prompt([
    {
      type: 'input',
      name: 'doubleConfirm',
      message: '请输入 "RESET ALL" 确认删除:',
      validate: input => input === 'RESET ALL' || '请输入 RESET ALL 确认'
    }
  ]);

  if (doubleConfirm === 'RESET ALL') {
    try {
      const fs = require('fs');
      const dataDir = path.join(os.homedir(), '.api-usage-tracker');

      // 删除配置文件
      const configFile = path.join(dataDir, 'config.json');
      if (fs.existsSync(configFile)) {
        fs.unlinkSync(configFile);
      }

      // 删除记录文件
      resetData();

      console.log(chalk.green('\n✓ 所有数据已重置'));
      console.log(chalk.dim('下次启动时将重新开始'));
    } catch (error) {
      console.log(chalk.red(`\n✗ 重置失败: ${error.message}`));
    }
  }
}

function showAbout() {
  console.log(chalk.green(`
  █████╗ ██████╗ ██╗███████╗████████╗ █████╗ ████████╗
 ██╔══██╗██╔══██╗██║██╔════╝╚══██╔══╝██╔══██╗╚══██╔══╝
 ███████║██████╔╝██║███████╗   ██║   ███████║   ██║
 ██╔══██║██╔═══╝ ██║╚════██║   ██║   ██╔══██║   ██║
 ██║  ██║██║     ██║███████║   ██║   ██║  ██║   ██║
 ╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝
  `));

  console.log(chalk.bold.cyan('  API Usage Monitoring & Statistics'));
  console.log(chalk.dim('  Version 2.0.0\n'));

  console.log(chalk.yellow('功能特性:'));
  console.log(chalk.dim('  • 多平台API管理'));
  console.log(chalk.dim('  • 实时余额查询'));
  console.log(chalk.dim('  • 使用量统计分析'));
  console.log(chalk.dim('  • 分组管理'));
  console.log(chalk.dim('  • 数据导出'));
  console.log();

  console.log(chalk.yellow('支持的平台:'));
  console.log(chalk.dim('  • OpenAI 官方及兼容接口'));
  console.log(chalk.dim('  • Anthropic Claude'));
  console.log(chalk.dim('  • 各类国内中转站'));
  console.log(chalk.dim('  • DeepSeek、阿里云等'));
  console.log();

  console.log(chalk.cyan('安装命令:'));
  console.log(chalk.bold('  npm install'));
  console.log(chalk.bold('  npm link'));
  console.log();

  console.log(chalk.cyan('启动命令:'));
  console.log(chalk.bold('  apistat'));
  console.log(chalk.bold('  APISTAT'));
  console.log();

  console.log(chalk.dim('License: MIT'));
}
