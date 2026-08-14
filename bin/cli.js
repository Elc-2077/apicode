#!/usr/bin/env node

const termkit = require('terminal-kit');
const term = termkit.terminal;
const { listApis, addApi, removeApi } = require('../src/config');
const { getStats, loadRecords } = require('../src/tracker');
const { queryApi, testConnection } = require('../src/api');
const DataManager = require('../src/data-manager');
const RealtimeMonitor = require('../src/realtime-monitor');

// 解析命令行参数
const args = process.argv.slice(2);

// 如果是 serve 命令，启动代理服务器
if (args[0] === 'serve') {
  const ProxyServer = require('../src/proxy/server');
  let port = null; // null 表示自动检测

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' || args[i] === '-p') {
      port = parseInt(args[i + 1]) || null;
    }
  }

  const proxy = new ProxyServer({ port });

  // 使用异步启动
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

// 初始化数据管理器
const dataManager = new DataManager();
const dataSourceInfo = dataManager.getDataSourceInfo();

// 初始化实时监控器（5分钟更新一次）
const realtimeMonitor = new RealtimeMonitor({ interval: 300000 });

// 监听数据更新事件
realtimeMonitor.on('updated', ({ changes, stats }) => {
  // 数据源有更新，自动刷新界面
  if (currentTab === 0 || currentTab === 2 || currentTab === 3 || currentTab === 5) {
    // 如果在数据看板、使用情况、缓存命中率或更换站点页面，刷新界面
    drawUI();
  }
});

// 当前登录的API
let currentApi = null;

// 当前选中的标签
let currentTab = 0;
let renderVersion = 0; // 渲染版本号，防止异步内容串

// 标签列表
const tabs = [
  { name: '数据看板', key: 'dashboard' },
  { name: '令牌管理', key: 'token' },
  { name: '使用情况', key: 'usage' },
  { name: '缓存命中率', key: 'cache' },
  { name: '价格管理', key: 'price' },
  { name: '填写站点和API', key: 'switch' }
];

// 模型价格表（每1K tokens）
const modelPrices = {
  // OpenAI
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4-turbo-preview': { input: 0.01, output: 0.03 },
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'gpt-3.5-turbo-16k': { input: 0.003, output: 0.004 },
  'text-embedding-ada-002': { input: 0.0001, output: 0 },
  'text-embedding-3-small': { input: 0.00002, output: 0 },
  'text-embedding-3-large': { input: 0.00013, output: 0 },

  // Anthropic Claude
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'claude-3.5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-5-sonnet': { input: 0.003, output: 0.015 },

  // DeepSeek
  'deepseek-chat': { input: 0.00014, output: 0.00028 },
  'deepseek-coder': { input: 0.00014, output: 0.00028 },

  // Google
  'gemini-pro': { input: 0.00025, output: 0.0005 },
  'gemini-1.5-pro': { input: 0.0035, output: 0.0105 },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },

  // 通义千问
  'qwen-turbo': { input: 0.0002, output: 0.0006 },
  'qwen-plus': { input: 0.0004, output: 0.0012 },
  'qwen-max': { input: 0.002, output: 0.006 },

  // 其他
  'llama-2-70b': { input: 0.0007, output: 0.0009 },
  'llama-3-70b': { input: 0.0008, output: 0.001 },
  'mixtral-8x7b': { input: 0.0006, output: 0.0006 }
};

// 标签位置记录
let tabPositions = [];
let addButtonPosition = null;

// 智能匹配模型价格
function findModelPrice(modelId) {
  if (!modelId) return null;

  const modelLower = modelId.toLowerCase();

  // 精确匹配
  if (modelPrices[modelLower]) {
    return modelPrices[modelLower];
  }

  // 模糊匹配 - 检查是否包含价格表中的关键词
  for (const [priceName, price] of Object.entries(modelPrices)) {
    const priceLower = priceName.toLowerCase();

    // 双向包含检查
    if (modelLower.includes(priceLower) || priceLower.includes(modelLower)) {
      return price;
    }

    // 移除常见后缀再匹配
    const modelBase = modelLower.replace(/-(preview|latest|\d{8}|instruct|chat|turbo|vision|audio)$/g, '');
    const priceBase = priceLower.replace(/-(preview|latest|\d{8}|instruct|chat|turbo|vision|audio)$/g, '');

    if (modelBase === priceBase) {
      return price;
    }
  }

  // 特殊规则匹配
  // gpt-4 系列
  if (modelLower.includes('gpt-4') && modelLower.includes('turbo')) {
    return modelPrices['gpt-4-turbo'];
  } else if (modelLower.includes('gpt-4') && modelLower.includes('mini')) {
    return modelPrices['gpt-4o-mini'];
  } else if (modelLower.includes('gpt-4o')) {
    return modelPrices['gpt-4o'];
  } else if (modelLower.includes('gpt-4')) {
    return modelPrices['gpt-4'];
  }

  // gpt-3.5 系列
  if (modelLower.includes('gpt-3.5') || modelLower.includes('gpt-35')) {
    return modelPrices['gpt-3.5-turbo'];
  }

  // Claude 系列
  if (modelLower.includes('claude-3.5') || modelLower.includes('claude-3-5')) {
    return modelPrices['claude-3.5-sonnet'];
  } else if (modelLower.includes('claude') && modelLower.includes('opus')) {
    return modelPrices['claude-3-opus'];
  } else if (modelLower.includes('claude') && modelLower.includes('sonnet')) {
    return modelPrices['claude-3-sonnet'];
  } else if (modelLower.includes('claude') && modelLower.includes('haiku')) {
    return modelPrices['claude-3-haiku'];
  }

  // DeepSeek 系列
  if (modelLower.includes('deepseek')) {
    if (modelLower.includes('coder')) {
      return modelPrices['deepseek-coder'];
    }
    return modelPrices['deepseek-chat'];
  }

  // Gemini 系列
  if (modelLower.includes('gemini')) {
    if (modelLower.includes('1.5') && modelLower.includes('flash')) {
      return modelPrices['gemini-1.5-flash'];
    } else if (modelLower.includes('1.5')) {
      return modelPrices['gemini-1.5-pro'];
    }
    return modelPrices['gemini-pro'];
  }

  // 通义千问系列
  if (modelLower.includes('qwen')) {
    if (modelLower.includes('max')) {
      return modelPrices['qwen-max'];
    } else if (modelLower.includes('plus')) {
      return modelPrices['qwen-plus'];
    }
    return modelPrices['qwen-turbo'];
  }

  return null;
}

