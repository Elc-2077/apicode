/**
 * 实时监控模块 - 定期检查数据源更新
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');

class RealtimeMonitor extends EventEmitter {
  constructor(options = {}) {
    super();

    // 监控间隔（默认5分钟 = 300000ms）
    this.interval = options.interval || 300000;

    // 数据源路径
    this.sources = {
      ccswitch: path.join(os.homedir(), '.cc-switch', 'cc-switch.db'),
      ownProxy: path.join(os.homedir(), '.api-usage-tracker', 'apistat.db'),
      localRecords: path.join(os.homedir(), '.api-usage-tracker', 'records.json')
    };

    // 上次检查的文件状态
    this.lastStats = {
      ccswitch: null,
      ownProxy: null,
      localRecords: null
    };

    // 监控定时器
    this.timer = null;

    // 是否正在运行
    this.running = false;

    // 统计信息
    this.stats = {
      ccswitch: { available: false, lastUpdate: null, recordCount: 0, size: 0 },
      ownProxy: { available: false, lastUpdate: null, recordCount: 0, size: 0 },
      localRecords: { available: false, lastUpdate: null, recordCount: 0, size: 0 }
    };
  }

  /**
   * 启动监控
   */
  start() {
    if (this.running) {
      return;
    }

    this.running = true;

    // 立即执行一次检查
    this.check();

    // 启动定时器
    this.timer = setInterval(() => {
      this.check();
    }, this.interval);

    this.emit('started');
  }

  /**
   * 停止监控
   */
  stop() {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.emit('stopped');
  }

  /**
   * 检查所有数据源
   */
  check() {
    const changes = {
      ccswitch: false,
      ownProxy: false,
      localRecords: false
    };

    // 检查 ccswitch 数据库
    if (fs.existsSync(this.sources.ccswitch)) {
      const stats = fs.statSync(this.sources.ccswitch);
      const currentMtime = stats.mtime.getTime();
      const currentSize = stats.size;

      if (!this.lastStats.ccswitch ||
          this.lastStats.ccswitch.mtime !== currentMtime ||
          this.lastStats.ccswitch.size !== currentSize) {
        changes.ccswitch = true;
        this.lastStats.ccswitch = { mtime: currentMtime, size: currentSize };

        this.stats.ccswitch = {
          available: true,
          lastUpdate: new Date(),
          size: currentSize,
          recordCount: this.estimateRecordCount(currentSize)
        };
      }
    } else {
      this.stats.ccswitch.available = false;
    }

    // 检查 apistat 代理数据库
    if (fs.existsSync(this.sources.ownProxy)) {
      const stats = fs.statSync(this.sources.ownProxy);
      const currentMtime = stats.mtime.getTime();
      const currentSize = stats.size;

      if (!this.lastStats.ownProxy ||
          this.lastStats.ownProxy.mtime !== currentMtime ||
          this.lastStats.ownProxy.size !== currentSize) {
        changes.ownProxy = true;
        this.lastStats.ownProxy = { mtime: currentMtime, size: currentSize };

        this.stats.ownProxy = {
          available: true,
          lastUpdate: new Date(),
          size: currentSize,
          recordCount: this.estimateRecordCount(currentSize)
        };
      }
    } else {
      this.stats.ownProxy.available = false;
    }

    // 检查本地记录文件
    if (fs.existsSync(this.sources.localRecords)) {
      const stats = fs.statSync(this.sources.localRecords);
      const currentMtime = stats.mtime.getTime();
      const currentSize = stats.size;

      if (!this.lastStats.localRecords ||
          this.lastStats.localRecords.mtime !== currentMtime ||
          this.lastStats.localRecords.size !== currentSize) {
        changes.localRecords = true;
        this.lastStats.localRecords = { mtime: currentMtime, size: currentSize };

        try {
          const content = fs.readFileSync(this.sources.localRecords, 'utf8');
          const records = JSON.parse(content);

          this.stats.localRecords = {
            available: true,
            lastUpdate: new Date(),
            size: currentSize,
            recordCount: records.length
          };
        } catch (err) {
          this.stats.localRecords.available = false;
        }
      }
    } else {
      this.stats.localRecords.available = false;
    }

    // 触发检查完成事件
    this.emit('checked', { changes, stats: this.stats });

    // 如果有变化，触发更新事件
    if (changes.ccswitch || changes.ownProxy || changes.localRecords) {
      this.emit('updated', { changes, stats: this.stats });
    }
  }

  /**
   * 估算记录数量（基于文件大小）
   * SQLite 数据库大约每条记录 1KB
   */
  estimateRecordCount(fileSize) {
    return Math.floor(fileSize / 1024);
  }

  /**
   * 获取当前统计信息
   */
  getStats() {
    return this.stats;
  }

  /**
   * 格式化时间差
   */
  formatTimeDiff(date) {
    if (!date) return '从未';

    const now = new Date();
    const diff = now - date;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}天前`;
    if (hours > 0) return `${hours}小时前`;
    if (minutes > 0) return `${minutes}分钟前`;
    return '刚刚';
  }

  /**
   * 格式化文件大小
   */
  formatSize(bytes) {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = RealtimeMonitor;
