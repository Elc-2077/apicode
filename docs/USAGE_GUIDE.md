# APICODE 使用指南

## 快速开始

### 1. 首次启动

```bash
apicode
```

你会看到欢迎界面：

```
  █████╗ ██████╗ ██╗ ██████╗ ██████╗ ██████╗ ███████╗
 ██╔══██╗██╔══██╗██║██╔════╝██╔═══██╗██╔══██╗██╔════╝
 ███████║██████╔╝██║██║     ██║   ██║██║  ██║█████╗  
 ██╔══██║██╔═══╝ ██║██║     ██║   ██║██║  ██║██╔══╝  
 ██║  ██║██║     ██║╚██████╗╚██████╔╝██████╔╝███████╗
 ╚═╝  ╚═╝╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝

  AI 对话 CLI 工具 - 实时显示 Token 使用统计
```

### 2. 配置 API

首次使用需要添加 API 配置：

```
添加新的 API 配置

站点名称: OpenAI
站点 URL: https://api.openai.com/v1
API Key: sk-proj-xxxxx
API 类型: 1

正在测试连接...
✅ 连接成功！
```

### 3. 选择模型

```
选择模型：

  1. gpt-4o
  2. gpt-4o-mini
  3. gpt-4-turbo
  4. gpt-4
  5. gpt-3.5-turbo

请选择 (1-5): 1
```

### 4. 开始对话

```
┌─────────────────────────────────────────────────────────────┐
│ APICODE REPL | 模型: gpt-4o | 输入 /help 查看命令           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ ─────────────────────────────────────────────────────────── │
│ 📊 会话: 0 tokens ($0.0000) │ 总计: 0 tokens ($0.0000)     │
│ > _                                                         │
└─────────────────────────────────────────────────────────────┘
```

## 实战示例

### 示例 1：代码问答

```
You: 用 Python 写一个二分查找函数

AI: 好的！这是一个 Python 二分查找的实现：

def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    
    while left <= right:
        mid = (left + right) // 2
        
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    
    return -1

这个函数的时间复杂度是 O(log n)...

📊 会话: 245 tokens ($0.0007) │ 总计: 245 tokens ($0.0007)
```

### 示例 2：切换模型

```
You: /model gpt-4o-mini

ℹ️  已切换到模型: gpt-4o-mini

You: 继续刚才的话题

AI: 当然！关于二分查找...

📊 会话: 423 tokens ($0.0002) │ 总计: 668 tokens ($0.0009)
```

### 示例 3：清空会话

```
You: /clear

ℹ️  会话已清空

📊 会话: 0 tokens ($0.0000) │ 总计: 668 tokens ($0.0009)
```

## 多 API 配置管理

### 添加多个配置

1. **OpenAI 官方**
```
名称: OpenAI
URL: https://api.openai.com/v1
Key: sk-proj-xxxxx
类型: OpenAI兼容
```

2. **DeepSeek**
```
名称: DeepSeek
URL: https://api.deepseek.com/v1
Key: sk-xxxxx
类型: OpenAI兼容
```

3. **Claude**
```
名称: Claude
URL: https://api.anthropic.com
Key: sk-ant-xxxxx
类型: Anthropic
```

### 切换配置

再次启动时选择：

```bash
apicode

选择一个 API 配置：

  1. OpenAI - https://api.openai.com/v1
  2. DeepSeek - https://api.deepseek.com/v1
  3. Claude - https://api.anthropic.com
  4. 添加新配置
  0. 退出

请选择 (0-4): 2
```

## 统计功能

### 简洁模式（默认）

底部显示核心统计：

```
📊 会话: 1,234 tokens ($0.0037) │ 总计: 45,625 tokens ($0.1368)
```

- **会话**: 当前对话的累计使用
- **总计**: 所有历史记录的累计

### 详细模式（Ctrl+D）

显示更多细节：

```
📊 会话: 1,234 tokens ($0.0037) │ 输入: 834 │ 输出: 400 │ 缓存命中: 18.7%
```

- **输入/输出**: Token 分离统计
- **缓存命中**: Prompt 缓存效率

### 完整统计（监控模式）

查看图表和历史趋势：

```bash
apicode monitor
```

进入原有的监控界面，查看：
- 数据看板
- 令牌管理
- 使用情况
- 缓存命中率
- 价格管理

## 快捷键汇总

| 快捷键 | 功能 |
|--------|------|
| `Enter` | 发送消息 |
| `Backspace` | 删除字符 |
| `Ctrl+C` | 退出程序 |
| `Ctrl+L` | 清空会话 |
| `Ctrl+D` | 切换详细统计 |

## 命令汇总

| 命令 | 功能 |
|------|------|
| `/help` | 显示帮助 |
| `/clear` | 清空会话 |
| `/model <名称>` | 切换模型 |
| `/stats` | 切换统计模式 |
| `/quit`, `/exit` | 退出 |

## 启动参数

```bash
# REPL 模式（默认）
apicode

# 监控模式
apicode monitor

# 代理模式
apicode serve --port 8080
```

## 常见问题

### Q: 如何重新配置 API？
A: 配置文件在 `~/.api-usage-tracker/config.json`，可以手动编辑或删除后重新运行。

### Q: Token 统计准确吗？
A: 统计来自 API 返回的实际使用量，非常准确。

### Q: 支持哪些模型？
A: 支持所有 OpenAI 兼容 API 的模型，以及 Anthropic Claude 全系列。

### Q: 会话历史会保存吗？
A: 当前版本会话历史在内存中，退出后清空。Token 统计会永久保存。

### Q: 如何导出统计数据？
A: 统计数据保存在 `~/.api-usage-tracker/records.json`，可以直接复制或在监控模式中导出。

## 成本控制建议

1. **选择合适的模型**
   - 简单任务用 `gpt-4o-mini` 或 `claude-3-haiku`
   - 复杂任务用 `gpt-4o` 或 `claude-3-5-sonnet`

2. **观察统计数据**
   - 定期查看总成本
   - 比较不同模型的效率

3. **合理使用会话**
   - 长对话会累积大量 token
   - 适时使用 `/clear` 清空会话

## 技术支持

遇到问题？
1. 查看日志输出
2. 检查 API Key 是否正确
3. 确认网络连接
4. 提交 Issue 到 GitHub
