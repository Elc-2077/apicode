const inquirer = require('inquirer');
const chalk = require('chalk');
const path = require('path');
const { exportData } = require('../tracker');

module.exports = async function exportDataModule() {
  console.clear();
  console.log(chalk.bold.blue('\n💾 数据导出\n'));

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'format',
      message: '选择导出格式:',
      choices: [
        { name: 'JSON - 适合程序处理', value: 'json' },
        { name: 'CSV - 适合Excel打开', value: 'csv' }
      ]
    },
    {
      type: 'input',
      name: 'filename',
      message: '文件名（不含扩展名）:',
      default: `api-usage-export-${new Date().toISOString().split('T')[0]}`,
      validate: input => input.length > 0 || '文件名不能为空'
    },
    {
      type: 'input',
      name: 'outputDir',
      message: '保存目录（留空使用当前目录）:',
      default: process.cwd()
    }
  ]);

  const outputPath = path.join(
    answers.outputDir,
    `${answers.filename}.${answers.format}`
  );

  try {
    const filePath = exportData(answers.format, outputPath);
    console.log(chalk.green(`\n✓ 数据导出成功`));
    console.log(chalk.cyan('文件路径:'), chalk.bold(filePath));

    const { openFile } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'openFile',
        message: '是否打开文件所在目录?',
        default: false
      }
    ]);

    if (openFile) {
      const { exec } = require('child_process');
      const dir = path.dirname(filePath);

      // Windows
      if (process.platform === 'win32') {
        exec(`explorer "${dir}"`);
      }
      // macOS
      else if (process.platform === 'darwin') {
        exec(`open "${dir}"`);
      }
      // Linux
      else {
        exec(`xdg-open "${dir}"`);
      }

      console.log(chalk.dim('\n正在打开文件夹...'));
    }
  } catch (error) {
    console.log(chalk.red(`\n✗ 导出失败: ${error.message}`));
  }
};
