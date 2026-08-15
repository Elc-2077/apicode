# APICODE REPL 模式实现计划

## 目标
将现有的 apicode-core（监控工具）改造为类似 Claude Code 的 REPL 对话 CLI，用户输入问题后 AI 回答，底部实时显示 token 统计。

## 现有架构分析

### 已有的优势
1. **完善的 token 追踪系统** (`src/tracker.js`)
   - 本地记录存储（`~/.api-usage-tracker/records.json`）
   - 支持按平台、模型、时间范围统计
   - 可计算成本、输入/输出 token 分离

2. **多 API 服务支持** (`src/api.js`)
   - OpenAI 兼容 API（DeepSeek、国内中转等）
   - Anthropic Claude API
   - 自动探测余额、使用量、模型列表

3. **配置管理** (`src/config.js`)
   - 多站点管理
   - API Key 存储

4. **终端 UI 基础** (`bin/cli.js`)
   - 使用 `terminal-kit` 库
   - 已有标签导航、鼠标支持

### 现有问题
- **当前是监控工具**，只查询和展示已有数据
- **没有对话功能**，不能发送消息给 AI
- **UI 是全屏仪表盘**，不是 REPL 交互模式

## 设计方案

### 架构设计

```
┌─────────────────────────────────────────────────────┐
│  APICODE REPL CLI                                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [对话历史滚动区域]                                  │
│  User: 你好                                          │
│  Assistant: 你好！有什么可以帮助你的吗？              │
│  User: 解释一下快速排序                              │
│  Assistant: 快速排序是...                            │
│                                                     │
├─────────────────────────────────────────────────────┤
│  > 你的输入：_                                       │
├─────────────────────────────────────────────────────┤
│  📊 本次会话: 1,234 tokens ($0.0037) │ 总计: 45.6K tokens ($0.1368)  │
│  📈 模型: gpt-4o │ 输入: 834 │ 输出: 400 │ 缓存命中: 25%           │
└─────────────────────────────────────────────────────┘
```

### 核心模块

#### 1. **REPL 引擎** (新建 `src/repl-engine.js`)
- 管理对话历史
- 处理用户输入
- 调用 AI API
- 实时更新 token 统计

#### 2. **AI 客户端** (新建 `src/ai-client.js`)
- 统一的 AI API 调用接口
- 支持 OpenAI、Anthropic、DeepSeek 等
- 流式响应处理
- 自动提取 token 使用量

#### 3. **统计追踪器** (扩展现有 `src/tracker.js`)
- 会话级别统计（当前对话）
- 全局统计（所有历史）
- 实时更新

#### 4. **UI 渲染器** (新建 `src/repl-ui.js`)
- 对话历史渲染
- 底部状态栏
- 输入框
- 实时刷新

#### 5. **启动入口** (修改 `bin/cli.js`)
- 启动流程：选择 API → 进入 REPL
- 命令解析：`apicode` (REPL模式) vs `apicode serve` (代理模式)

### 技术选型

#### UI 库保持 terminal-kit
- 已经在用，功能强大
- 支持光标控制、颜色、鼠标事件
- 适合构建复杂终端界面

#### AI API 调用
- **OpenAI SDK** (`openai` npm包) - 官方支持，兼容性好
- **Anthropic SDK** (`@anthropic-ai/sdk`) - 官方支持
- **流式响应** - 逐字显示，体验更好

#### 数据存储
- **会话历史** - 内存中保存当前会话（可选保存到文件）
- **Token 统计** - 复用现有 `tracker.js`，保存到 `~/.api-usage-tracker/`

### 实现步骤

#### Phase 1: 核心 REPL 功能 ✅
1. 创建 `src/ai-client.js` - AI 客户端封装
   - OpenAI 调用（含流式）
   - Anthropic 调用（含流式）
   - 统一接口
   
2. 创建 `src/repl-engine.js` - REPL 核心逻辑
   - 对话历史管理
   - 消息发送/接收
   - Token 统计集成

3. 创建 `src/repl-ui.js` - REPL UI
   - 对话区域渲染
   - 输入框
   - 底部状态栏
   - 滚动支持

#### Phase 2: 集成现有系统 ✅
4. 修改 `bin/cli.js` - 新增 REPL 模式
   - 保留原有监控模式（`apicode monitor`）
   - 新增 REPL 模式（`apicode` 或 `apicode chat`）
   - 启动时选择 API 配置

5. 扩展 `src/tracker.js` - 会话统计
   - 新增 `getCurrentSessionStats()` 方法
   - 新增 `resetSession()` 方法

#### Phase 3: 高级功能 ✅
6. 多模型切换
   - 对话中切换模型：`/model gpt-4o`
   - 显示当前模型

