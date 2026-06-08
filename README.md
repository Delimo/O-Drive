# O-Drive

O-Drive 是一个运行在 Cloudflare Pages 上的轻量云盘。它默认用 R2 保存文件，也可以扩展 S3 兼容空间；D1 保存配置、日志、回收站、分享链接、访问控制、文件索引、存储配额和 Webhook 记录。

它适合个人网盘、团队资料盘、临时文件分发站，或一个可公开浏览但由管理员维护的轻量文件目录。

## 主要能力

- 文件浏览：列表视图、网格视图、面包屑、搜索、筛选、排序和详情面板。
- 文件预览：图片、视频、音频、PDF、文本和 Markdown 在线预览。
- 文件管理：上传、新建文件夹、移动、复制、重命名、删除和批量操作。
- 大文件上传：自动分片上传，支持暂停、继续、取消和失败重试。
- 文件夹上传：保留本地目录结构。
- 在线编辑：管理员可编辑文本类文件并保存回文件所在的存储空间。
- 多存储空间：根目录默认 R2，支持 S3 兼容空间、路径绑定和 R2 高水位自动溢出。
- 回收站：支持恢复、彻底删除、清空、筛选和按保留天数清理。
- 分享链接：为单个文件创建公开分享，可限制有效期、下载次数、预览和下载权限。
- 权限控制：游客访问开关、隐藏路径、路径访问密码和错误次数锁定。
- 管理后台：概览、系统状态、操作日志筛选、快捷维护、存储配额、分享管理和 Webhook 配置。
- Webhook：支持 JSON、文本、Markdown 消息，自定义请求，事件订阅和最近发送记录。
- 移动端：适配浏览、预览、上传、批量操作和管理后台。

## 技术组成

| 部分 | 用途 |
| --- | --- |
| Cloudflare Pages | 托管静态前端 |
| Pages Functions | 提供 API |
| Cloudflare R2 | 默认保存文件、回收站对象和缩略图缓存 |
| S3 compatible storage | 可选扩展空间，用于文件夹绑定或 R2 高水位溢出 |
| Cloudflare D1 | 保存配置、日志、索引、分享和访问控制数据 |
| Tailwind CSS | 构建前端样式 |
| Node.js test runner | 运行核心测试 |
| Playwright | 运行浏览器回归测试 |

## 项目结构

```text
functions/api/[[path]].js       API 入口
functions/api/lib/              后端模块
migrations/                     D1 数据库迁移
public/index.html               云盘首页
public/admin.html               管理后台
public/share.html               公开分享页
public/js/                      前端模块
public/style.css                Tailwind 输入
public/main.css                 Tailwind 输出
tests/core.test.mjs             核心测试
tests/helpers/                  测试夹具
tests/browser/                  浏览器测试
```

## 部署

### 准备资源

你需要：

- 一个 Cloudflare 账号。
- 一个 Cloudflare Pages 项目。
- 一个 Cloudflare R2 Bucket。
- 一个 Cloudflare D1 数据库。
- Node.js 18 或更高版本。

### 创建 R2 Bucket

1. 打开 Cloudflare Dashboard。
2. 进入 `R2 Object Storage`。
3. 创建一个 Bucket，例如 `o-drive-files`。

### 创建 D1 数据库

1. 进入 `D1 SQL Database`。
2. 创建一个数据库，例如 `o-drive-db`。
3. 可以运行 `migrations/0001_initial.sql` 初始化表结构。O-Drive 也会在功能首次使用时自动创建缺失表，方便已有部署平滑升级。

自动创建的数据表包括：

- 系统设置
- 操作日志
- 登录失败记录
- 路径访问密码
- 回收站记录
- 文件索引
- 存储配额
- 分享链接
- Webhook 配置
- Webhook 发送记录
- 下载异常提醒记录

### 创建 Pages 项目

推荐把项目推送到 GitHub，然后在 Cloudflare Pages 中连接仓库。

构建配置：

| 配置项 | 值 |
| --- | --- |
| Build command | `npm run build` |
| Build output directory | `public` |
| Root directory | 仓库根目录时留空 |

Pages Functions 会自动读取 `functions` 目录。

### 绑定 R2 和 D1

进入 Pages 项目的 `Settings` -> `Functions` -> `Bindings`，添加：

| 类型 | 变量名 | 说明 |
| --- | --- | --- |
| D1 database | `D1` | 选择 D1 数据库 |
| R2 bucket | `R2` | 选择 R2 Bucket |

