# O-Drive 修复进度追踪

> 创建时间：2026-07-04。本文档追踪 `docs/audit-findings.md`（安全/并发审计）和 `docs/project-roadmap.md`（功能路线图）里问题的修复进度。
> 目的：任务可能中途暂停，本文档让任何时候都能准确接续，不丢上下文。

## 如何接续

1. 读本文档「任务状态总表」，找到第一个非 ✅ 的任务。
2. 看该任务的「改动文件」和「下一步」。
3. 先处理「复核发现」中标为 ⚠️ / ❌ 的项目，再继续后续功能批次。
4. 每完成一批（见下方批次划分），运行 `npm run check`（= lint + test + build）。
5. 全部完成后，更新 `docs/audit-findings.md` 和 `docs/project-roadmap.md` 的状态标注。

## 批次划分

- **批次一 安全**：#1 #2 #3 —— ⚠️ 部分完成（#1/#3 仍需复核或修复）
- **批次二 后端并发正确性**：#4 #5 #6 #7 #8 —— ⚠️ 部分完成（#4 未通过测试）
- **批次三 前端正确性**：#9 #10 #11 #12 —— ⚠️ 部分完成（#11 有回归）
- **批次四 Webhook 可观测**：#13 —— ⚠️ 部分完成
- **批次五 测试补齐**：#14 #19 —— ⚠️ 部分完成（#14 通过；#19 需等全量测试恢复）
- **批次六 功能/UI**：#15 #16 #17 #18 —— ⚠️ 部分完成（#16/#17 完成，#15/#18 待办）
- **收尾**：#20 `npm run check` + 更新两个文档 ⬜ 待办（当前 `npm test` 仍有 6 个失败）

## 最近复核结果

> 复核时间：2026-07-04。

- `npm run lint`：✅ 通过，JS syntax check passed（最近一次 2026-07-04，169 files）。
- `npm run build`：✅ 通过，已重新生成 `public/main.css`、`public/explorer.css`、`public/admin.css`、`public/share.css`。
- `node --test tests/frontend.test.mjs`：✅ 通过，78/78。
- `node --test --test-name-pattern "admin maintenance scans index consistency without mutating data" tests/core.test.mjs`：✅ 通过，覆盖索引一致性扫描持久化和 observability 汇总。
- `npm test`：❌ 未通过，251 个测试中 245 个通过、6 个失败。
- 失败集中在配额和公开分享链路：
  - `deduplicated uploads do not consume additional storage quota`
  - `uploads enforce the selected storage bucket quota`
  - `admin can create public share links and expired shares are deleted`
  - `admin can create folder share links and browse shared folders`
  - `admin can create bundle share links for mixed files and folders`
  - `password protected share links require unlock before access`

## 复核发现

### #1 Webhook SSRF —— ⚠️ 部分完成

- 已完成：`guardedFetch()` 使用 `redirect: "manual"`，逐跳校验 URL；支持多种 IPv4 字面量编码、IPv6 loopback/link-local/ULA 和 `localhost` 拦截。
- 未完成：代码注释明确说明 DNS rebinding / 公网域名解析到私网 IP 当前无法拦截，因为 Workers 没有 DNS 解析 API。原审计项包含 DNS rebinding，因此不能标为完全关闭。
- 下一步：明确风险接受边界，或改为只允许管理员配置 allowlist 域名 / 禁止普通域名直接投递到任意公网。

### #3 下载次数 TOCTOU —— ⚠️ 部分完成

- 已完成：`reserveDownloadSlot()` 使用条件 `UPDATE` 防并发超限，`releaseDownloadSlot()` 用于下载失败回滚。
- 当前问题：公开分享相关 4 个核心测试返回 `410` 而非预期 `200`，说明改动影响了正常分享访问/下载路径。
- 下一步：排查 `handlePublicShare()`、`mapShare()`、`exhaustedResponse()` 与测试 mock 中 `max_downloads/download_count` 字段默认值的兼容。

### #4 配额并发绕过 —— ❌ 未完成

- 当前问题：`tryReserveStorageQuota()` 只判断 `reserved_bytes + incoming <= quota`，没有把当前 D1 已用量 `getIndexedStorageUsed()` 算进去。
- 影响：已有用量接近配额时，只要单次上传大小小于总配额，仍可能被放行；当前 2 个配额测试已失败。
- 位置：`functions/api/lib/storage.js`
- 下一步：原子预留条件必须纳入当前已用量，或维护一个和 `storage_usage` 同步的原子计数器。修复后重跑配额相关测试。

