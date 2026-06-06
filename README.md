# O-Drive

O-Drive 是一个部署在 Cloudflare Pages 上的轻量文件管理器。它使用 Cloudflare R2 保存文件，使用 Cloudflare D1 保存日志、回收站、访问控制、文件索引、存储配额和 Webhook 配置。

项目适合用来搭建个人网盘、团队资料盘、轻量公开文件目录或临时文件分发站。

## 功能概览

- 游客浏览文件和文件夹，可通过环境变量关闭游客访问。
- 管理员登录后可上传、创建文件夹、移动、复制、重命名、删除文件。
- 小文件普通上传，大文件自动分片上传，支持暂停、继续、取消和失败重试。
- 支持选择文件夹上传，并在 R2 中保留本地目录结构。
- 支持图片缩略图，图片、视频、音频、PDF、文本、Markdown 在线预览。
- 文本文件可在线编辑并保存。
- 支持搜索、筛选、排序、详情面板、批量选择和批量操作。
- 回收站支持恢复、彻底删除、清空、筛选和按保留天数清理。
- 支持隐藏路径管理，隐藏后的路径不会向游客展示。
- 支持路径访问密码，控制预览和下载，并带错误次数锁定。
- 管理后台提供概览、文件索引状态、操作日志、系统状态、存储配额和 Webhook 通知。
- Webhook 支持自定义 URL、method、content_type、headers、body、Basic Auth、消息格式和事件订阅范围。
- 移动端可浏览、预览、上传文件，并执行管理员批量操作。

## 技术栈

- Cloudflare Pages：托管静态前端和 Pages Functions。
- Cloudflare Pages Functions：提供 API。
- Cloudflare R2：保存文件内容、回收站对象和缩略图缓存。
- Cloudflare D1：保存配置、日志、回收站记录、访问密码、文件索引和配额。
- Tailwind CSS：构建前端样式。
- Node.js test runner：运行核心测试。
- Playwright：运行浏览器端回归测试。

## 目录结构

```text
functions/api/[[path]].js      Cloudflare Pages Functions API 入口
functions/api/lib/             后端功能模块
public/index.html              云盘首页
public/admin.html              管理后台
public/js/                     前端模块
public/style.css               Tailwind 输入文件
public/main.css                Tailwind 构建输出
tests/core.test.mjs            核心后端和前端工具测试
tests/browser/                 浏览器测试
```

## 部署前准备

需要准备：

- 一个 Cloudflare 账号。
- 一个 Cloudflare Pages 项目。
- 一个 Cloudflare R2 Bucket。
- 一个 Cloudflare D1 数据库。
- Node.js 18 或更高版本，用于本地安装依赖和构建 CSS。

## Cloudflare 部署教程

### 1. 创建 R2 Bucket

进入 Cloudflare Dashboard：

1. 打开 `R2 Object Storage`。
2. 点击 `Create bucket`。
3. 输入 Bucket 名称，例如 `o-drive-files`。
4. 创建完成后记住该 Bucket，后面要绑定到 Pages Functions。

### 2. 创建 D1 数据库

进入 Cloudflare Dashboard：

1. 打开 `D1 SQL Database`。
2. 点击 `Create database`。
3. 输入数据库名称，例如 `o-drive-db`。
4. 创建完成即可，不需要手动建表。

O-Drive 会在功能首次使用时自动创建所需表，包括日志、设置、回收站、登录失败记录、访问密码、文件索引、配额和 Webhook 配置。

### 3. 创建 Pages 项目

推荐把项目推送到 GitHub，然后在 Cloudflare Pages 中连接仓库：

1. 打开 `Workers & Pages`。
2. 选择 `Pages`。
3. 点击 `Create a project`。
4. 选择你的 Git 仓库。
5. 构建配置填写：

| 配置项 | 值 |
| --- | --- |
| Build command | `npm run build` |
| Build output directory | `public` |
| Root directory | 留空，除非你的项目在仓库子目录 |

Pages Functions 会自动读取 `functions` 目录。

### 4. 绑定 R2 和 D1

进入 Pages 项目设置：

1. 打开 `Settings`。
2. 打开 `Functions`。
3. 找到 `Bindings`。
4. 添加以下绑定：

