const inquirer = require('inquirer');
const chalk = require('chalk');
const Table = require('cli-table3');
const { addApi, listApis, getApi, removeApi } = require('../config');
const { testConnection } = require('../api');

module.exports = async function apiManage() {
  console.clear();
  console.log(chalk.bold.blue('\n📊 API 管理\n'));

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: '选择操作:',
      choices: [
        { name: '➕ 添加新API', value: 'add' },
        { name: '📋 查看所有API', value: 'list' },
        { name: '🧪 测试连接', value: 'test' },
        { name: '❌ 删除API', value: 'remove' },
        { name: '🔙 返回主菜单', value: 'back' }
      ]
    }
  ]);

  switch (action) {
    case 'add':
      await addApiInteractive();
      break;
    case 'list':
      await listApisInteractive();
      break;
    case 'test':
      await testApiInteractive();
      break;
    case 'remove':
      await removeApiInteractive();
      break;
    case 'back':
      return;
  }
};

async function addApiInteractive() {
  console.log(chalk.yellow('\n➕ 添加新API\n'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'API名称（用于识别）:',
      validate: input => input.length > 0 || '名称不能为空'
    },
    {
      type: 'list',
      name: 'type',
      message: 'API类型:',
      choices: [
        { name: 'OpenAI 官方', value: 'openai' },
        { name: 'OpenAI 兼容（国内中转、DeepSeek等）', value: 'openai' },
        { name: 'Anthropic Claude 官方', value: 'anthropic' },
        { name: '自定义接口', value: 'custom' }
      ]
    },
    {
      type: 'input',
      name: 'baseUrl',
      message: 'API地址:',
      default: 'https://api.openai.com',
      validate: input => {
        try {
          new URL(input);
          return true;
        } catch {
          return '请输入有效的URL';
        }
      }
    },
    {
      type: 'password',
      name: 'apiKey',
      message: 'API Key:',
      validate: input => input.length > 0 || 'API Key不能为空'
    },
    {
      type: 'input',
      name: 'group',
      message: '分组（可选，用于中转站分类）:',
      default: ''
    },
    {
      type: 'confirm',
      name: 'testNow',
      message: '是否现在测试连接?',
      default: true
    }
  ]);

  // 测试连接
  if (answers.testNow) {
    console.log(chalk.yellow('\n🔄 测试连接中...'));
    const result = await testConnection(answers.baseUrl, answers.apiKey, answers.type);

    if (result.status === 'ok') {
      console.log(chalk.green('✓ 连接成功！'));
      if (result.models && result.models.length > 0) {
        console.log(chalk.dim(`找到 ${result.models.length} 个模型`));
      }
    } else {
      console.log(chalk.red('✗ 连接失败: ' + result.error));
      const { proceed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: '仍然要保存此配置吗?',
          default: false
        }
      ]);

      if (!proceed) {
        console.log(chalk.dim('已取消'));
        return;
      }
    }
  }

  // 保存配置
  try {
    const api = addApi({
      name: answers.name,
      baseUrl: answers.baseUrl,
      apiKey: answers.apiKey,
      type: answers.type,
      group: answers.group || undefined
    });
    console.log(chalk.green(`\n✓ API "${api.name}" 已添加`));
  } catch (error) {
    console.log(chalk.red(`\n✗ 添加失败: ${error.message}`));
  }
}

async function listApisInteractive() {
  console.log(chalk.yellow('\n📋 所有API配置\n'));

  const apis = listApis();

  if (apis.length === 0) {
    console.log(chalk.dim('还没有配置任何API'));
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan('名称'),
      chalk.cyan('类型'),
      chalk.cyan('分组'),
      chalk.cyan('地址'),
      chalk.cyan('添加时间')
    ],
    colWidths: [20, 12, 15, 35, 20]
  });

  apis.forEach(api => {
    const createdAt = new Date(api.createdAt).toLocaleDateString();
    table.push([
      api.name,
      api.type,
      api.group || '-',
      api.baseUrl,
      createdAt
    ]);
  });

  console.log(table.toString());
  console.log(chalk.dim(`\n共 ${apis.length} 个API配置`));
}

async function testApiInteractive() {
  const apis = listApis();

  if (apis.length === 0) {
    console.log(chalk.yellow('\n还没有配置任何API'));
    return;
  }

  const { name } = await inquirer.prompt([
    {
      type: 'list',
      name: 'name',
      message: '选择要测试的API:',
      choices: apis.map(api => ({
        name: `${api.name} (${api.type})`,
        value: api.name
      }))
    }
  ]);

  const api = getApi(name);
  console.log(chalk.yellow(`\n🔄 测试 "${api.name}" 连接中...\n`));

  const { testConnection } = require('../api');
  const result = await testConnection(api.baseUrl, api.apiKey, api.type);

  if (result.status === 'ok') {
    console.log(chalk.green('✓ 连接成功！'));
    if (result.models && result.models.length > 0) {
      console.log(chalk.dim(`找到 ${result.models.length} 个可用模型`));
    }
  } else {
    console.log(chalk.red('✗ 连接失败'));
    console.log(chalk.red(`错误: ${result.error}`));
  }
}

async function removeApiInteractive() {
  const apis = listApis();

  if (apis.length === 0) {
    console.log(chalk.yellow('\n还没有配置任何API'));
    return;
  }

  const { name } = await inquirer.prompt([
    {
      type: 'list',
      name: 'name',
      message: '选择要删除的API:',
      choices: apis.map(api => ({
        name: `${api.name} (${api.type})`,
        value: api.name
      }))
    }
  ]);

  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: `确定要删除 "${name}" 吗?`,
      default: false
    }
  ]);

  if (confirmed) {
    try {
      removeApi(name);
      console.log(chalk.green(`\n✓ API "${name}" 已删除`));
    } catch (error) {
      console.log(chalk.red(`\n✗ 删除失败: ${error.message}`));
    }
  } else {
    console.log(chalk.dim('\n已取消'));
  }
}
