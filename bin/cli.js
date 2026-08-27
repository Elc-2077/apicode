#!/usr/bin/env node

/**
 * APICODE REPL - 主入口
 * 支持 REPL 对话模式和监控模式
 */

const termkit = require('terminal-kit');
const term = termkit.terminal;
const chalk = require('chalk');
const axios = require('axios');
const { listApis, addApi, removeApi } = require('../src/config');
const { testConnection, queryApi, listSiteModels, fetchSiteModels } = require('../src/api');
const { API_PRESETS } = require('../src/presets');
const { getStats } = require('../src/tracker');
const REPLAgentEngine = require('../src/repl-agent-engine');
const REPLFixedUI = require('../src/repl-fixed-ui');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 解析命令行参数
const args = process.argv.slice(2);

// 如果是 update 命令，执行自动更新
if (args[0] === 'update') {
  const { execSync } = require('child_process');

  console.log(chalk.cyan('\n🔄 正在检查更新...\n'));

  try {
    // 获取当前版本
    const packageJson = require('../package.json');
    const currentVersion = packageJson.version;
    console.log(chalk.gray(`当前版本: ${currentVersion}`));

    // 获取最新版本
    const latestVersion = execSync('npm view api-code-cli version', { encoding: 'utf-8' }).trim();
    console.log(chalk.gray(`最新版本: ${latestVersion}\n`));

    if (currentVersion === latestVersion) {
      console.log(chalk.green('✓ 已是最新版本！\n'));
      process.exit(0);
    }

    console.log(chalk.yellow(`发现新版本 ${latestVersion}，开始更新...\n`));

    // 执行全局更新
    console.log(chalk.cyan('执行: npm install -g api-code-cli@latest\n'));
    execSync('npm install -g api-code-cli@latest', { stdio: 'inherit' });

    console.log(chalk.green('\n✓ 更新完成！\n'));
    process.exit(0);
  } catch (error) {
    console.error(chalk.red('\n❌ 更新失败:'), error.message);
    console.log(chalk.yellow('\n您可以手动执行: npm install -g api-code-cli@latest\n'));
    process.exit(1);
  }

  return;
}

// 如果是 serve 命令，启动代理服务器
if (args[0] === 'serve') {
  const ProxyServer = require('../src/proxy/server');
  let port = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' || args[i] === '-p') {
      port = parseInt(args[i + 1]) || null;
    }
  }

  const proxy = new ProxyServer({ port });

  (async () => {
    try {
      await proxy.start();
    } catch (error) {
      console.error('❌ 启动代理失败:', error.message);
      process.exit(1);
    }
  })();

  return;
}

// 如果是 monitor 命令，启动原有监控模式
if (args[0] === 'monitor') {
  require('./cli-monitor');
  return;
}

// 默认启动 REPL 模式（已内置工具能力，无需 agent 子命令）
startREPL();

