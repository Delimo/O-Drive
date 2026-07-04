# O-Drive 修复进度追踪

> 创建时间：2026-07-04。本文档追踪 `docs/audit-findings.md`（安全/并发审计）和 `docs/project-roadmap.md`（功能路线图）里问题的修复进度。
> 最近更新：2026-07-04。本轮已完成剩余可工程闭环项，并通过 `npm run check`。

## 如何接续

1. 读「任务状态总表」，找到第一个非 ✅ 的任务。
2. 看该任务的「当前结论」和「下一步」。
3. 完成任一批改动后运行 `npm run check`（= lint + test + build）。
4. 完成任一批改动后同步更新本文档与来源文档中的状态。

## 批次状态

- **批次一 安全**：#1 #2 #3 —— ✅ 完成。
- **批次二 后端并发正确性**：#4 #5 #6 #7 #8 —— ✅ 完成。
- **批次三 前端正确性**：#9 #10 #11 #12 —— ✅ 完成。
- **批次四 Webhook 可观测**：#13 —— ✅ 完成。
- **批次五 测试补齐**：#14 #19 —— ✅ 完成当前验收范围。
- **批次六 功能/UI**：#15 #16 #17 #18 —— ✅ 完成当前验收范围。
- **收尾**：#20 `npm run check` + 更新文档 —— ✅ 完成。

## 最近复核结果

> 复核时间：2026-07-04。

- `node --test --test-name-pattern "admin can create public share links and expired shares are deleted|admin shares section formats millisecond expiry timestamps" tests/core.test.mjs tests/frontend.test.mjs`：✅ 通过，2/2。
- `npm test`：✅ 通过，256/256。
- `npm run lint`：✅ 通过，JS syntax check passed，170 files。
- `npm run check`：✅ 通过，lint + test + build 全部成功；构建期间仅出现 Browserslist/caniuse-lite 过期提示，不影响产物。

## 任务状态总表

