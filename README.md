# O-Drive

O-Drive 是一个部署在 Cloudflare Pages 上的轻量文件管理项目，使用 Cloudflare R2 存储文件，使用 D1 保存日志、回收站和访问控制配置。

## 功能

- 游客浏览文件和文件夹
- 管理员登录、上传、移动、复制、重命名、删除
- 小文件普通上传，大文件自动分片上传
- 图片缩略图、图片/视频/音频/PDF/文本/Markdown 预览
- 文本文件在线编辑保存
- 搜索、筛选、排序、详情面板
- 批量选择和批量操作
- 回收站恢复、彻底删除、清空、按保留天数清理
- 隐藏路径管理
- 路径访问密码管理
- 管理控制台、操作日志、存储概览和风险提醒
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

## 初始化 D1 数据库

O-Drive 会在运行时自动创建需要的 D1 表。你只需要先创建 D1 数据库，并把它绑定到 Pages Functions。

### 方式一：Cloudflare 控制台

1. 进入 Cloudflare Dashboard。
2. 打开 Workers & Pages -> D1 SQL Database。
3. 点击 Create database。
4. 输入数据库名称，例如 `o-drive-db`。
5. 创建完成后，进入 Pages 项目。
6. 打开 Settings -> Functions -> D1 database bindings。
7. 添加绑定：
   - Variable name: `DB`
   - D1 database: 选择刚创建的数据库
8. 重新部署 Pages 项目。

第一次访问 API、登录、上传、删除或打开管理台时，项目会自动初始化这些表：

- `settings`
- `logs`
- `login_attempts`
- `trash`
- `path_passwords`

其中部分表会在对应功能首次使用时创建，例如回收站和访问密码。

### 方式二：Wrangler 命令行

如果你使用 Wrangler，也可以用命令创建数据库：

```bash
npx wrangler d1 create o-drive-db
```

创建后把输出中的数据库绑定到 Cloudflare Pages。Pages 项目中最终仍然需要有这个绑定：

```text
Variable name: DB
Binding type: D1 database
```

本项目不要求你手动执行 SQL 初始化脚本；如果页面返回 500，通常是 `DB` 未绑定、变量名不是 `DB`，或绑定没有部署到当前环境。

## 绑定资源

在 Pages 项目的 Settings -> Functions -> Bindings 中添加：

| 类型 | 变量名 | 说明 |
| --- | --- | --- |
| D1 database | `DB` | 保存日志、设置、回收站、登录限制 |
| R2 bucket | `R2_BUCKET` | 保存实际文件内容 |

## 环境变量

在 Pages 项目的 Settings -> Environment variables 中添加：

| 变量名 | 必填 | 说明 |
| --- | --- | --- |
| `ADMIN_USERNAME` | 是 | 管理员用户名 |
| `ADMIN_PASSWORD` | 是 | 管理员密码，也用于签名登录会话 |
| `ALLOW_GUEST` | 否 | 只有设为 `true` 时允许游客访问；不填或设为其他值时关闭游客访问 |

修改环境变量后需要重新部署。

## 本地开发

```bash
npm install
npm run build
npm test
```

本项目的 API 依赖 Cloudflare Pages Functions、R2 和 D1，本地直接打开 `public/index.html` 只能查看静态页面，完整功能需要在 Cloudflare 环境或兼容的本地 Pages 开发环境中运行。

## 首次部署检查

部署后建议按顺序检查：

1. 打开首页，确认游客模式是否符合预期。默认未配置 `ALLOW_GUEST` 时需要登录。
2. 点击登录，使用 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 登录。
3. 上传一个小文件，确认 R2 写入正常。
4. 新建文件夹并进入，确认路径操作正常。
5. 删除测试文件，再到回收站恢复，确认 D1 表初始化正常。
6. 打开 `/admin.html`，查看概览、日志、隐藏管理和访问密码页面。

如果页面返回 500，优先检查 `DB` 和 `R2_BUCKET` 绑定是否存在。
如果登录失败，检查环境变量是否部署到了当前 Pages 环境。
如果管理操作提示安全校验过期，刷新页面后重新登录。

## 管理建议

- 大目录删除、移动、复制前先看确认框中的路径列表，超大目录建议分批处理。
- 回收站会继续占用 R2 空间，建议在管理台设置保留天数并定期清理。
- 管理台概览出现扫描上限提醒时，说明文件数量已经较多，后续可以考虑引入文件索引。
- 隐藏路径只是不向游客展示；需要访问控制时请使用“访问密码”。
- 不要把 `.trash`、`.thumbs`、`.meta`、`.system` 作为用户目录名，它们是系统保留前缀。

## 测试

```bash
npm test
```

测试覆盖列表、搜索、权限、预览、上传、回收站、隐藏路径和访问密码等核心流程。
