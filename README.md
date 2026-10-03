# api-code-cli

**AI 编码助手 CLI** - 类似 Claude Code 的命令行工具，支持读写文件、搜索代码、执行命令、读取图像。现已更新到v1.2.1,代码内容以文件里面的为准，后面标识的和比较有些问题

[![npm version](https://img.shields.io/npm/v/api-code-cli.svg)](https://www.npmjs.com/package/api-code-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

##  特性

-  **文件操作**: 读写文件、编辑文件、创建目录
-  **代码搜索**: 支持 glob 通配符和正则表达式搜索
-  **命令执行**: 在终端执行 shell 命令
-  **图像读取**: 读取和分析图像（PNG/JPEG/GIF/WebP）- **v1.1.0 新功能**
-  **技能加载**: 自动发现本机 `SKILL.md` 技能并注入技能索引，任务匹配时 AI 读取技能全文照做 - **新功能**
-  **风格切换**: `/style` 回车弹出选择面板（↑↓ 选、再回车确认），Code / 猫娘两种预设，只改语气、不改代码能力 - **新功能**
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
| `load_skill` 🆕 | 按名称读取本机技能（SKILL.md）完整指令 | ❌ |

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
/clear   # 清空对话上下文（也会清掉已加载的技能）
/style   # 切换表达风格（回车后 ↑↓ 选择；也可 /style code、/style neko）
/skills  # 技能状态（/skills <名称> 直接加载、/skills all 重扫并列前 40 个）
/quit    # 退出（同 /exit）

# 输入 / 即可打开实时搜索面板（↑↓ 选择，PgUp/PgDn 翻页，回车加载）
```

## Agent 风格（/style）

`/style` 切换 AI 的**表达风格**，内置两种预设：

| id | 名称 | 说明 |
|---|---|---|
| `code` | Code 模式（默认） | 简洁中文技术说明；system prompt 与未启用本功能时逐字节一致 |
| `neko` | 猫娘模式 🐱 | 只把说话方式换成猫娘，代码能力、工具纪律、危险操作确认全部不变 |

```
You: /style                          ← 输入 /style 回车，面板出现在输入行下方
> 
  Code 模式（当前）   默认技术风格：简洁中文说明 + 可运行代码
▶ 🐱 猫娘模式        代码能力完全不变，只把说话方式换成猫娘
  第 2/2 项 · ↑↓ 选择 · Enter 或数字确认 · Esc 取消 · 当前：Code 模式

  → /style neko                      ← 再按一次回车才真正切换
🐱 ℹ️  已切换到 🐱 猫娘模式（代码能力与危险操作确认保持不变；/style 可再选，/style code 切回默认）
```

- 用的就是输入 `/` 时那套候选面板：`↑↓` 移动、`Enter`/`Tab`/数字 `1`·`2` 确认、`Esc` 取消并保持原风格。
- 不想按两次也可以直接带 id：`/style neko`、`/style code`。终端窄到画不出面板时，自动退回静态列表。

猫娘模式的边界（写在 `src/styles.js` 的风格段落里）：

- 只作用于「怎么说」：句末可以加「喵」、语气轻松，但结论仍须准确可执行；闲聊类回答 2~4 句最自然，技术回答该长就长。
- **严禁**把「喵」或颜文字放进代码块、终端命令、文件路径、diff、JSON 与工具参数、报错原文、日志 —— 这些必须原样可复制，不能污染要提交的内容。
- 不削弱安全边界：危险操作照旧弹 y/n 确认，报错与警告不会被语气淡化；被问到使用的模型时仍如实回答。
- 本地 UI 里只有信息类提示（`ℹ️`）会加 🐱 前缀；**报错和确认框文案保持原样**，统计栏会常驻显示当前风格。
- 说「正常说话 / 别猫娘了」模型会立刻回到纯技术表达；`/style code` 是彻底切回。
- 加第三种风格：往 `src/styles.js` 的 `STYLES` 里加一项即可（默认风格必须返回空串），其余代码不用动。

选择持久化在 `~/.api-usage-tracker/config.json` 的 `style` 字段，下次启动自动生效；无效值回落 `code`。

## 技能（Skills）

### 手动加载（推荐用法）

在输入行敲 `/`，输入行下方立刻浮出候选面板（**斜杠命令 + 全部技能**都在里面）。继续打字实时过滤（技能名前缀 > 名字包含 > 描述包含，中文描述也能搜）：

| 键 | 作用 |
|---|---|
| 打字 / 退格 | 实时过滤，窗口回到顶部 |
| `↑` `↓` | 逐条移动，走到窗口边缘时自动滚动 |
| `PgUp` `PgDn` | 整页翻（几百个技能也能几秒翻到底） |
| `Home` `End` | 跳到第一条 / 最后一条 |
| `Enter` / `Tab` | 选中高亮项（技能→加载进上下文；命令→填入输入行） |
| `Esc` | 收起面板（已输入内容保留） |

**回车即把该技能的 `SKILL.md` 全文加载进上下文**：

```
> /
▶ /help  显示帮助
  /clear  清空会话
  /model  查看/切换模型
  /skills - 技能状态
  /exit   退出
  accessibility — 使用 WCAG 2.2 AA 级标准设计、实现和审计…
  agent-architecture-audit — 针对 Agent 和 LLM 应用的全栈诊断…
  agent-eval — 在自定义任务上对编码 Agent 进行对比评估…
  ↑↓ 选择 · PgUp/PgDn 翻页 · Home/End 首尾 · Enter 接受 · Esc 关闭 · 第 1/336 项 · 匹配技能 330 个

（打字 kotlin → ↓ 选中 → 回车）
  ✓ 已选入技能 kotlin-testing（9214 字符）—— 下一条消息发出时会自动带上它的 SKILL.md 指令
> 帮我把这个模块的测试补齐
```

你选中的技能会先进「待发送队列」，在你下一次按回车发消息时拼在消息最前面一起发出，之后留在对话历史里持续生效（`/clear` 卸载）。面板行数随终端高度自适应，宽度按显示列裁剪，任何一行都不会挤到换行。

### 自动加载（模型侧兜底）

启动时同样会扫描技能并把「技能名索引」注入系统提示；任务明显匹配某个技能时，AI 会自己调用 `load_skill(name)` 读取全文再照做，无需你手动选。

- 项目级（优先，可覆盖同名全局技能）：`./.zcode/skills/`、`./.agents/skills/`、`./.claude/skills/`
- 全局级：`~/.zcode/skills/`、`~/.agents/skills/`、`~/.claude/skills/`
- 每个技能是一个含 `SKILL.md` 的目录，顶部 `---` frontmatter 里的 `name` / `description` 被用作索引
- 技能目录增删后用 `/skills all` 重扫，不必重启

### 成本说明

- 名字索引按字符预算自适应：技能少时每行带描述，技能很多（本机 330 个）时自动降级为只列名字，约 +3K token/请求
- 技能正文一旦进入对话历史，之后**每轮都会重发**（单个技能约 5–20K 字符），这是「加载进上下文」的固有代价；不需要时用 `/clear` 清掉
- 技能自带的脚本由 AI 通过 `run_shell` 在技能目录内执行（同样走危险操作确认）

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