### #11 上传定时器全局泄漏 —— ❌ 有回归

- 当前问题：文件顶部已改为 `autoCloseTimers = []`，但上传完成时仍写 `autoCloseTimer = setTimeout(...)`。
- 影响：上传完成进入收尾逻辑时会触发 `ReferenceError`。
- 位置：`public/js/state/thunks/upload.js`
- 下一步：改为 `autoCloseTimers.push(setTimeout(...))`，并确保 `clearUploadAutoTimers()` 能清理全部自动关闭定时器。

### #13 Webhook 投递记录不全 + 同步阻塞 —— ⚠️ 部分完成

- 已完成：文件操作通知已通过 `router.js` 的 `notifyConfiguredWebhookEvent()` 走 `notifyWebhookWithLog()`，并使用 `waitForWebhook()` 放到 `context.waitUntil`。
- 已完成：登录失败 burst 改为 `notifyWebhookWithLog()`。
- 未完成：分享过期/耗尽通知仍在 `notifyShareExpiredOnce()` 中同步 `await notifyWebhookWithLog()`；`cleanupExpiredShares()`、`expiredResponse()` 和 `exhaustedResponse()` 仍可能阻塞主请求。
- 下一步：让分享过期通知也接收 `context` 或任务化/异步化，避免请求链路等待 Webhook 投递。

### #19 测试 mock 降低脆弱性 —— ⚠️ 验证未关闭

- 已完成：`make-env.mjs` 已补 `api_rate_limits` 原子 upsert handler 和 `storage_quota_counter` mock。
- 未完成：全量 `npm test` 仍失败 6 个，不能把测试补齐批次整体标为完成。
- 下一步：配额和分享测试恢复后，再确认 #19 是否可以重新标 ✅。

## 任务状态总表

| # | 任务 | 来源 | 状态 | 改动文件 |
| --- | --- | --- | --- | --- |
| 1 | 修复 Webhook SSRF (CRITICAL) | audit S1 | ⚠️ 部分完成 | `functions/api/lib/webhooks.js` |
| 2 | 路径密码锁定 x-forwarded-for 绕过 (HIGH) | audit A1 | ✅ 完成 | `functions/api/lib/protected-paths.js` |
| 3 | 下载次数 TOCTOU (MEDIUM) | audit S2/M1 | ⚠️ 部分完成 | `functions/api/lib/shares/expiry.js`, `functions/api/lib/shares/public.js` |
| 4 | 配额并发绕过 (HIGH) | audit U1 | ❌ 未完成 | `functions/api/lib/storage.js`, `functions/api/lib/file-index/stats.js`, `file-mutations/upload.js`, `file-mutations/upload-check.js`, `file-mutations/multipart.js`, `dav/lib/methods.js` |
| 5 | 孤儿 multipart 清扫 (HIGH) | audit U2 | ✅ 完成 | `functions/api/lib/file-mutations/multipart.js`, `functions/api/lib/admin-maintenance.js`, `public/js/render/pages/admin/utils.js` |
| 6 | D1 限流原子化 (MEDIUM) | audit A5 / roadmap 3 | ✅ 完成 | `functions/api/lib/rate-limiter.js` |
| 7 | 回收站孤儿窗口 (MEDIUM) | audit S6 | ✅ 完成 | `functions/api/lib/trash/soft-delete.js` |
| 8 | completeAndDeduplicate 非原子 (MEDIUM) | audit U3 | ✅ 完成 | `functions/api/lib/file-mutations/multipart.js` |
| 9 | 前端 loadExplorer 请求竞态 (HIGH) | audit F1 | ✅ 完成 | `explorer-slice.js`, `explorer.js` |
| 10 | batchDispatch 冻结渲染 (MED) | audit F2 | ✅ 完成 | `file-actions.js` |
| 11 | 上传定时器全局泄漏 (MED) | audit F3 | ❌ 有回归 | `upload.js` |
| 12 | assertApiOk 绕过 response.ok (MED) | audit F4 | ✅ 完成 | `errors.js` |
| 13 | Webhook 投递记录不全 + 同步阻塞 | audit S3/S4 | ⚠️ 部分完成 | `auth.js`, `router.js`, `shares/expiry.js` |
| 14 | 补齐 WebDAV 测试 | roadmap 4 | ✅ 完成 | `webdav.test.mjs` |
| 15 | 大目录操作任务化 | roadmap 1 | ⬜ 待办 | — |
| 16 | 索引一致性前端展示 | roadmap 2 | ✅ 完成 | `functions/api/lib/index-consistency.js`, `functions/api/lib/admin-maintenance.js`, `public/js/render/pages/admin/system.js`, `public/css/pages/admin.css`, `public/admin.css`, `tests/frontend.test.mjs`, `tests/core.test.mjs` |
| 17 | 后台可观测性增强 | roadmap 5 | ✅ 完成 | `functions/api/lib/admin-stats.js`, `public/js/render/pages/admin/overview.js`, `public/js/mock/index.js`, `tests/helpers/make-env.mjs`, `tests/frontend.test.mjs`, `tests/core.test.mjs` |
| 18 | 分享功能产品化 | roadmap 6 | ⬜ 待办 | — |
| 19 | 测试 mock 降低脆弱性 | roadmap 7 | ⚠️ 验证未关闭 | `make-env.mjs` |
| 20 | npm run check + 更新两个文档 | — | ⬜ 待办 | — |

