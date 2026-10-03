const { addRecord } = require('./tracker');

/**
 * API 拦截器 - 自动记录 OpenAI 兼容 API 的使用情况
 */

// OpenAI SDK 拦截器
function wrapOpenAI(openai, options = {}) {
  const { apiName = 'OpenAI', platform = 'openai' } = options;

  // 保存原始的 create 方法
  const originalCreate = openai.chat.completions.create.bind(openai.chat.completions);

  // 替换为包装后的方法
  openai.chat.completions.create = async function(...args) {
    const startTime = Date.now();

    try {
      const response = await originalCreate(...args);

      // 记录使用情况
      if (response.usage) {
        addRecord({
          platform,
          model: response.model,
          inputTokens: response.usage.prompt_tokens || 0,
          outputTokens: response.usage.completion_tokens || 0,
          cost: 0, // 成本需要根据价格表计算
          note: `Auto-tracked from ${apiName}`,
          apiName
        });
      }

      return response;
    } catch (error) {
      // 即使出错也抛出，但不记录
      throw error;
    }
  };

  return openai;
}

// Anthropic SDK 拦截器
function wrapAnthropic(anthropic, options = {}) {
  const { apiName = 'Anthropic', platform = 'anthropic' } = options;

  // 保存原始的 create 方法
  const originalCreate = anthropic.messages.create.bind(anthropic.messages);

  // 替换为包装后的方法
  anthropic.messages.create = async function(...args) {
    const startTime = Date.now();

    try {
      const response = await originalCreate(...args);

      // 记录使用情况
      if (response.usage) {
        addRecord({
          platform,
          model: response.model,
          inputTokens: response.usage.input_tokens || 0,
          outputTokens: response.usage.output_tokens || 0,
          cost: 0, // 成本需要根据价格表计算
          note: `Auto-tracked from ${apiName}`,
          apiName
        });
      }

      return response;
    } catch (error) {
      throw error;
    }
  };

  return anthropic;
}

// 通用 fetch 拦截器（用于自定义 API 调用）
function createTrackedFetch(options = {}) {
  const { apiName = 'Custom API', platform = 'custom', extractUsage } = options;

  return async function trackedFetch(url, fetchOptions = {}) {
    const startTime = Date.now();

    try {
      const response = await fetch(url, fetchOptions);
      const data = await response.json();

      // 尝试提取使用情况
      let usage = null;

      if (extractUsage && typeof extractUsage === 'function') {
        // 使用自定义提取函数
        usage = extractUsage(data);
      } else if (data.usage) {
        // 标准格式
        usage = {
          model: data.model || 'unknown',
          inputTokens: data.usage.prompt_tokens || data.usage.input_tokens || 0,
          outputTokens: data.usage.completion_tokens || data.usage.output_tokens || 0
        };
      }

      // 记录
      if (usage) {
        addRecord({
          platform,
          model: usage.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cost: 0,
          note: `Auto-tracked from ${apiName}`,
          apiName
        });
      }

      return data;
    } catch (error) {
      throw error;
    }
  };
}

// Axios 拦截器
function setupAxiosInterceptor(axiosInstance, options = {}) {
  const { apiName = 'Custom API', platform = 'custom', extractUsage } = options;

  // 添加响应拦截器
  axiosInstance.interceptors.response.use(
    (response) => {
      // 尝试提取使用情况
      let usage = null;
      const data = response.data;

      if (extractUsage && typeof extractUsage === 'function') {
        usage = extractUsage(data);
      } else if (data && data.usage) {
        usage = {
          model: data.model || 'unknown',
          inputTokens: data.usage.prompt_tokens || data.usage.input_tokens || 0,
          outputTokens: data.usage.completion_tokens || data.usage.output_tokens || 0
        };
      }

      if (usage) {
        addRecord({
          platform,
          model: usage.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cost: 0,
          note: `Auto-tracked from ${apiName}`,
          apiName
        });
      }

      return response;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  return axiosInstance;
}

// 手动记录（用于无法自动拦截的场景）
function track(data) {
  const {
    platform = 'custom',
    model = 'unknown',
    inputTokens = 0,
    outputTokens = 0,
    cost = 0,
    note = '',
    apiName
  } = data;

  return addRecord({
    platform,
    model,
    inputTokens,
    outputTokens,
    cost,
    note,
    apiName
  });
}

module.exports = {
  wrapOpenAI,
  wrapAnthropic,
  createTrackedFetch,
  setupAxiosInterceptor,
  track
};