变量名必须是 `D1` 和 `R2`。

本项目不提交 `wrangler.toml`，避免仓库配置接管 Cloudflare Pages 的生产环境变量和资源绑定。请在 Cloudflare Pages Dashboard 的 Bindings 页面配置真实绑定。

### 配置 S3 兼容空间

S3 空间是可选功能。没有配置 S3 时，所有文件仍按原来的方式写入 R2。

进入 `/admin.html` -> `存储配额`，在 `S3 空间` 区域填写：

| 字段 | 说明 |
| --- | --- |
| 名称 | 后台和上传提示中显示的名称，例如 `S3-主存储` |
| ID | 内部标识，例如 `s3-main`，保存后不要随意修改 |
| Endpoint | S3 兼容服务地址，例如 `https://s3.example.com` |
| Bucket | 目标 Bucket 名称 |
| Access Key ID | S3 访问密钥 ID |
| Secret Access Key | S3 访问密钥 Secret，保存后不会回显 |
| Region | 区域，Cloudflare R2 S3 API 通常可用 `auto` |
| 前缀 | 可选，所有对象写入该前缀下 |
| 容量上限 | 可选，例如 `100GB`、`500GB`；留空表示不限制该 S3 空间 |

填写后先点 `测试连接`。测试会向 Bucket 发起一次签名的 `ListObjectsV2` 请求，只读取最多 1 个对象，用于验证 Endpoint、Bucket 和密钥是否可用。测试成功后再点 `保存 S3 空间`。

### 文件夹绑定和 R2 溢出

根目录默认使用 R2。管理员可以在 `存储配额` -> `路径绑定与溢出` 中把目录绑定到指定空间：

| 云盘路径 | 存储空间 |
| --- | --- |
| `/` | 默认 R2 |
| `/photos` | S3-主存储 |
| `/archive` | 另一个 S3 空间 |

规则：

- 子目录继承最近的上级绑定。
- 上传到 `/photos/2026/a.jpg` 会写入 `/photos` 绑定的 S3。
- 未绑定路径继续写入 R2。
- 旧文件保留原来的 `storage_id`，不会因为改绑定自动迁移。
- 复制或移动到另一个绑定目录时，新对象会写入目标目录对应的空间。

每个存储空间可以单独设置容量上限。R2 建议设置为低于免费额度的安全值，例如 `9.5GB`；S3 空间可按服务商套餐设置，例如 `100GB` 或 `1TB`。上传时系统会先确定最终写入哪个空间，再检查该空间自己的剩余容量。

页面上方的总存储配额仍是全局上限；单个空间配额是各桶自己的上限。上传需要同时满足全局配额和目标空间配额。

R2 高水位自动溢出默认开启，默认容量按 `10GB`、阈值按 `85%` 计算。目标路径本来应写入 R2，且本次上传后预计达到阈值时，会自动写入第一个启用的 S3 溢出空间。上传面板会显示提示，例如：

```text
R2 空间已使用 86%，本次上传将自动存入 S3 空间：S3-主存储
```

如果没有配置可用的 S3 溢出空间，系统只提示 R2 已接近阈值，不会擅自改变写入位置。

### 配置环境变量

进入 Pages 项目的 `Settings` -> `Environment variables`。

| 变量名 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| `ADMIN_USERNAME` | 是 | `admin` | 管理员用户名 |
| `ADMIN_PASSWORD` | 是 | `change-me` | 管理员密码 |
| `TOKEN_SECRET` | 推荐 | `生成的随机字符串` | 用于签名登录、分享和路径解锁 Cookie；未配置时会回退到 `ADMIN_PASSWORD` |
| `ALLOW_GUEST` | 否 | `true` | 设为 `true` 时允许游客浏览 |
| `PATH_UNLOCK_MAX_ATTEMPTS` | 否 | `5` | 受保护路径密码最大错误次数 |
| `PATH_UNLOCK_LOCK_MINUTES` | 否 | `15` | 受保护路径锁定分钟数 |
| `DOWNLOAD_BURST_THRESHOLD` | 否 | `30` | 下载异常提醒阈值 |
| `DOWNLOAD_BURST_WINDOW_SECONDS` | 否 | `300` | 下载异常统计窗口 |
| `DOWNLOAD_BURST_COOLDOWN_SECONDS` | 否 | `1800` | 下载异常提醒冷却时间 |
| `DOWNLOAD_BURST_BLOCK_SECONDS` | 否 | `600` | 异常下载临时阻断时长，`0` 表示只告警不阻断 |

