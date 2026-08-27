# 发布指南

## 📦 发布 v1.1.0 到 GitHub 和 npm

### 前置准备

1. ✅ 代码已修改完成
2. ✅ 版本号已更新到 1.1.0
3. ✅ CHANGELOG.md 已创建
4. ✅ README.md 已更新
5. ✅ .npmignore 已配置
6. ✅ Git commit 已完成

### 🚀 发布步骤

#### 1. 推送到 GitHub

```bash
# 进入 apicode-core 子目录
cd /d/apicode/apicode-core

# 推送代码到 GitHub
git push origin main

# 回到主目录
cd ..

# 推送主仓库
git push origin master

# 创建标签
cd apicode-core
git tag v1.1.0
git push origin v1.1.0
```

#### 2. 发布到 npm

```bash
# 进入 apicode-core 目录
cd /d/apicode/apicode-core

# 确认 npm 登录状态
npm whoami

# 如果未登录，先登录
npm login

# 发布到 npm（公开包）
npm publish --access public

# 或者如果包名已存在且你有权限
npm publish
```

#### 3. 验证发布

```bash
# 查看 npm 包信息
npm view api-code-cli

# 测试安装
npm install -g api-code-cli@1.1.0

# 验证版本
apicode --version
```

### 🔧 如果遇到网络问题

当前遇到 GitHub 连接问题，可以尝试：

1. **使用代理或 VPN**
2. **稍后重试**
3. **使用 SSH 方式推送**:
   ```bash
   # 将 HTTPS 切换为 SSH
   git remote set-url origin git@github.com:Elc-2077/apicode.git
   git push origin main
   ```

### 📋 发布检查清单

- [ ] 代码已提交到本地 Git
- [ ] 版本号正确（1.1.0）
- [ ] README.md 包含新功能说明
- [ ] CHANGELOG.md 更新
- [ ] 测试脚本可正常运行
- [ ] 推送到 GitHub
- [ ] 创建 Git 标签
- [ ] npm 登录成功
- [ ] 发布到 npm
- [ ] 验证安装和功能

### 🎉 发布后

1. **在 GitHub 创建 Release**:
   - 访问 https://github.com/Elc-2077/apicode/releases/new
   - 选择标签 v1.1.0
   - 标题: `v1.1.0 - 图像读取功能`
   - 描述: 复制 CHANGELOG.md 中的更新内容
   - 发布 Release

2. **宣传新功能**:
   - 在 README 中突出显示新功能
   - 社交媒体分享（如果需要）

### 📝 当前状态

```
✅ 代码修改完成
✅ 本地 Git 提交完成
⏳ 等待网络恢复，推送到 GitHub
⏳ 等待推送成功后发布到 npm
```

### 🛠️ 快速发布脚本

当网络恢复后，可以使用以下命令快速发布：

```bash
# 一键推送和发布
cd /d/apicode/apicode-core && \
git push origin main && \
git tag v1.1.0 && \
git push origin v1.1.0 && \
npm publish --access public

cd .. && git push origin master
```

### ⚠️ 注意事项

1. **npm 包名冲突**: 如果 `api-code-cli` 已被占用，可能需要改名
2. **npm 权限**: 确保你有发布该包的权限
3. **版本号**: npm 不允许覆盖已发布的版本，确保版本号正确且未发布过
4. **测试**: 发布前建议在本地测试 `npm link` 确保功能正常
