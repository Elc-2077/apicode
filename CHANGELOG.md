# Changelog

All notable changes to this project will be documented in this file.

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
