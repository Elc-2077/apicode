const fs = require('fs');
const path = require('path');
const os = require('os');
const dayjs = require('dayjs');

// 数据存储路径
const DATA_DIR = path.join(os.homedir(), '.api-usage-tracker');
const DATA_FILE = path.join(DATA_DIR, 'records.json');

// 确保数据目录存在
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// 读取所有记录
function loadRecords() {
  ensureDataDir();

  if (!fs.existsSync(DATA_FILE)) {
    return [];
  }

  try {
    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading data file:', error.message);
    return [];
  }
}

// 保存记录
function saveRecords(records) {
  ensureDataDir();

  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2), 'utf-8');
  } catch (error) {
    throw new Error(`Failed to save records: ${error.message}`);
  }
}

// 添加新记录
function addRecord({ platform, model, inputTokens, outputTokens, cost, note, apiName }) {
  const records = loadRecords();

  const record = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    platform: platform.toLowerCase(),
    model: model.toLowerCase(),
    inputTokens: inputTokens || 0,
    outputTokens: outputTokens || 0,
    cost: cost || 0,
    note: note || '',
    apiName: apiName || undefined
  };

  records.push(record);
  saveRecords(records);

  return record;
}

// 获取统计数据
function getStats(options = {}) {
  let records = loadRecords();

  // 过滤平台
  if (options.platform) {
    records = records.filter(r => r.platform === options.platform.toLowerCase());
  }

  // 过滤模型
  if (options.model) {
    records = records.filter(r => r.model === options.model.toLowerCase());
  }

  // 过滤日期范围
  if (options.days) {
    const cutoffDate = dayjs().subtract(options.days, 'day');
    records = records.filter(r => dayjs(r.timestamp).isAfter(cutoffDate));
  }

  if (options.from) {
    records = records.filter(r => dayjs(r.timestamp).isAfter(dayjs(options.from)));
  }

  if (options.to) {
    records = records.filter(r => dayjs(r.timestamp).isBefore(dayjs(options.to).add(1, 'day')));
  }

  // 计算统计
  const stats = {
    totalCalls: records.length,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCost: 0,
    byPlatform: {},
    byModel: {},
    records: records
  };

  records.forEach(record => {
    stats.totalInputTokens += record.inputTokens;
    stats.totalOutputTokens += record.outputTokens;
    stats.totalCost += record.cost;

    // 按平台统计
    if (!stats.byPlatform[record.platform]) {
      stats.byPlatform[record.platform] = {
        calls: 0,
        tokens: 0,
        cost: 0
      };
    }
    stats.byPlatform[record.platform].calls++;
    stats.byPlatform[record.platform].tokens += record.inputTokens + record.outputTokens;
    stats.byPlatform[record.platform].cost += record.cost;

    // 按模型统计
    if (!stats.byModel[record.model]) {
      stats.byModel[record.model] = {
        calls: 0,
        tokens: 0,
        cost: 0
      };
    }
    stats.byModel[record.model].calls++;
    stats.byModel[record.model].tokens += record.inputTokens + record.outputTokens;
    stats.byModel[record.model].cost += record.cost;
  });

  return stats;
}

// 列出记录
function listRecords(options = {}) {
  let records = loadRecords();

  // 过滤
  if (options.platform) {
    records = records.filter(r => r.platform === options.platform.toLowerCase());
  }

  if (options.model) {
    records = records.filter(r => r.model === options.model.toLowerCase());
  }

  // 排序（最新的在前）
  records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // 限制数量
  if (options.limit) {
    records = records.slice(0, options.limit);
  }

  return records;
}

// 导出数据
function exportData(format = 'json', outputPath) {
  const records = loadRecords();

  if (!outputPath) {
    outputPath = path.join(process.cwd(), `api-usage-export-${Date.now()}.${format}`);
  }

  if (format === 'json') {
    fs.writeFileSync(outputPath, JSON.stringify(records, null, 2), 'utf-8');
  } else if (format === 'csv') {
    // CSV 格式
    const headers = ['ID', 'Timestamp', 'Platform', 'Model', 'Input Tokens', 'Output Tokens', 'Cost', 'Note'];
    const rows = records.map(r => [
      r.id,
      r.timestamp,
      r.platform,
      r.model,
      r.inputTokens,
      r.outputTokens,
      r.cost,
      r.note || ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    fs.writeFileSync(outputPath, csv, 'utf-8');
  } else {
    throw new Error(`Unsupported format: ${format}`);
  }

  return outputPath;
}

// 重置所有数据
function resetData() {
  ensureDataDir();

  if (fs.existsSync(DATA_FILE)) {
    fs.unlinkSync(DATA_FILE);
  }
}

module.exports = {
  addRecord,
  getStats,
  listRecords,
  exportData,
  resetData,
  loadRecords
};