`TOKEN_SECRET` 是系统用来给登录状态、分享访问和路径解锁 Cookie 做签名的随机密钥。它不是管理员密码，不需要自己记住，也不要填固定的简单文字。

推荐生成一次 48 字节随机值，然后长期保存到 Cloudflare Pages 的环境变量里。Windows PowerShell、macOS 终端或 Linux 终端都可以运行：

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

运行后会输出一长串随机字符，例如：

```text
4z7iP8...中间很长...Kq2w
```

把这整串内容复制到 Cloudflare Pages 的环境变量：

```text
变量名：TOKEN_SECRET
变量值：刚才生成的整串随机字符
```

注意：

- 只需要生成一次，不要每次部署都换。
- 不要把真实的 `TOKEN_SECRET` 写进 README、截图、聊天记录或公开仓库。
- 如果以后手动更换 `TOKEN_SECRET`，已登录的浏览器、已解锁的分享和路径访问会需要重新验证。

修改绑定或环境变量后，需要重新部署 Pages。

### 最短部署路径

1. 在 Cloudflare 创建 R2 Bucket 和 D1 数据库。
2. 在 Pages 项目中绑定 `R2` 和 `D1`，变量名必须分别叫 `R2`、`D1`。
3. 配置 `ADMIN_USERNAME`、`ADMIN_PASSWORD`、`TOKEN_SECRET`。
4. 运行远程 D1 迁移：`npm run db:migrate:remote`。
5. 部署 Pages：`npm run deploy`，或在 Cloudflare Pages 里使用构建命令 `npm run build`、输出目录 `public`。
6. 首次登录 `/admin.html` 后，在“系统状态”里检查绑定、密钥和索引状态。

### 首次检查

部署完成后建议按这个顺序检查：

1. 打开首页，确认游客访问状态符合预期。
2. 使用管理员账号登录。
3. 上传一个小文件，确认 R2 写入正常。
4. 新建文件夹，确认目录操作正常。
5. 删除并恢复一个测试文件，确认 D1 和回收站正常。
6. 打开 `/admin.html`，查看系统状态。
7. 在系统状态页执行“重建文件索引”。

## 使用指南

### 角色

O-Drive 有两种角色：

- 游客：可浏览允许展示的文件，是否开启由 `ALLOW_GUEST` 控制。
- 管理员：可上传、编辑、移动、复制、删除，并进入管理后台。

### 文件浏览

首页支持：

- 进入文件夹。
- 预览和下载文件。
- 列表视图和网格视图切换。
- 搜索文件名。
- 按类型筛选。
- 按名称、时间和大小排序。
- 查看文件详情。

系统保留前缀不会作为普通文件展示：

```text
.trash
.thumbs
.meta
.system
```

不要把这些名称作为用户目录名。

### 上传

管理员可以上传文件或文件夹。小文件直接上传，大文件自动走分片上传。

上传队列支持：

- 暂停
- 继续
- 取消
- 失败重试
- 冲突时重命名、覆盖或跳过

选择文件夹上传时，会保留本地目录结构。

### 在线预览和编辑

支持预览：

- 图片
- 视频
- 音频
- PDF
- 文本
- Markdown

文本类文件可以在线编辑并保存。保存后会写回文件当前所在的存储空间，并同步文件索引。

### 批量操作

管理员可以选择多个文件或文件夹执行：

- 复制
- 移动
- 删除
- 清空选择

系统会在大目录操作前估算对象数量。目录特别大时建议分批处理。

### 回收站

普通删除会先进入回收站。管理员可以：

- 恢复文件或文件夹。
- 彻底删除。
- 清空回收站。
- 按名称、路径、类型和删除日期筛选。
- 设置保留天数并清理。

回收站对象仍占用原存储空间，建议定期清理。

## 分享链接

管理员可以在文件详情面板中为单个文件创建公开分享链接。访问者不需要登录。

可配置项：

- 有效期，默认 7 天。
- 最大下载次数，`0` 表示不限制。
- 是否允许在线预览。
- 是否允许下载。

公开分享页格式：

```text
/share.html?token=分享令牌
```

分享链接只保存 D1 元数据，不复制 R2 文件。删除分享记录后，公开链接立即失效，不会留下额外文件副本。

过期和清理规则：

- 到期后立即停止访问。
- 到期后的 7 天内，管理后台仍会显示记录。
- 这 7 天内可以手动删除。
- 到期超过 7 天后，系统会在管理端加载分享列表或访问该过期链接时自动清理。
- 达到下载次数上限的分享会立即失效并清理。

