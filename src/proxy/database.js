/**
 * 代理数据库管理（使用 sql.js - 纯 JS 实现）
 * 存储代理拦截的 API 请求记录
 */

const initSqlJs = require('sql.js');
const path = require('path');
const os = require('os');
const fs = require('fs');

class ProxyDatabase {
  constructor() {
    this.dbDir = path.join(os.homedir(), '.api-usage-tracker');
    if (!fs.existsSync(this.dbDir)) {
      fs.mkdirSync(this.dbDir, { recursive: true });
    }

    this.dbPath = path.join(this.dbDir, 'apistat.db');
    this.db = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    const SQL = await initSqlJs();

    // 检查数据库文件是否存在
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
      this.initDatabase();
    }

    this.initialized = true;
    console.log(`✅ 数据库初始化完成: ${this.dbPath}`);
  }

  initDatabase() {
    // 创建表结构（与 ccswitch 兼容）
    this.db.run(`
      CREATE TABLE IF NOT EXISTS proxy_request_logs (
        request_id TEXT PRIMARY KEY,
        model TEXT NOT NULL,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cache_read_tokens INTEGER DEFAULT 0,
        cache_creation_tokens INTEGER DEFAULT 0,
        total_cost_usd REAL DEFAULT 0,
        status_code INTEGER,
        duration_ms INTEGER,
        endpoint TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_created_at ON proxy_request_logs(created_at);`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_model ON proxy_request_logs(model);`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_status ON proxy_request_logs(status_code);`);

    this.save();
  }

  save() {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  async saveRecord(record) {
    if (!this.initialized) {
      await this.init();
    }

    try {
      this.db.run(
        `INSERT INTO proxy_request_logs (
          request_id, model, input_tokens, output_tokens,
          cache_read_tokens, cache_creation_tokens,
          total_cost_usd, status_code, duration_ms, endpoint, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.requestId,
          record.model,
          record.inputTokens,
          record.outputTokens,
          record.cacheReadTokens || 0,
          record.cacheCreationTokens || 0,
          record.totalCost,
          record.statusCode,
          record.duration,
          record.endpoint,
          Math.floor(record.timestamp / 1000)
        ]
      );

      this.save();
      return true;
    } catch (err) {
      console.error('保存记录失败:', err.message);
      return false;
    }
  }

  async getRecordCount() {
    if (!this.initialized) {
      await this.init();
    }

    try {
      const result = this.db.exec('SELECT COUNT(*) as count FROM proxy_request_logs');
      if (result.length > 0 && result[0].values.length > 0) {
        return result[0].values[0][0];
      }
      return 0;
    } catch (err) {
      return 0;
    }
  }

  close() {
    if (this.db) {
      this.save();
      this.db.close();
    }
  }
}

module.exports = ProxyDatabase;