| 类型 | 变量名 | 说明 |
| --- | --- | --- |
| D1 database | `D1` | 选择刚创建的 D1 数据库 |
| R2 bucket | `R2` | 选择刚创建的 R2 Bucket |

变量名必须严格写成 `D1` 和 `R2`。

### 5. 配置环境变量

进入 Pages 项目设置：

1. 打开 `Settings`。
2. 打开 `Environment variables`。
3. 添加以下变量。

| 变量名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `ADMIN_USERNAME` | 是 | `admin` | 管理员用户名 |
| `ADMIN_PASSWORD` | 是 | `change-me-to-a-strong-password` | 管理员密码，也用于签名登录会话和路径访问会话 |
| `ALLOW_GUEST` | 否 | `true` | 只有设为 `true` 时允许游客访问；其他值表示关闭游客访问 |
| `PATH_UNLOCK_MAX_ATTEMPTS` | 否 | `5` | 受保护路径同一 IP 连续输错多少次后锁定 |
| `PATH_UNLOCK_LOCK_MINUTES` | 否 | `15` | 受保护路径输错后的锁定分钟数 |

修改绑定或环境变量后，需要重新部署 Pages 项目才会生效。

### 6. 首次部署检查

部署完成后建议按顺序检查：

1. 打开首页，确认游客访问是否符合预期。
2. 如果未开启游客访问，页面会要求登录。
3. 使用 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 登录。
4. 上传一个小文件，确认 R2 写入正常。
5. 新建一个文件夹并进入，确认目录操作正常。
6. 删除测试文件，再到回收站恢复，确认 D1 写入正常。
7. 打开 `/admin.html`，检查概览、系统状态和日志。
8. 在“系统状态”的快捷维护区执行“重建文件索引”，确认索引可同步。

如果页面返回 500，优先检查 `D1` 和 `R2` 绑定是否存在。如果登录失败，检查环境变量是否部署到了当前环境。如果管理员操作提示安全校验过期，刷新页面后重新登录。

## 本地开发

安装依赖：

```bash
npm install
```

构建样式：

```bash
npm run build
```

运行核心测试：

```bash
npm test
```

如果在 Windows PowerShell 中遇到 `npm.ps1` 执行策略限制，可以直接运行项目里的测试命令：

```bash
node --test tests/*.test.mjs
```

运行浏览器测试：

```bash
npm run test:browser
```

本项目完整 API 依赖 Cloudflare Pages Functions、R2 和 D1。直接打开 `public/index.html` 只能查看静态界面，无法完整使用上传、登录、列表和管理功能。

## 使用教程

### 登录和角色

O-Drive 有两种角色：

- 游客：只能浏览允许展示的文件，能否访问由 `ALLOW_GUEST` 控制。
- 管理员：登录后可上传、编辑、移动、复制、删除和进入管理后台。

管理员登录使用环境变量 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`。

### 浏览文件

打开首页后可以：

- 点击文件夹进入目录。
- 点击文件预览。
- 使用列表视图或网格视图查看文件。
- 查看文件大小、更新时间和详情面板。
- 对可预览文件执行预览，对任意文件执行下载。

系统保留前缀不会作为普通文件展示：

- `.trash`
- `.thumbs`
- `.meta`
- `.system`

不要把这些名称作为用户目录名。

### 上传文件

管理员登录后可以上传文件：

1. 进入目标目录。
2. 点击上传按钮。
3. 选择文件。
4. 等待上传队列完成。

小文件会直接上传，大文件会自动使用分片上传。上传队列支持暂停、继续、取消和失败重试。

移动端上传菜单提供“文件”“文件夹”入口，上传进度会显示在底部面板中。

### 上传文件夹

管理员可以选择本地文件夹上传。上传时会保留本地目录结构，例如：

```text
资料/
  合同/a.pdf
  图片/b.jpg