// 清屏并绘制界面
function drawUI() {
  // 增加渲染版本号，使旧的异步回调失效
  renderVersion++;

  term.clear();
  term.eraseDisplay();
  term.moveTo(1, 1);   // 重置光标

  // 绘制 Logo - API 橙色
  const startX = 1;
  let logoY = 1;

  term.moveTo(startX, logoY++);
  term.yellow('   █████╗ ');
  term.brightMagenta('██████╗ ');
  term.yellow('██╗');
  term.white('███████╗████████╗ █████╗ ████████╗');

  term.moveTo(startX, logoY++);
  term.yellow('  ██╔══██╗');
  term.brightMagenta('██╔══██╗');
  term.yellow('██║');
  term.white('██╔════╝╚══██╔══╝██╔══██╗╚══██╔══╝');

  term.moveTo(startX, logoY++);
  term.yellow('  ███████║');
  term.brightMagenta('██████╔╝');
  term.yellow('██║');
  term.white('███████╗   ██║   ███████║   ██║');

  term.moveTo(startX, logoY++);
  term.yellow('  ██╔══██║');
  term.brightMagenta('██╔═══╝ ');
  term.yellow('██║');
  term.white('╚════██║   ██║   ██╔══██║   ██║');

  term.moveTo(startX, logoY++);
  term.yellow('  ██║  ██║');
  term.brightMagenta('██║     ');
  term.yellow('██║');
  term.white('███████║   ██║   ██║  ██║   ██║');

  term.moveTo(startX, logoY++);
  term.yellow('  ╚═╝  ╚═╝');
  term.brightMagenta('╚═╝     ');
  term.yellow('╚═╝');
  term.white('╚══════╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝');

  if (currentApi) {
    term.moveTo(1, 8, `           当前站点: ${currentApi.baseUrl} | ${currentApi.name}`);
  }

  // 绘制标签栏
  drawTabs();

  // 绘制内容
  drawContent();

  // 底部提示
  const monitorStatus = realtimeMonitor.running ? '🟢 实时监控: 启动' : '🔴 实时监控: 停止';
  term.moveTo(1, term.height, ` 鼠标点击切换 | q: 退出 | ←→: 切换标签 | r: 刷新 | ${monitorStatus} `);
}

// 绘制标签栏
function drawTabs() {
  const startY = 10;
  term.moveTo(1, startY);

  tabPositions = [];
  let x = 1;

  tabs.forEach((tab, index) => {
    const isSelected = index === currentTab;
    const tabText = ` ${tab.name} `;

    tabPositions.push({
      x: x,
      y: startY,
      width: tabText.length,
      index: index
    });

    if (isSelected) {
      term.moveTo(x, startY).inverse(tabText);
    } else {
      term.moveTo(x, startY)(tabText);
    }

    x += tabText.length + 5; // 增加间隔从3到5
  });
}

// 绘制内容
function drawContent() {
  const contentStartY = 12;

  // 彻底清空内容区域和底部，避免内容串
  for (let i = contentStartY; i < term.height; i++) {
    term.moveTo(1, i).eraseLineAfter();
  }

  const tab = tabs[currentTab];

  switch (tab.key) {
    case 'dashboard':
      showDashboard(contentStartY);
      break;
    case 'token':
      showTokenManage(contentStartY);
      break;
    case 'usage':
      showUsageInfo(contentStartY);
      break;
    case 'cache':
      showCacheHit(contentStartY);
      break;
    case 'price':
      showPriceManage(contentStartY);
      break;
    case 'switch':
      showSwitchSite(contentStartY);
      break;
  }
}

// 数据看板
function showDashboard(startY) {
  const currentVersion = renderVersion; // 保存当前版本号

  let y = startY;
  term.moveTo(1, y++, '────────────────────────────────────────────────────────────');
  term.moveTo(1, y++, '  数据看板');
  term.moveTo(1, y++, '────────────────────────────────────────────────────────────');
  y++;

  if (!currentApi) {
    term.moveTo(1, y, '  请先登录站点');
    return;
  }

  term.moveTo(1, y++, '  正在从站点获取数据...');

  // 从当前站点实时获取数据
  queryApi(currentApi).then(result => {
    // 检查版本号，如果已经切换到其他标签，就不显示
    if (renderVersion !== currentVersion) {
      return;
    }

    let dashY = startY + 4;

    // 清空加载提示
    term.moveTo(1, dashY).eraseLineAfter();

    if (result.status === 'ok') {
      term.moveTo(1, dashY++, '  站点信息:');
      term.moveTo(1, dashY++, `    站点名称: ${currentApi.name}`);
      term.moveTo(1, dashY++, `    站点地址: ${currentApi.baseUrl}`);
      dashY++;

      if (result.balance && typeof result.balance === 'object') {
        term.moveTo(1, dashY++, '  账户余额:');
        try {
          const balanceStr = JSON.stringify(result.balance, null, 2);
          const lines = balanceStr.split('\n').slice(0, 10); // 限制显示行数
          lines.forEach(line => {
            if (dashY < term.height - 2) {
              term.moveTo(1, dashY++, `    ${line.substring(0, 55)}`);
            }
          });
        } catch (e) {
          term.moveTo(1, dashY++, `    ${String(result.balance).substring(0, 55)}`);
        }
        dashY++;
      }

      if (result.usage && typeof result.usage === 'object') {
        term.moveTo(1, dashY++, '  使用量统计:');
        try {
          const usageStr = JSON.stringify(result.usage, null, 2);
          const lines = usageStr.split('\n').slice(0, 10); // 限制显示行数
          lines.forEach(line => {
            if (dashY < term.height - 2) {
              term.moveTo(1, dashY++, `    ${line.substring(0, 55)}`);
            }
          });
        } catch (e) {
          term.moveTo(1, dashY++, `    ${String(result.usage).substring(0, 55)}`);
        }
        dashY++;
      }

      if (result.models && Array.isArray(result.models)) {
        term.moveTo(1, dashY++, `  可用模型: ${result.models.length}个`);
      }
    } else {
      term.moveTo(1, dashY, `  获取失败: ${result.error || '未知错误'}`);
    }
  }).catch(error => {
    let dashY = startY + 4;
    term.moveTo(1, dashY, `  查询失败: ${error.message || '未知错误'}`);
  });
}

