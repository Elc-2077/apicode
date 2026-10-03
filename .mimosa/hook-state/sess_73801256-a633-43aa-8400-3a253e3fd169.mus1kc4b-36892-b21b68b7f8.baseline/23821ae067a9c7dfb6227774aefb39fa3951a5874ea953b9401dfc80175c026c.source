const fs = require('fs');
const path = require('path');
const os = require('os');

// 配置文件路径
const CONFIG_DIR = path.join(os.homedir(), '.api-usage-tracker');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// 确保配置目录存在
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

// 读取配置
function loadConfig() {
  ensureConfigDir();

  if (!fs.existsSync(CONFIG_FILE)) {
    return { apis: [] };
  }

  try {
    const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading config file:', error.message);
    return { apis: [] };
  }
}

// 保存配置
function saveConfig(config) {
  ensureConfigDir();

  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    throw new Error(`Failed to save config: ${error.message}`);
  }
}

// 添加API配置
function addApi({ name, baseUrl, apiKey, type = 'openai', group }) {
  const config = loadConfig();

  // 检查是否已存在
  const existing = config.apis.find(api => api.name === name);
  if (existing) {
    throw new Error(`API "${name}" already exists`);
  }

  const api = {
    id: Date.now().toString(),
    name,
    baseUrl: baseUrl.replace(/\/$/, ''), // 移除末尾斜杠
    apiKey,
    type, // openai, anthropic, custom
    group: group || undefined, // 分组（可选）
    createdAt: new Date().toISOString()
  };

  config.apis.push(api);
  saveConfig(config);

  return api;
}

// 列出所有API
function listApis() {
  const config = loadConfig();
  return config.apis;
}

// 获取单个API
function getApi(name) {
  const config = loadConfig();
  const api = config.apis.find(a => a.name === name);

  if (!api) {
    throw new Error(`API "${name}" not found`);
  }

  return api;
}

// 删除API
function removeApi(name) {
  const config = loadConfig();
  const index = config.apis.findIndex(a => a.name === name);

  if (index === -1) {
    throw new Error(`API "${name}" not found`);
  }

  config.apis.splice(index, 1);
  saveConfig(config);
}

// 更新API
function updateApi(name, updates) {
  const config = loadConfig();
  const api = config.apis.find(a => a.name === name);

  if (!api) {
    throw new Error(`API "${name}" not found`);
  }

  Object.assign(api, updates);
  saveConfig(config);

  return api;
}

module.exports = {
  loadConfig,
  saveConfig,
  addApi,
  listApis,
  getApi,
  removeApi,
  updateApi
};