```

上传到 `/客户/` 后会保存为：

```text
客户/资料/合同/a.pdf
客户/资料/图片/b.jpg
```

### 新建文件夹

管理员可以在当前目录中新建文件夹。文件夹名会被校验，不能包含路径穿越、控制字符、Windows 保留名称或过长名称。

### 预览文件

支持的预览类型包括：

- 图片：常见图片格式会在页面中展示，并在列表中显示缩略图。
- 视频：支持浏览器可播放的视频格式。
- 音频：支持浏览器可播放的音频格式。
- PDF：使用浏览器内置 PDF 预览。
- 文本：以文本查看器打开。
- Markdown：使用本地 Markdown 渲染器渲染。

预览和下载支持 Range 请求，适合媒体文件和较大的文件。

### 在线编辑文本

管理员打开文本类文件后，可以进入编辑模式，修改内容并保存。保存会写回 R2，并同步文件索引。

### 搜索、筛选和排序

首页支持：

- 按文件名搜索。
- 在当前目录范围内搜索。
- 按类型筛选。
- 按名称、时间、大小排序。
- 搜索结果较多时加载更多。

当 D1 文件索引存在时，搜索会优先使用索引；没有索引时会扫描 R2 列表。文件很多时建议在管理后台重建索引。

### 批量操作

管理员可以选择多个文件或文件夹，然后执行：

- 复制
- 移动
- 删除
- 清空选择

移动、复制、删除大目录前，系统会估算对象数量。超大目录建议分批处理。

### 重命名

管理员选择单个项目后可以重命名。系统会拒绝覆盖已有同名目标。

### 回收站

删除文件或文件夹时，项目会先进入回收站。管理员可以在回收站中：

- 恢复项目。
- 彻底删除项目。
- 清空回收站。
- 按路径或名称筛选。
- 按文件或文件夹类型筛选。
- 按删除日期范围筛选。
- 设置保留天数并执行清理。

回收站内容仍然占用 R2 空间，建议定期清理。

### 隐藏路径

打开 `/admin.html`，进入“隐藏管理”页，可以添加隐藏路径。

隐藏路径的效果：

- 游客列表中不会显示该路径。
- 管理员仍然可以查看和管理。
- 这不是下载密码保护，只是控制游客是否能在列表中看到。

如果需要真正控制预览和下载，请使用“访问密码”。

### 访问密码

打开 `/admin.html`，进入“访问密码”页，可以为指定路径设置密码。

访问密码的效果：

- 游客预览或下载受保护路径下的文件时，需要输入密码。
- 可以设置是否允许游客看到路径名称。
- 密码使用 PBKDF2 保存。
- 同一 IP 对同一路径连续输错会被临时锁定。

默认锁定规则：

- 输错 5 次后锁定。
- 锁定 15 分钟。

可以通过 `PATH_UNLOCK_MAX_ATTEMPTS` 和 `PATH_UNLOCK_LOCK_MINUTES` 修改。

### 管理后台概览

打开 `/admin.html`，进入“概览”页，可以查看：

- 文件数量。
- 存储占用。
- 回收站数量和占用。
- 日志数量。
- 文件类型分布。
- 最近新增文件。
- 存储和回收站风险提示。
- 文件索引状态、最后更新时间和重建索引入口。

### 操作日志

“操作日志”记录管理员上传、删除、移动、复制、重命名、维护、配额、Webhook、隐藏路径和访问密码等关键操作，便于追踪变更来源。

### 系统状态

“系统状态”包含环境检查和快捷维护。环境检查用于确认：

- D1 绑定是否存在。
- R2 绑定是否存在。
- 管理员用户名是否配置。
- 管理员密码是否配置。
- 游客访问是否开启。

部署后遇到 500、登录失败或文件无法读写时，建议先看这里。

### 快捷维护

“系统状态”下方的快捷维护区提供：

- 文件索引记录数和索引状态。
- 回收站记录数。
- 操作日志数量。
- 访问失败记录数量。
- 缩略图缓存状态。
- 重建文件索引。
- 清理访问失败记录。
- 清理缩略图缓存。

当文件数量较多、搜索变慢、统计不准确时，建议执行“重建文件索引”。

### 存储配额

“存储配额”用于设置总存储上限：

- 设置为 `0` 表示不限制。
- 设置为正数字节数后，系统会在上传前检查剩余空间。
- 如果上传会超过配额，会拒绝上传并返回配额不足。

页面提供 5 GB、10 GB、50 GB、100 GB 和不限制的快捷按钮。

### Webhook 通知

打开 `/admin.html`，进入“Webhook”页，可以配置文件操作通知。

会触发通知的事件包括：

- 文件上传
- 文件删除
- 文件彻底删除
- 文件移动
- 文件复制
- 文件重命名
- 文件夹创建
- 测试通知

常见事件名：

```text
file.uploaded
file.deleted
file.purged
file.moved
file.copied
file.renamed
folder.created
webhook.test
```

默认 JSON 载荷示例：

```json
{
  "event": "file.uploaded",
  "timestamp": "2026-06-06T12:00:00.000Z",
  "data": {
    "path": "/example.txt",
    "uploader": "admin"
  }
}
```

Webhook 发送设置字段：

| 字段 | 说明 |
| --- | --- |
| `url` | 接收通知的地址，必填 |
| `method` | HTTP 方法，默认 `POST` |
| `content_type` | 请求体类型，默认 `application/json` |
| `headers` | 自定义请求头，填写 JSON 对象 |
| `body` | 自定义请求体模板，留空时使用系统默认载荷 |
| `username` | HTTP Basic Auth 用户名，可选 |
| `password` | HTTP Basic Auth 密码，可选 |
| `msgtype` | 消息格式，支持 `json`、`text`、`markdown` |
| `名称` | 仅用于后台区分不同 Webhook |
| `触发事件` | 选择哪些文件事件会触发该 Webhook；全选或留空表示全部事件 |

`headers` 示例：

```json
{
  "X-Source": "O-Drive",
  "Authorization": "Bearer your-token"
}
```

自定义 `body` 支持简单模板变量：

```json
{
  "event": "{event}",
  "time": "{timestamp}",
  "path": "{{data.path}}"
}
```

如果填写了 `username` 或 `password`，且 `headers` 中没有手动设置 `Authorization`，系统会自动添加 HTTP Basic Auth 请求头。

企业微信机器人可以直接填写机器人地址，并按需要选择 `text` 或 `markdown`：

```text
https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxxxxx
```

普通微信个人聊天不能直接接收 Webhook。钉钉、飞书等平台如果要求签名或特殊字段，建议准备一个中转服务：O-Drive 发送通用 JSON 到中转服务，再由中转服务转换成目标平台要求的格式。

## 运维建议

- 给 `ADMIN_PASSWORD` 设置足够强的密码。
- 不需要公开目录时，不要设置 `ALLOW_GUEST=true`。
- 文件数量很多时，定期重建文件索引。
- 回收站会持续占用 R2 空间，建议设置保留天数并定期清理。
- 大目录删除、移动、复制前先确认对象数量。
- Webhook 中涉及敏感 token 时，优先使用 HTTPS。
- 不要把 `.trash`、`.thumbs`、`.meta`、`.system` 作为用户目录。

## 常见问题

### 页面返回 500

优先检查 Pages Functions 绑定：

- 是否绑定了 D1，变量名是否为 `D1`。
- 是否绑定了 R2，变量名是否为 `R2`。
- 当前部署环境是否也配置了这些绑定。

### 登录失败

检查：

- `ADMIN_USERNAME` 是否配置。
- `ADMIN_PASSWORD` 是否配置。
- 环境变量是否部署到了当前 Pages 环境。
- 修改环境变量后是否重新部署。

### 管理员操作提示安全校验失败

刷新页面后重新登录。管理员写操作需要 CSRF token，登录态过期或页面停留过久时可能触发该提示。

### 游客无法访问

默认游客访问是关闭的。需要在环境变量中设置：

```text
ALLOW_GUEST=true
```

修改后重新部署。

### 搜索结果不完整或统计不准确

打开 `/admin.html`，进入“系统状态”，在快捷维护区执行“重建文件索引”。

### 上传被拒绝

可能原因：

- 文件过大，超过请求体限制。
- 存储配额不足。
- 目标路径是系统保留前缀。
- 登录态或 CSRF token 过期。

### Webhook 测试失败

检查：

- URL 是否能从 Cloudflare 访问。
- 目标服务是否要求 HTTPS。
- method、content_type、headers 是否符合接收端要求。
- 如果使用 Basic Auth，username 和 password 是否正确。
- 如果平台要求签名，是否需要通过中转服务处理。

## 测试

核心测试：

```bash
node --test tests/*.test.mjs
```

浏览器测试：

```bash
npm run test:browser
```

测试覆盖列表、搜索、权限、预览、上传、回收站、隐藏路径、访问密码、文件索引、存储配额、Webhook 和核心路由流程。

## License

本项目使用 MIT License，详见 `LICENSE`。