## 修复细节与复核备注

### #4 配额并发绕过 — `storage.js` + `stats.js` + 上传路径（❌ 未完成）

- **问题**：`getIndexedStorageUsed()` 有 30 秒模块级缓存，并发读取相同缓存值全部通过配额检查，集体超限。
- **已做改动**：
  - `stats.js`：移除 `STORAGE_USED_CACHE_TTL` 和模块级 `storageUsedCache` 对象，每次读取实时 D1 数据。`clearStorageUsedCache()` 保留为空函数兼容调用方。
  - `storage.js`：新增 `storage_quota_counter` 表 + `tryReserveStorageQuota()`（原子条件 UPDATE）和 `releaseReservedQuota()`。
  - `upload.js`：替换 `checkStorageQuota` 为 `tryReserveStorageQuota` + `releaseReservedQuota`，使用 `try/finally` 确保释放。
  - `upload-check.js`：同上。
  - `multipart.js`：移除 create 阶段的配额检查（`checkStorageQuota`），改为在 `completeAndDeduplicate` 非 dedup 路径做原子预留。
  - `dav/lib/methods.js`：`handlePut` 改用 `tryReserveStorageQuota` + `finally`。
- **复核结论**：当前 `tryReserveStorageQuota()` 没有纳入 D1 已用量，只检查本次预留计数，导致配额测试仍失败。

### #5 孤儿 multipart 清扫 — `multipart.js` + `admin-maintenance.js`

- **问题**：客户端放弃分片上传后服务端不清理 R2 悬空 uploadId，持续产生 R2 计费。
- **修复**：
  - `multipart.js`：新增 `multipart_uploads` D1 跟踪表，create 时写入、complete/abort 时删除；新增 `cleanupOrphanMultipartUploads()`（扫描超过 24 小时的记录，调用 `storageAbortMultipartUpload`）。
  - `admin-maintenance.js`：新增 `cleanup-orphan-multipart` 维护动作。
  - 前端 `utils.js`：在维护操作列表添加对应 UI 入口。

### #6 D1 限流原子化 — `rate-limiter.js`

- **问题**：`checkRateLimitD1` 用 SELECT→UPDATE 两步，并发请求读到相同计数，放过超限请求。
- **修复**：改为 `INSERT ... ON CONFLICT DO UPDATE` + `RETURNING` 单语句原子自增，合并窗口检查和计数更新。

### #7 回收站孤儿窗口 — `trash/soft-delete.js`

- **问题**：`softDeleteTree` 先拷贝对象到 `.trash/` + 删原件，再 INSERT `trash` 行；INSERT 失败时对象滞留在 `.trash/` 且无 DB 记录。
- **修复**：将 `INSERT INTO trash` 移到 `mapWithConcurrency` 拷贝操作之前，确保 DB 记录始终先于物理数据存在。

### #8 completeAndDeduplicate 非原子 — `multipart.js`

- **问题**：非 dedup 路径「拷贝→删临时→建 storage_object」，建 storage_object 失败时数据已在目标位置但无跟踪记录；dedup 路径在 `upsertFileIndex` 前就删除了已组装的对象。
- **修复**：
  - 非 dedup：调整为「拷贝→建 storage_object→删临时」，失败时临时对象保留在 `key` 供恢复。
  - Dedup：延迟 `storageDelete(key)` 到 `upsertFileIndex` 成功后执行，用 `try/catch` 静默处理。

