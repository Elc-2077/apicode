# apistat

[![npm version](https://img.shields.io/npm/v/apistat.svg)](https://www.npmjs.com/package/apistat)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

🚀 **智能 API 使用监控统计工具** - 自动检测数据源或启动代理服务器

## ✨ 特性

- 🎯 **智能检测** - 自动检测站点是否在 ccswitch 中，智能选择数据源
- 🔄 **自动代理** - 无记录时自动启动代理服务器，智能查找可用端口
- 📊 **实时监控** - 5分钟自动更新，实时查看 API 使用情况
- 🎨 **美观界面** - 炫酷的终端 UI，支持鼠标点击操作
- 🔙 **便捷操作** - q 键返回，标签切换，全键盘/鼠标支持
- 💾 **多数据源** - 支持 ccswitch、代理、本地记录三种数据源

## 📦 安装

```bash
npm install -g apistat
```

## 🚀 使用

```bash
apistat
```

启动后：
1. 输入站点 URL（例如：https://api.openai.com/v1）
2. 输入 API Key
3. 自动检测数据源并进入主界面

## 🎮 操作

### 键盘
- `q` - 返回/退出（主页退出，其他页返回）
- `←/→` - 切换标签
- `r` - 刷新
- `1-6` - 快速切换标签
- `a` - 添加站点
- `d` - 删除站点

### 鼠标
- 点击标签切换
- 点击按钮执行操作

## 📊 功能模块

### 数据看板
实时显示 API 使用统计、费用、调用次数等关键指标

### 令牌管理
查看各模型的令牌使用情况和分布

### 使用情况
详细的时间序列使用数据和趋势分析

### 缓存命中率
查看缓存效率和优化建议

### 价格管理
自定义模型价格，精确计算成本

### 填写站点和API
管理多个 API 站点，快速切换

## 🔧 代理模式

当站点无历史记录时，apistat 会：
1. 自动查找可用端口（从 8080 开始）
2. 启动代理服务器
3. 显示配置说明

配置你的应用：
```bash
export HTTP_PROXY=http://localhost:8080
export HTTPS_PROXY=http://localhost:8080
```

## 📝 数据源

apistat 支持三种数据源：

1. **ccswitch** - 自动检测并使用（优先）
2. **代理服务器** - 无记录时自动启动
3. **本地记录** - 手动记录的数据

## 🛠️ 开发

```bash
git clone https://github.com/你的用户名/apistat.git
cd apistat
npm install
node bin/cli.js
```

## 📄 License

MIT © [你的名字]

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📮 联系

- GitHub: [@你的用户名](https://github.com/你的用户名)
- Email: your.email@example.com

## ⭐ Star History

如果这个项目对你有帮助，请给个 Star！⭐
