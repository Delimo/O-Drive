# O-Drive 维护交接

> 更新时间：2026-07-09。本文件是后续维护入口，只记录当前代码库的实际状态。

## 项目状态

O-Drive 是运行在 Cloudflare Pages 上的轻量云盘，不是 React、Create React App、Ant Design 或 Redux Toolkit 项目。

- 前端：原生 ES Module、字符串模板渲染、自研 store/slice/thunk。
- 样式：Tailwind 输入文件在 `public/style*.css`，构建产物是 `public/main.css` 和页面级 CSS。
- 后端：Cloudflare Pages Functions，主入口是 `functions/api/[[path]].js`。
- 存储：Cloudflare R2 保存对象，D1 保存配置、日志、索引、分享、任务、通知和存储对象引用。
- 测试：Node test runner 和 Playwright。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run lint` | 检查 JavaScript 语法。 |
| `npm test` | 运行核心 Node 测试。 |
| `npm run build` | 构建 CSS，并检查 `public/index.js` 语法。 |
| `npm run check` | 运行 lint、核心测试和 build。 |
| `npm run test:browser` | 运行 Playwright 浏览器测试。 |
| `npm run dev` | 本地启动 Wrangler Pages dev。 |

最近一次完整验证：`npm run check` 通过，包含 262 个测试全绿。构建时只有 Browserslist 的 `caniuse-lite is outdated` 提示，不影响通过。

## 入口地图

| 区域 | 文件 |
| --- | --- |
| 前端总入口 | `public/index.js` |
| 首页 HTML | `public/index.html` |
| 管理页 HTML | `public/admin.html` |
| 分享页 HTML | `public/share.html` |
| 前端 API 封装 | `public/js/api/index.js` |
| 状态入口 | `public/js/state/index.js` |
| thunk 入口 | `public/js/state/thunks/index.js` |
| 事件入口 | `public/js/events/index.js` |
| 后端 API 入口 | `functions/api/[[path]].js` |
| API 路由分发 | `functions/api/lib/router.js` |
| WebDAV 入口 | `functions/dav/[[path]].js` |

前端维护细节见 `docs/frontend.md`。

## 近期已落地能力

- R2 内容去重已实现，相关代码在 `functions/api/lib/storage-objects.js`、`functions/api/lib/file-mutations/upload.js`、`functions/api/lib/file-mutations/upload-check.js` 和 `functions/api/lib/file-mutations/multipart.js`。
- `storage_objects` 表由 `migrations/0007_add_storage_objects.sql` 和 `functions/api/lib/schema.js` 管理。
- 普通上传、秒传检查、带 `sha256` 的分片上传、删除、回收站、维护任务、架构边界和 thunk 错误状态已有测试覆盖。
- 后台当前有 6 个 Tab：概览、存储、分享、日志、系统、通知。WebDAV 位于系统 Tab，不是独立 Tab。
- 通知中心位于全局 header，下拉列表通过 `notificationApi` 和 `navigation-actions.js` 维护。
- 搜索支持名称、路径、元数据筛选和小型文本文件内容命中，命中原因通过 `searchHit` 返回给前端。
- 文件夹详情已接入 `/api/folder-stats/:path`，前端会缓存统计结果并在详情面板展示文件数、子文件夹数、总大小和最近更新时间。
- 分享支持文件和文件夹两类目标；文件夹分享页支持目录浏览和 ZIP 下载，后台分享列表会显示目标类型。
- 到期但仍在 7 天保留期内的分享可以在后台重新启用，保持原 token、路径、密码和权限设置。
- 标准 API 错误处理已收敛到 `public/js/state/thunks/errors.js` 的 `assertApiOk()`。
- 通知记录支持 `severity: info | warning | error`，通知 Tab 可按级别、已读状态和事件筛选通知历史，并展示 Webhook 通道配置与最近投递。
- 后台失败或部分失败任务可从系统 Tab 重试；上传任务仍由浏览器侧上传队列重试。
- 后台 ZIP 结果写入 `.system/zip-tasks/`，会按 `ZIP_TASK_RETENTION_DAYS` 自动清理，也可通过系统 Tab 的维护指令手动清理。
- 容量告警和任务失败告警共用 `functions/api/lib/alert-rules.js` 的阈值判断 helper。
- API 与 WebDAV 入口的全局限流已接入 D1 `api_rate_limits` 表；内存限流保留为无 D1 时的降级路径。
- 管理员登录失败防护同时记录 IP 和账号维度；IP 维度会硬锁，账号维度只做软降速，成功登录会清理两类失败计数。
- 目录复制/移动的 `copyTree` 会收集子树单项失败，批量粘贴会返回具体失败子路径，失败的 move 子项不会删除源对象。
- Webhook 写操作通知不再依赖 `Response.clone().json()` 二次解析；相关 handler 通过可选 `meta` 向 router 传递通知数据。

## 2026-07-09 审计收尾

阶段性审计清单已清除。对应 6 个待处理项已落地：

- 上传 conflict 写入改为条件插入并在竞态下重试改名，普通上传、秒传和 multipart 都接入统一写入路径。
- Webhook delivery 历史会脱敏敏感 header，手动重试优先使用当前 webhook 配置里的真实 header。
- 分享访问 cookie 和管理员用户名比较改为常量时间比较。
- 受保护路径密码移除遗留 SHA-256 回退，只接受当前 PBKDF2 格式。
- 前端订阅改为浅比较和结构化 selector，admin 渲染不再粗粒度订阅整个 slice。
- 旧 `/api/admin/settings/quota` 已迁到当前 `storage_config_v1` 链路，旧 `storage-quota.js` 已删除。

新增/更新的回归测试覆盖：

- admin quota endpoint 写入运行时存储配置。
- 上传 rename 在候选名被并发占用时继续重试。
- multipart dedup 在 complete 阶段遇到竞态时继续重试，并清理实际组装出来的临时对象。
- Webhook delivery 历史脱敏敏感 header，重试使用当前配置。

## 后续维护提示

- 修改前端功能时按 `api -> slice -> thunk -> render -> events` 的顺序接入。
- 修改样式源文件后运行 `npm run build`，不要只改构建后的 CSS 产物。
- 新增后台 Tab、入口分层或 CSS 构建脚本相关改动后，确认架构测试仍通过。
- 新增 thunk 错误处理分支后，优先复用 `assertApiOk()` 并补对应前端或 thunk 测试。
- 涉及 R2 真实对象、回收站、ZIP、WebDAV 或分享下载时，必须确认读取链路使用 `file_index.object_key`，不要假设用户路径就是 R2 key。
- 涉及 D1 schema 时同步检查 `migrations/`、`functions/api/lib/schema.js` 和测试 helper。
- 已完成的规划、审计清单和修复进度不要长期留在 `docs/`；把仍有维护价值的结论合并到本文件或对应说明文档后清理原文件。