### #1 Webhook SSRF — `functions/api/lib/webhooks.js`（⚠️ 部分完成）
- 新增 `parseIpv4`（点分十进制/十六进制/八进制、单一 32 位整数形式）、`ipv4IsPrivate`（0/8、10/8、127/8、169.254/16、172.16/12、192.168/16、100.64/10 CGNAT）、`ipv6IsBlocked`（::1、::、fc00::/7、fe80::/10、IPv4-mapped）、`isBlockedWebhookHost`、`guardedFetch`。
- `guardedFetch` 用 `redirect: "manual"` 逐跳校验 Location，最多 3 跳，杜绝 302 跳转绕过；非 http/https scheme 拒绝。
- `sendOne` 改为调用 `guardedFetch` 替代原来的内联字符串匹配。
- 清理了打断期间残留的重复函数块（旧 `isBlockedHost`/`parseIpv4`/`parseIntStrict`/`isPrivateIpv4`）。
- 语法检查通过。
- **复核结论**：DNS rebinding 仍无法拦截，需要记录为剩余风险或继续收紧允许目标。

### #2 路径密码锁定绕过 — `functions/api/lib/protected-paths.js`
- `clientIp()` 从 `cf-connecting-ip || x-forwarded-for || unknown` 改为只用 `cf-connecting-ip`，与 `auth.js`、`rate-limiter.js` 对齐，防止轮换 XFF 头重置锁定计数。

### #3 下载次数 TOCTOU — `functions/api/lib/shares/expiry.js` + `public.js`（⚠️ 部分完成）
- expiry.js 新增 `reserveDownloadSlot`（`UPDATE ... SET download_count = download_count + 1 WHERE token = ? AND (max_downloads = 0 OR download_count < max_downloads)`，靠 affected rows 判断是否放行）和 `releaseDownloadSlot`（下载失败回滚计数）。
- public.js 三个下载点（bundle 根 zip、bundle 子路径、单文件/文件夹）全部改为「先 reserve、成功记 IP、失败 release」。
- 语法检查通过。
- **复核结论**：公开分享核心测试当前返回 `410`，需要修复兼容性后才能关闭。

### #9 前端 loadExplorer 请求竞态 — `explorer-slice.js` + `explorer.js`
- **问题**：快速导航时旧响应覆盖新数据（请求竞态 F1）。
- **修复**：
  - `explorer-slice.js`：新增 `loadSeq` 字段和 `incrementLoadSeq` reducer。
  - `explorer.js`：`loadExplorer` 入口递增 `loadSeq`；每个 dispatch 前调用 `isStale()` 校验，seq 不匹配直接跳过。
  - `loadMoreSearchResults` 同样追加 seq 校验。
- **语法检查**：通过。

### #10 batchDispatch 冻结渲染 — `file-actions.js`
- **问题**：`batchDispatch` 内混入 async thunk（如 `loadExplorer`），batchDepth > 0 锁住 `notifyListeners`，用户看不到 loading 反馈。
- **修复**：将 `clear-search-filters`、`toggle-trash`、`execute-batch-paste`、`execute-batch-delete` 中的 async thunk 从 batch 数组中拆出，改为 `store.batchDispatch([syncActions...]); store.dispatch(thunk)`。
- **语法检查**：通过。

### #11 上传定时器全局泄漏 — `upload.js`（❌ 有回归）
- **问题**：`autoCloseTimer` 是模块级标量变量，并发批次互相覆盖。
- **已做改动**：改为数组模式 `autoCloseTimers`，`clearUploadAutoTimers` 遍历 clear 全部。
- **复核结论**：底部仍引用已不存在的 `autoCloseTimer`，上传完成时会抛 `ReferenceError`。

### #12 assertApiOk 绕过 response.ok — `errors.js`
- **问题**：`acceptedPartial` 在 `response.ok` 之前短路，completed 响应跳过 HTTP 状态检查。
- **修复**：将 `response.ok &&` 移到条件最前面，确保 HTTP 状态优先校验。
- **语法检查**：通过。

### #13 Webhook 投递记录不全 + 同步阻塞 — `auth.js` + `router.js`（⚠️ 部分完成）
- **问题**：`notifyLoginBurst` 走 convenience 函数 `notifyWebhook`（无 delivery log），且同步 await 阻塞登录响应。
- **已做改动**：
  - `auth.js`：替换 `notifyLoginBurst` 为 `notifyWebhookWithLog`，通过 `context.waitUntil` 异步投递。
  - `router.js`：移除废弃的 `notifyConfiguredWebhooks` 函数和未使用的 `notifyDownloadBurst` 导入。
- **语法检查**：通过。
- **复核结论**：文件操作通知已由 `router.js` 统一走带日志的异步投递；分享过期/耗尽通知仍同步阻塞。

