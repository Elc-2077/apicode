/**
 * apistat - API Usage Tracker
 *
 * 自动追踪和统计 AI API 使用情况
 */

const { addRecord, getStats, listRecords, exportData, resetData, loadRecords } = require('./src/tracker');
const { wrapOpenAI, wrapAnthropic, createTrackedFetch, setupAxiosInterceptor, track } = require('./src/interceptor');
const { listApis, addApi, getApi, removeApi, updateApi } = require('./src/config');

module.exports = {
  // 拦截器 - 用于自动追踪
  wrapOpenAI,
  wrapAnthropic,
  createTrackedFetch,
  setupAxiosInterceptor,

  // 手动追踪
  track,
  addRecord,

  // 统计查询
  getStats,
  listRecords,
  loadRecords,

  // 数据导出
  exportData,
  resetData,

  // API 配置管理
  listApis,
  addApi,
  getApi,
  removeApi,
  updateApi
};
