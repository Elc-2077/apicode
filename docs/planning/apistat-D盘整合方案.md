# apistat 项目统一管理方案

## 📁 目录结构规划

```
D:/
├── api-usage-tracker/              # 主项目目录（已存在）
│   ├── apistat-core/               # 核心模块（从 npm 移过来）
│   │   ├── bin/
│   │   │   └── cli.js             # TUI 界面
│   │   ├── src/
│   │   │   ├── api.js             # 站点 API 查询
│   │   │   ├── config.js          # 配置管理
│   │   │   ├── tracker.js         # 本地记录
│   │   │   └── interceptor.js     # 自动追踪
│   │   ├── index.js
│   │   └── package.json
│   │
│   ├── apistat-cc/                 # ccswitch 插件（新建）
│   │   ├── bin/
│   │   │   └── cli.js             # 基于 ccswitch 的 TUI
│   │   ├── src/
│   │   │   ├── ccswitch-reader.js # 读取 ccswitch 数据库
│   │   │   ├── stats.js           # 统计计算
│   │   │   └── ui.js              # UI 组件（复用 core）
│   │   ├── index.js
│   │   └── package.json
│   │
│   ├── apistat-dashboard/          # Web Dashboard（可选，未来）
│   │   ├── backend/
│   │   │   ├── server.js
│   │   │   └── api/
│   │   ├── frontend/
│   │   │   ├── src/
│   │   │   └── public/
│   │   └── package.json
│   │
│   ├── scripts/                    # 工具脚本
│   │   ├── import-from-ccswitch.js
│   │   ├── export-report.js
│   │   └── sync-data.js
│   │
│   ├── docs/                       # 文档
│   │   ├── README.md
│   │   ├── API.md
│   │   ├── 使用指南.md
│   │   └── 二次开发方案.md
│   │
│   └── data/                       # 数据目录（符号链接）
│       ├── records.json -> ~/.api-usage-tracker/records.json
│       ├── config.json -> ~/.api-usage-tracker/config.json
│       └── ccswitch.db -> ~/.cc-switch/cc-switch.db (只读)
```

## 🎯 整合计划

### 阶段 1：迁移现有代码（立即）

将 npm 全局安装的 apistat 代码移到 D 盘：

```bash
# 1. 复制核心代码到 D 盘
D:/api-usage-tracker/apistat-core/

# 2. 创建全局命令链接
npm link (在 apistat-core 目录)

# 3. 保持数据目录在用户目录（跨项目共享）
~/.api-usage-tracker/  # 保持不变
```

### 阶段 2：开发 ccswitch 插件（30分钟）

创建 `apistat-cc`，直接读取 ccswitch 数据：

```javascript
// D:/api-usage-tracker/apistat-cc/src/ccswitch-reader.js

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

class CCswitchReader {
  constructor() {
    this.dbPath = path.join(os.homedir(), '.cc-switch/cc-switch.db');
  }

  getUsageStats(days = 30) {
    const db = new Database(this.dbPath, { readonly: true });
    
    const startTimestamp = Math.floor(Date.now() / 1000) - (days * 24 * 3600);
    
    const stats = db.prepare(`
      SELECT 
        model,
        SUM(input_tokens) as inputTokens,
        SUM(output_tokens) as outputTokens,
        SUM(cache_read_tokens) as cacheReadTokens,
        SUM(cache_creation_tokens) as cacheCreationTokens,
        SUM(CAST(total_cost_usd AS REAL)) as totalCost,
        COUNT(*) as requestCount
      FROM proxy_request_logs
      WHERE created_at >= ? AND status_code = 200
      GROUP BY model
      ORDER BY totalCost DESC
    `).all(startTimestamp);
    
    db.close();
    return stats;
  }

  getCacheStats(days = 30) {
    const db = new Database(this.dbPath, { readonly: true });
    
    const startTimestamp = Math.floor(Date.now() / 1000) - (days * 24 * 3600);
    
    const cache = db.prepare(`
      SELECT 
        SUM(cache_read_tokens) as totalCacheHit,
        SUM(cache_creation_tokens) as totalCacheCreation,
        SUM(input_tokens + output_tokens) as totalTokens
      FROM proxy_request_logs
      WHERE created_at >= ? AND status_code = 200
    `).get(startTimestamp);
    
    db.close();
    return cache;
  }
}

module.exports = CCswitchReader;
```

### 阶段 3：统一 UI（复用）

两个命令共享相同的 UI 组件：

```
apistat      -> 使用本地 records.json + 站点 API
apistat-cc   -> 使用 ccswitch 数据库（推荐）
```

---

## 🚀 立即行动：迁移脚本

创建一个自动化迁移脚本：

```bash
# D:/api-usage-tracker/scripts/setup.sh

#!/bin/bash

echo "=== apistat 项目整合脚本 ==="

# 1. 创建目录结构
mkdir -p apistat-core apistat-cc scripts docs data

# 2. 从 npm 复制代码
echo "复制 apistat 核心代码..."
cp -r ~/AppData/Roaming/npm/node_modules/apistat/* apistat-core/

# 3. 创建符号链接
echo "创建数据目录符号链接..."
ln -s ~/.api-usage-tracker/records.json data/records.json
ln -s ~/.api-usage-tracker/config.json data/config.json
ln -s ~/.cc-switch/cc-switch.db data/ccswitch.db

# 4. 安装依赖
cd apistat-core && npm install
cd ../apistat-cc && npm install

# 5. 创建全局命令
cd apistat-core && npm link
cd ../apistat-cc && npm link

echo "✅ 完成！"
echo ""
echo "可用命令："
echo "  apistat      - 原有功能（本地记录 + 站点API）"
echo "  apistat-cc   - 基于 ccswitch（推荐）"
```

---

## 📦 package.json 配置

### apistat-core/package.json

```json
{
  "name": "@apistat/core",
  "version": "3.0.0",
  "description": "API 使用统计核心模块",
  "main": "index.js",
  "bin": {
    "apistat": "./bin/cli.js"
  },
  "repository": {
    "type": "git",
    "url": "file:///D:/api-usage-tracker"
  }
}
```

### apistat-cc/package.json

```json
{
  "name": "@apistat/ccswitch",
  "version": "1.0.0",
  "description": "基于 ccswitch 的 API 统计工具",
  "main": "index.js",
  "bin": {
    "apistat-cc": "./bin/cli.js"
  },
  "dependencies": {
    "@apistat/core": "file:../apistat-core",
    "better-sqlite3": "^9.0.0"
  }
}
```

---

## 🎯 优势

### 统一管理
✅ 所有代码在 D:/api-usage-tracker
✅ 版本控制（可以 git init）
✅ 方便备份和迁移

### 模块化
✅ apistat-core: 核心功能
✅ apistat-cc: ccswitch 插件
✅ apistat-dashboard: Web 版（未来）

### 数据共享
✅ 数据仍在 ~/.api-usage-tracker（跨项目）
✅ 符号链接方便访问
✅ ccswitch 数据只读，不修改

### 开发友好
✅ 本地开发，npm link 测试
✅ 独立模块，互不影响
✅ 易于扩展新功能

---

## 下一步

你希望我：

1. **立即创建迁移脚本** - 自动整理到 D:/api-usage-tracker
2. **直接开发 apistat-cc** - 在 D 盘创建新项目
3. **两者都做** - 完整的整合方案

我推荐选择 **3. 两者都做**，这样你就有一个完整、统一、易于管理的项目结构。

需要我现在开始吗？
