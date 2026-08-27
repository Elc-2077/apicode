# apistat-cc - 基于 ccswitch 数据的独立 CLI 工具

## 🎯 设计目标

创建一个**独立的命令行工具** `apistat-cc`，特点：

✅ **独立运行** - 不是 ccswitch 的插件，是自己的 CLI
✅ **直接读取 ccswitch 数据库** - 实时数据，无需导入
✅ **保留所有现有功能** - 使用情况、缓存命中率、成本分析
✅ **复用 apistat-core 的 UI** - 相同的 TUI 界面风格
✅ **真实数据** - 不是估算，是 ccswitch 记录的真实数值

## 📊 架构设计

```
apistat-cc (独立 CLI)
│
├── 数据层
│   └── ccswitch SQLite 数据库
│       ├── proxy_request_logs (请求记录)
│       ├── usage_daily_rollups (每日汇总)
│       └── model_pricing (价格信息)
│
├── 业务层
│   ├── 使用情况统计
│   ├── 缓存命中率计算 (真实数据!)
│   ├── 成本分析
│   └── 按时间/模型筛选
│
└── 展示层
    └── TUI 界面 (terminal-kit)
        ├── 数据看板
        ├── 使用情况 (柱状图)
        ├── 缓存命中率 (可视化)
        ├── 成本分析
        └── 模型对比
```

## 🚀 实现计划

### 阶段 1: 数据读取层 (10分钟)

创建 `src/ccswitch-reader.js`：
- 读取 ccswitch 数据库
- 提供统计查询接口
- 支持时间范围筛选
- 支持模型筛选

### 阶段 2: UI 界面 (15分钟)

创建 `bin/cli.js`：
- 复用 apistat-core 的 UI 组件
- 显示真实的缓存命中数据
- 显示柱状图和统计
- 支持交互操作

### 阶段 3: 命令行参数 (5分钟)

支持命令行选项：
```bash
apistat-cc                    # 启动 TUI
apistat-cc --days 7           # 最近7天
apistat-cc --model claude     # 特定模型
apistat-cc --export report    # 导出报告
```

## 💻 核心代码结构

### src/ccswitch-reader.js

```javascript
class CCswitchReader {
  constructor(dbPath) {
    this.db = new Database(dbPath, { readonly: true });
  }

  // 获取使用统计
  getUsageStats(options = {}) {
    const { days = 30, model = null } = options;
    // 查询 proxy_request_logs
    // 按模型分组统计
    // 返回结构化数据
  }

  // 获取真实缓存数据
  getCacheStats(options = {}) {
    const { days = 30 } = options;
    // 查询 cache_read_tokens, cache_creation_tokens
    // 返回真实的缓存命中率
  }

  // 获取成本分析
  getCostAnalysis(options = {}) {
    // 查询 total_cost_usd
    // 按时间趋势分析
  }

  // 获取模型对比
  getModelComparison(options = {}) {
    // 对比不同模型的使用情况
  }
}
```

### bin/cli.js

```javascript
const term = require('terminal-kit').terminal;
const CCswitchReader = require('../src/ccswitch-reader');

// 初始化
const reader = new CCswitchReader();
const stats = reader.getUsageStats({ days: 30 });

// 显示 TUI（复用 apistat-core 的界面逻辑）
function showDashboard() {
  // 显示 LOGO
  // 显示标签栏
  // 显示数据
}

function showUsageInfo() {
  // 从 ccswitch 数据库读取
  // 显示柱状图
  // 显示详细统计
}

function showCacheHit() {
  // 显示真实的缓存命中数据
  // 不是估算，是实际记录
}
```

## 🎨 UI 功能

### 1. 数据看板
- 总请求次数
- 总 Token 消耗
- 总成本
- 平均响应时间

### 2. 使用情况
- 按模型柱状图
- 详细 Token 消耗
- 输入/输出比例
- 时间趋势

### 3. 缓存命中率 (真实数据!)
```
缓存统计 (来自 ccswitch 真实记录):
  缓存命中 Token: 1,234,567
  缓存写入 Token: 345,678
  总 Token: 5,678,901
  命中率: 21.74%

命中率可视化:
  [██████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]

缓存效益:
  节省 Token: 1,111,110 (命中 Token 的 90%)
  写入开销: 345,678
  净节省: 765,432

数据来源: ccswitch 数据库
```

### 4. 成本分析
- 每日成本趋势
- 按模型成本占比
- 成本预测

### 5. 模型对比
- 不同模型的使用量
- 不同模型的成本效益
- 推荐使用建议

## 🔍 相比 apistat-core 的优势

| 特性 | apistat-core | apistat-cc |
|------|--------------|------------|
| 数据来源 | 手动导入 | 实时读取 |
| 缓存数据 | 估算 | **真实记录** |
| 数据同步 | 需要运行导入脚本 | 自动同步 |
| 历史记录 | 取决于导入 | **完整历史** |
| 响应时间 | 有记录 | **有记录** |
| 成本数据 | 估算 | **精确** |
| 数据完整性 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

## 📦 项目结构

```
D:/api-usage-tracker/apistat-cc/
├── bin/
│   └── cli.js              # 主程序入口
├── src/
│   ├── ccswitch-reader.js  # 数据读取
│   ├── stats.js            # 统计计算
│   ├── ui.js               # UI 组件
│   └── utils.js            # 工具函数
├── package.json
├── README.md
└── .gitignore
```

## 🚀 开始实现

需要我现在立即实现吗？

实现后你将拥有：
- 一个独立的 `apistat-cc` 命令
- 完全基于 ccswitch 数据
- 真实的缓存命中率（不是估算）
- 完整的使用统计和可视化
- 保留所有现有功能，甚至更强

预计时间：**30 分钟**

准备好了吗？