async function startREPL() {
  term.clear();

  // 显示欢迎信息
  displayWelcome();

  // 选择或添加 API 配置
  const apiConfig = await selectOrAddAPI();

  if (!apiConfig) {
    term('\n\n按任意键退出...');
    await term.inputField({ cancelable: false }).promise;
    process.exit(0);
  }

  // 如果是从 addNewAPI 返回的，会包含 selectedModel
  let model = apiConfig.selectedModel;

  // 如果没有选择模型（从已有配置选择的），则获取并选择模型
  if (!model) {
    model = await selectModelForExisting(apiConfig);
  }

  // 初始化配置
  const config = {
    ...apiConfig,
    model: model,
    systemPrompt: 'You are a helpful AI assistant with file system and command execution capabilities.'
  };

  const engine = new REPLAgentEngine(config);
  const ui = new REPLFixedUI(config);

  // 初始化界面
  ui.init();

  // 打印初始统计（只打印统计，不重绘输入行，因为 init 已经画了）
  ui.sessionStats = engine.getSessionStats();
  ui.printStats();
  ui.drawInputLine();

  // 确认函数（危险操作逐条询问）
  const confirmState = { allowAll: false };
  const makeConfirm = (state) => async ({ name, args, preview, dangerous }) => {
    if (state.allowAll) return true;

    // 清除输入行，打印确认信息
    term.eraseLine();
    term.column(1);
    console.log(chalk.yellow(`\n🔧 工具调用: ${chalk.bold(name)}`));
    if (preview) {
      const lines = preview.split('\n').slice(0, 5);
      lines.forEach(line => console.log(chalk.gray('  ' + line)));
      if (preview.split('\n').length > 5) {
        console.log(chalk.gray(`  ... (还有 ${preview.split('\n').length - 5} 行)`));
      }
    }

    return new Promise((resolve) => {
      term.yellow('确认? (y=同意 / n=拒绝 / a=本次全部同意): ');
      term.inputField({ cancelable: false }, (err, input) => {
        console.log(''); // 换行
        const choice = (input || '').trim().toLowerCase();
        if (choice === 'a') {
          state.allowAll = true;
          resolve(true);
        } else {
          resolve(choice === 'y');
        }
        // 重绘输入行
        ui.drawInputLine();
      });
    });
  };

  // 键盘事件处理
  let inputBuffer = '';
  let isProcessing = false;
  let abortController = null; // 用于中断请求

  term.on('key', async (name, matches, data) => {
    if (isProcessing && name === 'ESCAPE') {
      // ESC 键中断当前请求
      if (abortController) {
        abortController.abort();
        abortController = null;
        isProcessing = false;
        confirmState.allowAll = false;

        // 清除输入行
        term.eraseLine();
        term.column(1);
        console.log(chalk.red('\n⚠️  已中断请求'));

        // 重绘输入行
        ui.drawInputLine();
      }
      return;
    }

    if (isProcessing) return; // 处理中禁止其他输入

    // Ctrl+C 退出
    if (name === 'CTRL_C') {
      ui.cleanup();
      term.clear();
      term.cyan('\n再见！👋\n\n');
      process.exit(0);
    }

    // 退格键
    if (name === 'BACKSPACE') {
      if (inputBuffer.length > 0) {
        inputBuffer = inputBuffer.slice(0, -1);
        ui.updateInput(inputBuffer);
      }
      return;
    }

    // 回车键 - 发送消息
    if (name === 'ENTER') {
      if (inputBuffer.trim().length === 0) return;

      const userMessage = inputBuffer.trim();
      inputBuffer = '';
      ui.inputBuffer = ''; // 同步清空 UI 的 inputBuffer

      // 清除当前输入行并打印用户消息
      term.eraseLine();
      term.column(1);
      console.log(chalk.green('You: ') + userMessage);

      // 检查是否是命令
      if (userMessage.startsWith('/')) {
        await handleFixedCommand(userMessage, engine, ui, config);
        ui.drawInputLine();
        return;
      }

      isProcessing = true;
      abortController = new AbortController();

      try {
        // 发送消息（带工具调用循环）
        const result = await engine.sendMessage(userMessage, {
          signal: abortController.signal,
          onText: (text) => {
            // 流式输出文本，不换行
            process.stdout.write(chalk.cyan(text));
          },
          onToolStart: ({ name, args }) => {
            ui.print(chalk.yellow(`\n🔧 调用工具: ${chalk.bold(name)}`));
          },
          onToolResult: ({ name, result }) => {
            // 对于图片读取，只显示简短确认信息
            if (name === 'read_image') {
              try {
                const imageData = JSON.parse(result);
                if (imageData.type === 'image') {
                  ui.print(chalk.gray(`  已读取图像: ${imageData.path}`));
                  return;
                }
              } catch (e) {
                // 非图像数据，继续正常显示
              }
            }

            // 其他工具显示前3行结果
            const lines = result.split('\n').slice(0, 3);
            ui.print(chalk.gray('  结果: ' + lines.join('\n        ')));
            if (result.split('\n').length > 3) {
              ui.print(chalk.gray('  ...'));
            }
          },
          confirm: makeConfirm(confirmState),
          onComplete: (content, usage, sessionStats) => {
            // 只有在未中断的情况下才更新统计
            if (!abortController || !abortController.signal.aborted) {
              // AI 回复完成后换行，再打印统计
              console.log('\n');
              ui.updateStats(sessionStats);
            }
          }
        });

        // 如果被中断，不再执行后续操作
        if (abortController && abortController.signal.aborted) {
          return;
        }

      } catch (error) {
        if (error.name !== 'AbortError' && error.code !== 'ABORT_ERR') {
          ui.showError(error.message);
        }
      }

      // 重置状态（不需要再调用 drawInputLine，updateStats 已经调了）
      confirmState.allowAll = false;
      isProcessing = false;
      abortController = null;
      return;
    }

    // 普通字符输入
    if (data.isCharacter && !data.isControl) {
      inputBuffer += String.fromCharCode(data.codepoint);
      ui.updateInput(inputBuffer);
    }
  });
}

