# O-Drive 代码审计发现

> 本文档已按当前项目代码重新核对（2026-07-04）。
> 它不再作为“原始漏洞描述逐条待修”的清单，而是区分为：当前仍待处理、需要维护决策、已修复历史问题、已核实无问题。

## 当前结论

当前主风险已经从最初的 D1/R2 并发一致性问题，收敛到少量低到中优先级的安全硬化和维护债务。

仍建议继续跟进的项目：

| 优先级 | 发现 | 当前状态 |
| --- | --- | --- |
| 1 | [U3 conflict 解析仍有竞态](#u3-conflict-解析仍有竞态medium) | 仍存在 |
| 2 | [S5 Webhook 认证头明文存储](#s5-webhook-认证头明文存储medium) | 仍存在 |
| 3 | [A3 分享访问 cookie 非常量时间比较](#a3-分享访问-cookie-非常量时间比较low) | 仍存在 |
| 4 | [A4 用户名 === 比较](#a4-用户名--比较low) / [A5 遗留 SHA-256 密码回退](#a5-遗留-sha-256-密码回退low) | 仍存在 |
| 5 | [F5 订阅粒度 / selector 脆弱](#f5-订阅粒度--selector-脆弱low) | 仍存在 |
| 6 | [U6 两套配额配置链路并存](#u6-两套配额配置链路并存low) | 需要决策 |

---

## 当前仍待处理

### U3 conflict 解析仍有竞态｜MEDIUM

- 位置：`functions/api/lib/file-mutations/helpers.js`、`functions/api/lib/file-index/ensure.js`、`functions/api/lib/file-mutations/multipart.js`
- 现状：`resolveUploadConflict()` 仍是先 `keyExists()` 读取，再返回目标 key。`file_index.path` 是主键，但 `UPSERT_SQL` 使用 `ON CONFLICT(path) DO UPDATE`，写入时会覆盖同 path 记录，而不是以条件插入兜底。
- 影响：同名并发上传在 `rename` 模式下仍可能选到同一个候选名；`overwrite`/默认写入下仍可能后写覆盖先写。multipart 在 create 阶段解析 conflict，complete 阶段写入已解析 key 时不再重新校验。
- 建议：写入 file index 时提供“仅当 path 不存在才插入”的路径；冲突时重试选名。对 overwrite 保留显式覆盖语义，对 rename/普通上传使用条件插入兜底。

### S5 Webhook 认证头明文存储｜MEDIUM

- 位置：`functions/api/lib/webhooks.js`
- 现状：`recordDelivery()` 仍将完整 endpoint 配置写入 `webhook_deliveries.endpoint_config`，其中可能包含自定义 `headers`。`retryWebhookDelivery()` 会从该字段读回原 endpoint。
- 影响：如果 webhook endpoint 使用 `Authorization`、`X-Token` 等头，delivery 历史会长期保存明文凭据。
- 建议：保存 delivery 时脱敏敏感 header；重试时优先从当前 endpoint 配置加载凭据，只把必要的 endpoint 标识、url、name、msgtype 等非敏感字段写入历史。

### A3 分享访问 cookie 非常量时间比较｜LOW

- 位置：`functions/api/lib/shares/password.js`
- 现状：`hasShareAccess()` 仍使用 `value === (await signShareAccess(...))` 比较含 HMAC 的完整 cookie 值。
- 影响：伪造仍需服务端密钥，网络时序侧信道实际风险很低，但与 `auth.js` 的 `timingSafeEqual()` 风格不一致。
- 建议：改用 `timingSafeEqual()`。

### A4 用户名 === 比较｜LOW

- 位置：`functions/api/lib/auth.js`
- 现状：登录时用户名仍使用 `username === env.ADMIN_USERNAME`，密码使用 `timingSafeEqual()`。WebDAV 侧用户名和密码都使用常量时间比较。
- 影响：理论上存在轻微用户名存在性时序差异，实际风险低。
- 建议：为了风格一致，可将用户名比较也改为 `timingSafeEqual()`。

### A5 遗留 SHA-256 密码回退｜LOW

- 位置：`functions/api/lib/protected-paths.js`
- 现状：受保护路径密码仍接受旧格式 `sha256Hex(salt:password)`，作为非 PBKDF2 记录的兼容回退。
- 影响：旧格式强度弱于当前 PBKDF2。若生产库里已无旧记录，这段逻辑会扩大无意义攻击面。
- 建议：确认迁移完成后删除回退，或增加一次性迁移标记和到期删除计划。

### F5 订阅粒度 / selector 脆弱｜LOW

- 位置：`public/index.js`、`public/js/state/selectors.js`
- 现状：admin 页仍以 `subscribeSlice(s => s.admin, render)` 订阅整个 admin slice；详情抽屉 selector 仍使用字符串拼接多个字段；`currentEntries()` 仍使用模块级缓存。
- 影响：当前单 store/MPA 模型下可用，但 admin 轮询或局部状态变化会触发整页渲染；selector 可维护性偏弱。
- 建议：细化 admin 页面订阅粒度；把复杂 selector 输出改成结构化、稳定的派生状态；如未来引入多 store，再把模块级 memo 改为 store 绑定。

---

## 需要维护决策

### U6 两套配额配置链路并存｜LOW

- 位置：`functions/api/lib/storage-quota.js`、`functions/api/lib/admin-quota.js`、`functions/api/lib/storage.js`、`public/js/state/thunks/admin/storage.js`
- 现状：上传和 WebDAV 的运行时配额检查使用 `storage.js` / `storage_config_v1` / `tryReserveStorageQuota()`；但旧的 `storage-quota.js` 仍被 `handleAdminQuota()` 使用，并且 `/api/admin/settings/quota`、前端 `loadAdminQuota()` / `setAdminQuota()` 仍然接着这条链路。
- 判断：这不是纯 dead code，不能直接删除；但它确实是并存的旧配置通道，容易和当前存储配置页的 `storageConfig` 语义混淆。
- 建议：选择其一：
  - 将旧 `/api/admin/settings/quota` 迁移到当前 `storage_config_v1`；
  - 或明确标为兼容接口，前端逐步移除旧 quota thunk；
  - 迁移完成后再删除 `storage-quota.js`。

---

## 已修复历史问题

### U1 配额可绕过｜已修复

- 旧问题：`checkStorageQuota()` 依赖缓存的 `used`，检查和写入不原子；multipart complete / 秒传等路径可能绕过配额。
- 当前状态：`getIndexedStorageUsed()` 的 30 秒缓存已移除，`clearStorageUsedCache()` 仅为空兼容函数。上传、秒传、multipart complete、WebDAV PUT 均走 `tryReserveStorageQuota()`；该函数使用 D1 `storage_quota_counter` 做并发 reserved bytes 预留。
- 主要位置：`functions/api/lib/file-index/stats.js`、`functions/api/lib/storage.js`、`functions/api/lib/file-mutations/upload.js`、`functions/api/lib/file-mutations/upload-check.js`、`functions/api/lib/file-mutations/multipart.js`、`functions/dav/lib/methods.js`

### U2 孤儿 multipart upload｜已修复

- 旧问题：multipart upload 只依赖客户端 abort，断网、关闭标签页或 Worker 异常会留下 R2 未完成分片。
- 当前状态：服务端已增加 `multipart_uploads` 跟踪表、`trackMultipartUpload()`、`untrackMultipartUpload()` 和 `cleanupOrphanMultipartUploads()`；后台维护动作支持 `cleanup-orphan-multipart`。
- 主要位置：`functions/api/lib/file-mutations/multipart.js`、`functions/api/lib/admin-maintenance.js`

### U4 completeAndDeduplicate dedup/copy 非原子｜已修复

- 旧问题：临时对象删除顺序可能导致 copy/create 失败后数据丢失。
- 当前状态：非 dedup 路径先 copy 到永久 object key，再创建 storage object 记录，最后删除临时 key；dedup 命中时也在 `upsertFileIndex()` 成功后再清理组装出的临时 key。
- 主要位置：`functions/api/lib/file-mutations/multipart.js`

### U5 upload-check 短路竞争配额｜已修复

- 旧问题：秒传 dedup 命中后直接写 index，多并发可绕过配额。
- 当前状态：`handleUploadCheck()` 已在写入 index 前调用 `tryReserveStorageQuota()`，并在 finally 中释放 reserved bytes。
- 主要位置：`functions/api/lib/file-mutations/upload-check.js`

### A1 路径密码锁定可绕过 x-forwarded-for｜已修复

- 旧问题：unlock 锁定 key 接受客户端可控的 `x-forwarded-for`。
- 当前状态：`clientIp()` 明确只信 `cf-connecting-ip`，注释说明排除 `x-forwarded-for` 的原因。
- 主要位置：`functions/api/lib/protected-paths.js`

### A2 D1 限流器 read-modify-write｜已修复

- 旧问题：D1 限流器 SELECT 后 UPDATE，非原子。
- 当前状态：`checkRateLimitD1()` 已改为 `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`。入口路由和 WebDAV 均调用 D1 版本。
- 注意：`withRateLimit()` 仍使用内存 `checkRateLimit()`，如果未来重新用于生产入口，仍要确认是否接受 per-isolate best-effort 语义。
- 主要位置：`functions/api/lib/rate-limiter.js`、`functions/api/[[path]].js`、`functions/dav/[[path]].js`

### S1 Webhook SSRF｜已修复当前验收范围

- 旧问题：只做主机名字符串检查且默认跟随重定向。
- 当前状态：保存、测试、重试和实际投递都会走 endpoint policy；默认要求 HTTPS，拒绝 IP literal、localhost/私网形式，并使用 `redirect: "manual"` 对每个 redirect hop 重新校验，禁止 redirect 切换 host。支持 `WEBHOOK_ALLOWED_HOSTS` / `WEBHOOK_HOST_ALLOWLIST` / `WEBHOOK_ALLOWLIST` 作为严格白名单。
- 注意：Workers 环境无法直接做通用 DNS 解析后私网段判断；对高安全部署，仍建议配置 allowlist。
- 主要位置：`functions/api/lib/webhooks.js`

### S2 下载次数超限 TOCTOU｜已修复

- 旧问题：分享下载先检查 exhausted，下载后再自增，导致并发超限。
- 当前状态：下载前使用 `reserveDownloadSlot()` 条件 UPDATE，`WHERE max_downloads = 0 OR download_count < max_downloads`；下载失败会 `releaseDownloadSlot()` 回滚。
- 主要位置：`functions/api/lib/shares/expiry.js`、`functions/api/lib/shares/public.js`

### S3 Webhook 投递阻塞主请求｜已修复

- 旧问题：分享过期/耗尽通知可能同步阻塞主请求。
- 当前状态：分享通知通过 `context.waitUntil` 调度；文件操作和登录失败通知也通过 `waitForWebhook()` 异步投递。
- 主要位置：`functions/api/lib/shares/expiry.js`、`functions/api/lib/router.js`、`functions/api/lib/auth.js`

### S4 投递记录不全｜已修复当前路由

- 旧问题：文件操作 webhook 使用不记录 delivery 的便捷通知器。
- 当前状态：当前路由中的文件操作、登录失败 burst、分享过期/耗尽通知都走 `notifyWebhookWithLog()`，后台有 delivery 记录并支持失败重试。
- 注意：`webhooks.js` 里仍保留 `notifyFileUploaded()` / `notifyFileDeleted()` 等便捷函数，它们内部仍调用不记录日志的 `notifyWebhook()`。当前路由未使用这些便捷函数；如果未来复用，需要同步改成 logged 版本。
- 主要位置：`functions/api/lib/router.js`、`functions/api/lib/webhooks.js`

### S6 回收站孤儿窗口｜已修复

- 旧问题：先复制到 `.trash/` 并删除原件，再插入 `trash` DB 行；DB 插入失败会留下不可见孤儿。
- 当前状态：`softDeleteTree()` 现在先插入 trash DB row，再移动/删除对象。
- 主要位置：`functions/api/lib/trash/soft-delete.js`

### F1 loadExplorer 响应乱序竞态｜已修复

- 旧问题：列表/搜索请求没有请求序列号，慢响应可能覆盖新状态。
- 当前状态：`explorer.loadSeq` 和 `incrementLoadSeq()` 已接入 `loadExplorer()` / `loadMoreSearchResults()`，旧请求结果会被 `isStale()` 丢弃。
- 主要位置：`public/js/state/slices/explorer-slice.js`、`public/js/state/thunks/explorer.js`

### F2 batchDispatch 冻结渲染直到异步 thunk 完成｜已修复当前已知触发点

- 旧问题：`clear-search-filters` 将异步 `loadExplorer()` 放进 batch，导致网络返回前不通知渲染。
- 当前状态：当前 `clear-search-filters` 只 batch 同步 action，然后单独 dispatch `loadExplorer()`。
- 主要位置：`public/js/events/file-actions.js`

### F3 上传定时器跨批次污染｜已修复

- 旧问题：模块级 `autoCloseTimer` 被新批次覆盖，旧 timer 可能清掉新上传列表。
- 当前状态：自动关闭 timer 已改为数组管理，统一清理所有 timer。
- 主要位置：`public/js/state/thunks/upload.js`

### F4 assertApiOk completed 绕过 response.ok｜已修复

- 旧问题：`allowCompleted && data.completed` 在 `response.ok` 检查前短路。
- 当前状态：`assertApiOk()` 现在要求 `response.ok && (...)`，5xx 不会因 `completed` 被接受。
- 主要位置：`public/js/state/thunks/errors.js`

---

## 已核实无问题 / 说明

- 分片排序正确：服务端和客户端均按 part number 重排，part number 也校验为正整数。
- 多存储高水位溢出逻辑当前不存在：运行时 `storageId` 基本固定为 `"r2"`。
- 文件索引引用计数整体正确：`file_index`、`storage_usage`、`storage_objects` 会随上传、删除、回收站释放更新。
- 公开写路由不存在：公开 dispatcher 仅包含读、搜索、下载、预览、解锁等操作；写操作都在 admin 分支并受认证/CSRF/保留路径检查约束。
- 分享删除不产生 R2 孤儿：分享是 D1 指针，删除分享仅删除分享行。
- index 截断是降级而非直接丢文件：读取链路会合并 live R2 list 与 index。
- 回收站恢复冲突处理支持 error/skip/overwrite/rename，引用计数经释放逻辑递减。
