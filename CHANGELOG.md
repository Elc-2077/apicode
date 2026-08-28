# Changelog

All notable changes to this project will be documented in this file.

## [1.1.8] - 2026-08-28

### Fixed
- 🐛 **修复对话中途自动结束、结算 token 后续每轮 400 的问题**: 当模型某一步返回空响应（无文字、无工具调用，常见于只发 `reasoning_content` 的推理模型或被中断/空响应）时，旧逻辑会把一条 `content` 与 `tool_calls` 都为空的助手消息写入历史。这条脏消息导致：① agentic 循环误判任务完成而提前 `return`，对话在输出/调用工具中途自动结束并结算 token；② 下一轮把它发回接口，报 `400 Invalid assistant message: content or tool_calls must be set`，同一会话此后每次请求都失败。
  - 空助手消息不再写入历史（OpenAI 与 Anthropic 两条分支都已加守护）。
  - 每次请求前清洗历史，剔除残留的空助手消息及其失去归属的 `tool` 消息，可自动修复此前已被污染、持续 400 的会话。

## [1.1.7] - 2026-08-28

### Changed
- 🔀 **`/model` 切换模型时保留当前对话上下文**: 此前切换模型会新建 Agent 导致对话历史清空，现在会把历史迁移到新模型，切换后可继续当前上下文和项目。OpenAI 类模型会保留新模型的 system 提示再接上旧对话，Anthropic 直接沿用。

## [1.1.6] - 2026-08-28

### Added
- ✨ **`/model` 交互式菜单切换模型**: 直接输入 `/model`（不带参数）会拉取当前站点的可用模型列表并弹出交互式菜单——`↑↓` 移动、回车确认、按 `1-9` 直接选、`ESC` 取消，默认高亮当前模型。运行菜单期间临时摘掉 REPL 按键监听避免抢键，结束后恢复。仍支持 `/model <编号>` / `/model <名称>` 直接切换。

## [1.1.5] - 2026-08-28

### Added
- ✨ **`/model` 支持列出并切换模型**: 直接输入 `/model`（不带参数）会拉取当前站点的可用模型列表并编号显示，标出当前模型；再用 `/model <编号>` 或 `/model <名称>` 即可切换。此前 `/model` 只能显示当前模型。

### Fixed
- 🐛 **修复固定界面模式下命令崩溃**: 输入 `/help`、`/model` 等命令后程序抛出 `TypeError: ui.drawInputBox is not a function` 并退出。原因是 `handleFixedCommand` 调用了不存在的 `ui.drawInputBox()`，现更正为 `ui.drawInputLine()`。

## [1.1.3] - 2026-08-27

### Changed
- 🎨 **简化图片读取输出**: read_image 工具结果只显示一行简短确认，不再显示大量灰色 base64 数据
- 🔒 **增强安全性**: 完善 .gitignore 规则，防止配置文件、测试文件和敏感信息泄露

### Security
- 确保 API keys 存储在用户目录 (~/.api-usage-tracker/)，永不提交到代码库
- 添加配置文件、数据库文件、测试文件的忽略规则

## [1.1.2] - 2026-08-27

### Fixed
- 🐛 **重要修复**: 修复 OpenAI 分支图像读取问题
  - 之前模型收到的是 JSON 字符串而非实际图像数据
  - 现在正确通过 `user` 消息传递图像内容
  - 修复重复读取图像文件的性能问题
  - 模型现在可以正确"看到"并分析图像内容

### Technical Details
- `agent.js` OpenAI 分支: 使用 `Map` 缓存图像数据，避免重复调用 `executeTool`
- `tool` 消息只返回文本确认，图像通过单独的 `user` 消息传递
- 符合 OpenAI API 规范：图像必须在 `user` 消息中以 `image_url` 格式传递

## [1.1.0] - 2026-08-27

### Added
- ✨ **图像读取功能**: 新增 `read_image` 工具，支持 PNG、JPEG、GIF、WebP 格式
- 🖼️ **视觉模型支持**: 完整支持 Anthropic Claude 和 OpenAI GPT-4V 的图像分析能力
- 📝 **文档和测试**: 添加图像功能使用文档和测试脚本
- 🔄 **自动格式转换**: 根据不同 API 自动转换图像格式（base64/data URI）

### Changed
- 📦 更新 package.json 版本到 1.1.0
- 📖 更新项目描述，说明支持图像功能

### Technical Details
- `agent-tools.js`: 新增 `read_image` 工具实现
- `agent.js`: 增强对 OpenAI 和 Anthropic 图像 API 的支持
- 图像文件大小限制: 20MB
- 自动检测图像类型并设置正确的 media type

## [1.0.0] - 2024-08-15

### Added
- 🎉 初始版本发布
- 📁 文件读写功能 (read_file, write_file, edit_file)
- 🔍 代码搜索功能 (glob, grep, list_dir)
- 💻 终端命令执行 (run_shell)
- 🤖 支持 OpenAI 和 Anthropic API
- 🛡️ 危险操作确认机制
- 📊 交互式 Agent 模式
