# 📦 apistat v4.0.0 发布指南

## ✅ 准备工作

### 1. 确认代码完整性
```bash
cd D:\api-usage-tracker\apistat-core

# 检查语法
node -c bin/cli.js

# 测试运行
node bin/cli.js
```

### 2. 更新版本号
```bash
npm version 4.0.0
```

这会自动：
- 更新 `package.json` 中的版本号
- 创建 git commit
- 创建 git tag `v4.0.0`

---

## 📝 更新 CHANGELOG

创建或更新 `CHANGELOG.md`:

```markdown
# Changelog

## [4.0.0] - 2026-08-14

### 🎉 重大更新
- 完全重写启动流程：先输入站点信息，再自动检测数据源
- Logo API 字样统一使用橙色
- q 键改为返回功能（主页退出，其他页返回）

### ✨ 新功能
- 自动检测站点是否在 ccswitch 中
- 智能选择数据源（ccswitch 或代理）
- 自动查找可用端口启动代理
- 全局鼠标点击支持

### 🔧 改进
- 标签名称更清晰："填写站点和API"
- 界面无串字残留
- Logo 颜色统一

### 🐛 修复
- 修复 Invalid URL 错误
- 修复鼠标点击失效问题
- 修复 bindKeyEvents 未定义问题
```

---

## 🚀 发布到 npm

### 方式 1: 公开发布（推荐）

```bash
cd D:\api-usage-tracker\apistat-core

# 1. 登录 npm（如果未登录）
npm login

# 2. 发布
npm publish

# 如果是 scoped package (@your-name/apistat)
npm publish --access public
```

### 方式 2: 私有发布

```bash
npm publish --access restricted
```

---

## 📋 发布前检查清单

- [ ] 代码语法正确 (`node -c bin/cli.js`)
- [ ] 功能测试通过 (`apistat` 能正常运行)
- [ ] 版本号已更新 (`package.json`)
- [ ] CHANGELOG 已更新
- [ ] README 已更新（如需要）
- [ ] 临时文件已清理
- [ ] git commit 并 push

---

## 🔐 npm 发布步骤

### 1. 登录 npm

```bash
npm login
# 输入：
# Username: 你的npm用户名
# Password: 你的npm密码
# Email: 你的邮箱
```

### 2. 检查包信息

```bash
npm pack --dry-run
```

这会显示将要发布的文件列表

### 3. 发布

```bash
npm publish
```

### 4. 验证

```bash
npm view apistat

# 或访问
https://www.npmjs.com/package/apistat
```

---

## 🌐 GitHub 发布（可选）

### 1. Push 到 GitHub

```bash
git add .
git commit -m "Release v4.0.0"
git push origin main
git push origin v4.0.0  # push tag
```

### 2. 创建 GitHub Release

1. 访问仓库页面
2. 点击 "Releases"
3. 点击 "Draft a new release"
4. 选择 tag: `v4.0.0`
5. 填写 Release notes（复制 CHANGELOG 内容）
6. 点击 "Publish release"

---

## 📢 发布后

### 1. 测试安装

```bash
npm install -g apistat@4.0.0
apistat
```

### 2. 更新文档

- README.md
- 使用文档
- API 文档

### 3. 通知用户

- 发布公告
- 更新说明
- 迁移指南（如有破坏性更改）

---

## 🔄 如果发布错误

### 撤销发布（24小时内）

```bash
npm unpublish apistat@4.0.0
```

### 发布补丁版本

```bash
npm version patch  # 4.0.0 -> 4.0.1
npm publish
```

---

## ✅ 快速发布命令

```bash
cd D:\api-usage-tracker\apistat-core

# 一键发布
npm version 4.0.0 && npm publish

# 或分步骤
npm version 4.0.0
npm publish
```

---

## 📝 package.json 建议配置

确保你的 `package.json` 包含：

```json
{
  "name": "apistat",
  "version": "4.0.0",
  "description": "API Usage Monitoring & Statistics - 智能API使用监控统计工具",
  "main": "src/index.js",
  "bin": {
    "apistat": "bin/cli.js"
  },
  "keywords": [
    "api",
    "monitor",
    "statistics",
    "usage",
    "tracking",
    "ccswitch",
    "proxy"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/your-username/apistat.git"
  },
  "bugs": {
    "url": "https://github.com/your-username/apistat/issues"
  },
  "homepage": "https://github.com/your-username/apistat#readme"
}
```

---

准备好了就发布吧！🚀
