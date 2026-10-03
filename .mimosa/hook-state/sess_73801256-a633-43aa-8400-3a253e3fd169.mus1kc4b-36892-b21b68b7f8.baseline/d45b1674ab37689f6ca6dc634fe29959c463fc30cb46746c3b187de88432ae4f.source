const axios = require('axios');

// 通用查询函数 - 尝试多个端点
async function tryMultipleEndpoints(baseUrl, apiKey, endpoints, params = null) {
  for (const endpoint of endpoints) {
    try {
      const config = {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      };

      if (params) {
        config.params = params;
      }

      const response = await axios.get(`${baseUrl}${endpoint}`, config);

      // 检查是否返回HTML
      const contentType = response.headers['content-type'] || '';
      if (contentType.includes('text/html')) {
        continue;
      }

      // 检查是否是有效的JSON对象
      if (response.data && typeof response.data === 'object') {
        return response.data;
      }
    } catch (err) {
      continue;
    }
  }
  return null;
}

// 查询OpenAI兼容API的信息
async function queryOpenAICompatible(baseUrl, apiKey) {
  try {
    // 确保 baseUrl 格式正确
    let url = baseUrl.trim();
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }
    // 移除末尾的斜杠
    url = url.replace(/\/$/, '');

    // 1. 获取模型列表
    const modelsUrl = url.includes('/v1') ? `${url}/models` : `${url}/v1/models`;

    const modelsResponse = await axios.get(modelsUrl, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    const models = modelsResponse.data.data || modelsResponse.data.models || [];

    // 2. 查询余额 - 尝试多个端点
    const balanceEndpoints = [
      '/user/balance',                          // DeepSeek
      '/v1/dashboard/billing/subscription',     // OpenAI官方
      '/dashboard/billing/subscription',
      '/v1/me',                                 // 用户信息
      '/me',
      '/v1/account',                            // 账户信息
      '/account',
      '/v1/balance',
      '/balance'
    ];

    const balance = await tryMultipleEndpoints(url, apiKey, balanceEndpoints);

    // 3. 查询使用量 - 带日期参数
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const dateParams = {
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0]
    };

    const usageEndpoints = [
      '/v1/dashboard/billing/usage',
      '/dashboard/billing/usage',
      '/v1/usage',
      '/usage',
      '/v1/organization/usage',
      '/organization/usage',
      '/v1/me/usage',
      '/me/usage',
      '/v1/account/usage',
      '/account/usage'
    ];

    let usage = await tryMultipleEndpoints(url, apiKey, usageEndpoints, dateParams);

    // 4. 如果带参数查询失败，尝试不带参数
    if (!usage) {
      usage = await tryMultipleEndpoints(url, apiKey, usageEndpoints);
    }

    // 5. 尝试获取信用额度信息
    if (!usage) {
      const creditEndpoints = [
        '/v1/dashboard/billing/credit_grants',
        '/dashboard/billing/credit_grants',
        '/v1/credits',
        '/credits'
      ];

      const credits = await tryMultipleEndpoints(url, apiKey, creditEndpoints);
      if (credits) {
        usage = { credit_grants: credits };
      }
    }

    // 6. 尝试获取统计信息
    let stats = null;
    const statsEndpoints = [
      '/v1/statistics',
      '/statistics',
      '/v1/stats',
      '/stats'
    ];

    stats = await tryMultipleEndpoints(url, apiKey, statsEndpoints);

    return {
      status: 'ok',
      models: models.map(m => ({
        id: m.id,
        owned_by: m.owned_by,
        created: m.created,
        pricing: m.pricing
      })),
      balance,
      usage,
      stats
    };
  } catch (error) {
    if (error.response) {
      return {
        status: 'error',
        error: `API returned ${error.response.status}: ${error.response.statusText}`,
        details: error.response.data
      };
    } else if (error.code === 'ECONNABORTED') {
      return {
        status: 'error',
        error: 'Request timeout'
      };
    } else {
      return {
        status: 'error',
        error: error.message
      };
    }
  }
}

