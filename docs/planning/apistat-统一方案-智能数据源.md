# apistat - 统一 CLI 工具（智能多数据源）

## 🎯 最终方案：统一工具 + 智能数据源

**不需要两个命令**，只需要一个 `apistat`，自动检测并使用最佳数据源。

## 🧠 智能数据源检测

```javascript
// 启动时自动检测
function detectDataSources() {
  const sources = {
    ccswitch: false,
    localRecords: false,
    siteApi: false
  };

  // 1. 检测 ccswitch 数据库
  const ccSwitchDbPath = path.join(os.homedir(), '.cc-switch/cc-switch.db');
  if (fs.existsSync(ccSwitchDbPath)) {
    sources.ccswitch = true;
    console.log('✅ 检测到 ccswitch 数据库');
  }

  // 2. 检测本地记录
  const recordsPath = path.join(os.homedir(), '.api-usage-tracker/records.json');
  if (fs.existsSync(recordsPath)) {
    const records = JSON.parse(fs.readFileSync(recordsPath));
    if (records.length > 0) {
      sources.localRecords = true;
      console.log('✅ 检测到本地记录');
    }
  }

  // 3. 检测站点 API
  if (currentApi) {
    sources.siteApi = true;
    console.log('✅ 检测到站点配置');
  }

  return sources;
}
```

## 📊 数据源优先级策略

### 策略 1: 智能优先（推荐）

```
优先级：ccswitch > 本地记录 > 站点 API

如果有 ccswitch：
  ✅ 使用 ccswitch 数据（最完整、最准确）
  
如果没有 ccswitch，但有本地记录：
  ✅ 使用本地记录（手动或代码集成）
  
如果两者都没有，但配置了站点：
  ✅ 尝试从站点 API 获取
  
如果都没有：
  ⚠️ 显示欢迎页面，引导用户设置
```

### 策略 2: 合并模式（可选）

```
同时使用多个数据源，合并显示：

ccswitch 数据 + 本地记录 + 站点 API
    ↓
去重 & 合并
    ↓
统一展示
```

## 🎨 用户界面设计

### 欢迎页面（无数据时）

```
┌─────────────────────────────────────────────┐
│                                             │
│    █████╗ ██████╗ ██╗███████╗████████╗     │
│   ██╔══██╗██╔══██╗██║██╔════╝╚══██╔══╝     │
│   ███████║██████╔╝██║███████╗   ██║        │
│   ██╔══██║██╔═══╝ ██║╚════██║   ██║        │
│   ██║  ██║██║     ██║███████║   ██║        │
│   ╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝   ╚═╝        │
│                                             │
│            API 使用统计工具                 │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│  ⚠️  暂无数据源                            │
│                                             │
│  请选择一种方式开始：                       │
│                                             │
│  1️⃣  如果你使用 ccswitch                   │
│     apistat 会自动读取 ccswitch 数据      │
│     请确保 ccswitch 已安装并运行过         │
│                                             │
│  2️⃣  如果你想手动记录                      │
│     运行: apistat add                      │
│     添加你的 API 使用记录                  │
│                                             │
│  3️⃣  如果你想代码集成                      │
│     查看文档: apistat help integrate       │
│     在代码中自动追踪 API 调用              │
│                                             │
│  4️⃣  如果你想从站点获取                    │
│     运行: apistat site add                 │
│     配置你的 API 站点                      │
│                                             │
│  按 q 键退出                                │
│                                             │
└─────────────────────────────────────────────┘
```

### 数据看板（有数据时）

```
┌─────────────────────────────────────────────┐
│  数据来源: ✅ ccswitch (13,215 条记录)      │
│  时间范围: 最近 30 天                       │
│  最后更新: 2026-08-14 07:30                │
└─────────────────────────────────────────────┘

  总请求次数: 13,215
  总 Token: 45,678,901
  总成本: $1,234.56
```

或者：

```
┌─────────────────────────────────────────────┐
│  数据来源: 📝 本地记录 (128 条)             │
│           ⚠️  ccswitch 未安装               │
│  时间范围: 最近 30 天                       │
└─────────────────────────────────────────────┘
```

## 💻 代码实现

### src/data-manager.js