| # | 任务 | 来源 | 状态 | 改动文件 |
| --- | --- | --- | --- | --- |
| 1 | 修复 Webhook SSRF (CRITICAL) | audit S1 | ✅ 完成当前验收范围 | `functions/api/lib/webhooks.js`, `functions/api/lib/admin-webhook-settings.js`, `public/js/render/pages/admin/webhook.js`, `tests/core.test.mjs`, `tests/frontend.test.mjs` |
| 2 | 路径密码锁定 x-forwarded-for 绕过 (HIGH) | audit A1 | ✅ 完成 | `functions/api/lib/protected-paths.js` |
| 3 | 下载次数 TOCTOU (MEDIUM) | audit S2/M1 | ✅ 完成 | `functions/api/lib/shares/expiry.js`, `functions/api/lib/shares/public.js`, `tests/helpers/make-env.mjs` |
| 4 | 配额并发绕过 (HIGH) | audit U1 | ✅ 完成 | `functions/api/lib/storage.js`, `functions/api/lib/file-index/stats.js`, `functions/api/lib/file-mutations/upload.js`, `functions/api/lib/file-mutations/upload-check.js`, `functions/api/lib/file-mutations/multipart.js`, `functions/api/dav/lib/methods.js` |
| 5 | 孤儿 multipart 清扫 (HIGH) | audit U2 | ✅ 完成 | `functions/api/lib/file-mutations/multipart.js`, `functions/api/lib/admin-maintenance.js`, `public/js/render/pages/admin/utils.js` |
| 6 | D1 限流原子化 (MEDIUM) | audit A5 / roadmap 3 | ✅ 完成 | `functions/api/lib/rate-limiter.js` |
| 7 | 回收站孤儿窗口 (MEDIUM) | audit S6 | ✅ 完成 | `functions/api/lib/trash/soft-delete.js` |
| 8 | completeAndDeduplicate 非原子 (MEDIUM) | audit U3 | ✅ 完成 | `functions/api/lib/file-mutations/multipart.js` |
| 9 | 前端 loadExplorer 请求竞态 (HIGH) | audit F1 | ✅ 完成 | `public/js/state/explorer-slice.js`, `public/js/state/thunks/explorer.js` |
| 10 | batchDispatch 冻结渲染 (MED) | audit F2 | ✅ 完成 | `public/js/events/file-actions.js` |
| 11 | 上传定时器全局泄漏 (MED) | audit F3 | ✅ 完成 | `public/js/state/thunks/upload.js` |
| 12 | assertApiOk 绕过 response.ok (MED) | audit F4 | ✅ 完成 | `public/js/state/thunks/errors.js` |
| 13 | Webhook 投递记录不全 + 同步阻塞 | audit S3/S4 | ✅ 完成 | `functions/api/lib/auth.js`, `functions/api/lib/router.js`, `functions/api/lib/shares/expiry.js`, `functions/api/lib/shares/admin.js`, `functions/api/lib/shares/public.js`, `functions/api/[[path]].js` |
| 14 | 补齐 WebDAV 测试 | roadmap 4 | ✅ 完成 | `tests/webdav.test.mjs` |
| 15 | 大目录操作任务化 | roadmap 1 | ✅ 完成当前验收范围 | `public/js/render/modals/confirmations.js`, `public/js/events/file-actions.js`, `public/js/state/thunks/explorer.js`, `tests/frontend.test.mjs`, `tests/thunks.test.mjs` |
| 16 | 索引一致性前端展示 | roadmap 2 | ✅ 完成 | `functions/api/lib/index-consistency.js`, `functions/api/lib/admin-maintenance.js`, `public/js/render/pages/admin/system.js`, `public/css/pages/admin.css`, `public/admin.css`, `tests/frontend.test.mjs`, `tests/core.test.mjs` |
| 17 | 后台可观测性增强 | roadmap 5 | ✅ 完成 | `functions/api/lib/admin-stats.js`, `public/js/render/pages/admin/overview.js`, `public/js/mock/index.js`, `tests/helpers/make-env.mjs`, `tests/frontend.test.mjs`, `tests/core.test.mjs` |
| 18 | 分享功能产品化 | roadmap 6 | ✅ 完成当前验收范围 | `functions/api/lib/schema.js`, `functions/api/lib/shares/access-log.js`, `functions/api/lib/shares/admin.js`, `functions/api/lib/shares/public.js`, `functions/api/lib/shares/mapping.js`, `public/js/render/pages/admin/shares.js`, `public/css/pages/admin.css`, `public/admin.css`, `tests/core.test.mjs`, `tests/frontend.test.mjs`, `tests/helpers/make-env.mjs` |
| 19 | 测试 mock 降低脆弱性 | roadmap 7 | ✅ 完成当前验收范围 | `tests/helpers/make-env.mjs` |
| 20 | npm run check + 更新文档 | — | ✅ 完成 | `docs/fix-progress.md`, `docs/project-roadmap.md`, `docs/audit-findings.md` |

## 复核结论与剩余风险

### #1 Webhook SSRF —— ✅ 完成当前验收范围

- 已完成：`guardedFetch()` 使用 `redirect: "manual"`，逐跳校验 URL；支持多种 IPv4 字面量编码、IPv6 loopback/link-local/ULA 和 `localhost` 拦截。
- 已完成：新增 Webhook 目标白名单策略。配置 `WEBHOOK_ALLOWED_HOSTS`、`WEBHOOK_HOST_ALLOWLIST` 或 `WEBHOOK_ALLOWLIST` 后进入白名单模式；也可用 `WEBHOOK_REQUIRE_ALLOWLIST=true` / `WEBHOOK_STRICT_ALLOWLIST=true` 强制要求白名单。
- 已完成：保存配置、测试投递、失败重试和实际事件投递都会执行同一策略；旧配置中不在白名单的 URL 不会出网，会写入失败投递记录。
- 默认行为：未配置白名单时保持兼容模式，继续依赖字面量 IP/跳转防护；生产部署建议配置白名单来关闭 DNS rebinding 类剩余风险。

### #3 下载次数 TOCTOU —— ✅ 完成