// 查询Anthropic API信息
async function queryAnthropic(baseUrl, apiKey) {
  try {
    // Anthropic没有公开的余额查询接口，我们只测试连接性
    // 可以发送一个最小的请求
    const response = await axios.post(
      `${baseUrl}/v1/messages`,
      {
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }]
      },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    return {
      status: 'ok',
      message: 'Connection successful',
      models: [
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
        'claude-3-5-sonnet-20240620'
      ]
    };
  } catch (error) {
    if (error.response) {
      return {
        status: 'error',
        error: `API returned ${error.response.status}: ${error.response.statusText}`,
        details: error.response.data
      };
    } else {
      return {
        status: 'error',
        error: error.message
      };
    }
  }
}

// 规范化 baseUrl
function normalizeUrl(baseUrl) {
  let url = (baseUrl || '').trim();
  if (!url.startsWith('http')) {
    url = 'https://' + url;
  }
  return url.replace(/\/$/, '');
}

// ============================================================
//  与 AURE 一致的检测逻辑
//  核心：只认 GET /models 真列出来的名字＝「该站点可用模型」，
//  Key/站点校验也只看 /models 能否 2xx，不逐个实调模型。
//  （照搬 AURE bot.py _resolve_*_model / server.py _check_api_key
//    / ui_bundle.json checkApiKey 的做法）
// ============================================================

// 从返回体里抽出模型名数组（兼容 {data:[]} / {models:[]} / 顶层数组，元素可为字符串或对象）
function extractModelNames(data) {
  const pick = m => {
    if (typeof m === 'string') return m;
    if (!m || typeof m !== 'object') return null;
    return m.id || m.model || m.name || null;
  };
  let arr = null;
  if (data && Array.isArray(data.data)) arr = data.data;
  else if (data && Array.isArray(data.models)) arr = data.models;
  else if (Array.isArray(data)) arr = data;
  if (!arr) return [];
  return arr.map(pick).filter(Boolean);
}

// 生成 /models 候选地址（base 已含 /v1 就直接 base+/models，否则优先 /v1/models 再兜底 /models）
function modelsEndpoints(url) {
  const list = /\/v1$/.test(url)
    ? [`${url}/models`]
    : [`${url}/v1/models`, `${url}/models`];
  return [...new Set(list)];
}

// 把状态码/网络错误转成可读原因
function modelsFailReason(status, data, netErr) {
  if (netErr) {
    if (netErr.code === 'ECONNABORTED') return '请求超时（网络慢或该站点在本地网络下不可达）';
    if (netErr.code === 'ENOTFOUND') return '域名无法解析（baseUrl 是否写错？）';
    if (netErr.code === 'ECONNREFUSED') return '连接被拒绝';
    if (/certificate|self signed|CERT_/i.test(netErr.message || '')) return 'TLS 证书错误';
    return netErr.message || '网络错误';
  }
  const map = { 401: 'API Key 无效/无权限', 403: '禁止访问（Key 无权限或被风控）', 404: '该站点没有 /models 接口', 429: '限流/配额用尽', 500: '服务端错误', 502: '网关错误', 503: '服务不可用' };
  let msg = '';
  if (data && typeof data === 'object') {
    msg = (data.error && (data.error.message || data.error)) || data.message || '';
    if (typeof msg === 'object') msg = JSON.stringify(msg);
  } else if (typeof data === 'string' && /<!doctype|<html/i.test(data)) {
    msg = '返回的是网页而不是 JSON（baseUrl 可能少了 /v1 或不是 API 根地址）';
  }
  const base = map[status] || `HTTP ${status}`;
  return msg ? `${base}: ${String(msg).slice(0, 140)}` : base;
}

// 拉站点模型列表（带失败原因）：GET {base}/models（OpenAI 兼容），和 AURE 一样只信这份列表
// 返回 { models: string[], error: string|null, status: number|null, endpoint: string|null }
async function fetchSiteModels(baseUrl, apiKey) {
  const url = normalizeUrl(baseUrl);
  let lastReason = '未知错误';
  let lastStatus = null;
  for (const endpoint of modelsEndpoints(url)) {
    try {
      const resp = await axios.get(endpoint, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'x-api-key': apiKey,          // 有的中转站认这个
          'Content-Type': 'application/json'
        },
        timeout: 15000,                 // 公式 API/慢网络留足时间
        validateStatus: () => true
      });
      lastStatus = resp.status;
      if (resp.status >= 200 && resp.status < 300) {
        const names = extractModelNames(resp.data);
        if (names.length) return { models: names, error: null, status: resp.status, endpoint };
        // 2xx 但列表为空：可能这条路径不对，记录后试下一条
        lastReason = '接口返回成功但模型列表为空';
      } else {
        lastReason = modelsFailReason(resp.status, resp.data, null);
      }
    } catch (e) {
      lastReason = modelsFailReason(null, null, e);
    }
  }
  return { models: [], error: lastReason, status: lastStatus, endpoint: null };
}

