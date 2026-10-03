/**
 * 数据管理器 - 智能检测和管理多数据源
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require('sql.js');
const { loadRecords } = require('./tracker');

class DataManager {
  constructor() {
    this.sources = this.detectSources();
    this.primarySource = this.selectPrimarySource();
  }

  /**
   * 检测所有可用的数据源
   */
  detectSources() {
    const sources = {
      ccswitch: {
        available: false,
        path: path.join(os.homedir(), '.cc-switch', 'cc-switch.db'),
        recordCount: 0,
        label: 'ccswitch'
      },
      localRecords: {
        available: false,
        path: path.join(os.homedir(), '.api-usage-tracker', 'records.json'),
        recordCount: 0,
        label: '本地记录'
      },
      ownProxy: {
        available: false,
        path: path.join(os.homedir(), '.api-usage-tracker', 'apistat.db'),
        recordCount: 0,
        label: 'apistat 代理'
      }
    };

    // 检测 ccswitch 数据库
    if (fs.existsSync(sources.ccswitch.path)) {
      try {
        // ccswitch 使用 better-sqlite3，我们可以读取但不依赖它
        // 简单检查文件大小来判断是否有数据
        const stats = fs.statSync(sources.ccswitch.path);
        if (stats.size > 0) {
          sources.ccswitch.available = true;
          sources.ccswitch.recordCount = 1; // 暂时标记为有数据
        }
      } catch (err) {
        // 无法访问
      }
    }

    // 检测本地记录
    if (fs.existsSync(sources.localRecords.path)) {
      try {
        const records = loadRecords();
        if (records.length > 0) {
          sources.localRecords.available = true;
          sources.localRecords.recordCount = records.length;
        }
      } catch (err) {
        // 记录文件可能损坏
      }
    }

    // 检测自己的代理数据库
    if (fs.existsSync(sources.ownProxy.path)) {
      try {
        const stats = fs.statSync(sources.ownProxy.path);
        if (stats.size > 0) {
          sources.ownProxy.available = true;
          sources.ownProxy.recordCount = 1; // 暂时标记为有数据
        }
      } catch (err) {
        // 数据库可能损坏
      }
    }

    return sources;
  }

  /**
   * 选择主数据源
   * 优先级：ccswitch > ownProxy > localRecords
   */
  selectPrimarySource() {
    if (this.sources.ccswitch.available && this.sources.ccswitch.recordCount > 0) {
      return 'ccswitch';
    } else if (this.sources.ownProxy.available && this.sources.ownProxy.recordCount > 0) {
      return 'ownProxy';
    } else if (this.sources.localRecords.available && this.sources.localRecords.recordCount > 0) {
      return 'localRecords';
    }
    return null;
  }

  /**
   * 获取使用统计
   */
  getUsageStats(options = {}) {
    const { days = 30, model = null } = options;

    switch (this.primarySource) {
      case 'ccswitch':
        return this.getStatsFromCCSwitch(days, model);
      case 'ownProxy':
        return this.getStatsFromOwnProxy(days, model);
      case 'localRecords':
        return this.getStatsFromLocal(days, model);
      default:
        return this.getEmptyStats();
    }
  }

  /**
   * 从 ccswitch 数据库获取统计（异步版本）
   */
  async getStatsFromCCSwitch(days, model) {
    try {
      const SQL = await initSqlJs();
      const buffer = fs.readFileSync(this.sources.ccswitch.path);
      const db = new SQL.Database(buffer);

      const startTimestamp = Math.floor(Date.now() / 1000) - (days * 24 * 3600);

      let query = `
        SELECT
          model,
          SUM(input_tokens) as inputTokens,
          SUM(output_tokens) as outputTokens,
          SUM(cache_read_tokens) as cacheReadTokens,
          SUM(cache_creation_tokens) as cacheCreationTokens,
          SUM(CAST(total_cost_usd AS REAL)) as totalCost,
          COUNT(*) as requestCount
        FROM proxy_request_logs
        WHERE created_at >= ${startTimestamp} AND status_code = 200
      `;

      if (model) {
        query += ` AND model LIKE '%${model}%'`;
      }

      query += ' GROUP BY model ORDER BY totalCost DESC';

      const result = db.exec(query);
      db.close();

      if (result.length === 0) {
        return this.getEmptyStats();
      }

      const totals = {
        totalCalls: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheReadTokens: 0,
        totalCacheCreationTokens: 0,
        totalCost: 0,
        byModel: {}
      };

      const columns = result[0].columns;
      const values = result[0].values;

      values.forEach(row => {
        const modelData = {};
        columns.forEach((col, idx) => {
          modelData[col] = row[idx];
        });

        totals.totalCalls += modelData.requestCount;
        totals.totalInputTokens += modelData.inputTokens || 0;
        totals.totalOutputTokens += modelData.outputTokens || 0;
        totals.totalCacheReadTokens += modelData.cacheReadTokens || 0;
        totals.totalCacheCreationTokens += modelData.cacheCreationTokens || 0;
        totals.totalCost += modelData.totalCost || 0;

        totals.byModel[modelData.model] = {
          calls: modelData.requestCount,
          tokens: (modelData.inputTokens || 0) + (modelData.outputTokens || 0),
          inputTokens: modelData.inputTokens || 0,
          outputTokens: modelData.outputTokens || 0,
          cacheReadTokens: modelData.cacheReadTokens || 0,
          cacheCreationTokens: modelData.cacheCreationTokens || 0,
          cost: modelData.totalCost || 0
        };
      });

      return totals;
    } catch (err) {
      console.error('读取 ccswitch 数据库失败:', err.message);
      return this.getEmptyStats();
    }
  }

  /**
   * 从自己的代理数据库获取统计
   */
  async getStatsFromOwnProxy(days, model) {
    try {
      const SQL = await initSqlJs();
      const buffer = fs.readFileSync(this.sources.ownProxy.path);
      const db = new SQL.Database(buffer);

      // 使用相同的查询逻辑
      const startTimestamp = Math.floor(Date.now() / 1000) - (days * 24 * 3600);

      let query = `
        SELECT
          model,
          SUM(input_tokens) as inputTokens,
          SUM(output_tokens) as outputTokens,
          SUM(cache_read_tokens) as cacheReadTokens,
          SUM(cache_creation_tokens) as cacheCreationTokens,
          SUM(CAST(total_cost_usd AS REAL)) as totalCost,
          COUNT(*) as requestCount
        FROM proxy_request_logs
        WHERE created_at >= ${startTimestamp} AND status_code = 200
      `;

      if (model) {
        query += ` AND model LIKE '%${model}%'`;
      }

      query += ' GROUP BY model ORDER BY totalCost DESC';

      const result = db.exec(query);
      db.close();

      if (result.length === 0) {
        return this.getEmptyStats();
      }

      const totals = {
        totalCalls: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheReadTokens: 0,
        totalCacheCreationTokens: 0,
        totalCost: 0,
        byModel: {}
      };

      const columns = result[0].columns;
      const values = result[0].values;

      values.forEach(row => {
        const modelData = {};
        columns.forEach((col, idx) => {
          modelData[col] = row[idx];
        });

        totals.totalCalls += modelData.requestCount;
        totals.totalInputTokens += modelData.inputTokens || 0;
        totals.totalOutputTokens += modelData.outputTokens || 0;
        totals.totalCacheReadTokens += modelData.cacheReadTokens || 0;
        totals.totalCacheCreationTokens += modelData.cacheCreationTokens || 0;
        totals.totalCost += modelData.totalCost || 0;

        totals.byModel[modelData.model] = {
          calls: modelData.requestCount,
          tokens: (modelData.inputTokens || 0) + (modelData.outputTokens || 0),
          inputTokens: modelData.inputTokens || 0,
          outputTokens: modelData.outputTokens || 0,
          cacheReadTokens: modelData.cacheReadTokens || 0,
          cacheCreationTokens: modelData.cacheCreationTokens || 0,
          cost: modelData.totalCost || 0
        };
      });

      return totals;
    } catch (err) {
      console.error('读取代理数据库失败:', err.message);
      return this.getEmptyStats();
    }
  }

  /**
   * 从本地记录获取统计
   */
  getStatsFromLocal(days, model) {
    const records = loadRecords();
    const cutoffDate = Date.now() - (days * 24 * 3600 * 1000);

    const filteredRecords = records.filter(r => {
      const recordDate = r.timestamp || Date.now();
      const matchesDate = recordDate >= cutoffDate;
      const matchesModel = !model || (r.model && r.model.toLowerCase().includes(model.toLowerCase()));
      return matchesDate && matchesModel;
    });

    const totals = {
      totalCalls: filteredRecords.length,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheCreationTokens: 0,
      totalCost: 0,
      byModel: {}
    };

    filteredRecords.forEach(record => {
      totals.totalInputTokens += record.inputTokens || 0;
      totals.totalOutputTokens += record.outputTokens || 0;
      totals.totalCost += record.cost || 0;

      const modelName = record.model || 'unknown';
      if (!totals.byModel[modelName]) {
        totals.byModel[modelName] = {
          calls: 0,
          tokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          cost: 0
        };
      }

      totals.byModel[modelName].calls++;
      totals.byModel[modelName].inputTokens += record.inputTokens || 0;
      totals.byModel[modelName].outputTokens += record.outputTokens || 0;
      totals.byModel[modelName].tokens += (record.inputTokens || 0) + (record.outputTokens || 0);
      totals.byModel[modelName].cost += record.cost || 0;
    });

    return totals;
  }

  /**
   * 获取空统计
   */
  getEmptyStats() {
    return {
      totalCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheCreationTokens: 0,
      totalCost: 0,
      byModel: {}
    };
  }

  /**
   * 获取数据源信息
   */
  getDataSourceInfo() {
    const info = {
      primary: this.primarySource,
      primaryLabel: this.primarySource ? this.sources[this.primarySource].label : null,
      recordCount: this.primarySource ? this.sources[this.primarySource].recordCount : 0,
      sources: this.sources
    };

    return info;
  }

  /**
   * 检查是否有任何数据源
   */
  hasAnyDataSource() {
    return this.primarySource !== null;
  }
}

module.exports = DataManager;

