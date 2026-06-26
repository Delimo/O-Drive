# O-Drive 可优化项清单

> 生成于 2026-06-26，基于全量代码审查。

---

## 一、安全

### 1.1 CSRF Token 比较未使用时间安全函数

- **文件:** `functions/api/lib/auth.js:55-59`
- **现状:** `verifyCsrf` 用 `===` 比较 token，但同文件已有 `timingSafeEqual` 实现（用于密码验证）
- **风险:** 时序攻击可逐字节猜解 CSRF token
- **修复:** 将 `token === auth.csrf` 改为 `timingSafeEqual(token, auth.csrf)`

### 1.2 WebDAV 端点无速率限制

- **文件:** `functions/dav/[[path]].js`
- **现状:** API 端有 120 req/min 限制，`/dav/*` 完全无防护
- **风险:** 可被暴力破解 `DAV_TOKEN`
- **修复:** 复用 `rate-limiter.js` 的限流逻辑，或在 WebDAV 入口添加独立限流

### 1.3 不安全的 HMAC 密钥回退

- **文件:** `functions/api/lib/secrets.js:20-28`
- **现状:** 未配置 `TOKEN_SECRET` 时回退到硬编码的 `"o-drive"`
- **风险:** session token 可被伪造
- **修复:** 未配置时拒绝启动，或使用 `crypto.getRandomValues()` 生成随机临时密钥

### 1.4 SQL 模板注入风险

- **文件:** `functions/api/lib/admin-maintenance.js:14-23`
- **现状:** `countRows` 直接拼接表名到 SQL：`` `SELECT COUNT(*) as count FROM ${table}` ``
- **风险:** 若未来调用者传入用户可控参数，将成为 SQL 注入入口
- **修复:** 添加表名白名单校验

### 1.5 受保护路径 fail-open 模式

- **文件:** `functions/api/lib/protected-paths.js:155-157`
- **现状:** `checkUnlockAttempts` 查询失败时返回 `{ ok: true }`
- **风险:** 数据库故障时绕过密码保护
- **修复:** 改为 fail-closed（查询失败时拒绝访问），或返回明确错误

### 1.6 内存速率限制器可被绕过

- **文件:** `functions/api/lib/rate-limiter.js:5-7`
- **现状:** 使用内存 `Map` 做限流，Cloudflare Workers 各 isolate 独立
- **风险:** 多 isolate 场景下限制无效
- **修复:** 改用 D1 或 KV 做分布式限流（可接受一定性能损耗），或接受当前限制为尽力而为

---

## 二、代码质量

### 2.1 重复代码

#### 2.1.1 `timingSafeEqual` 重复实现

- `functions/api/lib/auth.js:20-37`
- `functions/dav/lib/auth.js:6-23`
- **修复:** 提取到 `functions/api/lib/common/crypto.js`，两个入口共用

#### 2.1.2 加密工具函数重复

`bytesToHex`、`randomHex`、`pbkdf2Hex` 在以下文件各实现一遍：
- `functions/api/lib/shares.js:20-53`
- `functions/api/lib/protected-paths.js:18-55`
- **修复:** 提取到 `functions/api/lib/common/crypto.js`

#### 2.1.3 `MAINTENANCE_ACTIONS` 数组重复定义

- `public/js/render/pages/admin/maintenance.js:5-9`
- `public/js/render/pages/admin/system.js:5-9`
- **修复:** 提取为共享常量

#### 2.1.4 时间格式化不一致

- `public/js/render/home.js:405-414` 的 `renderListTime()` 输出 `YYYY-MM-DD HH:MM`
- `public/js/utils/format.js:21-25` 的 `formatTime()` 输出 `zh-CN` locale 格式
- **修复:** 统一使用 `formatTime()`

### 2.2 未使用参数

- `public/js/render/pages/admin/overview.js:2` — 解构了 `formatTime` 但从未使用
- `public/js/render/pages/admin/storage.js:2` — 同样解构了 `formatTime` 未使用

### 2.3 请求体解析缺少错误处理

多处 `request.json()` 无 `.catch()`，JSON 格式错误会返回 500：
- `functions/api/lib/auth.js:179`
- `functions/api/lib/trash.js:305, 325`
- `functions/api/lib/file-mutations/rename.js:6`（且会被 router 二次消费导致抛异常）

### 2.4 静默吞错

大量 `catch (_) {}` 空块，尤其在：
- `functions/api/lib/file-index/*.js`（几乎所有 DB 操作）
- `functions/api/lib/auth.js:106, 118, 192`
- `functions/api/lib/download-bursts.js:83, 158`
- **建议:** 至少添加 `console.warn` 或统一日志函数

