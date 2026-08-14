const inquirer = require('inquirer');
const chalk = require('chalk');
const { addRecord } = require('../tracker');
const { listApis } = require('../config');

module.exports = async function manualLog() {
  console.clear();
  console.log(chalk.bold.blue('\n📝 手动记录API调用\n'));

  const apis = listApis();
  const platforms = ['openai', 'anthropic', 'google', 'deepseek', 'other'];

  // 如果有配置的API，可以选择
  let useConfiguredApi = false;
  if (apis.length > 0) {
    const { choice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: '选择记录方式:',
        choices: [
          { name: '使用已配置的API', value: 'configured' },
          { name: '手动输入平台信息', value: 'manual' }
        ]
      }
    ]);
    useConfiguredApi = choice === 'configured';
  }

  let platform, apiName;

  if (useConfiguredApi) {
    const { selected } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selected',
        message: '选择API:',
        choices: apis.map(api => ({
          name: `${api.name} (${api.type})`,
          value: { platform: api.type, name: api.name }
        }))
      }
    ]);
    platform = selected.platform;
    apiName = selected.name;
  } else {
    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'platform',
        message: '选择平台:',
        choices: [
          { name: 'OpenAI', value: 'openai' },
          { name: 'Anthropic', value: 'anthropic' },
          { name: 'Google', value: 'google' },
          { name: 'DeepSeek', value: 'deepseek' },
          { name: '其他', value: 'other' }
        ]
      }
    ]);
    platform = answer.platform;
  }

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'model',
      message: '模型名称:',
      validate: input => input.length > 0 || '模型名称不能为空'
    },
    {
      type: 'number',
      name: 'inputTokens',
      message: '输入Token数:',
      default: 0,
      validate: input => input >= 0 || '必须是非负数'
    },
    {
      type: 'number',
      name: 'outputTokens',
      message: '输出Token数:',
      default: 0,
      validate: input => input >= 0 || '必须是非负数'
    },
    {
      type: 'number',
      name: 'cost',
      message: '成本(美元，可选):',
      default: 0
    },
    {
      type: 'input',
      name: 'note',
      message: '备注(可选):',
      default: ''
    }
  ]);

  try {
    const record = addRecord({
      platform: platform.toLowerCase(),
      model: answers.model.toLowerCase(),
      inputTokens: answers.inputTokens || 0,
      outputTokens: answers.outputTokens || 0,
      cost: answers.cost || 0,
      note: answers.note || '',
      apiName: apiName || undefined
    });

    console.log(chalk.green('\n✓ 记录添加成功'));
    console.log(chalk.dim(`ID: ${record.id}`));
    console.log(chalk.dim(`时间: ${new Date(record.timestamp).toLocaleString()}`));
    console.log(chalk.dim(`平台: ${record.platform}`));
    console.log(chalk.dim(`模型: ${record.model}`));
    console.log(chalk.dim(`Tokens: ${record.inputTokens + record.outputTokens}`));
    if (record.cost > 0) {
      console.log(chalk.dim(`成本: $${record.cost.toFixed(4)}`));
    }
  } catch (error) {
    console.log(chalk.red(`\n✗ 添加失败: ${error.message}`));
  }
};