// 令牌管理
function showTokenManage(startY) {
  const currentVersion = renderVersion;

  let y = startY;
  term.moveTo(1, y++, '────────────────────────────────────────────────────────────');
  term.moveTo(1, y++, '  令牌管理');
  term.moveTo(1, y++, '────────────────────────────────────────────────────────────');
  y++;

  if (!currentApi) {
    term.moveTo(1, y++, '  请先登录站点');
    y += 2;

    // 显示实时监控状态
    const monitorStats = realtimeMonitor.getStats();
    term.moveTo(1, y++, '  本地数据源状态:');
    y++;

    if (monitorStats.ccswitch.available) {
      term.moveTo(1, y++, `  ✅ ccswitch: ${monitorStats.ccswitch.recordCount.toLocaleString()} 条记录 (${realtimeMonitor.formatTimeDiff(monitorStats.ccswitch.lastUpdate)})`);
    }
    if (monitorStats.ownProxy.available) {
      term.moveTo(1, y++, `  ✅ apistat代理: ${monitorStats.ownProxy.recordCount.toLocaleString()} 条记录 (${realtimeMonitor.formatTimeDiff(monitorStats.ownProxy.lastUpdate)})`);
    }
    if (monitorStats.localRecords.available) {
      term.moveTo(1, y++, `  ✅ 本地记录: ${monitorStats.localRecords.recordCount.toLocaleString()} 条 (${realtimeMonitor.formatTimeDiff(monitorStats.localRecords.lastUpdate)})`);
    }

    if (!monitorStats.ccswitch.available && !monitorStats.ownProxy.available && !monitorStats.localRecords.available) {
      term.moveTo(1, y++, '  ⚠️  未检测到任何数据源');
    }

    return;
  }

  term.moveTo(1, y++, '  正在查询...');

  queryApi(currentApi).then(result => {
    if (renderVersion !== currentVersion) return;
    let y = startY;
    term.moveTo(1, y++, '────────────────────────────────────────────────────────────');
    term.moveTo(1, y++, '  令牌管理');
    term.moveTo(1, y++, '────────────────────────────────────────────────────────────');
    y++;

    if (result.status === 'ok') {
      if (result.balance) {
        term.moveTo(1, y++, '  账户余额:');
        const balanceStr = JSON.stringify(result.balance, null, 2);
        balanceStr.split('\n').forEach(line => {
          term.moveTo(1, y++, `    ${line}`);
        });
        y++;
      }

      if (result.usage) {
        term.moveTo(1, y++, '  使用量:');
        const usageStr = JSON.stringify(result.usage, null, 2);
        usageStr.split('\n').forEach(line => {
          term.moveTo(1, y++, `    ${line}`);
        });
        y++;
      }

      if (result.models && result.models.length > 0) {
        term.moveTo(1, y++, `  可用模型 (${result.models.length}个):`);
        result.models.slice(0, 15).forEach(model => {
          if (y < term.height - 2) {
            term.moveTo(1, y++, `    ${model.id}`);
          }
        });
        if (result.models.length > 15) {
          term.moveTo(1, y++, `    ... 还有${result.models.length - 15}个`);
        }
      }
    } else {
      term.moveTo(1, y, `  查询失败: ${result.error}`);
    }
  });
}

// 使用情况（智能模式：优先站点，回退本地）
function showUsageInfo(startY) {
  let y = startY;
  term.moveTo(1, y++, '────────────────────────────────────────────────────────────');
  term.moveTo(1, y++, '  使用情况');
  term.moveTo(1, y++, '────────────────────────────────────────────────────────────');
  y++;

  if (!currentApi) {
    term.moveTo(1, y, '  请先登录站点');
    return;
  }

  term.moveTo(1, y++, '  正在从站点获取使用数据...');

  // 尝试从站点获取
  queryApi(currentApi).then(result => {
    if (renderVersion !== currentVersion) return;
    let usageY = startY + 4;

    // 清空加载提示
    for (let i = usageY; i < term.height - 2; i++) {
      term.moveTo(1, i).eraseLineAfter();
    }

    // 如果站点返回了使用数据，显示站点数据
    if (result.status === 'ok' && result.usage) {
      // 显示站点数据（原有逻辑）
      term.moveTo(1, usageY++, '  站点使用统计:');

      if (result.usage.total_tokens !== undefined) {
        term.moveTo(1, usageY++, `    总Token: ${result.usage.total_tokens.toLocaleString()}`);
      }

      if (result.usage.prompt_tokens !== undefined) {
        term.moveTo(1, usageY++, `    输入Token: ${result.usage.prompt_tokens.toLocaleString()}`);
      }

      if (result.usage.completion_tokens !== undefined) {
        term.moveTo(1, usageY++, `    输出Token: ${result.usage.completion_tokens.toLocaleString()}`);
      }

      // 如果有详细的按模型使用数据
      if (result.usage.data && Array.isArray(result.usage.data) && result.usage.data.length > 0) {
        usageY++;
        term.moveTo(1, usageY++, '  各模型使用柱状图:');
        usageY++;

        const sortedModels = result.usage.data
          .filter(item => item.n_context_tokens_total > 0)
          .sort((a, b) => (b.n_context_tokens_total || 0) - (a.n_context_tokens_total || 0))
          .slice(0, 8);

        if (sortedModels.length > 0) {
          const maxTokens = sortedModels[0].n_context_tokens_total;
          const maxBarLength = 35;

          sortedModels.forEach(item => {
            if (usageY >= term.height - 10) return;

            const tokens = item.n_context_tokens_total || 0;
            const percentage = maxTokens > 0 ? (tokens / maxTokens) : 0;
            const barLength = Math.floor(percentage * maxBarLength);
            const tokenCount = tokens.toLocaleString().padStart(10);

            const modelName = (item.snapshot_id || item.model_id || 'unknown').substring(0, 20).padEnd(20);
            term.moveTo(1, usageY, `    ${modelName} `);
            term.moveTo(26, usageY, '█'.repeat(barLength));
            term.moveTo(62, usageY, tokenCount);
            usageY++;
          });
        }
      }

      usageY++;
      term.moveTo(1, usageY++, '  数据来源: 站点API');
    } else {
      // 站点不支持，回退到本地记录
      term.moveTo(1, usageY++, '  该站点不支持使用量查询');
      usageY++;
      term.moveTo(1, usageY++, '  正在显示本地记录...');
      usageY++;

      const stats = getStats({ days: 30 });

      if (stats.totalCalls > 0) {
        term.moveTo(1, usageY++, '  本地记录统计 (最近30天):');
        term.moveTo(1, usageY++, `    总请求次数: ${stats.totalCalls.toLocaleString()}`);
        term.moveTo(1, usageY++, `    总输入Token: ${stats.totalInputTokens.toLocaleString()}`);
        term.moveTo(1, usageY++, `    总输出Token: ${stats.totalOutputTokens.toLocaleString()}`);
        term.moveTo(1, usageY++, `    总Token: ${(stats.totalInputTokens + stats.totalOutputTokens).toLocaleString()}`);
        term.moveTo(1, usageY++, `    总成本: $${stats.totalCost.toFixed(4)}`);
        usageY++;

        // 按模型显示柱状图
        const modelEntries = Object.entries(stats.byModel)
          .sort((a, b) => b[1].tokens - a[1].tokens)
          .slice(0, 8);

        if (modelEntries.length > 0) {
          term.moveTo(1, usageY++, '  各模型使用柱状图:');
          usageY++;

          const maxTokens = modelEntries[0][1].tokens;
          const maxBarLength = 35;

          modelEntries.forEach(([model, data]) => {
            if (usageY >= term.height - 10) return;

            const percentage = maxTokens > 0 ? (data.tokens / maxTokens) : 0;
            const barLength = Math.floor(percentage * maxBarLength);
            const tokenCount = data.tokens.toLocaleString().padStart(10);

            const modelName = model.substring(0, 20).padEnd(20);
            term.moveTo(1, usageY, `    ${modelName} `);
            term.moveTo(26, usageY, '█'.repeat(barLength));
            term.moveTo(62, usageY, tokenCount);
            usageY++;
          });
        }

        usageY++;
        term.moveTo(1, usageY++, '  数据来源: 本地记录');
      } else {
        term.moveTo(1, usageY++, '  本地也暂无记录');
        usageY++;
        term.moveTo(1, usageY++, '  提示:');
        term.moveTo(1, usageY++, '    1. 在代码中集成 apistat 自动追踪');
        term.moveTo(1, usageY++, '    2. 或手动调用 track() 记录使用情况');
        term.moveTo(1, usageY++, '    3. 或从 ccswitch 导入历史数据');
      }
    }
  }).catch(error => {
    let usageY = startY + 4;

    // 查询失败，回退到本地记录
    for (let i = usageY; i < term.height - 2; i++) {
      term.moveTo(1, i).eraseLineAfter();
    }

    term.moveTo(1, usageY++, '  站点查询失败，显示本地记录');
    usageY++;

    const stats = getStats({ days: 30 });

    if (stats.totalCalls > 0) {
      term.moveTo(1, usageY++, '  本地记录统计 (最近30天):');
      term.moveTo(1, usageY++, `    总请求次数: ${stats.totalCalls.toLocaleString()}`);
      term.moveTo(1, usageY++, `    总Token: ${(stats.totalInputTokens + stats.totalOutputTokens).toLocaleString()}`);
      term.moveTo(1, usageY++, `    总成本: $${stats.totalCost.toFixed(4)}`);
    } else {
      term.moveTo(1, usageY, '  本地也暂无记录');
    }
  });
}

