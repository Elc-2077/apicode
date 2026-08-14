#!/bin/bash

# 1. 提取 login 函数之前的部分 (1-984行)
head -984 bin/cli.js > bin/cli-new.js

# 2. 添加新的 login 函数
cat >> bin/cli-new.js << 'LOGINEND'

// 登录（简化版 - 自动检测）
async function login() {
  term.removeAllListeners('key');
  term.clear();

  // Logo - API 用橙色
  const startX = 10;
  let y = 3;

  term.moveTo(startX, y++);
  term.yellow('   █████╗ ');
  term.brightMagenta('██████╗ ');
  term.yellow('██╗');
  term.white('███████╗████████╗ █████╗ ████████╗');

  term.moveTo(startX, y++);
  term.yellow('  ██╔══██╗');
  term.brightMagenta('██╔══██╗');
  term.yellow('██║');
  term.white('██╔════╝╚══██╔══╝██╔══██╗╚══██╔══╝');

  term.moveTo(startX, y++);
  term.yellow('  ███████║');
  term.brightMagenta('██████╔╝');
  term.yellow('██║');
  term.white('███████╗   ██║   ███████║   ██║');

  term.moveTo(startX, y++);
  term.yellow('  ██╔══██║');
  term.brightMagenta('██╔═══╝ ');
  term.yellow('██║');
  term.white('╚════██║   ██║   ██╔══██║   ██║');

  term.moveTo(startX, y++);
  term.yellow('  ██║  ██║');
  term.brightMagenta('██║     ');
  term.yellow('██║');
  term.white('███████║   ██║   ██║  ██║   ██║');

  term.moveTo(startX, y++);
  term.yellow('  ╚═╝  ╚═╝');
  term.brightMagenta('╚═╝     ');
  term.yellow('╚═╝');
  term.white('╚══════╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝');

  y += 2;
  term.moveTo(startX + 5, y++, 'API Usage Monitoring & Statistics v3.1.0');
  y += 2;

  term.moveTo(startX, y++, '━'.repeat(60));
  term.moveTo(startX, y++, '  正在检测数据源...');
  term.moveTo(startX, y++, '━'.repeat(60));
  y++;

  await new Promise(resolve => setTimeout(resolve, 800));

  const monitorStats = realtimeMonitor.getStats();
  const hasCCSwitch = monitorStats.ccswitch.available;

  if (hasCCSwitch) {
    term.moveTo(startX, y++, '  ✅ 检测到 ccswitch 数据库');
    term.moveTo(startX, y++, \`     \${monitorStats.ccswitch.recordCount.toLocaleString()} 条记录 (\${realtimeMonitor.formatSize(monitorStats.ccswitch.size)})\`);
    y++;
    term.moveTo(startX, y++, '  🚀 正在加载数据...');
    await new Promise(resolve => setTimeout(resolve, 1200));
    currentApi = null;
    bindKeyEvents();
    drawUI();
  } else {
    term.moveTo(startX, y++, '  ⚠️  未检测到 ccswitch 数据库');
    y++;
    term.moveTo(startX, y++, '  💡 建议：启动代理服务器来记录 API 使用');
    y += 2;
    term.moveTo(startX, y++, '  请选择：');
    y++;
    term.moveTo(startX, y++).inverse('  [ 1. 启动代理服务器 ]  ');
    term.moveTo(startX, y++).inverse('  [ 2. 继续使用本地记录 ]  ');
    y += 2;
    term.moveTo(startX, y, '  请按 1 或 2: ');

    return new Promise((resolve) => {
      const keyHandler = (name) => {
        if (name === '1') {
          term.removeAllListeners('key');
          resolve('proxy');
        } else if (name === '2') {
          term.removeAllListeners('key');
          resolve('continue');
        }
      };
      term.on('key', keyHandler);
    }).then(async (choice) => {
      if (choice === 'proxy') {
        return startProxyInstructions();
      } else {
        term.clear();
        term.moveTo(startX, 10, '✅ 使用本地记录模式');
        term.moveTo(startX, 11, '   如有记录将自动显示');
        await new Promise(resolve => setTimeout(resolve, 1200));
        currentApi = null;
        bindKeyEvents();
        drawUI();
      }
    });
  }
}

// 显示代理启动说明
async function startProxyInstructions() {
  term.clear();
  const startX = 10;
  let y = 5;

  term.moveTo(startX, y++, '━'.repeat(60));
  term.moveTo(startX, y++, '  启动 apistat 代理服务器');
  term.moveTo(startX, y++, '━'.repeat(60));
  y += 2;
  term.moveTo(startX, y++, '  ⚠️  注意：代理需要在另一个终端运行');
  y += 2;
  term.moveTo(startX, y++, '  请打开新的终端窗口并运行：');
  y++;
  term.moveTo(startX, y++).brightCyan('    $ apistat serve');
  y += 2;
  term.moveTo(startX, y++, '  然后配置你的应用使用代理：');
  y++;
  term.moveTo(startX, y++).brightCyan('    export HTTP_PROXY=http://localhost:8080');
  term.moveTo(startX, y++).brightCyan('    export HTTPS_PROXY=http://localhost:8080');
  y += 2;
  term.moveTo(startX, y++, '  启动代理后，此界面将自动检测数据。');
  y += 2;
  term.moveTo(startX, y, '  按任意键继续...');

  await term.inputField({ cancelable: false }).promise;
  currentApi = null;
  bindKeyEvents();
  drawUI();
}

LOGINEND

# 3. 跳过旧的 login 相关函数，添加剩余部分 (从第1221行开始)
tail -n +1221 bin/cli.js >> bin/cli-new.js

echo "替换完成！"