```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

class DataManager {
  constructor() {
    this.sources = this.detectSources();
    this.primarySource = this.selectPrimarySource();
  }

  detectSources() {
    const sources = {
      ccswitch: {
        available: false,
        path: path.join(os.homedir(), '.cc-switch/cc-switch.db'),
        recordCount: 0
      },
      localRecords: {
        available: false,
        path: path.join(os.homedir(), '.api-usage-tracker/records.json'),
        recordCount: 0
      },
      siteApi: {
        available: false,
        endpoint: null
      }
    };

    // 检测 ccswitch
    if (fs.existsSync(sources.ccswitch.path)) {
      try {
        const db = new Database(sources.ccswitch.path, { readonly: true });
        const result = db.prepare('SELECT COUNT(*) as count FROM proxy_request_logs').get();
        sources.ccswitch.available = true;
        sources.ccswitch.recordCount = result.count;
        db.close();
      } catch (err) {
        console.error('ccswitch 数据库读取失败:', err.message);
      }
    }

    // 检测本地记录
    if (fs.existsSync(sources.localRecords.path)) {
      try {
        const records = JSON.parse(fs.readFileSync(sources.localRecords.path, 'utf-8'));
        if (records.length > 0) {
          sources.localRecords.available = true;
          sources.localRecords.recordCount = records.length;
        }
      } catch (err) {
        console.error('本地记录读取失败:', err.message);
      }
    }

    // 检测站点 API（从配置读取）
    const configPath = path.join(os.homedir(), '.api-usage-tracker/config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (config.apis && config.apis.length > 0) {
          sources.siteApi.available = true;
          sources.siteApi.endpoint = config.apis[0].baseUrl;
        }
      } catch (err) {
        console.error('站点配置读取失败:', err.message);
      }
    }

    return sources;
  }

  selectPrimarySource() {
    // 优先级：ccswitch > localRecords > siteApi
    if (this.sources.ccswitch.available) {
      return 'ccswitch';
    } else if (this.sources.localRecords.available) {
      return 'localRecords';
    } else if (this.sources.siteApi.available) {
      return 'siteApi';
    }
    return null;
  }

  getUsageStats(options = {}) {
    switch (this.primarySource) {
      case 'ccswitch':
        return this.getStatsFromCCSwitch(options);
      case 'localRecords':
        return this.getStatsFromLocal(options);
      case 'siteApi':
        return this.getStatsFromSite(options);
      default:
        return null;
    }
  }

  getStatsFromCCSwitch(options) {
    // 从 ccswitch 数据库读取
    const db = new Database(this.sources.ccswitch.path, { readonly: true });
    // ... 查询逻辑
    db.close();
    return stats;
  }

  getStatsFromLocal(options) {
    // 从本地 records.json 读取
    const records = JSON.parse(fs.readFileSync(this.sources.localRecords.path, 'utf-8'));
    // ... 统计逻辑
    return stats;
  }

  getStatsFromSite(options) {
    // 从站点 API 查询
    // ... API 调用逻辑
    return stats;
  }

  getDataSourceInfo() {
    return {
      primary: this.primarySource,
      sources: this.sources
    };
  }
}

module.exports = DataManager;
```

### bin/cli.js

```javascript
const DataManager = require('../src/data-manager');

// 初始化数据管理器
const dataManager = new DataManager();

// 获取数据源信息
const sourceInfo = dataManager.getDataSourceInfo();

if (!sourceInfo.primary) {
  // 显示欢迎页面
  showWelcomePage();
} else {
  // 显示正常界面
  showMainUI();
  
  // 在界面上标注数据来源
  showDataSourceBadge(sourceInfo);
}
```

## 🎯 用户体验流程

### 场景 1: 用户有 ccswitch

```
用户运行: apistat
    ↓
自动检测到 ccswitch
    ↓
显示: "✅ 数据来源: ccswitch (13,215 条记录)"
    ↓
展示完整统计和真实缓存数据
```

### 场景 2: 用户没有 ccswitch，但有本地记录

```
用户运行: apistat
    ↓
未检测到 ccswitch
检测到本地记录
    ↓
显示: "📝 数据来源: 本地记录 (128 条)"
      "💡 提示: 安装 ccswitch 可获得更完整的数据"
    ↓
展示本地记录统计
```

### 场景 3: 用户什么都没有

```
用户运行: apistat
    ↓
未检测到任何数据源
    ↓
显示欢迎页面
提供 4 种设置方式
    ↓
引导用户选择一种方式开始
```

## 📦 最终方案总结

### 单一命令

```bash
apistat              # 智能检测并使用最佳数据源
apistat --source=ccswitch    # 强制使用 ccswitch
apistat --source=local       # 强制使用本地记录
apistat --source=all         # 合并所有数据源
```

### 优势

✅ **对所有用户友好** - 有 ccswitch 的用户自动获得最佳体验
✅ **渐进式增强** - 没有 ccswitch 也能用，只是功能略减
✅ **清晰提示** - 界面上明确标注数据来源
✅ **易于迁移** - 用户安装 ccswitch 后自动升级体验
✅ **灵活配置** - 支持手动选择数据源

## 🚀 实现这个方案吗？

这样设计的好处：
- 一个命令适配所有用户
- 自动检测最佳数据源
- 提供友好的引导
- 保留所有功能

需要我现在实现吗？大约 40 分钟完成。