### 2.5 不一致的 API 响应格式

大部分端点返回 `{ success: false, message }`，但部分端点使用不同格式：
- `functions/api/lib/notifications.js:83,85` — 返回 `{ error }` 
- `functions/api/lib/shares.js:387` — 返回 `{ message }` 无 `success` 字段
- `functions/api/lib/trash.js:438` — 同上
- **修复:** 统一使用 `apiError()` helper（已存在于 `common/response.js`）

### 2.6 `visibilitychange` 事件监听器泄漏

- **文件:** `public/index.js:465-471`
- **现状:** `startNotificationPolling` 中的 `document.addEventListener("visibilitychange", ...)` 未在 `beforeunload` 或 `destroyEvents()` 中清理
- **修复:** 使用 `AbortController` 或在清理函数中 `removeEventListener`

---

## 三、可访问性

### 3.1 Tab 栏缺少 ARIA 角色

- **文件:** `public/js/render/pages/index.js:162-173`
- **缺失:** `role="tablist"`、`role="tab"`、`role="tabpanel"`、`aria-selected`
- **影响:** 屏幕阅读器无法正确识别标签页结构

### 3.2 多个按钮缺少 `aria-label`

- `overview.js` — 刷新按钮
- `logs.js:137-143` — 分页按钮
- `storage.js:37` — 调整配额按钮
- `webhook.js:145-152` — 编辑/测试/删除按钮

### 3.3 表格缺少 `scope` 属性

- `logs.js:104-109`、`storage.js:142-147` — `<th>` 元素缺少 `scope="col"`

---

## 四、测试覆盖

### 4.1 WebDAV 模块零测试

- **目录:** `functions/dav/`（5 个文件）
- **风险:** PROPFIND、GET、PUT、DELETE、MKCOL、COPY、MOVE 均无测试
- **建议:** 至少覆盖认证、PROPFIND 目录列表、PUT 上传、DELETE 软删除

### 4.2 前端事件/thunks 无测试

- `public/js/events/` — 无测试
- `public/js/state/thunks/` — 无测试
- **建议:** 至少覆盖核心 thunks（loadExplorer、login、upload）

### 4.3 浏览器测试不足

- 仅 3 个 Playwright 用例（admin-flow）
- **缺失场景:** 游客浏览、文件上传、分享链接访问、受保护路径解锁、搜索、移动端布局

### 4.4 已有测试失败

当前有 9 个前端测试失败（与本次清理无关，为已有问题），均为 admin 页面渲染相关测试。

---

## 五、数据库

### 5.1 索引缺失

- `logs` 表缺少 `timestamp` 单列索引（清理查询 `DELETE FROM logs WHERE timestamp < ?` 会全表扫描）
- `path_access_attempts` 表缺少 `last_attempt` 索引
- `file_tasks` 表缺少 `finished_at` 索引

### 5.2 缺少 CHECK 约束

- `trash.kind` — 应限制为 `'file'` 或 `'folder'`
- `file_tasks.status` — 应限制为 `'queued'`/`'running'`/`'completed'`/`'failed'`
- `system_warnings.level` — 应限制为 `'warning'`/`'error'`/`'info'`

---

## 六、性能

### 6.1 Admin 页面过度渲染

- **文件:** `public/index.js:498`
- **现状:** `subscribeSlice(s => s.admin, render)` 在任何 admin 状态变化时全量 morphdom diff
- **修复:** 细化 selector，仅在 activeTab 相关数据变化时重渲染

### 6.2 Explorer 复合 selector 字符串脆弱

- **文件:** `public/index.js:492-495`
- **现状:** 用模板字符串拼接 ~18 个字段做变更检测，新增字段需手动维护
- **建议:** 改为结构化 selector 或引入 shallowEqual 工具

### 6.3 `admin.css` 过大（79.71 KB）

- **文件:** `public/css/pages/admin.css`
- **建议:** 按标签页拆分为独立 CSS 文件，按需加载

---

## 七、低优先级

| 项目 | 说明 |
|------|------|
| Tailwind CSS v3 → v4 | v4 已发布，配置方式不同，需评估迁移成本 |
| `storageId` 参数被忽略 | `storage.js` 中多个函数接受 `storageId` 但始终使用 `env.R2` |
| 硬编码配置值 | 会话 TTL、锁定阈值、PBKDF2 迭代次数等未暴露为环境变量 |
| Webhook SSRF 防护可加强 | 运算符优先级问题、缺少 DNS 解析检查 |
| `file-mutations/index.js` 混合关注点 | 从 `trash.js` 重新导出，造成循环依赖外观 |
