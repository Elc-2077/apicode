const inquirer = require('inquirer');
const chalk = require('chalk');
const Table = require('cli-table3');
const { listApis, updateApi } = require('../config');

module.exports = async function groupManage() {
  console.clear();
  console.log(chalk.bold.blue('\n🏷️  分组管理\n'));

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: '选择操作:',
      choices: [
        { name: '📋 查看所有分组', value: 'list' },
        { name: '✏️  修改API分组', value: 'edit' },
        { name: '🔄 批量分配分组', value: 'batch' },
        { name: '🗑️  清空分组', value: 'clear' },
        { name: '🔙 返回主菜单', value: 'back' }
      ]
    }
  ]);

  const apis = listApis();

  if (apis.length === 0 && action !== 'back') {
    console.log(chalk.yellow('\n还没有配置任何API'));
    return;
  }

  switch (action) {
    case 'list':
      await listGroups(apis);
      break;
    case 'edit':
      await editApiGroup(apis);
      break;
    case 'batch':
      await batchAssignGroup(apis);
      break;
    case 'clear':
      await clearGroup(apis);
      break;
    case 'back':
      return;
  }
};

async function listGroups(apis) {
  console.log(chalk.yellow('\n📋 分组列表\n'));

  // 按分组整理
  const groups = {};
  const ungrouped = [];

  apis.forEach(api => {
    if (api.group) {
      if (!groups[api.group]) {
        groups[api.group] = [];
      }
      groups[api.group].push(api);
    } else {
      ungrouped.push(api);
    }
  });

  // 显示每个分组
  if (Object.keys(groups).length > 0) {
    for (const [groupName, groupApis] of Object.entries(groups)) {
      console.log(chalk.bold.cyan(`\n📁 ${groupName} (${groupApis.length}个API)`));

      const table = new Table({
        head: [chalk.cyan('API名称'), chalk.cyan('类型'), chalk.cyan('地址')],
        colWidths: [25, 15, 40]
      });

      groupApis.forEach(api => {
        table.push([api.name, api.type, api.baseUrl]);
      });

      console.log(table.toString());
    }
  }

  // 显示未分组的
  if (ungrouped.length > 0) {
    console.log(chalk.bold.yellow(`\n📂 未分组 (${ungrouped.length}个API)`));

    const table = new Table({
      head: [chalk.cyan('API名称'), chalk.cyan('类型'), chalk.cyan('地址')],
      colWidths: [25, 15, 40]
    });

    ungrouped.forEach(api => {
      table.push([api.name, api.type, api.baseUrl]);
    });

    console.log(table.toString());
  }

  // 统计信息
  console.log(chalk.bold(`\n统计信息:`));
  console.log(chalk.cyan(`  分组数: ${Object.keys(groups).length}`));
  console.log(chalk.cyan(`  已分组API: ${apis.length - ungrouped.length}`));
  console.log(chalk.yellow(`  未分组API: ${ungrouped.length}`));
}

async function editApiGroup(apis) {
  const { apiName } = await inquirer.prompt([
    {
      type: 'list',
      name: 'apiName',
      message: '选择要修改分组的API:',
      choices: apis.map(api => ({
        name: `${api.name} ${api.group ? `[${api.group}]` : '[未分组]'}`,
        value: api.name
      }))
    }
  ]);

  const api = apis.find(a => a.name === apiName);

  // 获取现有分组作为建议
  const existingGroups = [...new Set(apis.map(a => a.group).filter(Boolean))];

  const { groupAction } = await inquirer.prompt([
    {
      type: 'list',
      name: 'groupAction',
      message: '选择操作:',
      choices: [
        { name: '输入新分组名称', value: 'new' },
        ...(existingGroups.length > 0 ? [{ name: '选择现有分组', value: 'existing' }] : []),
        { name: '移除分组', value: 'remove' }
      ]
    }
  ]);

  let newGroup = null;

  if (groupAction === 'new') {
    const answer = await inquirer.prompt([
      {
        type: 'input',
        name: 'group',
        message: '输入分组名称:',
        default: api.group || '',
        validate: input => input.length > 0 || '分组名称不能为空'
      }
    ]);
    newGroup = answer.group;
  } else if (groupAction === 'existing') {
    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'group',
        message: '选择分组:',
        choices: existingGroups
      }
    ]);
    newGroup = answer.group;
  } else {
    newGroup = undefined;
  }

  try {
    updateApi(apiName, { group: newGroup });
    if (newGroup) {
      console.log(chalk.green(`\n✓ 已将 "${apiName}" 移动到分组 "${newGroup}"`));
    } else {
      console.log(chalk.green(`\n✓ 已移除 "${apiName}" 的分组`));
    }
  } catch (error) {
    console.log(chalk.red(`\n✗ 更新失败: ${error.message}`));
  }
}

async function batchAssignGroup(apis) {
  console.log(chalk.yellow('\n🔄 批量分配分组\n'));

  const { groupName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'groupName',
      message: '输入分组名称:',
      validate: input => input.length > 0 || '分组名称不能为空'
    }
  ]);

  const { selectedApis } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedApis',
      message: '选择要分配到此分组的API:',
      choices: apis.map(api => ({
        name: `${api.name} ${api.group ? `[${api.group}]` : ''}`,
        value: api.name
      }))
    }
  ]);

  if (selectedApis.length === 0) {
    console.log(chalk.yellow('\n未选择任何API'));
    return;
  }

  try {
    selectedApis.forEach(name => {
      updateApi(name, { group: groupName });
    });
    console.log(chalk.green(`\n✓ 已将 ${selectedApis.length} 个API分配到分组 "${groupName}"`));
  } catch (error) {
    console.log(chalk.red(`\n✗ 更新失败: ${error.message}`));
  }
}

async function clearGroup(apis) {
  // 获取所有分组
  const groups = [...new Set(apis.map(api => api.group).filter(Boolean))];

  if (groups.length === 0) {
    console.log(chalk.yellow('\n还没有配置任何分组'));
    return;
  }

  const { groupName } = await inquirer.prompt([
    {
      type: 'list',
      name: 'groupName',
      message: '选择要清空的分组:',
      choices: groups
    }
  ]);

  const groupApis = apis.filter(api => api.group === groupName);

  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: `确定要清空分组 "${groupName}" 吗？这将移除 ${groupApis.length} 个API的分组标记`,
      default: false
    }
  ]);

  if (confirmed) {
    try {
      groupApis.forEach(api => {
        updateApi(api.name, { group: undefined });
      });
      console.log(chalk.green(`\n✓ 已清空分组 "${groupName}"`));
    } catch (error) {
      console.log(chalk.red(`\n✗ 清空失败: ${error.message}`));
    }
  } else {
    console.log(chalk.dim('\n已取消'));
  }
}