/**
 * 为已有配置选择模型
 */
async function selectModelForExisting(apiConfig) {
  term.clear();
  term.cyan('正在获取可用模型列表...\n\n');

  // 和 AURE 一样：GET /models 拉一次，返回的这份列表就是「该站点可用模型」
  const probe = await fetchSiteModels(apiConfig.baseUrl, apiConfig.apiKey);
  const models = probe.models;

  if (models.length === 0) {
    term.red('❌ 无法从站点获取模型列表\n\n');
    term.yellow(`原因: ${probe.error || '未知'}\n\n`);
    term.yellow('按任意键返回...');
    await term.inputField({ cancelable: false }).promise;
    return await selectOrAddAPI();
  }

  term.green('✓ 已获取站点可用模型\n\n');

  term.clear();
  term.cyan(`选择模型（${apiConfig.name} - 共 ${models.length} 个）：\n\n`);

  models.forEach((model, index) => {
    term(`  ${index + 1}. ${model}\n`);
  });

  term('\n');
  term.green('请选择 (1-' + models.length + '): ');

  const response = await term.inputField({ cancelable: false }).promise;
  const choice = parseInt(response);

  term('\n\n');

  if (choice >= 1 && choice <= models.length) {
    return models[choice - 1];
  }

  return models[0];
}

/**
 * 显示欢迎信息
 */
function displayWelcome() {
  term.cyan.bold('\n  █████╗ ██████╗ ██╗ ██████╗ ██████╗ ██████╗ ███████╗\n');
  term.cyan.bold(' ██╔══██╗██╔══██╗██║██╔════╝██╔═══██╗██╔══██╗██╔════╝\n');
  term.cyan.bold(' ███████║██████╔╝██║██║     ██║   ██║██║  ██║█████╗  \n');
  term.cyan.bold(' ██╔══██║██╔═══╝ ██║██║     ██║   ██║██║  ██║██╔══╝  \n');
  term.cyan.bold(' ██║  ██║██║     ██║╚██████╗╚██████╔╝██████╔╝███████╗\n');
  term.cyan.bold(' ╚═╝  ╚═╝╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝\n');
  term.white('\n  AI 对话 CLI 工具 - 实时显示 Token 使用统计\n\n');
}

/**
 * 选择或添加 API 配置
 */
async function selectOrAddAPI() {
  const apis = listApis();

  if (apis.length === 0) {
    term.yellow('未找到已保存的 API 配置，请添加一个：\n\n');
    return await addNewAPI();
  }

  term.cyan('选择一个 API 配置：\n\n');

  apis.forEach((api, index) => {
    term(`  ${index + 1}. ${api.name} - ${api.baseUrl}\n`);
  });

  term(`  ${apis.length + 1}. 添加新配置\n`);
  term(`  ${apis.length + 2}. 删除配置\n`);
  term(`  0. 退出\n\n`);

  term.green('请选择 (0-' + (apis.length + 2) + '): ');

  const response = await term.inputField({ cancelable: true }).promise;
  const choice = parseInt(response);

  term('\n\n');

  if (isNaN(choice) || choice === 0) {
    return null;
  }

  if (choice === apis.length + 1) {
    return await addNewAPI();
  }

  if (choice === apis.length + 2) {
    return await deleteAPI();
  }

  if (choice >= 1 && choice <= apis.length) {
    return apis[choice - 1];
  }

  return null;
}

