# 基于 ccswitch 二次开发 apistat - 方案设计

## 当前情况分析

### ccswitch 架构
- **类型**: Windows GUI 桌面应用（Electron 或类似框架）
- **数据库**: SQLite (`cc-switch.db`) - 6.9MB，包含完整的使用记录
- **功能**: 
  - 作为代理服务器运行
  - 自动拦截并记录所有 API 调用
  - 提供 GUI 界面查看统计

### apistat 当前功能
- **类型**: 命令行 TUI 应用 (terminal-kit)
- **数据**: JSON 文件 (`records.json`) - 现有 13,223 条从 ccswitch 导入的记录
- **功能**:
  - 查看使用情况（柱状图、统计）
  - 查看缓存命中率
  - 从站点 API 或本地记录获取数据
  - 支持代码集成（自动追踪）

## 🎯 方案一：ccswitch 插件模式（推荐）

**思路**: 为 ccswitch 开发一个插件/扩展，直接读取 ccswitch 数据库

### 优势
✅ 利用 ccswitch 的自动数据收集
✅ 数据实时同步，无需导入
✅ 保留 apistat 的所有可视化功能
✅ 不需要修改 ccswitch 本身

### 实现方式

创建一个新的 CLI 工具 `apistat-cc`，直接读取 ccswitch 数据库：

```javascript
// apistat-cc - 基于 ccswitch 数据的统计工具

const Database = require('better-sqlite3');
const ccSwitchDb = path.join(os.homedir(), '.cc-switch/cc-switch.db');

// 直接从 ccswitch 数据库查询
function getUsageFromCCSwitch(days = 30) {
  const db = new Database(ccSwitchDb, { readonly: true });
  
  const startTimestamp = Math.floor(Date.now() / 1000) - (days * 24 * 3600);
  
  const stats = db.prepare(`
    SELECT 
      model,
      SUM(input_tokens) as totalInput,
      SUM(output_tokens) as totalOutput,
      SUM(cache_read_tokens) as totalCacheRead,
      SUM(cache_creation_tokens) as totalCacheCreation,
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
```

**特点**:
- 零配置，自动检测 ccswitch 数据库
- 实时数据，无需手动同步
- 复用 apistat 的 UI 界面
- 添加 ccswitch 独有的数据（如缓存统计）

---

## 🎯 方案二：混合数据源模式

**思路**: apistat 同时支持两种数据源

### 架构

```
apistat
├── 数据源 1: ccswitch 数据库（只读）
│   └── 自动收集的完整历史数据
│
├── 数据源 2: 本地 records.json
│   └── 手动记录或代码集成的数据
│
└── UI 层：统一展示
    ├── 使用情况（合并两个数据源）
    ├── 缓存命中率（优先 ccswitch 的真实数据）
    └── 成本分析
```

### 实现

修改 apistat，启动时自动检测并合并数据：

```javascript
// 智能数据加载
function loadAllData() {
  let data = [];
  
  // 1. 尝试从 ccswitch 加载
  if (ccSwitchDbExists()) {
    console.log('✅ 检测到 ccswitch 数据库');
    data.push(...loadFromCCSwitch());
  }
  
  // 2. 加载本地记录
  if (recordsJsonExists()) {
    console.log('✅ 加载本地记录');
    data.push(...loadFromLocal());
  }
  
  // 3. 去重并合并
  return deduplicateAndMerge(data);
}
```

**优势**:
✅ 无缝集成 ccswitch 数据
✅ 保留手动记录能力
✅ 自动去重
✅ 数据源优先级可配置

---

## 🎯 方案三：ccswitch Web 插件

**思路**: 如果 ccswitch 支持插件系统，开发一个 Web UI 插件

### 可能性探索

1. 检查 ccswitch 是否有插件 API
2. 在 ccswitch 的 GUI 中嵌入 apistat 的统计视图
3. 通过 ccswitch 的设置或菜单访问

**需要调研**:
- ccswitch 是否开源或提供 SDK
- 是否支持自定义面板/视图
- 是否有扩展机制

---

## 🎯 方案四：独立 Dashboard（最完整）

**思路**: 创建一个独立的 Web Dashboard，同时连接 ccswitch 和 apistat 数据

### 架构

```
┌─────────────────────────────────────┐
│   apistat Dashboard (Web)           │
│   http://localhost:3000             │
└─────────────────────────────────────┘
            │
            ├─→ ccswitch SQLite (主数据源)
            ├─→ apistat records.json (辅助)
            └─→ 站点 API (实时查询)

功能：
- 📊 使用情况趋势图（ECharts）
- 💰 成本分析和预测
- 🎯 缓存命中率（真实数据）
- 📈 模型对比
- ⚡ 实时监控
```

### 技术栈

```javascript
// 后端: Express + better-sqlite3
const express = require('express');
const Database = require('better-sqlite3');

app.get('/api/usage', (req, res) => {
  const db = new Database(ccSwitchDbPath);
  const stats = db.prepare('SELECT * FROM proxy_request_logs...').all();
  res.json(stats);
});

// 前端: React + ECharts
- 实时图表
- 数据过滤
- 导出报表
```

---

## 📋 推荐方案对比

| 方案 | 复杂度 | 数据源 | 实时性 | UI | 推荐度 |
|------|--------|--------|--------|-----|--------|
| **方案一：插件模式** | ⭐⭐ | ccswitch DB | ✅ 实时 | TUI | ⭐⭐⭐⭐⭐ |
| **方案二：混合数据** | ⭐⭐⭐ | ccswitch + 本地 | ✅ 实时 | TUI | ⭐⭐⭐⭐ |
| **方案三：Web插件** | ⭐⭐⭐⭐ | 取决于 ccswitch | ✅ 实时 | GUI | ⭐⭐⭐ (需调研) |
| **方案四：Dashboard** | ⭐⭐⭐⭐⭐ | 全部 | ✅ 实时 | Web | ⭐⭐⭐⭐⭐ (最强) |

---

## 🚀 立即实施：方案一（最快见效）

我可以立即帮你实现**方案一**，创建 `apistat-cc` 命令：

### 特点

1. **直接读取 ccswitch 数据库** - 无需导入
2. **复用 apistat 的 UI** - 柱状图、统计全保留
3. **真实的缓存数据** - 不是估算，是 ccswitch 记录的真实缓存命中
4. **按天/周/月筛选** - 灵活的时间范围
5. **成本追踪** - 精确到每个请求

### 命令示例

```bash
# 查看最近 7 天的使用情况
apistat-cc --days 7

# 查看特定模型
apistat-cc --model claude-opus-4-8

# 导出报告
apistat-cc --export report.json

# 启动 TUI 界面（像现在的 apistat）
apistat-cc
```

---

## 💡 建议

**短期（立即）**: 实施方案一，快速获得基于 ccswitch 的完整统计

**中期（1-2周）**: 升级到方案二，支持混合数据源

**长期（1个月+）**: 如果需要更好的可视化，开发方案四的 Web Dashboard

---

## 下一步

你想要哪个方案？我可以立即开始实现：

1. ✅ **方案一** - 30分钟实现，立即可用
2. 方案二 - 1小时实现，功能更全
3. 方案四 - 需要几小时，但最强大

**我的建议**: 先实现方案一，然后根据使用体验决定是否升级到方案四。
