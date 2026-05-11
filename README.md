# O-Drive

O-Drive 是一个部署在 Cloudflare Pages 上的轻量文件管理项目，使用 Cloudflare R2 存储文件，使用 D1 保存日志、回收站、访问控制配置和文件索引。

## 功能

- 游客浏览文件和文件夹
- 管理员登录、上传、移动、复制、重命名、删除
- 小文件普通上传，大文件自动分片上传
- 图片缩略图，以及图片、视频、音频、PDF、文本、Markdown 预览
- 文本文件在线编辑保存
- 搜索、筛选、排序、详情面板
- 批量选择和批量操作
- 回收站恢复、彻底删除、清空、按保留天数清理
- 隐藏路径管理
- 路径访问密码管理，支持错误次数限制
- 管理控制台、操作日志、存储概览、环境检查和文件索引重建
- 移动端浏览和管理员批量操作

## 部署要求

需要准备：

- Cloudflare Pages 项目
- Cloudflare R2 Bucket
- Cloudflare D1 数据库
- Node.js，用于本地构建 Tailwind CSS

Cloudflare Pages 配置：

- Build command: `npm run build`
- Build output directory: `public`
- Functions directory: `functions`

## 绑定资源

在 Pages 项目的 Settings -> Functions -> Bindings 中添加：

| 类型 | 变量名 | 说明 |
| --- | --- | --- |
| D1 database | `DB` | 保存日志、设置、回收站、访问密码和文件索引 |
| R2 bucket | `R2_BUCKET` | 保存实际文件内容 |

D1 表结构会在功能首次使用时自动创建，不需要在 D1 控制台手动执行 SQL。

## 环境变量

在 Pages 项目的 Settings -> Environment variables 中添加：

| 变量名 | 必填 | 说明 |
| --- | --- | --- |
| `ADMIN_USERNAME` | 是 | 管理员用户名 |
| `ADMIN_PASSWORD` | 是 | 管理员密码，也用于签名登录会话和路径访问会话 |
| `ALLOW_GUEST` | 否 | 只有设为 `true` 时允许游客访问；不填或设为其他值时关闭游客访问 |
| `PATH_UNLOCK_MAX_ATTEMPTS` | 否 | 受保护路径同一 IP 连续输错多少次后锁定，默认 `5` |
| `PATH_UNLOCK_LOCK_MINUTES` | 否 | 受保护路径输错锁定分钟数，默认 `15` |

修改环境变量后需要重新部署。

## 本地开发

```bash
npm install
npm run build
npm test
```

本项目的 API 依赖 Cloudflare Pages Functions、R2 和 D1。本地直接打开 `public/index.html` 只能查看静态页面，完整功能需要在 Cloudflare 环境或兼容的本地 Pages 开发环境中运行。

## 首次部署检查

部署后建议按顺序检查：

1. 打开首页，确认游客模式是否符合预期。默认未配置 `ALLOW_GUEST` 时需要登录。
2. 点击登录，使用 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 登录。
3. 上传一个小文件，确认 R2 写入正常。
4. 新建文件夹并进入，确认路径操作正常。
5. 删除测试文件，再到回收站恢复，确认 D1 表初始化正常。
6. 打开 `/admin.html`，查看概览、环境检查、日志、隐藏管理和访问密码页面。
7. 在管理控制台点击“重建索引”，确认文件索引可正常同步。

如果页面返回 500，优先检查 `DB` 和 `R2_BUCKET` 绑定是否存在。如果登录失败，检查环境变量是否部署到了当前 Pages 环境。如果管理员操作提示安全校验过期，刷新页面后重新登录。

## 管理建议

- 大目录删除、移动、复制前先看确认框中的路径和对象数量，超大目录建议分批处理。
- 回收站会继续占用 R2 空间，建议设置保留天数并定期清理。
- 文件很多时建议使用管理控制台的“重建索引”，让搜索和统计优先走 D1 索引。
- 隐藏路径只是不向游客展示；需要访问控制时请使用“访问密码”。
- 访问密码输错会按同一 IP 和同一路径计数，默认 5 次后暂停 15 分钟。
- 不要把 `.trash`、`.thumbs`、`.meta`、`.system` 作为用户目录名，它们是系统保留前缀。

## 测试

```bash
npm test
```

测试覆盖列表、搜索、权限、预览、上传、回收站、隐藏路径、访问密码、文件索引和核心路由流程。