### #14 补齐 WebDAV 测试 — `webdav.test.mjs`
- **新增 4 个测试**（原 22 → 26）：
  - `webdav MOVE directory with files` — 目录 MOVE，验证 R2 对象迁移
  - `webdav COPY directory with files` — 目录 COPY，验证 file_index 引用
  - `webdav MOVE overwrites existing target with Overwrite:T header` — 强制覆盖
  - `webdav COPY overwrites existing target with Overwrite:T header` — 强制覆盖
- **修复**: `handleDelete`/`handleMove`/`handleCopy` 传递 `request` 到 `softDeleteTree` 消除 500
- **修复**: 取消 `webdav DELETE moves file to trash` 的 `{ skip: true }`，添加验证

### #16 索引一致性前端展示 — maintenance + system UI

- `index-consistency.js`：新增最近一次扫描报告的持久化能力，使用 `kv_config` 保存 `index_consistency_latest`，并提供 `loadLatestIndexConsistencyReport()` / `saveLatestIndexConsistencyReport()`。
- `admin-maintenance.js`：`scan-index-consistency` 执行只读扫描后保存报告；`GET /api/admin/maintenance` 现在返回 `indexConsistencyLatest`，系统页刷新即可看到最近结果。
- `system.js`：系统管理页新增「索引一致性」卡片，展示状态、问题总数、扫描范围、最近扫描时间、问题分类、首个样例路径，并保留「扫描」维护动作按钮。
- `admin.css` / `admin.css` 产物：新增 `.ov-index-*` 样式，保证桌面双列、窄屏单列，避免问题样例文本撑破布局。
- 测试：`tests/frontend.test.mjs` 断言系统页渲染报告卡和 `data-maintenance-action="scan-index-consistency"`；`tests/core.test.mjs` 断言扫描结果会持久化进维护快照，且不改变 `file_index` 行数。

### #17 后台可观测性增强 — stats + overview UI

- `admin-stats.js`：`GET /api/admin/stats` 新增 `observability` 字段，聚合近 24 小时 API/WebDAV 限流、登录失败、失败任务、Webhook 失败、未确认系统警告、错误通知和最近索引一致性问题。
- 汇总结构包含 `status`、`counters`、`topRateLimits`、`topLoginFailures`、`failedTasks`、`webhookFailures`、`warnings`、`indexConsistency`；单项查询失败时返回空集合，避免概览页被某个可观测表拖垮。
- `overview.js`：概览统计区下方新增「运维可观测」面板，显示 8 个关键计数、索引健康摘要和少量异常 chip。
- `mock/index.js`：补齐可观测 mock 数据和维护快照中的索引一致性报告，方便离线/预览渲染。
- `make-env.mjs`：补充 observability 所需 SQL mock，包括近 24 小时限流、登录失败、失败任务、Webhook 失败和错误通知查询。
- 测试：前端覆盖「运维可观测」「Webhook 失败」「索引问题」渲染；核心测试覆盖 stats 返回的 counters、失败任务、Webhook 失败和 indexConsistency 摘要。

### #19 测试 mock 降低脆弱性 — `make-env.mjs`（⚠️ 验证未关闭）
- 新增 `api_rate_limits` `INSERT ... ON CONFLICT ... RETURNING` handler（匹配 #6 新 SQL）
- 新增 `storage_quota_counter` 表 mock（INSERT OR IGNORE + 原子 UPDATE + CASE UPDATE）
- 修复：`assertApiOk` 测试参数 `response.ok`（对齐 #12 修复）
- 当前效果：D1 rate-limiter 测试 3/3 通过；WebDAV rate limit 测试通过；全量测试为 245/251，通过但仍有 6 个失败。

## 待办任务的方向备注

- **#1/#3/#4/#11/#13/#19 复核项**：先处理上方 ⚠️ / ❌ 项，恢复 `npm test`。
- **#14 补齐 WebDAV 测试 (roadmap 4)**：已补 DELETE、目录 MOVE/COPY、覆盖语义测试；如需继续增强，可再补编码路径测试。
- **#15 大目录操作任务化 (roadmap 1)**：目录复制/移动/批量删除统一为后台任务。
- **#16 索引一致性前端展示 (roadmap 2)**：已完成，后续可在真实数据量较大后补分页/展开详情。
- **#17 后台可观测性增强 (roadmap 5)**：已完成，后续可接入趋势图或可配置告警阈值。
- **#18 分享功能产品化 (roadmap 6)**：访问/下载计数、限额、访问日志。
- **#19 测试 mock 降低脆弱性 (roadmap 7)**：拆分 `make-env`，抽出 SQL handler registry。
