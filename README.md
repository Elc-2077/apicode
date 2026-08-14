# apistat

> 智能 API 使用统计工具 - 支持 ccswitch 集成、代理服务器、实时监控

[![npm version](https://img.shields.io/npm/v/apistat.svg)](https://www.npmjs.com/package/apistat)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ 特点

- 🎨 **智能登录界面** - 三种数据源选择（ccswitch / 代理 / 远程站点）
- 🔄 **实时监控** - 每 5 分钟自动检测数据更新并刷新界面
- 🔧 **自动端口配置** - 代理服务器智能检测可用端口
- 📊 **完整统计** - Token 用量、成本、缓存命中率
- 💾 **多数据源** - 支持 ccswitch、自己的代理、本地记录
- 🌐 **多平台支持** - OpenAI、Anthropic、DeepSeek、Google Gemini
- 📈 **TUI 界面** - 漂亮的终端可视化界面

## 🚀 安装

```bash
npm install -g apistat
```

## 📖 快速开始

### 启动 apistat

```bash
apistat
```

你会看到智能登录界面：

```
   █████╗ ██████╗ ██╗███████╗████████╗ █████╗ ████████╗
  ██╔══██╗██╔══██╗██║██╔════╝╚══██╔══╝██╔══██╗╚══██╔══╝
  ███████║██████╔╝██║███████╗   ██║   ███████║   ██║
  ██╔══██║██╔═══╝ ██║╚════██║   ██║   ██╔══██║   ██║
  ██║  ██║██║     ██║███████║   ██║   ██║  ██║   ██║
  ╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝

选择数据源:

✅ ccswitch: 7,060 条记录 (6.89 MB)
⚠️  apistat代理: 未启动

[ 1. 使用 ccswitch 数据 ]
[ 2. 启动 apistat 代理服务器 ]
[ 3. 登录远程站点 API ]

请选择 (按 1/2/3 或点击按钮):
```

## 🎯 三种使用模式

### 模式 1: 使用 ccswitch 数据（推荐）

如果你已经安装了 ccswitch：

```bash
apistat
# 按 1 选择 ccswitch 数据源
# 立即查看所有历史记录
# 每 5 分钟自动同步新数据
```

**优势**：
- ✅ 无需登录站点
- ✅ 查看完整历史数据
- ✅ 真实的缓存命中率
- ✅ 精确的成本统计

### 模式 2: 启动 apistat 代理

```bash
# 终端 1: 启动代理（自动检测可用端口）
apistat serve

# 终端 2: 配置环境变量
# Bash/Linux:
export HTTP_PROXY=http://localhost:8080
export HTTPS_PROXY=http://localhost:8080

# PowerShell:
$env:HTTP_PROXY = "http://localhost:8080"
$env:HTTPS_PROXY = "http://localhost:8080"

# 终端 3: 运行你的 AI 应用
python your_app.py

# 终端 4: 查看统计
apistat
```

**优势**：
- ✅ 自动拦截所有 API 调用
- ✅ 无需修改代码
- ✅ 自动记录到数据库
- ✅ 端口自动配置

### 模式 3: 查询远程站点

```bash
apistat
# 按 3 选择登录远程站点
# 输入 URL 和 API Key
# 查看余额、模型、使用量
```

## 📊 功能

### 数据看板
- 站点信息和可用模型
- 账户余额

### 令牌管理
- 账户详情
- 使用量统计
- 可用模型列表

### 使用情况
- 按模型显示 Token 用量
- 柱状图可视化
- 成本统计

### 缓存命中率
- 真实缓存数据（从 ccswitch/代理）
- 缓存读取和创建统计

### 价格管理
- 模型价格查询
- 成本估算

### 更换站点
- 站点管理
- **实时监控状态**（每 5 分钟更新）

## ⏱️ 实时监控

apistat 每 5 分钟自动检测数据源更新：
- ccswitch 数据库
- apistat 代理数据库
- 本地记录文件

在"更换站点"标签查看详细监控状态。

## 🔧 代理服务器

### 自动端口配置

```bash
# 完全自动（推荐）
apistat serve
# 🔍 正在查找可用端口...
# ✅ 找到可用端口: 8080

# 指定端口（被占用时自动切换）
apistat serve --port 8080
# ⚠️  端口 8080 已被占用
# ✅ 找到可用端口: 8081
```

### 支持的 AI 平台

- ✅ OpenAI (GPT-4, GPT-3.5, etc.)
- ✅ Anthropic (Claude 3/3.5/4/5)
- ✅ DeepSeek
- ✅ Google Gemini
- ✅ 其他 OpenAI 兼容 API

## 📁 数据位置

- **配置**: `~/.api-usage-tracker/config.json`
- **手动记录**: `~/.api-usage-tracker/records.json`
- **代理数据**: `~/.api-usage-tracker/apistat.db`
- **ccswitch**: `~/.cc-switch/cc-switch.db` (只读)

## ⌨️ 快捷键

```
数字键 1-6: 切换标签
q: 退出
r: 刷新
←→: 切换标签
鼠标: 点击按钮
```

## 🤝 与 ccswitch 的关系

- **ccswitch 用户**：apistat 可以读取 ccswitch 数据，提供更好的 TUI 界面
- **非 ccswitch 用户**：apistat 可以独立工作，提供相同的功能

## 🔄 更新日志

### v3.1.0
- ✅ 新增智能登录界面（3 种数据源选择）
- ✅ 新增实时监控（每 5 分钟自动更新）
- ✅ 新增自动端口配置（智能检测可用端口）
- ✅ 改进 TUI 界面和用户体验

## 📝 License

MIT

## 🙋 问题反馈

如有问题或建议，请提交 Issue。

---

**Made with ❤️ for AI developers**