// 缓存命中率（智能模式：优先站点，回退本地估算）
function showCacheHit(startY) {
  let y = startY;
  term.moveTo(1, y++, '────────────────────────────────────────────────────────────');
  term.moveTo(1, y++, '  缓存命中率');
  term.moveTo(1, y++, '────────────────────────────────────────────────────────────');
  y++;

  if (!currentApi) {
    term.moveTo(1, y, '  请先登录站点');
    return;
  }

  term.moveTo(1, y++, '  正在分析缓存使用情况...');

  // 从当前站点实时获取数据
  queryApi(currentApi).then(result => {
    if (renderVersion !== currentVersion) return;
    let cacheY = startY + 4;

    // 清空加载提示
    for (let i = cacheY; i < term.height - 2; i++) {
      term.moveTo(1, i).eraseLineAfter();
    }

    if (result.status === 'ok') {
      let cacheData = null;

      // 优先从usage中提取真实缓存数据
      if (result.usage) {
        if (result.usage.cache_hit_tokens !== undefined || result.usage.cache_creation_tokens !== undefined) {
          // Claude API格式
          cacheData = {
            cacheHitTokens: result.usage.cache_hit_tokens || 0,
            cacheCreationTokens: result.usage.cache_creation_tokens || 0,
            totalTokens: (result.usage.cache_hit_tokens || 0) +
                        (result.usage.cache_creation_tokens || 0) +
                        (result.usage.n_context_tokens_total || result.usage.total_tokens || 0),
            source: 'api'
          };
        } else if (result.usage.data && Array.isArray(result.usage.data)) {
          // 详细数据格式
          let totalCacheHit = 0;
          let totalCacheCreation = 0;
          let totalTokens = 0;

          result.usage.data.forEach(item => {
            totalCacheHit += item.n_cached_context_tokens || 0;
            totalCacheCreation += item.n_cache_creation_input_tokens || 0;
            totalTokens += item.n_context_tokens_total || 0;
          });

          if (totalCacheHit > 0 || totalCacheCreation > 0) {
            cacheData = {
              cacheHitTokens: totalCacheHit,
              cacheCreationTokens: totalCacheCreation,
              totalTokens: totalTokens,
              source: 'api'
            };
          }
        }
      }

      // 如果站点有缓存数据，显示站点数据
      if (cacheData && cacheData.source === 'api') {
        const hitRate = cacheData.totalTokens > 0
          ? ((cacheData.cacheHitTokens / cacheData.totalTokens) * 100).toFixed(2)
          : 0;

        term.moveTo(1, cacheY++, '  缓存统计 (来自站点API):');
        term.moveTo(1, cacheY++, `    缓存命中Token: ${cacheData.cacheHitTokens.toLocaleString()}`);
        term.moveTo(1, cacheY++, `    缓存写入Token: ${cacheData.cacheCreationTokens.toLocaleString()}`);
        term.moveTo(1, cacheY++, `    总Token: ${cacheData.totalTokens.toLocaleString()}`);
        term.moveTo(1, cacheY++, `    命中率: ${hitRate}%`);
        cacheY++;

        // 可视化命中率
        term.moveTo(1, cacheY++, '  命中率可视化:');
        const barLength = 50;
        const filledLength = cacheData.totalTokens > 0
          ? Math.floor((cacheData.cacheHitTokens / cacheData.totalTokens) * barLength)
          : 0;

        term.moveTo(1, cacheY, '    [');
        term('█'.repeat(filledLength));
        term('░'.repeat(barLength - filledLength));
        term(']');
        cacheY += 2;

        term.moveTo(1, cacheY++, '  数据来源: 站点API');
      } else {
        // 站点不支持，回退到本地记录估算
        term.moveTo(1, cacheY++, '  该站点不支持缓存统计');
        cacheY++;
        term.moveTo(1, cacheY++, '  正在基于本地记录估算...');
        cacheY++;

        const stats = getStats({ days: 30 });

        if (stats.totalCalls > 0) {
          const totalTokens = stats.totalInputTokens + stats.totalOutputTokens;
          const promptTokens = stats.totalInputTokens;

          // 估算逻辑
          let estimatedCacheRate = 0;
          if (promptTokens > 10000) {
            estimatedCacheRate = 0.35;
          } else if (promptTokens > 5000) {
            estimatedCacheRate = 0.25;
          } else if (promptTokens > 1000) {
            estimatedCacheRate = 0.15;
          } else {
            estimatedCacheRate = 0.05;
          }

          const estimatedCacheHit = Math.floor(totalTokens * estimatedCacheRate);
          const estimatedCacheCreation = Math.floor(estimatedCacheHit * 0.3);

          const hitRate = totalTokens > 0
            ? ((estimatedCacheHit / totalTokens) * 100).toFixed(2)
            : 0;

          term.moveTo(1, cacheY++, '  缓存统计 (基于本地记录估算):');
          term.moveTo(1, cacheY++, `    估算缓存命中Token: ${estimatedCacheHit.toLocaleString()}`);
          term.moveTo(1, cacheY++, `    估算缓存写入Token: ${estimatedCacheCreation.toLocaleString()}`);
          term.moveTo(1, cacheY++, `    总Token: ${totalTokens.toLocaleString()}`);
          term.moveTo(1, cacheY++, `    估算命中率: ${hitRate}%`);
          cacheY++;

          // 可视化命中率
          term.moveTo(1, cacheY++, '  命中率可视化:');
          const barLength = 50;
          const filledLength = totalTokens > 0
            ? Math.floor((estimatedCacheHit / totalTokens) * barLength)
            : 0;

          term.moveTo(1, cacheY, '    [');
          term('█'.repeat(filledLength));
          term('░'.repeat(barLength - filledLength));
          term(']');
          cacheY += 2;

          term.moveTo(1, cacheY++, '  算法说明:');
          term.moveTo(1, cacheY++, '    基于输入Token量估算缓存潜力');
          term.moveTo(1, cacheY++, '    >10k: 35% | >5k: 25% | >1k: 15% | <1k: 5%');
          cacheY++;
          term.moveTo(1, cacheY++, '  数据来源: 本地记录估算');
        } else {
          term.moveTo(1, cacheY++, '  本地也暂无记录');
          cacheY++;
          term.moveTo(1, cacheY++, '  提示: 需要先记录API使用数据');
        }
      }
    } else {
      term.moveTo(1, cacheY, `  获取失败: ${result.error}`);
    }
  }).catch(error => {
    let cacheY = startY + 4;
    term.moveTo(1, cacheY, `  查询失败: ${error.message}`);
  });
}

