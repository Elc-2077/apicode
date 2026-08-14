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
    // 1. 获取模型列表
    const modelsResponse = await axios.get(`${baseUrl}/v1/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    const models = modelsResponse.data.data || [];

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

    const balance = await tryMultipleEndpoints(baseUrl, apiKey, balanceEndpoints);

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

    let usage = await tryMultipleEndpoints(baseUrl, apiKey, usageEndpoints, dateParams);

    // 4. 如果带参数查询失败，尝试不带参数
    if (!usage) {
      usage = await tryMultipleEndpoints(baseUrl, apiKey, usageEndpoints);
    }

    // 5. 尝试获取信用额度信息
    if (!usage) {
      const creditEndpoints = [
        '/v1/dashboard/billing/credit_grants',
        '/dashboard/billing/credit_grants',
        '/v1/credits',
        '/credits'
      ];

      const credits = await tryMultipleEndpoints(baseUrl, apiKey, creditEndpoints);
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

    stats = await tryMultipleEndpoints(baseUrl, apiKey, statsEndpoints);

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
  queryAnthropic
};