/**
 * 删除 API 配置
 */
async function deleteAPI() {
  const apis = listApis();

  if (apis.length === 0) {
    term.red('没有可删除的配置\n');
    await new Promise(resolve => setTimeout(resolve, 1500));
    return await selectOrAddAPI();
  }

  term.clear();
  term.red.bold('删除 API 配置\n\n');

  apis.forEach((api, index) => {
    term(`  ${index + 1}. ${api.name} - ${api.baseUrl}\n`);
  });

  term(`  0. 返回\n\n`);

  term.yellow('请选择要删除的配置 (0-' + apis.length + '): ');

  const response = await term.inputField({ cancelable: true }).promise;
  const choice = parseInt(response);

  term('\n\n');

  if (isNaN(choice) || choice === 0) {
    return await selectOrAddAPI();
  }

  if (choice >= 1 && choice <= apis.length) {
    const api = apis[choice - 1];
    term.red(`确认删除 "${api.name}"? (y/N): `);
    const confirm = await term.inputField({ cancelable: false }).promise;

    if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
      removeApi(api.name);
      term.green(`\n✓ 已删除 "${api.name}"\n`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return await selectOrAddAPI();
}

/**
 * 选择服务商预设（自动填地址+协议），或选自定义手动填。
 * @returns {Promise<object|null>} 选中的预设，或 null（自定义）
 */
async function pickPreset() {
  term.clear();
  term.cyan.bold('\n  选择服务商 ');
  term.gray('（自动填好请求地址，省得手敲；也可选「自定义」自己填）\n\n');

  API_PRESETS.forEach((p, i) => {
    const num = String(i + 1).padStart(2);
    term(`  ${num}. `);
    term.white(p.name);
    term.gray(`  ${p.baseUrl}`);
    if (p.note) term.yellow(`  ${p.note}`);
    term('\n');
  });

  term('\n');
  term.green('   0. ');
  term.white('自定义（手动填写请求地址）\n\n');

  term.green(`请选择 (0-${API_PRESETS.length}，直接回车=自定义): `);
  const response = await term.inputField({ cancelable: false }).promise;
  term('\n');

  const choice = parseInt(response);
  if (!isNaN(choice) && choice >= 1 && choice <= API_PRESETS.length) {
    return API_PRESETS[choice - 1];
  }
  return null;
}

/**
 * 添加新的 API 配置
 */
async function addNewAPI() {
  while (true) {
    // 先选服务商（自动填地址+协议），或选自定义手动填
    const preset = await pickPreset();

    term.clear();

    // 居中显示 Logo
    const logoLines = [
      '  █████╗ ██████╗ ██╗ ██████╗ ██████╗ ██████╗ ███████╗',
      ' ██╔══██╗██╔══██╗██║██╔════╝██╔═══██╗██╔══██╗██╔════╝',
      ' ███████║██████╔╝██║██║     ██║   ██║██║  ██║█████╗  ',
      ' ██╔══██║██╔═══╝ ██║██║     ██║   ██║██║  ██║██╔══╝  ',
      ' ██║  ██║██║     ██║╚██████╗╚██████╔╝██████╔╝███████╗',
      ' ╚═╝  ╚═╝╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝'
    ];

    const logoWidth = 58;
    const startX = Math.floor((term.width - logoWidth) / 2);
    let y = 3;

    logoLines.forEach(line => {
      term.moveTo(startX, y++);
      term.cyan.bold(line);
    });

    y += 2;
    const centerText = 'AI 对话 CLI 工具 - 配置 API';
    term.moveTo(Math.floor((term.width - centerText.length) / 2), y);
    term.white(centerText);

    y += 3;

    // 绘制圆角框
    const boxWidth = 60;
    const boxStartX = Math.floor((term.width - boxWidth) / 2);

    // 站点名称输入框
    term.moveTo(boxStartX, y);
    term.gray('站点名称');
    drawRoundedBox(boxStartX, y + 1, boxWidth, 3);
    term.moveTo(boxStartX + 2, y + 2);
    const name = await term.inputField({
      cancelable: false,
      maxLength: boxWidth - 4
    }).promise;

    y += 5;

    // 请求地址输入框（选了预设就自动填好，可直接回车或再修改）
    term.moveTo(boxStartX, y);
    term.gray('请求地址');
    if (preset) {
      term.gray('  ← ');
      term.green(preset.name);
      term.gray(preset.note ? `  ${preset.note}` : '');
    }
    drawRoundedBox(boxStartX, y + 1, boxWidth, 3);
    term.moveTo(boxStartX + 2, y + 2);
    const baseUrl = await term.inputField({
      cancelable: false,
      maxLength: boxWidth - 4,
      default: preset ? preset.baseUrl : ''
    }).promise;

    y += 5;

    // API Key 输入框
    term.moveTo(boxStartX, y);
    term.gray('API Key');
    drawRoundedBox(boxStartX, y + 1, boxWidth, 3);
    term.moveTo(boxStartX + 2, y + 2);
    const apiKey = await term.inputField({
      echoChar: '*',
      cancelable: false,
      maxLength: boxWidth - 4
    }).promise;

    y += 4;

    // 检测：和 AURE 一样，GET /models 拉一次。拉到列表 = Key 有效 + 这就是可用模型（OpenAI 兼容）
    term.moveTo(boxStartX, y);
    term.cyan('正在检测该站点可用模型...');

    let type = 'openai';
    let models = [];
    const ANTHROPIC_PRESET_MODELS = [
      'claude-opus-4-1',
      'claude-sonnet-4-5',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229'
    ];
    let probe = { models: [], error: null };

    if (preset && preset.type === 'anthropic') {
      // 官方 Anthropic 没有 /models 接口，直接验活 + 预设模型，不白跑一趟 /models
      const anthropicTest = await testConnection(baseUrl, apiKey, 'anthropic');
      if (anthropicTest.status === 'ok') {
        type = 'anthropic';
        models = ANTHROPIC_PRESET_MODELS;
      } else {
        probe.error = anthropicTest.error || 'Anthropic 接口验活失败';
      }
    } else {
      probe = await fetchSiteModels(baseUrl, apiKey);
      if (probe.models.length > 0) {
        type = 'openai';
        models = probe.models;
      } else {
        // /models 拿不到：可能是官方 Anthropic（没有 /models 接口），用一次最小 messages 请求验活
        const anthropicTest = await testConnection(baseUrl, apiKey, 'anthropic');
        if (anthropicTest.status === 'ok') {
          type = 'anthropic';
          models = ANTHROPIC_PRESET_MODELS;
        }
      }
    }

    term.moveTo(boxStartX, y);
    term.eraseLine();

    if (models.length === 0) {
      // 两条路都失败：把真实原因显示出来（401/403/超时/返回网页 等），不再只说「无法获取」
      term.moveTo(boxStartX, y);
      term.red.bold('❌ 检测失败: ');
      term.red(probe.error || '无法连接该站点');

      y += 2;
      term.moveTo(boxStartX, y);
      term.yellow('提示：确认 baseUrl 是 API 根地址（多数需带 /v1）、Key 正确、本地网络可直连该站点');

      y += 2;
      term.moveTo(boxStartX, y);
      term.yellow('按任意键返回重新填写...');

      await term.inputField({ cancelable: false }).promise;
      continue; // 重新开始填写
    }

    term.moveTo(boxStartX, y);
    term.green.bold('✅ 连接成功！');

    // 接口协议（决定用哪个端点/鉴权方式，不是模型）
    const detectedType = type === 'anthropic' ? 'Anthropic' : 'OpenAI 兼容';
    y += 1;
    term.moveTo(boxStartX, y);
    term.gray(`接口协议: ${detectedType}  |  可用模型: ${models.length} 个`);
    y += 1;

    // 直接从站点列出的可用模型里选（和 AURE 一致：信任 /models 这份列表）
    const selectedModel = await selectFromModelList(models, `选择模型（${name} - 共 ${models.length} 个）`);

    if (!selectedModel) {
      // 用户放弃，重新填写
      continue;
    }

    // 保存配置
    const api = addApi({
      name: name,
      baseUrl: baseUrl,
      apiKey: apiKey,
      type: type
    });

    term.grabInput({ mouse: false });

    // 返回配置和选择的模型
    return { ...api, selectedModel };
  }
}

/**
 * 从「站点列出的可用模型」里选一个（和 AURE 一致：信任 /models 返回的列表，不逐个实调）
 * @returns {Promise<string|null>} 选中的模型，或 null（放弃）
 */
async function selectFromModelList(models, title) {
  term.clear();
  term.cyan.bold(`\n  ${title || '选择模型'}：\n\n`);

  models.forEach((m, index) => {
    term(`    ${index + 1}. `);
    term(m);
    term('\n');
  });

  term('\n');
  term.green(`  请选择要使用的模型 (1-${models.length}): `);
  const choice = await term.inputField({ cancelable: false }).promise;
  const idx = parseInt(choice);
  term('\n\n');

  if (idx >= 1 && idx <= models.length) {
    return models[idx - 1];
  }
  return models[0];
}

/**
 * 绘制圆角框
 */
function drawRoundedBox(x, y, width, height) {
  // 顶部边框
  term.moveTo(x, y);
  term.gray('╭');
  term.gray('─'.repeat(width - 2));
  term.gray('╮');

  // 中间内容区域
  for (let i = 1; i < height - 1; i++) {
    term.moveTo(x, y + i);
    term.gray('│');
    term.moveTo(x + width - 1, y + i);
    term.gray('│');
  }

  // 底部边框
  term.moveTo(x, y + height - 1);
  term.gray('╰');
  term.gray('─'.repeat(width - 2));
  term.gray('╯');
}

/**
 * 选择模型
 */
async function selectModel(apiConfig) {
  term.clear();

  term.cyan('正在获取可用模型列表...\n\n');

  let models = [];
  let fromAPI = false;

  // 尝试从 API 获取实际模型列表
  try {
    const result = await queryApi(apiConfig);

    if (result.status === 'ok' && result.models && result.models.length > 0) {
      models = result.models.map(m => m.id || m).slice(0, 20); // 最多显示20个
      fromAPI = true;
      term.green('✓ 已获取站点可用模型\n\n');
    }
  } catch (error) {
    // 获取失败，使用默认列表
  }

  // 如果没有获取到，使用预设列表（根据 URL 和 type 智能判断）
  if (models.length === 0) {
    term.yellow('⚠ 无法获取模型列表，使用预设列表\n\n');

    // 智能判断：检查是否为 Anthropic 兼容接口
    const url = (apiConfig.baseUrl || '').toLowerCase();
    const isAnthropicAPI = apiConfig.type === 'anthropic' ||
                          url.includes('/anthropic') ||
                          url.includes('claude') ||
                          url.includes('anthropic.com');

    if (isAnthropicAPI) {
      // Anthropic 或 Anthropic 兼容接口
      models = [
        'claude-3-5-sonnet-20241022',
        'claude-3-5-sonnet-20240620',
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307'
      ];
    } else {
      // OpenAI 兼容接口
      models = [
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-4-turbo',
        'gpt-4',
        'gpt-3.5-turbo',
        'deepseek-chat',
        'deepseek-coder'
      ];
    }
  }

  term.clear();
  const sourceText = fromAPI ? '(来自 API)' : '(预设列表)';
  term.cyan(`选择模型（${apiConfig.name} - 共 ${models.length} 个 ${sourceText}）：\n\n`);

  models.forEach((model, index) => {
    term(`  ${index + 1}. ${model}\n`);
  });

  term('\n');
  term.green('请选择 (1-' + models.length + '): ');

  const response = await term.inputField({ cancelable: false }).promise;
  const choice = parseInt(response);

  term('\n\n');

  if (choice >= 1 && choice <= models.length) {
    return models[choice - 1];
  }

  return models[0];
}

/**
 * 处理命令（固定输入框模式）
 */
async function handleFixedCommand(command, engine, ui, config) {
  const parts = command.split(' ');
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case '/help':
      ui.print(chalk.cyan('\n可用命令:'));
      ui.print(chalk.gray('  /help   - 显示帮助'));
      ui.print(chalk.gray('  /clear  - 清空会话'));
      ui.print(chalk.gray('  /model  - 查看/切换模型'));
      ui.print(chalk.gray('  /exit   - 退出'));
      break;

    case '/clear':
      engine.clearSession();
      ui.updateStats(engine.getSessionStats());
      ui.showInfo('会话已清空');
      break;

    case '/model':
      if (parts[1]) {
        engine.switchModel(parts[1]);
        config.model = parts[1];
        ui.config.model = parts[1];
        ui.showInfo('已切换到模型: ' + parts[1]);
      } else {
        ui.showInfo('当前模型: ' + config.model);
      }
      break;

    case '/exit':
    case '/quit':
      ui.cleanup();
      term.clear();
      term.cyan('\n再见！👋\n\n');
      process.exit(0);
      break;

    default:
      ui.showError('未知命令: ' + cmd);
  }

  ui.drawInputBox();
}

/**
 * 处理命令（滚动模式）
 */
async function handleScrollCommand(command, engine, ui, config, rl) {
  const parts = command.split(' ');
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case '/help':
      console.log(chalk.cyan('\n可用命令:'));
      console.log(chalk.gray('  /help   - 显示帮助'));
      console.log(chalk.gray('  /clear  - 清空会话'));
      console.log(chalk.gray('  /model  - 查看/切换模型'));
      console.log(chalk.gray('  /exit   - 退出'));
      console.log('');
      break;

    case '/clear':
      engine.clearSession();
      ui.updateStats(engine.getSessionStats());
      ui.showInfo('会话已清空');
      console.log('');
      break;

    case '/model':
      if (parts[1]) {
        engine.switchModel(parts[1]);
        config.model = parts[1];
        ui.config.model = parts[1];
        ui.showInfo('已切换到模型: ' + parts[1]);
      } else {
        ui.showInfo('当前模型: ' + config.model);
      }
      console.log('');
      break;

    case '/exit':
    case '/quit':
      rl.close();
      return;

    default:
      ui.showError('未知命令: ' + cmd);
      console.log('');
  }

  rl.prompt();
}