// 使用日志
// 价格管理（从站点实时获取）
function showPriceManage(startY) {
  let y = startY;
  term.moveTo(1, y++, '────────────────────────────────────────────────────────────');
  term.moveTo(1, y++, '  价格管理');
  term.moveTo(1, y++, '────────────────────────────────────────────────────────────');
  y++;

  if (!currentApi) {
    term.moveTo(1, y, '  请先登录站点');
    return;
  }

  term.moveTo(1, y++, '  正在从站点获取模型价格...');

  // 从当前站点获取模型价格
  queryApi(currentApi).then(result => {
    if (renderVersion !== currentVersion) return;
    let priceY = startY + 4;

    // 清空加载提示
    for (let i = priceY; i < term.height - 2; i++) {
      term.moveTo(1, i).eraseLineAfter();
    }

    if (result.status === 'ok' && result.models && result.models.length > 0) {
      term.moveTo(1, priceY++, '  当前站点模型价格 (每1M tokens):');
      priceY++;

      const displayLimit = Math.min(result.models.length, term.height - priceY - 3);

      result.models.slice(0, displayLimit).forEach(model => {
        if (priceY >= term.height - 2) return;

        // 尝试从模型对象中提取价格信息
        let priceInfo = '';

        if (model.pricing) {
          // 如果有pricing字段
          const inputPrice = model.pricing.input ? `$${(model.pricing.input * 1000).toFixed(2)}` : '-';
          const outputPrice = model.pricing.output ? `$${(model.pricing.output * 1000).toFixed(2)}` : '-';
          priceInfo = `In:${inputPrice.padStart(8)} Out:${outputPrice.padStart(8)}`;
        } else if (model.price) {
          // 如果有price字段
          priceInfo = `$${(model.price * 1000).toFixed(2)}`;
        } else {
          // 使用智能匹配函数
          const matchedPrice = findModelPrice(model.id);

          if (matchedPrice) {
            // 转换为1M价格
            const inputPrice = `$${(matchedPrice.input * 1000).toFixed(2)}`;
            const outputPrice = `$${(matchedPrice.output * 1000).toFixed(2)}`;
            priceInfo = `In:${inputPrice.padStart(8)} Out:${outputPrice.padStart(8)}`;
          } else {
            priceInfo = '价格未知';
          }
        }

        const modelName = model.id.padEnd(35).substring(0, 35);
        term.moveTo(1, priceY++, `    ${modelName} ${priceInfo}`);
      });

      if (result.models.length > displayLimit) {
        priceY++;
        term.moveTo(1, priceY++, `    ... 还有${result.models.length - displayLimit}个模型`);
      }

      // 成本估算（如果有usage数据）
      if (result.usage && result.usage.data && Array.isArray(result.usage.data)) {
        priceY++;
        if (priceY < term.height - 3) {
          term.moveTo(1, priceY++, '  本周期成本估算:');
          priceY++;

          result.usage.data.slice(0, 5).forEach(item => {
            if (priceY >= term.height - 2) return;

            const modelName = (item.snapshot_id || 'unknown').substring(0, 30).padEnd(30);
            const tokens = item.n_context_tokens_total || 0;

            // 尝试获取价格并计算成本
            const model = result.models.find(m =>
              m.id.toLowerCase() === item.snapshot_id.toLowerCase()
            );

            let cost = '-';
            if (model && model.pricing) {
              const inputTokens = tokens * 0.4; // 假设40%是输入
              const outputTokens = tokens * 0.6; // 60%是输出
              const inputCost = (inputTokens / 1000) * model.pricing.input;
              const outputCost = (outputTokens / 1000) * model.pricing.output;
              cost = `$${(inputCost + outputCost).toFixed(4)}`;
            } else {
              // 使用智能匹配函数
              const matchedPrice = findModelPrice(item.snapshot_id);

              if (matchedPrice) {
                const inputTokens = tokens * 0.4;
                const outputTokens = tokens * 0.6;
                const inputCost = (inputTokens / 1000) * matchedPrice.input;
                const outputCost = (outputTokens / 1000) * matchedPrice.output;
                cost = `$${(inputCost + outputCost).toFixed(4)}`;
              }
            }

            term.moveTo(1, priceY++, `    ${modelName} ${cost.padStart(10)}`);
          });
        }
      }
    } else {
      term.moveTo(1, priceY, '  无法获取站点模型价格信息');
    }
  }).catch(error => {
    let priceY = startY + 4;
    term.moveTo(1, priceY, `  查询失败: ${error.message}`);
  });
}

