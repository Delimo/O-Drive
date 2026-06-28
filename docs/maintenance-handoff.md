# O-Drive 维护交接

> 给后续维护者的入口文档。先读本页，再按需跳到架构、后台页面和路线图文档。

## 项目快照

O-Drive 是 Cloudflare Pages + Pages Functions + R2 + D1 项目。前端不是 React，也没有使用 Create React App、Ant Design 或 Redux Toolkit。

当前前端是原生 ES Module：

- 入口：`public/index.js`
- API 层：`public/js/api/index.js`
- 状态：`public/js/state/*`
- 异步流程：`public/js/state/thunks/*`
- 渲染：`public/js/render/*`
- 事件委托：`public/js/events/*`
- 样式源文件：`public/css/*` 和 `public/style.css`
- 构建产物：`public/main.css`

后端入口：

- API 主入口：`functions/api/[[path]].js`
- API 路由分发：`functions/api/lib/router.js`
- WebDAV 入口：`functions/dav/[[path]].js`
- 数据表初始化：`functions/api/lib/schema.js`
- D1 迁移：`migrations/*`

## 本地命令

常用命令：

```bash
npm run dev
npm run check
npm test
npm run build
```

数据库迁移：

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

`npm run check` 会跑语法检查、全部测试和构建。改功能后优先跑它。

## 环境变量

核心变量：

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `TOKEN_SECRET`
- `ALLOW_GUEST`

WebDAV 使用管理员账号密码鉴权，不使用 `DAV_TOKEN`。只要配置了 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`，`/dav/*` 才会启用。

后台 ZIP 任务可通过以下变量调整直接下载阈值：

- `ZIP_INLINE_MAX_FILES`
- `ZIP_INLINE_MAX_BYTES`

未配置时，小目录直接流式下载，大目录自动转后台 `zip_download` 任务。

## 最近完成的关键能力

### 文件夹分享

相关文件：

- `functions/api/lib/shares.js`
- `functions/api/lib/schema.js`
- `migrations/0005_add_share_target_type.sql`
- `public/js/render/pages/admin/shares.js`
- `public/js/state/slices/share-slice.js`
- `public/js/state/thunks/share.js`
- `public/js/api/index.js`
- `public/css/pages/share.css`

当前能力：

- `share_links` 增加 `target_type`
- 分享对象支持文件和文件夹
- 文件夹分享页支持目录浏览、子目录跳转、目录内文件预览/下载
- 文件夹分享可下载当前目录 ZIP
- 密码、过期、下载次数限制对文件和文件夹分享都生效

### 大目录后台打包

相关文件：

- `functions/api/lib/zip-download.js`
- `functions/api/lib/tasks.js`
- `functions/api/lib/router.js`
- `public/js/state/thunks/explorer.js`
- `public/js/render/pages/admin/system.js`
- `public/js/render/pages/admin/maintenance.js`

当前能力：

- 小目录继续通过 `/api/zip-download` 即时返回 ZIP
- 大目录会自动创建 `zip_download` 后台任务
- ZIP 结果保存到 `.system/zip-tasks/...`
- 任务结果包含 `downloadUrl`
- 任务完成后写入通知中心
- 管理后台任务列表显示“下载结果”入口

### 通知与告警规则

相关文件：

- `functions/api/lib/admin-stats.js`
- `functions/api/lib/storage.js`
- `functions/api/lib/tasks.js`
- `functions/api/lib/notifications.js`
- `public/js/render/pages/admin/storage.js`
- `public/js/render/pages/admin/system.js`
- `public/js/render/pages/admin/maintenance.js`
- `public/js/events/admin-actions.js`

当前能力：

- 存储容量告警支持配置 warning/error 百分比，默认 90% / 95%。
- 失败任务告警支持配置统计窗口、warning/error 条数，默认最近 24 小时 3 / 10 条。
- 告警会进入后台概览 attention，并写入站内通知。
- 站内告警通知有 24 小时冷却，避免同级别重复刷屏。
- 规则配置保存在 `kv_config`，容量规则复用 `storage_config_v1`，任务规则使用 `task_failure_alert_config_v1`。

## 维护入口

新人建议按这个顺序读：

1. `docs/maintenance-handoff.md`
2. `docs/README.md`
3. `docs/architecture.md`
4. `docs/admin-page.md`
5. `docs/feature-expansion-roadmap.md`

如果要改布局或视觉，再读：

- `docs/layout.md`

如果要继续规划 R2 内容去重，再读：

- `docs/r2-content-deduplication.md`

## 下一步建议

当前路线图里告警中心已经完成容量阈值和失败任务数量两类规则。下一步建议继续做下载异常频率规则或通知 severity/filter：

1. 抽出通用告警规则 helper，减少容量和任务告警的重复冷却逻辑。
2. 给下载异常频率增加可配置阈值，并复用 `download_bursts`。
3. 通知表增加 `severity` 字段，后台通知列表支持按事件类型和严重程度筛选。
4. 评估是否为告警事件增加 Webhook 事件，例如 `storage.quota.warning`、`task.failure.warning`。
5. 补核心测试和前端渲染测试。

## 注意事项

- 不要把 React、Redux Toolkit 或 Ant Design 局部混进当前前端架构。
- 改源 CSS 后要构建生成 `public/main.css`。
- 新 API 需要判断是否要加 CSRF，配置点在 `functions/api/[[path]].js`。
- 保留 `.system`、`.trash`、`.thumbs`、`.meta` 等系统前缀的保护逻辑。
- 目录递归、打包下载、分享、回收站恢复都要补测试。
- 看到工作区有已有改动时，先确认是不是前一次任务留下的，不要随手回滚。
