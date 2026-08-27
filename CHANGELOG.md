# Changelog

All notable changes to this project will be documented in this file.

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