// 更换站点
let deleteButtonPosition = null;

function showSwitchSite(startY) {
  let y = startY;
  term.moveTo(1, y++, '────────────────────────────────────────────────────────────');
  term.moveTo(1, y++, '  更换站点');
  term.moveTo(1, y++, '────────────────────────────────────────────────────────────');
  y++;

  const apis = listApis();

  if (apis.length === 0) {
    term.moveTo(1, y++, '  没有已保存的站点');
  } else {
    term.moveTo(1, y++, '  已保存站点:');
    y++;
    apis.forEach((api, index) => {
      if (y >= term.height - 15) return;
      const current = currentApi && api.id === currentApi.id ? ' ← 当前' : '';
      term.moveTo(1, y++, `    ${index + 1}. ${api.name} - ${api.baseUrl.substring(0, 35)}${current}`);
    });
    y++;
    term.moveTo(1, y++, '  操作: 按数字键切换 | 按 d 删除当前站点');
  }

  y++;

  // 显示实时监控状态
  term.moveTo(1, y++, '────────────────────────────────────────────────────────────');
  term.moveTo(1, y++, '  实时监控状态 (自动更新间隔: 5分钟)');
  term.moveTo(1, y++, '────────────────────────────────────────────────────────────');
  y++;

  const monitorStats = realtimeMonitor.getStats();

  // ccswitch 数据库状态
  term.moveTo(1, y++, '  📊 ccswitch 数据库:');
  if (monitorStats.ccswitch.available) {
    term.moveTo(1, y++, `    状态: ✅ 在线`);
    term.moveTo(1, y++, `    最后更新: ${realtimeMonitor.formatTimeDiff(monitorStats.ccswitch.lastUpdate)}`);
    term.moveTo(1, y++, `    文件大小: ${realtimeMonitor.formatSize(monitorStats.ccswitch.size)}`);
    term.moveTo(1, y++, `    预估记录: ~${monitorStats.ccswitch.recordCount.toLocaleString()} 条`);
  } else {
    term.moveTo(1, y++, `    状态: ❌ 未检测到`);
  }
  y++;

  // apistat 代理数据库状态
  term.moveTo(1, y++, '  🔄 apistat 代理数据库:');
  if (monitorStats.ownProxy.available) {
    term.moveTo(1, y++, `    状态: ✅ 在线`);
    term.moveTo(1, y++, `    最后更新: ${realtimeMonitor.formatTimeDiff(monitorStats.ownProxy.lastUpdate)}`);
    term.moveTo(1, y++, `    文件大小: ${realtimeMonitor.formatSize(monitorStats.ownProxy.size)}`);
    term.moveTo(1, y++, `    预估记录: ~${monitorStats.ownProxy.recordCount.toLocaleString()} 条`);
  } else {
    term.moveTo(1, y++, `    状态: ⚠️  未启动代理 (运行 'apistat serve' 启动)`);
  }
  y++;

  // 本地记录状态
  term.moveTo(1, y++, '  📝 本地手动记录:');
  if (monitorStats.localRecords.available) {
    term.moveTo(1, y++, `    状态: ✅ 在线`);
    term.moveTo(1, y++, `    最后更新: ${realtimeMonitor.formatTimeDiff(monitorStats.localRecords.lastUpdate)}`);
    term.moveTo(1, y++, `    记录数量: ${monitorStats.localRecords.recordCount.toLocaleString()} 条`);
  } else {
    term.moveTo(1, y++, `    状态: ⚠️  无记录`);
  }
  y++;

  const buttonY = y;
  const buttonText = '  [ 添加新站点 ]  ';
  term.moveTo(1, buttonY).inverse(buttonText);

  // 记录按钮位置
  addButtonPosition = {
    x: 1,
    y: buttonY,
    width: buttonText.length,
    height: 1
  };

  // 如果有多个站点，显示删除按钮
  if (apis.length > 0 && currentApi) {
    y++;
    const deleteButtonY = y;
    const deleteButtonText = '  [ 删除当前站点 ]  ';
    term.moveTo(1, deleteButtonY).inverse(deleteButtonText);

    deleteButtonPosition = {
      x: 1,
      y: deleteButtonY,
      width: deleteButtonText.length,
      height: 1
    };
  } else {
    deleteButtonPosition = null;
  }
}

// 登录（输入站点信息并检测）
async function login() {
  term.removeAllListeners('key');
  term.removeAllListeners('mouse');
  term.clear();
  term.eraseDisplay();

  const startX = Math.floor((term.width - 65) / 2);
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
  const subtitle = 'API Usage Monitoring & Statistics v3.2.0';
  const subtitleX = Math.floor((term.width - subtitle.length) / 2);
  term.moveTo(subtitleX, y++, subtitle);
  y += 2;

  const formX = Math.floor((term.width - 60) / 2);

  term.moveTo(formX, y++, '━'.repeat(60));
  term.moveTo(formX, y++, '  填写站点和API');
  term.moveTo(formX, y++, '━'.repeat(60));
  y += 2;

  term.moveTo(formX, y++, '  站点 URL:');
  term.moveTo(formX + 2, y++);
  const siteUrl = await term.inputField({ cancelable: false }).promise;

  y++;
  term.moveTo(formX, y++, '  API Key:');
  term.moveTo(formX + 2, y++);
  const apiKey = await term.inputField({ cancelable: false, echoChar: '*' }).promise;

  y += 2;
  term.moveTo(formX, y++, '  🔍 正在检测该站点...');

  await new Promise(resolve => setTimeout(resolve, 800));

  const siteCheck = await checkSiteInCCSwitch(siteUrl);

  if (siteCheck.found) {
    term.moveTo(formX, y++, `  ✅ 该站点在 ccswitch 中有 ${siteCheck.recordCount.toLocaleString()} 条记录`);
    term.moveTo(formX, y++, '  📊 使用 ccswitch 数据');
    await new Promise(resolve => setTimeout(resolve, 1500));

    currentApi = { name: siteUrl, baseUrl: siteUrl, apiKey, useCCSwitch: true };
    bindKeyEvents();
    drawUI();
  } else {
    term.moveTo(formX, y++, '  ⚠️  该站点在 ccswitch 中无记录');
    y++;
    term.moveTo(formX, y++, '  🚀 正在启动代理服务器...');

    await new Promise(resolve => setTimeout(resolve, 800));

    const port = await findAvailablePort();

    if (port) {
      await startProxyInBackground(port);

      y++;
      term.moveTo(formX, y++, `  ✅ 代理已启动，监听端口: ${port}`);
      y++;
      term.moveTo(formX, y++, '  💡 请配置你的应用使用代理：');
      term.moveTo(formX, y++).brightCyan(`    export HTTP_PROXY=http://localhost:${port}`);
      term.moveTo(formX, y++).brightCyan(`    export HTTPS_PROXY=http://localhost:${port}`);
      y += 2;
      term.moveTo(formX, y, '  按任意键继续...');

      await term.inputField({ cancelable: false }).promise;
    }

    currentApi = { name: siteUrl, baseUrl: siteUrl, apiKey, useCCSwitch: false };
    bindKeyEvents();
    drawUI();
  }
}