/**
 * 处理命令（旧全屏模式，已废弃但保留兼容）
 */
async function handleCommand(command, engine, ui, config) {
  const parts = command.split(' ');
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case '/help':
      ui.showInfo('命令: /help /clear /model /stats /quit | Ctrl+C:退出 Ctrl+L:清空 Ctrl+D:详细统计');
      break;

    case '/clear':
      engine.clearSession();
      ui.messages = [];
      ui.refresh();
      ui.showInfo('会话已清空');
      updateTotalStats(ui, engine);
      break;

    case '/model':
      if (parts[1]) {
        engine.switchModel(parts[1]);
        config.model = parts[1];
        ui.config.model = parts[1];
        ui.refresh();
        ui.showInfo('已切换到模型: ' + parts[1]);
      } else {
        ui.showInfo('当前模型: ' + config.model);
      }
      break;

    case '/stats':
      ui.toggleDetailedStats();
      break;

    case '/quit':
    case '/exit':
      cleanup(ui);
      process.exit(0);
      break;

    default:
      ui.showError('未知命令: ' + cmd);
  }
}

/**
 * 更新总统计
 */
function updateTotalStats(ui, engine) {
  const totalStats = getStats({ days: 365 });
  const sessionStats = engine.getSessionStats();

  ui.updateStats(sessionStats, totalStats);
}

/**
 * 清理并退出
 */
function cleanup(ui) {
  ui.cleanup();
  term.clear();
  term.cyan('\n再见！👋\n\n');
}
