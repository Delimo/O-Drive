# O-Drive 改进建议

> 创建时间：2026-07-02。本文记录一次代码审阅后的改进建议，供后续排期实施。
> 结论均基于当前代码库实际实现，引用文件路径与模块职责，不依赖易失效的行号。
> 每条建议标注了优先级、现状、问题、建议做法和验证方式。实施完成的条目应从本文移除，
> 并把仍有价值的结论合并进 `maintenance-handoff.md` 或对应主题文档。

## 优先级总览

| 编号 | 主题 | 优先级 | 类型 | 影响面 |
| --- | --- | --- | --- | --- |
| 1 | 全局 API 限流接入 D1 | 高 | 安全 / 正确性 | `functions/api/[[path]].js`、`rate-limiter.js` |
| 2 | 登录失败锁定改为 IP + 账号维度 | 中 | 安全 | `functions/api/lib/auth.js` |
| 3 | 消除 Webhook 触发链路的 `.clone().json()` 二次解析 | 中 | 性能 / 健壮性 | `functions/api/lib/router.js` |
| 4 | `copyTree` 子树复制的错误不对称 | 中 | 正确性 | `functions/api/lib/r2-tree.js` |
| 5 | `mapWithConcurrency` 使用 `Array.shift()` 出队 | 低 | 性能 | `functions/api/lib/r2-tree.js` |
| 6 | 清理 `common/response.js` 与实际使用不一致的封装 | 低 | 可维护性 | `functions/api/lib/common/` |

---

## 1. 全局 API 限流接入 D1（高）

### 现状

- 全局 API 限流由 `functions/api/[[path]].js` 调用 `functions/api/lib/rate-limiter.js` 的 `checkRateLimit()` 实现，
  计数存放在模块级的内存 `Map`（`ipRequests`）。
- `rate-limiter.js` 顶部的文件注释已经明确说明：Cloudflare Workers 每个 isolate 有独立内存，
  Map 不跨 isolate 共享，分布式请求命中不同 isolate 时限流可被绕过。
- 数据库里其实已经准备好了 D1 版限流所需的表：`functions/api/lib/schema.js` 的 `CORE_TABLE_SQL`
  定义了 `api_rate_limits (key, request_count, window_start)`，并且 `migrations/0003_add_rate_limit_index.sql`
  专门为它加了索引。但除建表外，运行时没有任何代码查询 `api_rate_limits`——限流仍然只走内存版。
- 对比参照：`functions/api/lib/download-bursts.js` 已经用 D1（`download_bursts` 表）做了完整的
  窗口计数 + 告警冷却 + 临时阻断，是本项目里现成、可复用的 D1 限流范式。

### 问题

内存限流在多 isolate、无状态的 Pages Functions 环境里只是"尽力而为"的削峰，攻击者靠并发打到不同
isolate 即可稀释计数。对于纯粹的 QPS 削峰这尚可接受，但一旦把它当作安全边界看待就不够。

### 建议

1. 参照 `download-bursts.js` 的模式，为 `api_rate_limits` 表写一套 D1 backed 的
   `checkRateLimit`（读取 `window_start`/`request_count`，跨窗口重置，超阈值返回 `retryAfter`）。
2. 在 `functions/api/[[path]].js` 的 `routePolicy.rateLimit` 分支切换到 D1 版本；
   保留内存版作为快速前置短路（先查内存，超限直接拒，未超再落 D1）以降低 D1 读写次数，是可选优化。
3. 沿用 `download-bursts.js` 里 `Math.random() < 0.01` 的抽样清理策略回收过期行，避免表无限增长。

### 验证

- 在 `tests/rate-limiter.test.mjs` 增加针对 D1 版本的用例（可复用 `tests/helpers/make-env.mjs` 的 D1 mock）。
- 手动验证：同一 IP 连续超过阈值后返回 429 且带 `Retry-After`，窗口过后恢复。

---

## 2. 登录失败锁定改为 IP + 账号维度（中）

### 现状

- 管理员登录已经有 D1 backed 的失败锁定：`functions/api/lib/auth.js` 的 `checkLoginLocked()` /
  `recordLoginFailure()` 使用 `login_attempts` 表，按 `ip` 主键计数，达到 `LOGIN_MAX_ATTEMPTS`（5）
  后锁定 `LOGIN_LOCKOUT_MS`（15 分钟），并通过 `login_alerts` 表做告警冷却。
  这一块是正确且已落地的，不是缺口。

### 问题

锁定维度是**纯 IP**。真实攻击者可以轮换 IP（住宅代理池、云主机）来绕过按 IP 的计数；
同时 `login_attempts` 表主键是 `ip`，无法表达"某账号在全局范围内被高频尝试"。

### 建议

- 增加一个**按账号**（或全局）的失败计数维度，例如再记录 `user:<username>` 维度的尝试数，
  达到更高阈值时触发全局降速或延时响应（不必硬锁定，避免被用来 DoS 掉合法管理员登录）。
- 可考虑对失败响应加入固定小延时，抬高在线爆破成本。
- 注意与第 1 条协同：全局登录接口本身也应受 D1 限流保护，两者叠加。

### 验证

- 扩展 `tests/core.test.mjs` 或新增 auth 相关用例，覆盖"同账号多 IP 失败"场景。

---

## 3. 消除 Webhook 触发链路的 `.clone().json()` 二次解析（中）

### 现状