7. 会话管理
   - 保存会话：`/save <name>`
   - 加载会话：`/load <name>`
   - 清空会话：`/clear`

8. 完整统计看板
   - 按 `Ctrl+D` 进入统计模式
   - 显示详细图表（复用现有代码）
   - 按 `q` 返回对话

#### Phase 4: 优化与打磨 ✅
9. 性能优化
   - 大量对话时的滚动性能
   - 流式响应的渲染优化

10. 用户体验
    - 加载动画
    - 错误处理
    - 快捷键提示
    - 配色优化

### 文件结构

```
apicode-core/
├── bin/
│   └── cli.js              # 修改：支持 REPL 和 monitor 模式
├── src/
│   ├── ai-client.js        # 新建：AI API 客户端
│   ├── repl-engine.js      # 新建：REPL 核心逻辑
│   ├── repl-ui.js          # 新建：REPL UI 渲染
│   ├── tracker.js          # 扩展：会话统计
│   ├── api.js              # 保留：API 查询
│   ├── config.js           # 保留：配置管理
│   └── ... (其他现有文件)
├── package.json            # 更新：新增依赖
└── README.md               # 更新：新增 REPL 使用说明
```

### 依赖包更新

```json
{
  "dependencies": {
    "openai": "^4.20.0",           // 新增：OpenAI 官方 SDK
    "@anthropic-ai/sdk": "^0.10.0", // 新增：Anthropic 官方 SDK
    "terminal-kit": "^3.0.1",       // 保留
    "axios": "^1.6.0",              // 保留
    "dayjs": "^1.11.9",             // 保留
    // ... 其他现有依赖
  }
}
```

### 命令行接口

```bash
# REPL 对话模式（默认）
apicode
apicode chat

# 监控模式（原有功能）
apicode monitor

# 代理模式（原有功能）
apicode serve --port 8080

# 快速指定模型
apicode --model gpt-4o
apicode -m claude-3-5-sonnet

# 指定 API 配置
apicode --api my-api-config
```

### REPL 内置命令

```
/help          - 显示帮助
/model <name>  - 切换模型
/api           - 查看/切换 API 配置
/clear         - 清空当前会话
/save <name>   - 保存会话
/load <name>   - 加载会话
/stats         - 查看详细统计
/export        - 导出对话记录
/quit, /exit   - 退出
```

### 状态栏设计

#### 简洁模式（默认）
```
📊 会话: 1.2K tokens ($0.0036) │ 总计: 45.6K tokens ($0.1368)
```

#### 详细模式（可切换）
```
📊 本次: 1,234 tokens ($0.0037) │ 总计: 45,625 tokens ($0.1368)
📈 模型: gpt-4o │ 输入: 834 │ 输出: 400 │ 缓存: 156 (18.7%)
💰 费率: $3.00/1M in, $15.00/1M out │ 今日: $0.0856 │ 本月: $12.34
```

## 实现优先级

### P0 - 核心功能（必须有）
- [x] 基本 REPL 交互
- [x] OpenAI API 调用
- [x] 实时 token 统计
- [x] 对话历史显示
- [x] 底部状态栏

### P1 - 增强体验（很重要）
- [x] 流式响应
- [x] Anthropic API 支持
- [x] 多模型支持
- [x] 会话保存/加载
- [x] 错误处理

### P2 - 高级功能（锦上添花）
- [ ] 缓存命中率显示（如果 API 支持）
- [ ] 详细统计看板（复用现有代码）
- [ ] 会话导出
- [ ] 配色主题

## 风险与挑战

1. **终端 UI 复杂度**
   - 风险：滚动、输入框、实时更新可能冲突
   - 方案：参考成熟的终端 UI 库实现，分层渲染

2. **流式响应渲染**
   - 风险：逐字显示时的性能问题
   - 方案：批量更新（每 50ms 刷新一次）

3. **不同 API 的差异**
   - 风险：OpenAI、Anthropic 返回格式不同
   - 方案：统一的客户端接口抽象

4. **Token 统计准确性**
   - 风险：某些 API 不返回 token 数
   - 方案：客户端估算（tiktoken 库）

## 时间估算

- Phase 1: 核心 REPL 功能 - 4-6 小时
- Phase 2: 集成现有系统 - 2-3 小时
- Phase 3: 高级功能 - 3-4 小时
- Phase 4: 优化与打磨 - 2-3 小时

**总计：11-16 小时**

## 成功标准

1. ✅ 用户可以输入问题，AI 流式回复
2. ✅ 底部实时显示 token 使用（会话 + 总计）
3. ✅ 支持 OpenAI 和 Anthropic API
4. ✅ 可以切换模型
5. ✅ 会话可以保存和加载
6. ✅ 原有监控功能不受影响