async function checkSiteInCCSwitch(siteUrl) {
  const monitorStats = realtimeMonitor.getStats();
  console.log('[DEBUG] monitorStats.ccswitch.available:', monitorStats.ccswitch.available);

  if (!monitorStats.ccswitch.available) {
    console.log('[DEBUG] ccswitch 不可用，返回 false');
    return { found: false, recordCount: 0 };
  }

  try {
    const Database = require('better-sqlite3');
    const path = require('path');
    const os = require('os');

    const dbPath = path.join(os.homedir(), '.cc-switch', 'cc-switch.db');
    console.log('[DEBUG] 数据库路径:', dbPath);

    const db = new Database(dbPath, { readonly: true });

    // 1. 先在 provider_endpoints 中查找匹配的 provider_id
    const providerStmt = db.prepare(`
      SELECT provider_id
      FROM provider_endpoints
      WHERE url LIKE ?
    `);

    const providers = providerStmt.all(`%${siteUrl}%`);
    const providerIds = providers.map(p => p.provider_id);
    console.log('[DEBUG] 找到的 provider_ids:', providerIds.length);

    // 2. 如果找到了配置的 provider，统计其记录
    if (providerIds.length > 0) {
      const placeholders = providerIds.map(() => '?').join(',');
      const countStmt = db.prepare(`
        SELECT COUNT(*) as count
        FROM proxy_request_logs
        WHERE provider_id IN (${placeholders})
      `);

      const result = countStmt.get(...providerIds);
      const count = result ? result.count : 0;
      console.log('[DEBUG] Provider 记录数:', count);

      if (count > 0) {
        db.close();
        return { found: true, recordCount: count };
      }
    }

    // 3. 如果没有找到或记录为0，检查所有记录（包括 _session）
    console.log('[DEBUG] 检查所有记录...');
    const totalStmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM proxy_request_logs
    `);

    const totalResult = totalStmt.get();
    const totalCount = totalResult ? totalResult.count : 0;
    console.log('[DEBUG] 总记录数:', totalCount);

    db.close();

    // 如果有任何记录，就认为可以使用 ccswitch
    const result = {
      found: totalCount > 0,
      recordCount: totalCount
    };
    console.log('[DEBUG] 最终返回:', result);
    return result;
  } catch (error) {
    console.error('[DEBUG] 查询 ccswitch 失败:', error.message);
    console.error('[DEBUG] 错误堆栈:', error.stack);
    return { found: false, recordCount: 0 };
  }
}

async function findAvailablePort(startPort = 8080) {
  const net = require('net');
  for (let port = startPort; port < startPort + 20; port++) {
    const isAvailable = await new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(port, '0.0.0.0');
    });
    if (isAvailable) return port;
  }
  return null;
}

async function startProxyInBackground(port) {
  const { spawn } = require('child_process');
  const proxyProcess = spawn(process.argv[0], [
    require('path').join(__dirname, 'cli.js'),
    'serve',
    '--port',
    port.toString()
  ], {
    detached: true,
    stdio: 'ignore'
  });
  proxyProcess.unref();
}


// 启动代理服务器（在 CLI 内显示状态）
async function startProxyServer() {
  term.clear();

  const formWidth = 70;
  const formX = Math.floor((term.width - formWidth) / 2);
  let y = 10;

  term.moveTo(formX, y++, '━'.repeat(formWidth));
  term.moveTo(formX, y++, '  启动 apistat 代理服务器');
  term.moveTo(formX, y++, '━'.repeat(formWidth));
  y += 2;

  term.moveTo(formX, y++, '⚠️  注意：代理服务器需要在另一个终端运行');
  term.moveTo(formX, y++, '');
  term.moveTo(formX, y++, '请打开新的终端窗口并运行：');
  term.moveTo(formX, y++, '');
  term.moveTo(formX, y++, '  $ apistat serve --port 8080');
  term.moveTo(formX, y++, '');
  term.moveTo(formX, y++, '然后配置你的应用使用代理：');
  term.moveTo(formX, y++, '');
  term.moveTo(formX, y++, '  export HTTP_PROXY=http://localhost:8080');
  term.moveTo(formX, y++, '  export HTTPS_PROXY=http://localhost:8080');
  y += 2;

  term.moveTo(formX, y++, '启动代理后，这个界面将自动检测并显示数据。');
  y += 2;

  term.moveTo(formX, y, '按任意键继续...');

  await term.inputField({ cancelable: false }).promise;

  currentApi = null;
  bindKeyEvents();
  drawUI();
}

// 绑定键盘事件
function bindKeyEvents() {
  // 先移除旧的监听器
  term.removeAllListeners('key');
  term.removeAllListeners('mouse');

  // 键盘事件
  term.on('key', (name) => {
    // q键返回/退出
    if (name === 'q') {
      // 如果在"填写站点和API"页面，退出程序
      if (currentTab === tabs.findIndex(t => t.key === 'switch')) {
        term.clear();
        term('\n再见！\n');
        process.exit(0);
      } else {
        // 其他页面，返回到"填写站点和API"
        currentTab = tabs.findIndex(t => t.key === 'switch');
        drawUI();
      }
      return;
    }

    // 忽略所有CTRL组合键，防止意外退出
    if (name && name.startsWith('CTRL_')) {
      return;
    }

    if (name === 'LEFT') {
      currentTab = (currentTab - 1 + tabs.length) % tabs.length;
      drawUI();
    }

    if (name === 'RIGHT') {
      currentTab = (currentTab + 1) % tabs.length;
      drawUI();
    }

    if (name === 'r') {
      drawUI();
    }

    const num = parseInt(name);

    // 更换站点页面切换站点
    if (tabs[currentTab].key === 'switch' && !isNaN(num)) {
      const apis = listApis();
      if (num >= 1 && num <= apis.length) {
        currentApi = apis[num - 1];
        drawUI();
      }
    }
    // 数字键切换标签
    else if (!isNaN(num) && num >= 1 && num <= tabs.length) {
      currentTab = num - 1;
      drawUI();
    }

    // a键添加站点
    if (name === 'a' && tabs[currentTab].key === 'switch') {
      login();
    }

    // d键删除站点
    if (name === 'd' && tabs[currentTab].key === 'switch') {
      deleteCurrentSite();
    }
  });

  // 鼠标事件
  term.on('mouse', (name, data) => {
    if (name === 'MOUSE_LEFT_BUTTON_PRESSED') {
      // 检查标签点击
      for (let i = 0; i < tabPositions.length; i++) {
        const pos = tabPositions[i];
        if (data.y === pos.y && data.x >= pos.x && data.x < pos.x + pos.width) {
          currentTab = pos.index;
          drawUI();
          return;
        }
      }

      // 检查添加按钮点击
      if (addButtonPosition && tabs[currentTab].key === 'switch') {
        if (data.y === addButtonPosition.y &&
            data.x >= addButtonPosition.x &&
            data.x < addButtonPosition.x + addButtonPosition.width) {
          login();
          return;
        }
      }

      // 检查删除按钮点击
      if (deleteButtonPosition && tabs[currentTab].key === 'switch') {
        if (data.y === deleteButtonPosition.y &&
            data.x >= deleteButtonPosition.x &&
            data.x < deleteButtonPosition.x + deleteButtonPosition.width) {
          deleteCurrentSite();
          return;
        }
      }
    }
  });
}

// 登录远程站点 API
async function loginRemoteApi() {
  term.clear();

  // 显示居中的Logo
  const logo = `
   █████╗ ██████╗ ██╗███████╗████████╗ █████╗ ████████╗
  ██╔══██╗██╔══██╗██║██╔════╝╚══██╔══╝██╔══██╗╚══██╔══╝
  ███████║██████╔╝██║███████╗   ██║   ███████║   ██║
  ██╔══██║██╔═══╝ ██║╚════██║   ██║   ██╔══██║   ██║
  ██║  ██║██║     ██║███████║   ██║   ██║  ██║   ██║
  ╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝`;

  const logoLines = logo.split('\n');
  const logoWidth = 65;
  const startX = Math.floor((term.width - logoWidth) / 2);

  let y = 3;
  logoLines.forEach(line => {
    term.moveTo(startX, y++, line);
  });

  // 居中显示副标题
  const subtitle = 'API Usage Monitoring & Statistics v3.0.0';
  const subtitleX = Math.floor((term.width - subtitle.length) / 2);
  term.moveTo(subtitleX, y + 1, subtitle);

  y += 4;

  // 居中显示表单
  const formWidth = 60;
  const formX = Math.floor((term.width - formWidth) / 2);

  term.moveTo(formX, y++, '━'.repeat(formWidth));
  term.moveTo(formX, y++, '  登录站点');
  term.moveTo(formX, y++, '━'.repeat(formWidth));
  y++;

  term.moveTo(formX, y++, '站点URL:');
  term.moveTo(formX, y);
  const url = await term.inputField({
    default: 'https://api.openai.com',
    cancelable: false
  }).promise;

  y += 2;
  term.moveTo(formX, y++, 'API Key:');
  term.moveTo(formX, y);
  const apiKey = await term.inputField({
    echoChar: '*',
    cancelable: false
  }).promise;

  y += 2;
  term.moveTo(formX, y++, '正在连接...');

  const result = await testConnection(url, apiKey, 'openai');

  if (result.status === 'ok') {
    term.moveTo(formX, y++, '连接成功！');

    const api = addApi({
      name: `站点_${Date.now()}`,
      baseUrl: url,
      apiKey: apiKey,
      type: 'openai'
    });

    currentApi = api;
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 重新绑定键盘监听
    bindKeyEvents();
    drawUI();
  } else {
    term.moveTo(formX, y++, `连接失败: ${result.error}`);
    term.moveTo(formX, y + 1, '按任意键重试...');
    await term.inputField({ cancelable: false }).promise;

    // 重新绑定键盘监听
    bindKeyEvents();
    return loginRemoteApi();
  }
}

// 删除当前站点
async function deleteCurrentSite() {
  if (!currentApi) {
    return;
  }

  const apis = listApis();
  if (apis.length === 0) {
    return;
  }

  term.clear();
  term.moveTo(1, 1, `确定要删除站点 "${currentApi.name}" 吗？\n\n`);
  term('此操作不可恢复！\n\n');
  term('输入 yes 确认删除: ');

  const confirm = await term.inputField({ cancelable: false }).promise;

  if (confirm.toLowerCase() === 'yes') {
    try {
      removeApi(currentApi.name);
      term('\n\n删除成功！\n');

      // 切换到其他站点
      const remainingApis = listApis();
      if (remainingApis.length > 0) {
        currentApi = remainingApis[0];
      } else {
        currentApi = null;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      drawUI();
    } catch (error) {
      term(`\n\n删除失败: ${error.message}\n`);
      term('按任意键返回...');
      await term.inputField({ cancelable: false }).promise;
      drawUI();
    }
  } else {
    term('\n\n已取消\n');
    await new Promise(resolve => setTimeout(resolve, 500));
    drawUI();
  }
}

// 鼠标事件
term.on('mouse', (name, data) => {
  if (name === 'MOUSE_LEFT_BUTTON_PRESSED') {
    // 检查标签点击
    for (let i = 0; i < tabPositions.length; i++) {
      const pos = tabPositions[i];
      if (data.y === pos.y && data.x >= pos.x && data.x < pos.x + pos.width) {
        currentTab = pos.index;
        drawUI();
        return;
      }
    }

    // 检查添加按钮点击
    if (addButtonPosition && tabs[currentTab].key === 'switch') {
      if (data.y === addButtonPosition.y &&
          data.x >= addButtonPosition.x &&
          data.x < addButtonPosition.x + addButtonPosition.width) {
        login();
        return;
      }
    }

    // 检查删除按钮点击
    if (deleteButtonPosition && tabs[currentTab].key === 'switch') {
      if (data.y === deleteButtonPosition.y &&
          data.x >= deleteButtonPosition.x &&
          data.x < deleteButtonPosition.x + deleteButtonPosition.width) {
        deleteCurrentSite();
        return;
      }
    }
  }
});

// 启动
async function start() {
  term.grabInput({ mouse: 'button' });

  // 先启动实时监控并立即检查一次
  realtimeMonitor.start();

  // 然后进入登录界面
  await login();
}

start().catch(error => {
  console.error('启动失败:', error);
  process.exit(1);
});

// 进程退出时停止监控
process.on('exit', () => {
  realtimeMonitor.stop();
});

process.on('SIGINT', () => {
  realtimeMonitor.stop();
  term.processExit();
});
