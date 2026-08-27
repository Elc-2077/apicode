# 图像读取功能说明

apicode 现在支持读取和分析图像文件，类似于 Claude Code 的图像功能。

## 功能特性

- ✅ 支持 PNG、JPEG、GIF、WebP 格式
- ✅ 支持最大 20MB 的图像文件
- ✅ 自动转换为 base64 编码
- ✅ 同时支持 OpenAI 和 Anthropic API
- ✅ 无缝集成到现有的工具系统

## 使用方法

### 1. 在 Agent 模式中使用

```bash
# 启动 agent 模式
apicode agent

# 在对话中让 AI 读取图像
You › 请读取 screenshot.png 并告诉我图片里有什么
```

AI 会自动调用 `read_image` 工具来读取和分析图像。

### 2. 支持的模型

使用支持视觉的模型才能分析图像内容：

**Anthropic (Claude):**
- claude-3-5-sonnet-20241022
- claude-3-opus-20240229
- claude-3-sonnet-20240229
- claude-3-haiku-20240307

**OpenAI:**
- gpt-4o
- gpt-4o-mini
- gpt-4-turbo
- gpt-4-vision-preview

### 3. 示例对话

```
You › 我有一个设计图 design.png，帮我分析一下布局
AI › ⚙ read_image {"path":"design.png"}
    ↳ 已读取图像: D:\project\design.png
    
    这个设计图展示了一个现代化的 Web 应用界面，包含：
    - 顶部导航栏：Logo 在左侧，菜单项在右侧
    - 主内容区：采用卡片式布局，三列网格
    - 侧边栏：固定在右侧，显示最近活动
    - 底部：版权信息和链接
    
    配色方案使用了蓝色 (#2563eb) 作为主色...
```

### 4. 测试脚本

项目包含一个测试脚本来验证功能：

```bash
# 测试读取图像
node test-image-support.js path/to/image.png
```

## 实现细节

### 新增工具

在 `src/agent-tools.js` 中添加了 `read_image` 工具：

```javascript
{
  name: 'read_image',
  description: '读取图像文件并返回 base64 编码的数据，用于视觉分析。支持 PNG、JPEG、GIF、WebP 格式。',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '图像文件路径（相对或绝对）' }
    },
    required: ['path']
  }
}
```

### API 适配

- **Anthropic**: 使用原生的 `image` content 类型
- **OpenAI**: 使用 `image_url` 格式，支持 data URI

### 文件大小限制

- 最大文件大小: 20MB
- 超过限制会返回错误提示

## 常见问题

**Q: 为什么 AI 看不到图像内容？**

A: 确保使用支持视觉的模型。普通文本模型（如 gpt-3.5-turbo）无法处理图像。

**Q: 支持哪些图像格式？**

A: PNG、JPEG、GIF、WebP。系统会根据文件扩展名自动检测格式。

**Q: 可以读取网络图片吗？**

A: 目前只支持本地文件。如需读取网络图片，可以先下载到本地。

**Q: 图像数据会被保存吗？**

A: 不会。图像被读取并转换为 base64 后直接发送给 API，不会保存在本地。

## 更新日志

### v1.1.2 (2026-08-27)
- 🐛 **重要修复**: 修复 OpenAI 分支图像读取问题
  - 之前模型收到的是 JSON 字符串而非实际图像
  - 现在正确通过 user 消息传递图像数据
  - 模型现在可以正确"看到"并分析图像内容
- ✅ 添加消息格式验证测试

### v1.1.0 (2026-08-27)
- ✨ 新增 `read_image` 工具
- ✨ 支持 Anthropic 和 OpenAI 的图像 API
- 📝 添加图像功能文档和测试脚本
