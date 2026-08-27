# apistat - API 使用情况自动追踪

## 快速开始

### 1. 安装
```bash
npm install -g apistat
```

### 2. 启动 CLI 查看统计
```bash
apistat
```

## 自动追踪 API 使用情况

### 方法一：使用 OpenAI SDK 拦截器

```javascript
const { OpenAI } = require('openai');
const { wrapOpenAI } = require('apistat');

// 创建 OpenAI 客户端
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 包装客户端，自动追踪所有请求
wrapOpenAI(openai, {
  apiName: '我的项目',
  platform: 'openai'
});

// 正常使用，自动记录
async function chat() {
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Hello!' }]
  });
  
  console.log(response.choices[0].message.content);
  // 使用情况已自动记录到 apistat！
}

chat();
```

### 方法二：使用 Anthropic SDK 拦截器

```javascript
const Anthropic = require('@anthropic-ai/sdk');
const { wrapAnthropic } = require('apistat');

// 创建 Anthropic 客户端
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// 包装客户端
wrapAnthropic(anthropic, {
  apiName: 'Claude项目',
  platform: 'anthropic'
});

// 正常使用，自动记录
async function chat() {
  const response = await anthropic.messages.create({
    model: 'claude-3-opus-20240229',
    max_tokens: 1024,
    messages: [{ role: 'user', content: 'Hello!' }]
  });
  
  console.log(response.content[0].text);
  // 使用情况已自动记录！
}

chat();
```

### 方法三：使用 Axios 拦截器（适用于自定义 API）

```javascript
const axios = require('axios');
const { setupAxiosInterceptor } = require('apistat');

// 创建 axios 实例
const api = axios.create({
  baseURL: 'https://api.deepseek.com',
  headers: {
    'Authorization': `Bearer ${process.env.API_KEY}`
  }
});

// 设置拦截器
setupAxiosInterceptor(api, {
  apiName: 'DeepSeek',
  platform: 'deepseek',
  extractUsage: (data) => ({
    model: data.model,
    inputTokens: data.usage.prompt_tokens,
    outputTokens: data.usage.completion_tokens
  })
});

// 正常使用
async function chat() {
  const response = await api.post('/v1/chat/completions', {
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: 'Hello!' }]
  });
  
  // 使用情况已自动记录！
  return response.data;
}

chat();
```

### 方法四：手动追踪

```javascript
const { track } = require('apistat');

// 在任何地方手动记录
track({
  platform: 'openai',
  model: 'gpt-4',
  inputTokens: 1500,
  outputTokens: 800,
  cost: 0.045,
  note: '翻译任务',
  apiName: '我的项目'
});
```

## 查看统计数据

运行 `apistat` 命令启动 CLI：

```bash
apistat
```

然后使用：
- **数字键 1-6** 或 **鼠标点击** 切换标签
- **数字键 3** - 查看使用情况（显示本地记录）
- **数字键 4** - 查看缓存命中率
- **r 键** - 刷新数据
- **q 键** - 退出

## 编程方式查询统计

```javascript
const { getStats } = require('apistat');

// 获取最近 30 天的统计
const stats = getStats({ days: 30 });

console.log('总调用次数:', stats.totalCalls);
console.log('总输入 Token:', stats.totalInputTokens);
console.log('总输出 Token:', stats.totalOutputTokens);
console.log('总成本:', stats.totalCost);

// 按平台统计
console.log('按平台:', stats.byPlatform);

// 按模型统计
console.log('按模型:', stats.byModel);
```

## 优势

相比手动记录，自动追踪的优势：

1. ✅ **零侵入** - 只需包装一次客户端，所有调用自动记录
2. ✅ **不会遗漏** - 每次 API 调用都会被追踪
3. ✅ **准确的 Token 统计** - 直接从 API 响应中获取真实数据
4. ✅ **可视化展示** - CLI 提供漂亮的柱状图和统计
5. ✅ **本地存储** - 数据保存在本地，隐私安全