// 拉站点模型列表：只要名字数组（拉不到返回 []）—— 兼容旧调用
async function listSiteModels(baseUrl, apiKey) {
  const { models } = await fetchSiteModels(baseUrl, apiKey);
  return models;
}

// 校验 Key/站点能否调通：GET /models 拿到 2xx 就算能用（和 AURE checkApiKey / _check_api_key 一致）
async function checkApiKey(baseUrl, apiKey) {
  if (!apiKey) return false;
  const url = normalizeUrl(baseUrl);
  for (const endpoint of modelsEndpoints(url)) {
    try {
      const resp = await axios.get(endpoint, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'x-api-key': apiKey },
        timeout: 8000,
        validateStatus: () => true
      });
      if (resp.status >= 200 && resp.status < 300) return true;
    } catch (e) {
      // 换下一个候选地址
    }
  }
  return false;
}

// —— 名字规则（照搬 AURE bot.py 的 _CHEAP_RE / _CHEAP_BAD）——
const CHEAP_RE = /turbo|flash|mini|lite|haiku|small|air|speed|8b|7b|4b|3b/i;
const CHEAP_BAD = /vl|vision|audio|omni|tts|asr|embed|rerank|ocr|image|video|thinking|reason|search|coder|math|realtime/i;

// 取模型名的「家族」前缀（连续小写字母），如 gpt / claude / deepseek / qwen
function modelFamily(model) {
  const m = /^[a-z]+/.exec((model || '').toLowerCase());
  return m ? m[0] : '';
}

// 从一批模型名里挑「便宜档」（和 AURE _resolve_cheap_model 同规则）：
// 命中 CHEAP_RE 且不命中 CHEAP_BAD；同家族优先、名字短优先；挑不到或就是原模型则返回 ''（＝不换）
function resolveCheapModel(models, userModel) {
  const fam = modelFamily(userModel);
  const cands = (models || []).filter(n => CHEAP_RE.test(n) && !CHEAP_BAD.test(n));
  cands.sort((a, b) => {
    const fa = modelFamily(a) === fam ? 0 : 1;
    const fb = modelFamily(b) === fam ? 0 : 1;
    if (fa !== fb) return fa - fb;   // 同家族优先
    return a.length - b.length;      // 再挑名字最短的（别钉在带日期的快照版上）
  });
  if (cands.length && cands[0] !== (userModel || '').trim()) return cands[0];
  return '';
}

// 核对/挑选「会看图」的模型名（和 AURE _resolve_vision_model 同规则）：
// want 在列表里就用 want；否则挑一个带 vl（排除 ocr/embed）的、名字最长的；挑不到返回 want
function resolveVisionModel(models, want) {
  const names = models || [];
  if (names.includes(want)) return want;
  const cands = names.filter(n => /vl/i.test(n) && !/ocr|embed/i.test(n));
  if (cands.length) return cands.slice().sort((a, b) => b.length - a.length)[0];
  return want;
}

// 主查询函数
async function queryApi(api) {
  const { baseUrl, apiKey, type } = api;

  switch (type) {
    case 'anthropic':
      return await queryAnthropic(baseUrl, apiKey);
    case 'openai':
    case 'custom':
    default:
      return await queryOpenAICompatible(baseUrl, apiKey);
  }
}

// 测试API连接
async function testConnection(baseUrl, apiKey, type = 'openai') {
  try {
    const result = await queryApi({ baseUrl, apiKey, type });
    return result;
  } catch (error) {
    return {
      status: 'error',
      error: error.message
    };
  }
}

module.exports = {
  queryApi,
  testConnection,
  queryOpenAICompatible,
  queryAnthropic,
  normalizeUrl,
  // 与 AURE 一致的检测逻辑
  fetchSiteModels,
  listSiteModels,
  checkApiKey,
  resolveCheapModel,
  resolveVisionModel,
  modelFamily
};
