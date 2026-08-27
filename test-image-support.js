/**
 * 测试图像读取功能
 * 用法: node test-image-support.js [图像文件路径]
 */

const Agent = require('./apicode-core/src/agent');
const { listApis } = require('./apicode-core/src/config');
const chalk = require('chalk');

async function test() {
  const apis = listApis();
  if (apis.length === 0) {
    console.log(chalk.red('❌ 没有配置 API，请先运行 apicode 添加配置'));
    process.exit(1);
  }

  // 使用第一个配置
  const cfg = apis[0];
  console.log(chalk.cyan(`使用配置: ${cfg.name} - ${cfg.type}`));

  // 获取图像路径参数
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.log(chalk.yellow('请提供图像文件路径作为参数'));
    console.log(chalk.gray('用法: node test-image-support.js <image.png>'));
    process.exit(1);
  }

  // 选择一个支持视觉的模型（根据配置类型）
  let model;
  if (cfg.type === 'anthropic') {
    model = 'claude-3-5-sonnet-20241022'; // Claude 支持视觉
  } else {
    model = 'gpt-4o'; // OpenAI 支持视觉
  }

  console.log(chalk.cyan(`使用模型: ${model}\n`));

  const agent = new Agent({
    type: cfg.type,
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    model,
    rootDir: process.cwd()
  });

  const hooks = {
    onText: (t) => {
      if (t && t.trim()) process.stdout.write(chalk.white(t));
    },
    onToolStart: ({ name, args }) => {
      console.log(chalk.blue(`\n⚙ ${name}`), chalk.gray(JSON.stringify(args).slice(0, 80)));
    },
    onToolResult: ({ name, result }) => {
      const preview = String(result).slice(0, 100);
      console.log(chalk.gray(`  ↳ ${preview}${result.length > 100 ? '...' : ''}`));
    },
    confirm: async () => true // 自动同意所有操作
  };

  try {
    console.log(chalk.green('发送请求: 描述这张图片...\n'));
    const res = await agent.run(`请使用 read_image 工具读取图像 "${imagePath}"，然后详细描述图像中的内容。`, hooks);

    console.log(chalk.cyan(`\n\n✅ 完成`));
    console.log(chalk.gray(`Token 用量: 输入 ${res.usage.inputTokens} / 输出 ${res.usage.outputTokens}`));
  } catch (e) {
    console.log(chalk.red(`\n❌ 错误: ${e.message}`));
    console.error(e);
  }
}

test();
