# api-code-cli

**AI 编码助手 CLI** - 类似 Claude Code 的命令行工具，支持读写文件、搜索代码、执行命令、读取图像。现已更新到v1.2.1

[![npm version](https://img.shields.io/npm/v/api-code-cli.svg)](https://www.npmjs.com/package/api-code-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

##  特性

-  **文件操作**: 读写文件、编辑文件、创建目录
-  **代码搜索**: 支持 glob 通配符和正则表达式搜索
-  **命令执行**: 在终端执行 shell 命令
-  **图像读取**: 读取和分析图像（PNG/JPEG/GIF/WebP）- **v1.1.0 新功能**
-  **多 API 支持**: OpenAI、Anthropic Claude、DeepSeek 等
-  **安全机制**: 危险操作需用户确认
-  **交互模式**: 类似 Claude Code 的对话式编程体验

##  安装

```bash
npm install -g api-code-cli
```

##  更新
```bash
apicode update
```


##  快速开始

### 1. 配置 API

首次运行时需要配置 API：

```bash
apicode
```

按提示添加你的 API 配置（OpenAI、Anthropic、DeepSeek 等），即可进入交互式编程助手模式。

AI 可以：
- 读取和分析代码
- 修改文件
- 执行命令
- **读取和分析图像** 🆕

### 2. 使用示例

#### 代码编写

```
You › 帮我创建一个 Express 服务器，监听 3000 端口
AI › ⚙ write_file {"path":"server.js","content":"..."}
    ✅ 已创建 server.js
```

#### 代码搜索

```
You › 找出所有使用 axios 的文件
AI › ⚙ grep {"pattern":"require.*axios|import.*axios"}
    ↳ src/api.js:3: const axios = require('axios');
```

#### **图像分析** 🆕

```
You › 请读取 design.png 并分析这个设计图的布局
AI › ⚙ read_image {"path":"design.png"}
    ↳ 已读取图像: design.png
    
    这个设计图展示了一个现代化的 Web 应用界面...
```

##  图像功能详解

### 支持的格式
- PNG (.png)
- JPEG (.jpg, .jpeg)
- GIF (.gif)
- WebP (.webp)

### 使用场景

1. **UI/UX 设计审查**: 分析设计稿，提供改进建议
2. **截图调试**: 描述错误截图中的问题
3. **图表分析**: 解读数据可视化图表
4. **代码截图**: 识别和理解代码图片

### 示例

```bash
# 启动 apicode
apicode

# 在对话中
You › 分析 screenshot.png 中的错误信息
You › 这个 UI 设计图 design.png 有什么可以改进的地方？
You › 读取 chart.png 并总结图表中的数据趋势
```

##  可用工具

| 工具 | 描述 | 危险操作 |
|------|------|----------|
| `read_file` | 读取文本文件 | ❌ |
| `write_file` | 写入/覆盖文件 | ✅ |
| `edit_file` | 精确替换文件内容 | ✅ |
| `list_dir` | 列出目录内容 | ❌ |
| `glob` | 通配符搜索文件 | ❌ |
| `grep` | 正则搜索文件内容 | ❌ |
| `run_shell` | 执行 shell 命令 | ✅ |
| `read_image` 🆕 | 读取和分析图像 | ❌ |

## 📝 命令

```bash
# 启动交互式编程助手
apicode

# 更新到最新版本
apicode update

# 启动代理服务器（可选）
apicode serve

# 在对话模式中的命令
/exit    # 退出
/clear   # 清空对话上下文
/quit    # 退出（同 /exit）
```

##  配置

配置文件存储在 `~/.apicode/config.json`

支持多个 API 配置：

```json
{
  "apis": [
    {
      "name": "OpenAI",
      "type": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "sk-..."
    },
    {
      "name": "Claude",
      "type": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "apiKey": "sk-ant-..."
    }
  ]
}
```

##  安全特性

危险操作会提示确认：

```
⚠ 需要确认：write_file
│ 新建文件: /path/to/file.js
│ 内容(150 字符, 前 20 行):
│ const express = require('express');
│ ...

执行吗？(y=同意 / n=拒绝 / a=本次全部同意): 
```

##  贡献

欢迎提交 Issue 和 Pull Request！

##  许可证

MIT License - 详见 [LICENSE](LICENSE)

##  相关链接

- [GitHub 仓库](https://github.com/Elc-2077/apicode)
- [问题反馈](https://github.com/Elc-2077/apicode/issues)
- [更新日志](../CHANGELOG.md)
- [图像功能详细文档](../README-IMAGE-SUPPORT.md)

## 🆕 更新日志

### v1.1.0 (2026-08-27)
- 新增图像读取和分析功能
- 支持 PNG、JPEG、GIF、WebP 格式
- 完整支持 Anthropic 和 OpenAI 视觉 API
- 添加详细文档和测试脚本

### v1.0.0
- 初始版本发布
- 文件读写和搜索功能
- 命令执行功能
- 多 API 支持

### v1.2.1
- max_tokens 提到 32000，给推理/思考模型更充足输出空间
- 不做模型自动续写：会话历史跨轮保留且不再被污染，任一轮被截断/提前结束后，用户直接输入「继续」即可接着做。
- 截断提示语改为引导「继续」

---


Made with ❤️ by [Elc-2077](https://github.com/Elc-2077)
