# ☁️ O-Drive

**O-Drive** 是一款基于 Cloudflare 生态系统（Pages + R2 + D1）构建的极简、现代、高性能私人网盘。它不仅提供了流畅的文件管理体验，还具备完善的隐私保护和操作审计功能。

## 🌟 项目亮点

- **全能预览系统**：支持图片、视频、音频、PDF 以及代码文件的在线预览。特别集成 `marked.js` 实现 Markdown 专业渲染。
- **在线文本编辑**：管理员可直接在浏览器中修改并保存 `.txt`, `.md`, `.conf`, `.json` 等文本文件。
- **智能搜索**：支持全盘搜索和当前目录局部搜索。
- **专业文件整理**：内置“虚拟剪贴板”，支持跨文件夹的批量移动、复制、重命名及删除。
- **多层权限保护**：
  - **访客模式**：支持一键开关，允许或禁止公共浏览。
  - **路径隐藏**：支持在控制面板自定义“隐藏名单”，访客将无法搜到或访问特定文件夹。
  - **暴力破解防护**：D1 数据库记录登录尝试，自动封禁恶意 IP。

## 🛠️ 技术架构

- **前端 (Frontend)**: 原生 Vanilla JS (模块化设计) + CSS3 (CSS Variables)。
- **后端 (Backend)**: Cloudflare Pages Functions (Edge Runtime)。
- **存储 (Storage)**: Cloudflare R2 (S3 兼容对象存储)。
- **数据库 (DB)**: Cloudflare D1 (用于存储日志、频率限制及系统设置)。

## 🚀 快速部署

1. **准备工作**：
   - 在 Cloudflare 控制台创建一个 R2 存储桶 (Bucket)。
   - 创建一个 D1 数据库，并在 Console 中执行仓库中的 `O-Drive.sql` 初始化表结构。

2. **环境变量配置**：
   在 Cloudflare Pages 的设置中添加以下变量：
   - `ADMIN_USERNAME`: 管理员账号。
   - `ADMIN_PASSWORD`: 管理员密码。
   - `ALLOW_GUEST`: 设置为 `true` 开启访客模式，`false` 关闭。

3. **绑定设置**：
   - **D1 绑定**：变量名设为 `DB`。
   - **R2 绑定**：变量名设为 `R2_BUCKET`。

4. **构建与部署**：
   - 将本项目上传至 GitHub。
   - 连接至 Cloudflare Pages，构建输出目录选择 `public` 即可。
