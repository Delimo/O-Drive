# O-Drive 代码审计发现

> 本文档记录一次深入代码审计的结果，按子系统分组，供后续逐项修复参考。
> 审计范围：前端状态层、上传/分片、鉴权与权限链路、分享/回收站/Webhook 一致性。
> 每条发现给出严重级别、位置（`file:line`）、问题、影响和修复方向。

## 主线判断

单请求逻辑写得扎实，威胁模型也考虑过（fail-closed、脱敏 500、CSRF、PBKDF2 全在）。
问题几乎全部集中在一处：**Cloudflare D1/R2 没有事务能力，而代码多处使用「读-检查-写」三步模式，在 Workers 天然并发下失效。** 配额、下载次数、限流、burst 检测都是同一个模式在并发下破功。

治理方向统一：优先用 D1 条件 UPDATE（`WHERE count < limit`）+ 检查 affected rows，或原子 `UPDATE ... RETURNING` 收口。这些改动都不动架构，是在成熟骨架上补并发正确性。

## 修复优先级建议

| 优先级 | 发现 | 理由 |
| --- | --- | --- |
| 1 | [S1 Webhook SSRF](#s1-webhook-ssrfcritical) | 安全，云元数据外泄，改动小 |
| 2 | [A1 路径密码锁定可绕过](#a1-路径密码锁定可绕过-x-forwarded-forhigh) | 安全，一行修复，与其他文件对齐 |
| 3 | [U2 孤儿 multipart](#u2-孤儿-multipart-uploadhigh) | 直接对应 R2 计费，持续漏钱 |
| 4 | [U1 配额可绕过](#u1-配额可绕过-toctoumedium--cache-30shigh) / [S2 下载次数超限](#s2-下载次数超限-toctocmedium) | 并发正确性，原子条件更新收口 |
| 5 | [S6 回收站孤儿窗口](#s6-回收站孤儿窗口medium) | 先写 DB 行再删原件，调整顺序 |

---

## 上传 / 分片

### U1 配额可绕过 (TOCTOU + cache 30s)｜HIGH

> 修复状态（2026-07-04）：✅ 已完成。当前上传、秒传、分片完成和 WebDAV PUT 走 `tryReserveStorageQuota()` 原子预留；预留判断已纳入 D1 当前已用量和并发 reserved bytes。

- 位置：`functions/api/lib/storage.js:167`、`stats.js:5,13-14,33`、`multipart.js:37-51`
- 问题：`checkStorageQuota` 读取的 `used` 来自 `getIndexedStorageUsed`，该值缓存 30000ms。检查与随后的 `upsertFileIndex`/`addStorageUsage` 不原子，缓存只在写后失效。客户端并发跑 4+ 文件 × 4 分片（`upload.js:260`、`upload.js:168`），全部读到同一个陈旧 `used`，各自通过 `incoming <= remaining`，总和远超配额。
- 补充：大文件分片只在 create 时按 `totalSize` 检查一次（`multipart.js:37-51`），parts 和 complete 完全不再校验；`completeAndDeduplicate` 的 dedup 拷贝写入真实字节，无配额门。
- 影响：可复现的真实配额绕过，非理论。
- 修复方向：配额检查改为写入时原子扣减（`storage_usage` 上做条件 UPDATE 并检查 affected rows），或在 complete 阶段重新校验并在超限时回滚。

### U2 孤儿 multipart upload｜HIGH

- 位置：`functions/api/lib/file-mutations/multipart.js:188-200`、`public/js/services/index.js:239,268,270,279`
- 问题：abort 只由客户端发起（cancel/error 时）。标签页关闭、断网、worker 中途抛异常时 `storageAbortMultipartUpload` 永不调用。服务端没有任何清扫/过期机制，不列出也不回收未完成的 `uploadId`。R2 会为悬空分片持续计费。
- 补充：pause/cancel 检测有竞态——`multipartUpload` 抛 `UPLOAD_PAUSED`，但 catch 块只在 `UPLOAD_CANCELLED` 时 abort（`services/index.js:268`）。paused 正确保留 upload，但非这两种字符串的中途失败（`services/index.js:239`）会抛出且不 abort，泄漏 upload。
- 影响：R2 存储成本持续泄漏。
- 修复方向：加服务端定时/懒清理，列出并 abort 超时的 uploadId（记录 create 时间戳到 D1，扫描超期项）。

### U3 conflict 解析有竞态，写入时不强制唯一｜MEDIUM

- 位置：`functions/api/lib/file-mutations/helpers.js:32-44,54-93`、`multipart.js:34`
- 问题：`resolveUploadConflict` 先 `keyExists` 读、返回 key，实际 `upsertFileIndex` 在很后面且无唯一性守卫。同名文件并发上传（rename 模式）可能都选到 `fo (1)`；overwrite/默认模式下第二个静默覆盖。`keyExists` 混用 index + `storageHead` + list，看不到刚开始但未完成的同名上传。multipart 在 create 时解析 conflict，但 complete 写入解析出的 key 时不再校验。
- 修复方向：写入时以唯一约束/条件插入兜底，冲突时重试选名。

### U4 completeAndDeduplicate dedup/copy 非原子｜MEDIUM

- 位置：`functions/api/lib/file-mutations/multipart.js:127-141`、对比 `upload.js:129-138`
- 问题：dedup 命中时删除刚组装的对象（`:128`）；未命中时拷贝到 sha256 对象 key 再删临时对象（`:131-134`）。若 `createStorageObject` 或拷贝在删除后失败，上传的数据丢失且无 index 条目——静默数据丢失，而客户端以为成功。单文件路径直接 put 到对象 key（`upload.js:129-138`），更安全。
- 修复方向：先拷贝/建对象成功再删临时对象；失败时保留临时对象并报错。

### U5 upload-check 短路仍竞争配额｜LOW

- 位置：`functions/api/lib/file-mutations/upload-check.js:37-52`
- 问题：dedup 命中路径在缓存的配额检查后写 index 条目，多个并发相同 hash 检查全部通过。
- 修复方向：随 U1 一并收口。

### U6 两套并存的配额系统（DEAD CODE）｜LOW

- 位置：`storage-quota.js`（`checkQuota`，key `storage_quota_bytes`）未被任何上传路径引用；上传使用 `storage.js`/`checkStorageQuota`（key `storage_config_v1`）。
- 影响：陈旧误导代码，非运行时 bug。
- 修复方向：确认后删除 `storage-quota.js`。

### 已核实无问题

- 分片排序正确：服务端 `storage.js:252-256`、客户端 `services/index.js:286-288` 均重排，partNumber 校验 `>=1`（`multipart.js:67`）。
- 多存储高水位溢出逻辑不存在：`storageId` 全程硬编码 `"r2"`，`resolveStorageIdForPath` 恒返回 `"r2"`。
- 文件索引同步正确：`upsertFileIndex` 更新 `file_index` + `storage_usage` + `storage_objects` 引用计数（`upsert.js:68-98`），旧对象清理按引用计数（`upload.js:49-67`、`multipart.js:150-156`）——运行时正确，但受 U1 的缓存-写后失效影响。

---

## 鉴权 / 权限

### A1 路径密码锁定可绕过 (x-forwarded-for)｜HIGH

- 位置：`functions/api/lib/protected-paths.js:98-104,106-154`
- 问题：锁定 key 从 `cf-connecting-ip` **或客户端可控的 `x-forwarded-for`** 派生。`checkUnlockAttempts`/`recordUnlockFailure`/`clearUnlockFailures` 以此 IP 为 key 做 5 次/15 分钟锁定。攻击者轮换 `x-forwarded-for` 每次请求都重置锁定，把 PBKDF2 爆破防护降级到只剩全局 120/min。
- 对比：登录锁定（`auth.js:234`）和限流器（`rate-limiter.js:21`）都**只用** `cf-connecting-ip`——本文件是唯一不一致处，几乎肯定是笔误。
- 修复方向：删掉 `|| x-forwarded-for`，只用 `cf-connecting-ip`，与其他文件对齐。一行。

### A2 D1 限流器非原子 (read-modify-write)｜MEDIUM

- 位置：`functions/api/lib/rate-limiter.js:79-113`
- 问题：SELECT 后 UPDATE，无事务/原子自增。并发请求读到同一 count 各自 UPDATE，计数不足、放过突发（超 120/min）。per-isolate 内存回退（`checkRateLimit`）也不跨 isolate 共享（文件顶部已注明）。
- 修复方向：改原子 `UPDATE ... SET count = count + 1 ... RETURNING count`，或 `INSERT ... ON CONFLICT DO UPDATE`。

### A3 分享访问 cookie 非常量时间比较｜LOW

- 位置：`functions/api/lib/shares/password.js:55`
- 问题：`value === (await signShareAccess(...))` 用 `===` 比较含 HMAC 的完整签名值，非 `timingSafeEqual`。伪造仍需密钥，网络上的时序侧信道不实际。
- 补充：`verifyPassword`（`protected-paths.js:42`）、`verifySharePassword`（`password.js:22`）也用非常量比较，但那里候选值是攻击者输入的确定性 PBKDF2，无害。
- 修复方向：改 `timingSafeEqual`，与 auth.js 一致。

### A4 用户名 === 比较｜LOW

- 位置：`functions/api/lib/auth.js:247`
- 问题：`/api/login` 上有轻微用户名存在性时序泄漏。WebDAV 两者都用 `timingSafeEqual`（`dav/lib/auth.js:32-33`），非问题。
- 修复方向：低优先，可选常量时间比较。

### A5 遗留 SHA-256 密码回退｜LOW

- 位置：`functions/api/lib/protected-paths.js:44`
- 问题：接受 `sha256Hex(salt:password)` 用于非 PBKDF2 存储的哈希。无盐遗留格式偏弱，仅适用迁移前记录。
- 修复方向：迁移后移除回退。

### 信息 / 已核实

- I1：`getClientIp` 在无 `cf-connecting-ip` 时返回 `"unknown"`（`rate-limiter.js:21`、`auth.js:234`）。非 Cloudflare/本地部署会把所有客户端塌缩到一个桶（共享锁定/DoS）。CF 后面正常。
- I2：WebDAV（`dav/[[path]].js:74`）共享 `ADMIN_PASSWORD`，有 30/min IP 限流（`:62`），但无账户锁定/`login_attempts` 集成。授权仅用 `isReservedKey`——因 WebDAV 仅 admin 可用、admin 本就能看保留/隐藏路径，一致。
- I3：路径授权无遍历漏洞。`getR2KeyFromPath`（`request-context.js:38-41`）解码一次（双重编码保持字面量，无法到达 `.trash`），R2 key 扁平无 `../` 语义，`normalizeName` 拒绝 `.`/`..`/斜杠（`common/name.js:4-20`）。
- **H2 已排查、不成立**：曾疑「保留路径写保护仅对 admin 强制」。已确认 `PUBLIC_ROUTE_DISPATCHERS`（`router.js:320-329`）**无任何写操作 handler**（只有 zip-download、access/unlock、search、folder-stats、files GET、thumbnail、download、preview）；所有写路由都在 `ADMIN_ROUTE_DISPATCHERS`，只有 `isAdmin(auth)` 才进入。CSRF 与保留路径检查放在 admin 分支是正确的。**无需修复。**
- 扎实项：token HMAC + exp（`auth.js:46-68`）、CSRF 双提交绑进签名 JWT + `timingSafeEqual`（`auth.js:39-44`）、cookie flags（`__Host-`、HttpOnly、SameSite=Strict、HTTPS 上 Secure，`auth.js:30-37`）、PBKDF2 210k/SHA-256（`crypto.js:48`）、分享令牌 144-bit 熵（`shares/admin.js:27-31`）、unlock 检查 DB 出错 fail-closed（`protected-paths.js:127-130`）。

---

## 分享 / 回收站 / Webhook

### S1 Webhook SSRF（CRITICAL）

> 修复状态（2026-07-04）：✅ 已完成当前验收范围。默认要求 Webhook 使用 HTTPS，禁止 IP 地址形式目标，阻断 IPv4/IPv6 私网/本地地址和 `localhost`，并禁止重定向切换 host；同时保留高级目标白名单策略，配置 `WEBHOOK_ALLOWED_HOSTS` / `WEBHOOK_HOST_ALLOWLIST` / `WEBHOOK_ALLOWLIST` 后，保存、测试、重试和实际投递都会拒绝非白名单主机。

- 位置：`functions/api/lib/webhooks.js:250-267,268`
- 问题：私有 IP 拦截只做**主机名字符串匹配**，而 `fetch()` 用默认 `redirect: "follow"`。绕过方式：
  - (a) 公网 URL 302 跳转到 `http://169.254.169.254/…` 或 `10.x`，跳转目标不再过检查；
  - (b) DNS rebinding / 解析到内网 IP 的主机名（检查的是主机名字符串，非解析后 IP）；
  - (c) 替代编码：十进制 `2130706433`、十六进制 `0x7f...`、八进制、IPv6 `[::ffff:127.0.0.1]`、`[fd00::]` ULA；
  - (d) `100.64.0.0/10` CGNAT、`172.16/12` 边界编码。
- 影响：URL 由 admin 控制，爆炸半径限于已认证 admin，但云元数据外泄真实存在。
- 修复方向：`redirect: "manual"` 并对每个跳转目标重新校验；对 **DNS 解析后的 IP** 而非主机名做私有网段校验；覆盖十进制/十六进制/八进制/IPv6 编码。

### S2 下载次数超限 (TOCTOU)｜MEDIUM

> 修复状态（2026-07-04）：✅ 已完成。下载前使用条件 `UPDATE` 预留下载槽位，失败下载会回滚计数；对应分享测试已恢复通过。

- 位置：`functions/api/lib/shares/public.js:50-53,113,146,172`
- 问题：`item.exhausted` 检查在请求开始读的行上做，`download_count = download_count + 1` 的自增在很后面。自增语句本身原子，但检查-then-act 跨整个请求，无 `WHERE download_count < max_downloads` 守卫。N 个并发请求全部通过 exhausted 检查、全部下载、全部自增，最终超限至多 N-1。expiry 同理。
- 修复方向：自增改条件 UPDATE（`WHERE download_count < max_downloads`）并检查 affected rows，0 行即拒绝。

### S3 Webhook 投递阻塞主请求｜HIGH

> 修复状态（2026-07-04）：✅ 已完成。分享过期/耗尽通知已通过 `context.waitUntil` 调度，文件操作和登录失败通知也走异步投递。

- 位置：`functions/api/lib/shares/expiry.js:55-87,225,241`、`admin.js:36`、`webhooks.js:242-308,426-444`
- 问题：`cleanupExpiredShares` 在 `handleAdminShares` GET 内被同步 await，内部调用 `notifyShareExpiredOnce` → `notifyWebhookWithLog`，await 带重试 + 5s 超时的 `Promise.all(sendOne)`。最坏约 15s（2 重试 × 5s + 退避）每端点加到 admin 请求上。`expiredResponse`/`exhaustedResponse` 的公开分享路径同样。这些调用点没有 `waitUntil` 包裹。
- 修复方向：用 `context.waitUntil`（项目里的 `waitForWebhook`）包裹这些通知，脱离主请求关键路径。

### S4 投递记录不全｜HIGH

> 修复状态（2026-07-04）：✅ 已完成。文件操作、登录失败 burst、分享过期/耗尽通知均使用 `notifyWebhookWithLog()`，后台保留 delivery 记录并支持失败重试。

- 位置：`functions/api/lib/webhooks.js:344,374,430,440,489,530-575`
- 问题：`recordDelivery` 只被 `notifyWebhookWithLog` 调用。所有便捷通知器（`notifyFileUploaded/Deleted/Moved/…`）用不记录的 `notifyWebhook`。因此投递日志只捕获 `share.expired`——文件操作 webhook 无审计、不可重试。
- 修复方向：让文件操作 webhook 也走 `notifyWebhookWithLog`（或让 `notifyWebhook` 内部记录）。

### S5 Webhook 认证头明文存储｜MEDIUM

- 位置：`functions/api/lib/webhooks.js:344,489`
- 问题：`recordDelivery` 把 `endpoint_config`（含自定义 `headers`，可能有认证 token）以 JSON 明文存进 `webhook_deliveries`，`retryWebhookDelivery` 再读回。
- 修复方向：存储时剥离/脱敏敏感 header，重试时从当前 endpoint 配置重新取。

### S6 回收站孤儿窗口｜MEDIUM

- 位置：`functions/api/lib/trash/soft-delete.js:102-128,145`、`index-consistency.js:178`
- 问题：`softDeleteTree` 先把物理对象拷到 `.trash/…` 并删原件（`:102-128`），**再** INSERT `trash` 行（`:145`）。若 INSERT 抛异常，对象滞留 `.trash/` 无 DB 记录；`scanIndexConsistency` 跳过 `isReservedKey` 路径（`:178`），`.trash` 孤儿对一致性扫描不可见。
- 修复方向：调整顺序，先写 DB 行（或先建一条 pending 记录）再删原件；或让一致性扫描覆盖 `.trash` 前缀识别孤儿。

### 低 / correctness 说明

- **7 天保留正确但不对称**：过期分享遵守 `EXPIRED_SHARE_AUTO_DELETE_MS`（`expiry.js:60`）；exhausted 分享用 `exhaustedCutoff = now`（`:61,63`）立即删除，无保留、无重激活（`reactivate` 守卫 `:146-150`，符合预期但未文档化）。
- **手动清理绕过保留**：`manual=true` 设 `expiryCutoff = now`（`expiry.js:60`），无视 7 天窗口立即删除全部过期分享。
- **burst UPDATE 是 last-write-wins**（`download-bursts.js:105-142`）：并发下载读同一 `request_count` 竞争 UPDATE → 相对阈值计数不足。非安全，只软化检测。`blocked_until` 在窗口重置时正确保留（`:120`）。
- **已核实无 R2 孤儿**：分享是纯 D1 指针，`deleteShare` 只删行（`expiry.js:27-32`），正确。
- **已核实 index 截断优雅降级**：`syncFileIndexFromR2` 上限 20k/重建 50k（`sync.js:6,17`），超出 `truncated` 仅为返回标志，但读取时 `listShareDirectory`/`collectFolderZipEntries` 合并 live R2 list + index 并去重（`directory.js:49-100`、`zip.js:36-85`），降级而非丢文件。
- **已核实回收站恢复冲突处理正确**：error/skip/overwrite/rename（`helpers.js:120-150,243-319`），引用计数经 `releaseTrashEntry` 递减，无重复计数。

---

## 前端状态层

### F1 loadExplorer 无请求序列化 — 响应乱序竞态｜HIGH

- 位置：`public/js/state/thunks/explorer.js:26-108,105-107`、`index.js:403-406`
- 问题：`fileApi.list/search` 无 abort/请求令牌。快速导航或快速输入可致两请求在途，后返回的慢请求覆盖新数据，或早请求的 `finally { setSearching(false) }` 清掉新请求的 searching 标志。经典陈旧数据渲染。
- 修复方向：引入请求令牌/序列号，只应用最新请求结果；或用 AbortController 取消旧请求。

### F2 batchDispatch 冻结渲染直到异步 thunk 完成｜HIGH/MED

- 位置：`public/js/state/create-slice.js:34-37,55-65`、`file-actions.js:33-40`
- 问题：`batchDepth` 门控所有通知，直到批内每个 await 的 action resolve。`clear-search-filters` 把 `thunks.loadExplorer()` 放进批处理，网络往返完成前无任何 re-render（无 loading spinner），然后一次延迟的 `notifyListeners`。调用方也不 await 返回的 promise，rejection 未处理。
- 修复方向：把异步 thunk 移出 batch 原语；batch 只用于同步的多 action 合并。

### F3 上传定时器模块级全局，跨批次污染｜MED

> 修复状态（2026-07-04）：✅ 已完成。自动清理定时器改为数组管理，上传完成收尾使用 `autoCloseTimers.push(setTimeout(...))`，统一清理全部定时器。

- 位置：`public/js/state/thunks/upload.js:8-9,312-314,313`
- 问题：`autoRemoveTimers`/`autoCloseTimer` 是模块作用域。每次 `uploadFiles` 重新赋值 `autoCloseTimer` 不清旧的；3s 窗口内启动第二批上传时，陈旧 `autoCloseTimer` 触发 `uploads.clearAll()` 会清掉第二批的 item 列表。
- 修复方向：赋值前 `clearTimeout` 旧定时器；或把定时器状态挂到批次上下文而非模块全局。

### F4 assertApiOk 在 completed 时绕过 response.ok｜MED/LOW

- 位置：`public/js/state/thunks/errors.js:8-11`、`explorer.js:263,317-319,347,404`
- 问题：`acceptedPartial = allowCompleted && data?.completed` 在 `response.ok` 检查前短路，携带真值 `completed` 的 5xx 会被静默接受（`batchDelete`/`pasteClipboard` 用到）。错误处理风格也不一致——多数 thunk 用 `assertApiOk`，但 `batchDownloadZip`、`previewEntry` 手写 `response.ok` 检查。
- 修复方向：先校验 `response.ok` 再判断 `completed`；统一错误处理走 `assertApiOk`。

### F5 订阅粒度 / selector 脆弱｜LOW

- 位置：`public/js/state/index.js:426-432,439`、`selectors.js:41-42`
- 问题：admin 页把整个 `s.admin` 订阅到 full `render()`，每次通知轮询 tick 都重渲染整页。folder-stats 订阅把约 10 个字段序列化成模板字符串——能用但脆。`currentEntries` 缓存是模块级单例，仅在单 store 假设下成立。
- 修复方向：细化订阅粒度；selector 缓存改为 store 绑定。
- 次要：boot 双重渲染（`render()` 已调 region 渲染，`index.js:456-459` 又调一次）；`subscribeSlice` 仅 `beforeunload` 卸载（`index.js:483`）——MPA 下可接受。

### 已核实无问题

- `createSlice`/`combineReducers`/`createStore`（`create-slice.js:1-68`）最小且正确：reducer 纯 spread，`combineReducers` 每次 dispatch 返回新 root，slice reducer no-op 返回同引用保持身份稳定。
- 引用相等订阅（`index.js:408-417`）正确利用该稳定性；`currentEntries` memo（`selectors.js:41-96`）keyed on `explorer` 身份，因上述稳定性而有效。
- 异步 thunk 一致在进度回调内重读 `getState()`（`upload.js:182-234`）而非闭包快照——无陈旧闭包。
- 无真实订阅泄漏：`subscribe` 返回可用的 unsubscribe（`create-slice.js:43-46`），全部在 unload 时拆除。