- `reserveDownloadSlot()` 使用条件 `UPDATE` 先占用下载次数，避免并发请求同时通过 `max_downloads` 检查。
- `releaseDownloadSlot()` 在下载失败时回滚计数。
- `tests/helpers/make-env.mjs` 已补齐多行 SQL mock 和释放槽位 mock，公开分享核心测试恢复通过。

### #4 配额并发绕过 —— ✅ 完成

- `tryReserveStorageQuota()` 已纳入 `getIndexedStorageUsed()` 当前已用量，再叠加 `storage_quota_counter.reserved_bytes` 做并发预留。
- 上传、秒传、分片完成、WebDAV PUT 均走预留 + finally 释放路径。
- 配额错误文案保持为 `Cloudflare R2 空间配额不足`。

### #11 上传定时器全局泄漏 —— ✅ 完成

- 上传完成收尾逻辑已改为 `autoCloseTimers.push(setTimeout(...))`。
- `clearUploadAutoTimers()` 继续统一清理全部自动关闭定时器，避免跨批次误清空上传列表。

### #13 Webhook 投递记录不全 + 同步阻塞 —— ✅ 完成

- 文件操作、登录失败 burst、分享过期/耗尽通知均走 `notifyWebhookWithLog()`，保留投递记录和可重试能力。
- 分享过期/耗尽通知新增 `scheduleShareNotification()`，优先放入 `context.waitUntil`，避免阻塞主请求；无 `waitUntil` 时同步等待，保持测试和本地环境稳定。
- 路由已把 `context` 传到公开分享和后台分享清理链路。

### #15 大目录操作任务化 —— ✅ 完成当前验收范围

- 后端已有 `file_tasks` 对 `paste`、`delete`、`zip_download` 的任务能力，本轮补齐前端入口。
- 操作预估弹窗遇到 `shouldBatch` 时不再禁用确认按钮，而是提示将创建后台任务。
- 大批量删除和大粘贴确认后传入 `{ background: true }`，前端 thunk 创建后台任务并刷新任务/通知状态。
- 测试覆盖「大操作弹窗转后台任务」和 thunk 创建 `delete`/`paste` 后台任务。
- 未纳入本轮：清空回收站、回收站大恢复、任务分片进度恢复，这些仍可作为后续增强。

### #18 分享功能产品化 —— ✅ 完成当前验收范围

- 数据模型新增 `share_links.visit_count` 和 `share_access_logs`，访问日志保留 90 天并有懒清理。
- 公开分享 info/preview/download 成功路径记录访问日志；密码未解锁失败会记录失败日志但不增加访问次数。
- 下载次数仍使用原子 `download_count` 逻辑，访问次数独立使用 `visit_count`。
- 后台分享列表展示访问次数、下载次数、最近访问 IP/动作/时间，并从每个分享加载最近 3 条访问日志。
- 访问日志查询按 `created_at DESC, id DESC` 稳定排序，避免同毫秒记录顺序不确定。
- 未纳入本轮：`max_bytes` 总流量限制、二维码、公开上传收件箱、分享备注/标签，这些保留为产品增强。

### #19 测试 mock 降低脆弱性 —— ✅ 完成当前验收范围

- `make-env.mjs` 已补 `api_rate_limits` 原子 upsert、`storage_quota_counter`、分享下载槽位、访问日志、访问次数自增等 SQL mock。
- 本轮没有做大规模拆分 `make-env` 或 SQL handler registry；该方向风险较高，适合后续随新功能逐步抽离。
- 当前全量测试已恢复到 256/256 通过。

## 已知后续增强

- #1 Webhook SSRF：生产部署建议配置 `WEBHOOK_ALLOWED_HOSTS`，例如 `hooks.example.com,*.notify.example`。
- #15：继续把清空回收站、大目录恢复、任务断点恢复和失败项重试做得更完整。
- #18：补 `max_bytes`、二维码、公开上传收件箱、分享备注/标签和分享访问通知。
- #19：随着 D1 mock 继续增长，逐步拆分 `make-env.mjs`，抽出 SQL handler registry 和 fixture 工厂。