打开 `/admin.html` 的“分享链接”页可以：

- 查看所有分享。
- 复制公开地址。
- 删除任意分享。
- 手动清理已过期或已达到下载次数限制的分享。

## 访问控制

### 游客访问

默认游客访问关闭。要允许游客浏览，设置：

```text
ALLOW_GUEST=true
```

### 隐藏路径

管理后台的“隐藏管理”用于隐藏游客列表中的路径。

隐藏路径的效果：

- 游客看不到该路径。
- 管理员仍可查看和管理。
- 这不是密码保护，只是隐藏展示入口。

### 访问密码

管理后台的“访问密码”可以为指定路径设置密码。

效果：

- 游客预览或下载受保护路径时需要输入密码。
- 可选择是否让游客看到路径名称。
- 密码使用 PBKDF2 保存。
- 同一 IP 连续输错会临时锁定。

## 管理后台

后台地址：

```text
/admin.html
```

### 概览

概览页显示：

- 文件数量
- 存储占用
- 回收站数量和占用
- 日志数量
- 文件类型分布
- 最近新增文件
- 存储和回收站风险提示
- 文件索引状态

### 系统状态和快捷维护

系统状态页会检查：

- D1 绑定
- R2 绑定
- 管理员用户名
- 管理员密码
- 游客访问状态

快捷维护支持：

- 重建文件索引。
- 清理访问失败记录。
- 清理缩略图缓存。

当搜索不完整、统计不准确或文件很多时，建议重建文件索引。

### 操作日志

操作日志记录上传、删除、移动、复制、重命名、维护、配额、分享、Webhook、隐藏路径和访问密码等关键操作。

日志支持筛选：

- 关键词
- 动作
- IP
- 日期范围

### 存储配额

存储配额用于限制总存储占用。

- 设置为 `0` 表示不限制。
- 设置为正数字节数后，上传前会检查剩余空间。
- 超过配额的上传会被拒绝。

页面提供 5 GB、10 GB、50 GB、100 GB 和不限制的快捷按钮。

## Webhook

Webhook 用于把 O-Drive 的文件事件通知到外部系统或群机器人。

支持事件：

- 上传
- 删除
- 彻底删除
- 移动
- 复制
- 重命名
- 新建文件夹
- 大量下载提醒
- 登录异常提醒
- 测试通知

内部事件名：

```text
file.uploaded
file.deleted
file.purged
file.moved
file.copied
file.renamed
folder.created
download.burst
login.burst
webhook.test
```

### 消息格式

`json` 适合程序和中转服务处理。示例：

```json
{
  "event": "file.uploaded",
  "timestamp": "2026-06-07T12:00:00.000Z",
  "data": {
    "path": "/example.txt",
    "uploader": "admin"
  }
}
```

`text` 和 `markdown` 适合企业微信、飞书、钉钉等群机器人。系统会把事件名转换成中文，并使用中国时间。

示例：

```text
O-Drive 删除
事件：删除
时间：2026/6/7 21:12:47（中国时间）
对象：worker.js
```

测试通知：

```text
O-Drive 测试通知
事件：测试通知
时间：2026/6/7 21:12:47（中国时间）
说明：这是一条来自 O-Drive 的 test 测试通知。
```

### 请求设置

Webhook 可配置：

| 字段 | 说明 |
| --- | --- |
| 名称 | 后台展示用 |
| URL | 接收通知的地址 |
| Method | 默认 `POST` |
| Content-Type | 默认 `application/json` |
| Headers | JSON 对象形式的自定义请求头 |
| Body | 自定义请求体模板 |
| 消息格式 | `json`、`text` 或 `markdown` |
| 触发事件 | 选择哪些事件会触发 |

自定义 `body` 支持简单模板变量：

```json
{
  "event": "{event}",
  "time": "{timestamp}",
  "path": "{{data.path}}"
}
```

Webhook 页面会显示最近发送记录，包括事件、目标、HTTP 状态、耗时和成功/失败状态。

如果目标平台要求签名或特殊字段，建议准备一个中转服务：O-Drive 发送通用 JSON 到中转服务，再由中转服务转换成目标平台要求的格式。

## 本地开发

安装依赖：

```bash
npm install
```

构建样式：

```bash
npm run build
```

本地启动 Pages Functions：

```bash
cp .dev.vars.example .dev.vars
npm run dev
```