`functions/api/lib/router.js` 里多个路由包装器（如 `handleTrashDeleteRoute`、`handleTrashClearRoute`、
`handleMkdirRoute`、`handleSingleUploadRoute` 等）在拿到 handler 返回的 `Response` 后，用
`res.clone().json()` 再次解析响应体，从中取出字段发 Webhook 通知。

### 问题

1. **性能**：对较大的 JSON 响应体多一次 clone + 反序列化开销。
2. **健壮性**：依赖"handler 一定返回 JSON 格式 Response"这个隐式约定；一旦某 handler 改成流式或非 JSON 响应，
   这里会静默拿到 `null`，通知就丢失且不易察觉。

### 建议

- 让写操作 handler 直接返回结构化结果，例如 `{ response, event, eventData }`，
  router 直接读取 `event`/`eventData` 发 Webhook，不再对 `Response` 做二次反序列化。
- 若不想大改 handler 签名，可退一步：让 handler 把要通知的数据挂在一个轻量载体上（而非藏在 Response body 里），
  router 从载体取数据。
- 改动集中在 `router.js` 和少量 handler，`tests/architecture.test.mjs` 与现有核心测试可兜底路由行为。

### 验证

- 现有涉及上传/删除/移动的核心测试应保持通过。
- 补一个用例断言 handler 非 JSON 响应时通知链路的行为是明确的（而非静默丢失）。

---

## 4. `copyTree` 子树复制的错误不对称（中）

### 现状

`functions/api/lib/r2-tree.js` 的 `copyTree()` 处理目录复制/移动：
- 顶层入口 `handlePaste`（`file-mutations/paste.js`）对每个 primary 任务包了 try/catch，单项失败会收敛成
  `{ ok: false, message }`，不影响其他项。
- 但 `copyTree` 内部对**子树**对象用 `mapWithConcurrency(..., 6, async (item) => {...})` 并发处理时，
  worker 回调里没有 try/catch。任一子对象 `storageCopy`/`storageGet` 抛错，会让内部的 `Promise.all` 直接 reject，
  向上冒泡终止整个 `copyTree`。

### 问题

大目录复制/移动中途某个子对象失败时，会留下**半完成状态**：部分子对象已复制（move 场景下部分源已删除），
但整体抛错，调用方只知道"失败"，难以定位已完成到哪一步。顶层与子树两层的错误处理不对称。

### 建议

- 在子树 worker 回调内部加 try/catch，收集失败项（路径 + 原因）而不是让整体 reject；
  `copyTree` 返回时把子树失败信息一并上报给 `handlePaste`，纳入其 `failed` 列表。
- move 场景要特别注意：只有子对象**成功复制后**才删除源，避免"删了源但目标没写成"的数据丢失。
  当前逐项 `storageCopy` 后再 `deletePathEntry` 的顺序是对的，需保持并在失败时不删源。

### 验证

- 新增用例：mock 一个子对象 `storageCopy` 抛错，断言 `copyTree`/`handlePaste` 返回部分失败而非整体异常，
  且失败子项的源对象未被删除。

---

## 5. `mapWithConcurrency` 使用 `Array.shift()` 出队（低）

### 现状

`functions/api/lib/r2-tree.js` 的 `mapWithConcurrency()` 用 `queue.shift()` 从数组头部取任务。

### 问题

`Array.prototype.shift()` 是 O(n)（移动剩余全部元素）。对几千对象的大目录批量操作，
出队总开销累积到 O(n²)。功能正确，只是规模上去后有不必要的开销。

### 建议

- 改用游标索引：维护一个自增下标 `let i = 0; const item = items[i++];`，O(1) 出队。
- 改动极小且局部，不影响并发语义。

### 验证

- `copyTree` 相关现有测试保持通过即可；无需新增行为测试。

---

## 6. 清理 `common/response.js` 与实际使用不一致的封装（低）

### 现状

- 实际入口 `functions/api/[[path]].js` 统一使用 `common/index.js` 导出的 `jsonResponse()`。
- 而 `functions/api/lib/common/response.js` 里定义了 `jsonResponse` 和 `apiError`，
  审阅中未发现 `apiError` 被广泛使用；同时早期文档/草稿里出现过 `createErrorResponse` /
  `createErorResponse`（后者还是拼写错误）这类并不存在于实际入口的命名。

### 问题

存在"文档/记忆中的 API 名"与"代码实际导出名"漂移的风险，容易误导后续维护者。
这是可维护性问题，不影响运行。

### 建议

- 核对 `common/` 下所有响应封装的实际使用情况，删除无引用的导出（如确认 `apiError` 无人用）。
- 统一响应构造入口，确保全项目只有一种推荐用法（`jsonResponse`），并在 `architecture.md` 里点名。

### 验证

- `npm run lint` 与核心测试通过；grep 确认被删导出确实零引用。

---

## 实施顺序建议

1. 先做 **1（D1 限流）** —— 唯一"看起来在防护、实际打折"的安全项，且有 `download-bursts.js` 现成范式可抄。
2. 再做 **4（copyTree 错误对称）** —— 涉及数据正确性，风险最高的功能性问题。
3. 然后 **3（Webhook 二次解析）** 和 **2（登录多维锁定）** —— 工程质量与安全加固。
4. 最后 **5、6** —— 低风险的性能与整洁度收尾，可顺手带做。

每完成一条，从本表移除并把结论合并进 `maintenance-handoff.md`。
