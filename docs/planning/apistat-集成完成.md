# apistat 集成指南 - 让它像 ccswitch 一样自动记录数据

## 问题解决了！

之前 apistat 的"使用情况"和"缓存命中率"显示不了数据，因为：
1. ❌ 只尝试从远程 API 查询（经常超时失败）
2. ❌ 没有使用本地 records.json 的数据

## 已完成的修改

### 1. 修改了 CLI 显示逻辑
- ✅ "使用情况"标签现在**优先显示本地记录**
- ✅ "缓存命中率"标签现在**基于本地记录估算**
- ✅ 只有本地没数据时才查询远程 API

### 2. 添加了自动追踪功能
创建了 `src/interceptor.js`，提供 4 种方式自动记录 API 调用：
- `wrapOpenAI()` - OpenAI SDK 拦截器
- `wrapAnthropic()` - Anthropic SDK 拦截器
- `setupAxiosInterceptor()` - Axios 拦截器
- `track()` - 手动记录

### 3. 导出了编程接口
创建了 `index.js`，可以在你的代码中直接引入 apistat：

```javascript
const { track, getStats, wrapOpenAI } = require('apistat');
```

## 现在如何使用

### 方式一：查看现有数据（已有 8 条记录）

直接运行：
```bash
apistat
```

然后按 **数字键 3** 查看使用情况，按 **数字键 4** 查看缓存命中率。

### 方式二：在你的项目中集成自动追踪

#### 示例 1: OpenAI 项目

```javascript
const { OpenAI } = require('openai');
const { wrapOpenAI } = require('~/AppData/Roaming/npm/node_modules/apistat');

const openai = new OpenAI({ apiKey: 'your-key' });

// 启用自动追踪
wrapOpenAI(openai, { apiName: '我的项目', platform: 'openai' });

// 之后所有调用都会自动记录
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});
// ✅ 自动记录了！
```

#### 示例 2: 手动记录（最简单）

```javascript
const { track } = require('~/AppData/Roaming/npm/node_modules/apistat');

// 每次调用 API 后手动记录
const response = await callYourAPI();

track({
  platform: 'openai',
  model: 'gpt-4',
  inputTokens: response.usage.prompt_tokens,
  outputTokens: response.usage.completion_tokens,
  cost: calculateCost(response.usage),
  note: '描述',
  apiName: '项目名'
});
```

#### 示例 3: 定时批量导入（推荐）

创建一个脚本定期运行：

```javascript
// import-from-logs.js
const { track } = require('apistat');
const fs = require('fs');

// 从你的日志或数据库读取 API 调用记录
const logs = JSON.parse(fs.readFileSync('./api-logs.json'));

logs.forEach(log => {
  track({
    platform: log.platform,
    model: log.model,
    inputTokens: log.inputTokens,
    outputTokens: log.outputTokens,
    cost: log.cost,
    note: log.note
  });
});

console.log(`导入了 ${logs.length} 条记录`);
```

## 与 ccswitch 的对比

| 特性 | ccswitch | apistat |
|-----|----------|---------|
| 工作方式 | 代理服务器，拦截所有流量 | 集成到代码，主动记录 |
| 自动化程度 | 全自动 | 需要集成代码 |
| 数据完整性 | 捕获所有经过的请求 | 只记录你主动追踪的 |
| 隐私 | 可能拦截敏感数据 | 完全本地控制 |
| 适用场景 | 调试、监控所有工具 | 特定项目的精确统计 |
| 可视化 | ✅ 桌面 GUI | ✅ 终端 TUI |
| 本地数据 | ✅ SQLite 数据库 | ✅ JSON 文件 |

## 测试文件

- `~/Desktop/test-apistat.js` - 测试脚本（已运行，添加了 5 条新记录）
- `~/Desktop/APISTAT-USAGE.md` - 详细使用文档

## 当前状态

✅ 你的 apistat 现在有 **8 条使用记录**：
- 3 条来自之前的测试数据
- 5 条来自刚才运行的测试脚本

运行 `apistat` 就能看到：
- 📊 柱状图显示各模型使用量
- 💰 总成本 $0.7623
- 🎯 缓存命中率估算
- 📈 按平台/模型的详细统计

## 下一步

选择一种方式集成到你的实际项目中：
1. 如果用 OpenAI SDK → 使用 `wrapOpenAI()`
2. 如果用 Anthropic SDK → 使用 `wrapAnthropic()`
3. 如果用 axios → 使用 `setupAxiosInterceptor()`
4. 如果以上都不是 → 使用 `track()` 手动记录

每次记录后，运行 `apistat` 就能看到最新的统计！