本地应用 D1 迁移：

```bash
npm run db:migrate:local
```

应用远端 D1 迁移：

```bash
npm run db:migrate:remote
```

运行核心测试：

```bash
npm test
```

或直接运行：

```bash
node --test tests/*.test.mjs
```

运行浏览器测试：

```bash
npm run test:browser
```

完整 API 依赖 Cloudflare Pages Functions、R2 和 D1。直接打开静态 HTML 只能查看部分界面，不能完整使用登录、上传和管理功能。

## S3 上线验证清单

部署到 Cloudflare Pages 后，建议按这个顺序验证：

1. 打开 `/admin.html` -> `存储配额`，配置一个 S3 空间并点击 `测试连接`。成功后再保存。
2. 把 R2 容量设为 `9.5GB`，S3 容量按实际套餐填写，例如 `100GB`。
3. 临时把 R2 溢出阈值调低到 `1%`，上传一个小文件，确认上传面板出现“自动存入 S3 空间”的提示。
4. 上传一个大于 16MB 的文件，确认分片上传可以完成。
5. 对 S3 文件执行预览、下载、删除到回收站、恢复、彻底删除。
6. 绑定一个目录，例如 `/s3-test` 到 S3，再上传文件到该目录，确认文件列表、预览和下载正常。
7. 验证完成后把 R2 溢出阈值恢复到实际值，例如 `85%`。

## 运维建议

- 给 `ADMIN_PASSWORD` 设置强密码。
- 给 `TOKEN_SECRET` 设置独立随机值，推荐 48 字节随机 base64url 字符串。
- 不需要公开目录时，不要启用 `ALLOW_GUEST=true`。
- 文件多时定期重建文件索引。
- 回收站会占用 R2 空间，建议设置保留天数并定期清理。
- 分享链接到期后会保留 7 天，敏感分享建议手动删除。
- Webhook 中涉及 token 时优先使用 HTTPS。
- 不要把 `.trash`、`.thumbs`、`.meta`、`.system` 作为用户目录。

## 故障排查

### 页面返回 500

优先检查：

- D1 是否绑定，变量名是否为 `D1`。
- R2 是否绑定，变量名是否为 `R2`。
- 当前部署环境是否也配置了这些绑定。

### 登录失败

检查：

- `ADMIN_USERNAME` 是否配置。
- `ADMIN_PASSWORD` 是否配置。
- `TOKEN_SECRET` 是否配置；未配置时仍可登录，但会回退到 `ADMIN_PASSWORD` 签名。
- 修改环境变量后是否重新部署。

### 管理员操作提示安全校验失败

刷新页面后重新登录。管理员写操作需要 CSRF token，登录态过期或页面停留过久时可能触发。

### 游客无法访问

默认游客访问关闭。需要设置：

```text
ALLOW_GUEST=true
```

修改后重新部署。

### 搜索结果不完整或统计不准确

进入 `/admin.html`，在“系统状态”页执行“重建文件索引”。

### 上传被拒绝

常见原因：

- 存储配额不足。
- 目标路径是系统保留前缀。
- 登录态或 CSRF token 过期。
- 文件过大且当前环境限制了请求体。

### 分享链接不可用

检查：

- 分享是否已经过期。
- 是否达到下载次数上限。
- 管理员是否手动删除了分享记录。
- 原文件是否仍存在于对应的存储空间。

### S3 测试连接失败

检查：

- Endpoint 是否是 S3 API 地址，不是网页控制台地址。
- Bucket 名称是否正确，密钥是否有 `ListBucket` 权限。
- Access Key ID 和 Secret Access Key 是否属于同一个账号或同一个 Bucket 授权。
- Region 是否正确；Cloudflare R2 S3 API 通常使用 `auto`。
- 如果服务商不支持路径风格访问，当前版本可能需要适配该服务商的 S3 endpoint。

### Webhook 测试失败

检查：

- URL 是否能被 Cloudflare 访问。
- 目标服务是否要求 HTTPS。
- Method、Content-Type、Headers 是否符合接收端要求。
- 平台是否需要签名或中转服务。

## 测试覆盖

核心测试覆盖：

- 文件列表和搜索
- 访问权限
- 预览和下载
- 上传和分片上传
- 回收站
- 隐藏路径
- 访问密码
- 文件索引
- 存储配额
- 分享链接
- Webhook
- 管理后台路由

运行：

```bash
node --test tests/*.test.mjs
```

## License

MIT License. See `LICENSE`.
