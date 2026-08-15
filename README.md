# api-code-cli

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/api-code-cli.svg)](https://www.npmjs.com/package/api-code-cli)

🚀 **AI 编码助手 CLI** - 类似 Claude Code 的终端工具，支持读写文件、执行命令

> **注意**：本项目原包名为 `@elc2077/apicode`，现已更名为 `api-code-cli`。  
> 旧包不再更新，请使用新包名安装。

## 📦 安装

```bash
npm install -g api-code-cli
```

安装后运行：
```bash
apicode
```

## ✨ 特性

- 🤖 **多 AI 模型支持** - OpenAI、Claude、DeepSeek 等
- 📁 **文件操作** - 读写文件、搜索代码、创建目录
- 🖥️ **终端命令** - 执行 shell 命令（git、npm、构建等）
- 🔧 **内置工具系统** - list_dir、read_file、write_file、edit_file、run_shell、glob、grep
- ⚡ **流式输出** - 实时显示 AI 回复，支持 ESC 中断
- 📊 **Token 统计** - 实时追踪使用量和成本
- 🎨 **美观界面** - 清晰的终端 UI

## 🚀 快速开始

首次运行会引导你配置 API：
1. 输入 API Base URL（如 `https://api.openai.com/v1`）
2. 输入 API Key
3. 选择模型（自动从站点获取可用模型列表）

配置完成后即可开始对话，AI 可以帮你：
- 📖 读取和分析代码
- ✏️ 修改或新建文件
- 🐛 搜索文件和代码
- 🖥️ 执行命令（git、npm、构建等）

## 🎮 使用示例

```bash
# 启动
apicode

# 让 AI 列出当前目录
You: 列出当前目录的文件

# 让 AI 读取文件
You: 读一下 package.json

# 让 AI 修改代码
You: 把 README.md 里的版本号改成 1.0.0

# 让 AI 执行命令
You: 运行 npm test

# 让 AI 搜索代码
You: 在项目里搜索所有用到 axios 的地方
```

## ⌨️ 快捷键

- **ESC** - 中断当前 AI 响应
- **Ctrl+C** - 退出程序

## 🔨 对话命令

在对话中输入以下命令：

- `/help` - 显示帮助
- `/clear` - 清空会话历史
- `/model [名称]` - 查看或切换模型
- `/exit` - 退出

## 🛠️ 内置工具

AI 可以调用的工具：

- `list_dir` - 列出目录内容
- `read_file` - 读取文件
- `write_file` - 创建或覆盖文件
- `edit_file` - 精确替换文件内容
- `create_dir` - 创建目录
- `run_shell` - 执行终端命令
- `glob` - 按模式搜索文件（如 `**/*.js`）
- `grep` - 搜索文件内容（支持正则）

危险操作（写文件、执行命令）会先询问确认：
```
🔧 工具调用: run_shell
  执行命令:
  $ npm install axios

确认? (y=同意 / n=拒绝 / a=本次全部同意): y
```

## 📊 统计功能

每次对话后显示：
```
────────────────────────────────────────────────────────────
 📊 会话: 1,234 tokens ($0.0037) │ 总计: 45,625 tokens ($0.14)
────────────────────────────────────────────────────────────
```

数据存储在本地 SQLite 数据库（`~/.api-usage-tracker/usage.db`）。

## 🔐 配置文件

配置存储在 `~/.api-usage-tracker/config.json`：

```json
{
  "currentAPI": "my-api",
  "apis": {
    "my-api": {
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "sk-...",
      "model": "gpt-4"
    }
  }
}
```

可手动编辑或通过交互界面管理。

## 🌟 支持的模型

理论上支持所有 OpenAI 兼容 API 的模型，包括但不限于：

- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude 3.5 Sonnet, Claude 3 Opus)
- DeepSeek (DeepSeek-V3, DeepSeek-V4)
- 其他兼容 OpenAI API 格式的模型

## 📝 许可证

MIT

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📮 联系

- GitHub: [@Elc-2077](https://github.com/Elc-2077)
- Issues: [github.com/Elc-2077/apicode/issues](https://github.com/Elc-2077/apicode/issues)
