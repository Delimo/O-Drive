# O-Drive 优化分析报告

> 生成日期：2026-06-25
> 项目版本：v2.1.0
> 审查范围：全部后端 API、前端代码、CSS、配置、数据库迁移、测试

---

## 目录

- [🔴 高优先级](#-高优先级)
  - [1. R2 copy API 已实现但从未使用](#1-r2-copy-api-已实现但从未使用)
  - [2. 密码比较存在时序攻击风险](#2-密码比较存在时序攻击风险)
  - [3. save-text 用 String.length 计算文件大小](#3-save-text-用-stringlength-计算文件大小)
  - [4. 前端大量冗余 dispatch 导致多次渲染](#4-前端大量冗余-dispatch-导致多次渲染)
  - [5. Admin/Share 页面全页 re-render](#5-adminshare-页面全页-re-render)
- [🟠 中优先级](#-中优先级)
  - [6. request.clone().json() 双重解析请求体](#6-requestclonejson-双重解析请求体)
  - [7. cleanupLogs / cleanupWebhookDeliveries 每次写入都执行](#7-cleanuplogs--cleanupwebhookdeliveries-每次写入都执行)
  - [8. D1 N+1 查询](#8-d1-n1-查询)
  - [9. ensureStorageUsageTable 每次调用都执行 DDL](#9-ensurestorageusagetable-每次调用都执行-ddl)
  - [10. formatTime 每次创建新的 Intl.DateTimeFormat](#10-formattime-每次创建新的-intldatetimeformat)
  - [11. selectedKeys.includes(key) 是 O(n)](#11-selectedkeysincludeskey-是-on)
  - [12. currentEntries 缓存失效过于频繁](#12-currententries-缓存失效过于频繁)
  - [13. Migration 0002 依赖未在 migration 中创建的表](#13-migration-0002-依赖未在-migration-中创建的表)
- [🟡 低优先级](#-低优先级)
  - [14. 代码重复](#14-代码重复)
  - [15. 死代码](#15-死代码)
  - [16. CSS 重复](#16-css-重复)
  - [17. Service Worker 问题](#17-service-worker-问题)
  - [18. HTML 优化](#18-html-优化)
  - [19. 事件处理](#19-事件处理)
  - [20. 安全头改进](#20-安全头改进)
- [附录：推荐实施顺序](#附录推荐实施顺序)

---

## 🔴 高优先级

### 1. R2 copy API 已实现但从未使用 ✅ 已完成

**涉及文件：**
- `functions/api/lib/r2-tree.js:30-43` — `copyR2Object`
- `functions/api/lib/r2-tree.js:126-129` — `copyTree` 移动操作
- `functions/api/lib/trash.js:272-287` — `restoreTrashRecord`
- `functions/api/lib/storage.js:219-222` — `storageCopy`（已实现但未被调用）

**现状：**

Cloudflare R2 提供了服务端 `copy` API，可以在存储层直接复制对象，**数据不经过 Worker**。`storage.js:219-222` 已经封装了这个 API：

```js
export async function storageCopy(env, sourceStorageId, sourceKey, destStorageId, destKey) {
  await env.R2.copy(sourceKey, destKey);
  return true;
}
```

但以下三处完全没有使用它：

`r2-tree.js:30-43` — `copyR2Object`：
```js
const obj = await storageGet(env, "r2", sourceObjectKey);  // 从 R2 下载整个文件到 Worker 内存
await storagePut(env, "r2", targetKey, obj.body, ...);      // 再从 Worker 内存上传回 R2
```

`r2-tree.js:126-129` — `copyTree` 移动操作：每个文件都是 `storageGet` → `storagePut`。

`trash.js:272-287` — `restoreTrashRecord`：从垃圾桶恢复文件时，同样是读出来再写回去。

**影响：**

假设用户移动一个 100MB 的文件：
- **当前方式：** R2 → Worker（下载 100MB）→ R2（上传 100MB），Worker 承担 200MB 流量，耗时长，消耗 Worker CPU 时间
- **正确方式：** `env.R2.copy(sourceKey, destKey)` — R2 存储层直接复制，数据不经过 Worker，几乎瞬间完成

对于大文件夹（几十个文件），差距是数量级的。

**修复方向：**

将 `copyR2Object` 改为调用 `storageCopy`，然后删除源对象：

```js
export async function copyR2Object(env, sourceKey, targetKey) {
  const sourceLocation = await resolveExistingObjectLocation(env, sourceKey);
  await storageCopy(env, "r2", sourceLocation.objectKey, "r2", targetKey);
  const meta = await storageHead(env, "r2", targetKey);
  await upsertFileIndex(env, targetKey, { storageId: "r2", objectKey: targetKey, ... });
  return true;
}
```

---

### 2. 密码比较存在时序攻击风险 ✅ 已完成

**涉及文件：** `functions/api/lib/auth.js:168`

**现状：**

```js
if (username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD)
```

JavaScript 的 `===` 对字符串做逐字符比较。当发现第一个不匹配的字符时就立即返回 `false`。

**攻击原理：**

假设密码是 `"abcdef"`：
- 输入 `"a"` → 第 1 个字符匹配，继续比较第 2 个 → 不匹配，返回
- 输入 `"b"` → 第 1 个字符就不匹配，立即返回
- 输入 `"axxxx"` → 匹配更久才返回

攻击者通过精确测量响应时间，可以逐字符猜出密码。虽然网络延迟会增加噪声，但在 Cloudflare Worker 这种低延迟环境下，多次采样后统计差异是可行的。

**修复方向：**

使用 Web Crypto API 的 HMAC 做恒定时间比较：

```js
async function timingSafeEqual(a, b) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigA = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(a)));
  const sigB = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(b)));
  if (sigA.length !== sigB.length) return false;
  let diff = 0;
  for (let i = 0; i < sigA.length; i++) diff |= sigA[i] ^ sigB[i];
  return diff === 0;
}

// 使用
if (username === env.ADMIN_USERNAME && await timingSafeEqual(password, env.ADMIN_PASSWORD))
```

无论输入是什么，HMAC 计算时间是固定的，逐字节异或比较也是固定时间。

---

### 3. save-text 用 String.length 计算文件大小 ✅ 已完成

**涉及文件：** `functions/api/lib/file-mutations/save-text.js:17`

**现状：**

```js
size: body.content.length,
```

**问题：**

JavaScript 的 `String.length` 返回 **UTF-16 码元数量**，不是字节数：

| 输入 | `String.length` | 实际字节（UTF-8） |
|------|-----------------|-------------------|
| `"hello"` | 5 | 5 |
| `"你好"` | 2 | 6 |
| `"🎉"` | 2 | 4 |
| `"👨‍👩‍👧‍👦"` | 11 | 25 |

这意味着用户保存一段中文文本，文件大小会被严重少报。这会影响：
- 存储配额计算不准
- 管理后台统计不准
- 文件列表显示的大小不正确

**修复方向：**

```js
size: new TextEncoder().encode(body.content).byteLength,
```

---

### 4. 前端大量冗余 dispatch 导致多次渲染 ✅ 已完成

**涉及文件：**
- `public/index.js:444-450` — `navigateToExplorerPath`
- `public/js/events/file-actions.js:71-79` — `toggle-trash`
- `public/js/events/file-actions.js:33-39` — `clear-search-filters`

**现状：**

`navigateToExplorerPath`：
```js
store.dispatch(actions.explorer.setTrashMode(false));  // 通知所有订阅者
store.dispatch(actions.explorer.setPath(path));         // 通知所有订阅者
store.dispatch(actions.explorer.setQuery(''));           // 通知所有订阅者
store.dispatch(actions.explorer.setQueryDraft(''));      // 通知所有订阅者
store.dispatch(thunks.loadExplorer());                   // 通知所有订阅者
```

`toggle-trash` dispatch 7 次，`clear-search-filters` dispatch 6 次。

**为什么会慢：**

自定义 store（`create-slice.js:29-50`）每次 `dispatch` 都会：
1. 调用所有 reducer 计算新状态
2. 对每个 `subscribeSlice` 调用 selector，比较新旧值
3. 如果值变化，调用 render 函数

5 次 dispatch = 5 次完整的"计算→比较→渲染"循环。由于每次 dispatch 后状态都变了，后续的 render 会基于中间状态构建 DOM，然后又被下一次 dispatch 覆盖。前 4 次渲染全是浪费。

**修复方向：**

方案 A — 给 store 添加 `batchDispatch`：
```js
store.batchDispatch([
  actions.explorer.setTrashMode(false),
  actions.explorer.setPath(path),
  actions.explorer.setQuery(''),
  actions.explorer.setQueryDraft(''),
]);
// 只在最后通知一次订阅者
```

方案 B — 创建复合 action：
```js
actions.explorer.navigate({ trashMode: false, path, query: '', queryDraft: '' })
// 在 reducer 中一次性处理所有变更
```

---

### 5. Admin/Share 页面全页 re-render

**涉及文件：** `public/index.js:491-496`

**现状：**

```js
...(page === 'admin' ? [
  subscribeSlice(s => s.admin, render),
] : []),
```

`render` 函数重建整个页面 DOM（header + 内容 + modal + toast + overlay）。`state.admin` 有 50+ 字段（stats、logs、webhooks、shares、health、maintenance 等），任意一个字段变化都触发完整重建。

**具体场景：**

管理员在"概览"标签页查看统计数据时：
1. 加载统计数据 → `state.admin.stats` 变化 → 全页重建
2. 日志轮询更新 → `state.admin.logs` 变化 → 全页重建（用户根本没看日志标签）
3. 健康检查返回 → `state.admin.health` 变化 → 全页重建

每次"全页重建"意味着：拼接整个页面的 HTML 字符串（数千行）→ morphdom diff 整个 DOM 树。

**修复方向：**

将 admin 状态拆分为多个细粒度订阅：
```js
subscribeSlice(s => s.admin.stats, renderOverviewTab),
subscribeSlice(s => s.admin.logs, renderLogsTab),
subscribeSlice(s => s.admin.shares, renderSharesTab),
// ... 只有当前激活的标签页才渲染
```

---

## 🟠 中优先级

### 6. request.clone().json() 双重解析请求体 ✅ 已完成

**涉及文件：** `functions/api/lib/router.js:159, 179, 193, 285`

**现状：**

```js
// 第一次解析：为了获取 webhook 通知数据
const bodyForNotify = await request.clone().json();
// 第二次解析：实际处理函数内部
await handleUpload(request, env, context);
```

`request.clone()` 会将整个请求体缓冲到内存中。然后 `json()` 解析一次，原始 request 的 body 被传给 handler，handler 内部再 `request.json()` 解析一次。

**影响：**
- 内存浪费：body 被缓冲两次
- CPU 浪费：JSON 解析两次
- 如果 body 很大（比如上传元数据），开销显著

**修复方向：**

在入口处解析一次，传递给所有需要的函数：
```js
const body = await request.json();
await handleUpload(env, context, body);
notifyWebhookWithLog(env, "file.uploaded", { path, size: body.size });
```

---

### 7. cleanupLogs / cleanupWebhookDeliveries 每次写入都执行 ✅ 已完成

**涉及文件：**
- `functions/api/lib/common/log.js:46-67`
- `functions/api/lib/webhooks.js:333-346`

**现状：**

`log.js` — 每次插入日志后执行清理：
```js
await env.D1.prepare("DELETE FROM logs WHERE id IN (SELECT id FROM logs ORDER BY id DESC LIMIT 1 OFFSET ?)")
  .bind(LOG_MAX_ROWS).run();
```

`webhooks.js` — 每次记录投递后执行类似的清理。

**影响：**

如果管理员批量操作（比如批量删除 100 个文件），每个操作都会：
1. INSERT 一条日志
2. 紧接着 DELETE 一条旧日志

100 个操作 = 100 次 INSERT + 100 次 DELETE = 200 次 D1 查询。而清理只需要执行一次就够了。

D1 有免费额度限制（每天 500 万次读 + 500 万次写），这些冗余的 DELETE 消耗了宝贵的写入配额。

**修复方向：**

用计数器节流：
```js
let logWriteCount = 0;
export async function addLog(env, request, action, path) {
  // ... INSERT ...
  logWriteCount++;
  if (logWriteCount >= 50) {
    logWriteCount = 0;
    await cleanupLogs(env);
  }
}
```

---

### 8. D1 N+1 查询

**涉及文件：**
- `functions/api/lib/file-index/delete.js:41-57`
- `functions/api/lib/r2-tree.js:113-140`
- `functions/api/lib/trash.js:142-156`

**什么是 N+1 问题：**

假设要获取 100 个文件的信息。正确做法是 1 次查询获取全部：
```sql
SELECT * FROM file_index WHERE path IN (?, ?, ?, ...)  -- 1 次查询
```

N+1 的做法是：
```sql
SELECT * FROM file_index WHERE path = ?  -- 第 1 次
SELECT * FROM file_index WHERE path = ?  -- 第 2 次
...重复 100 次
```

**具体位置：**

`file-index/delete.js:41-57`：
```js
for (const row of rows.results) {
  await removeStorageUsage(env, row.storageId, row.size);  // 每行一次 COUNT + DELETE
}
```
删除一个有 100 个文件的文件夹 = 200 次 D1 查询。

`r2-tree.js:113-140`：`copyTree` 对每个子条目调用 `resolveExistingObjectLocation`（内部做 `getFileIndexEntry` 查询），而这些数据在 `listFileIndexPrefix` 中已经批量获取了。

`trash.js:142-156`：`softDeleteTree` 中 `copyR2Object` 已解析位置，之后又重复调用 `resolveExistingObjectLocation`。

**修复方向：**

批量查询 + D1 batch API：
```js
const placeholders = rows.results.map(() => '?').join(',');
await env.D1.prepare(`DELETE FROM storage_usage WHERE ...`).bind(...ids).run();
```

---

### 9. ensureStorageUsageTable 每次调用都执行 DDL

**涉及文件：** `functions/api/lib/file-index/ensure.js:93-106`

**现状：**

```js
export async function ensureStorageUsageTable(env) {
  await env.D1.prepare(`CREATE TABLE IF NOT EXISTS storage_usage ...`).run();
}
```

每次调用都执行 `CREATE TABLE IF NOT EXISTS`。虽然 SQLite 的 `IF NOT EXISTS` 让它不会报错，但 D1 仍然要解析 SQL、检查表是否存在、返回结果。

对比 `ensureFileIndexTable`（同一文件，77 行）有 `_fileIndexReady` 标志，只执行一次。`ensureStorageUsageTable` 缺少同样的缓存。

**修复方向：**

```js
let _storageUsageReady = false;
export async function ensureStorageUsageTable(env) {
  if (_storageUsageReady) return;
  await env.D1.prepare(`CREATE TABLE IF NOT EXISTS storage_usage ...`).run();
  _storageUsageReady = true;
}
```

---

### 10. formatTime 每次创建新的 Intl.DateTimeFormat ✅ 已完成

**涉及文件：** `public/js/utils/format.js:13-23`

**现状：**

```js
export function formatTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(time * 1000));
}
```

`Intl.DateTimeFormat` 构造函数开销很大（需要加载 locale 数据、构建格式化规则）。一个有 200 个文件的目录，每次渲染调用 200 次 = 200 次对象创建。

**修复方向：**

```js
const _timeFmt = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit",
});

export function formatTime(value) {
  return _timeFmt.format(new Date(time * 1000));
}
```

---

### 11. selectedKeys.includes(key) 是 O(n) ✅ 已完成

**涉及文件：**
- `public/js/render/shared.js:194`
- `public/js/render/home.js:347`

**现状：**

```js
const picked = state.explorer.selectedKeys.includes(key);
```

假设目录有 500 个文件，用户选中了 50 个：
- 每个文件都要检查 `selectedKeys.includes(key)` → O(50) 的数组扫描
- 500 个文件 × 50 = 25,000 次比较
- 每次渲染都重新计算

**修复方向：**

在渲染开始时转换一次：
```js
const selectedSet = new Set(state.explorer.selectedKeys);
// 之后每个文件的检查是 O(1)
const picked = selectedSet.has(key);
```

总复杂度从 O(n × m) 降到 O(n + m)。

---

### 12. currentEntries 缓存失效过于频繁

**涉及文件：** `public/js/state/selectors.js:41-42`

**现状：**

```js
let _cachedExplorer = null;
let _cachedResult = null;

// 使用时
if (_cachedExplorer === explorer) return _cachedResult;
```

问题是 reducer 总是创建新对象：
```js
case 'SET_SORT': return { ...state, sort: action.payload };  // 新对象
case 'SET_VIEW': return { ...state, view: action.payload };  // 新对象
```

`{ ...state, sort: ... }` 创建了一个新对象引用，所以 `_cachedExplorer === explorer` 永远是 `false`。即使只是改了 `view`（视图模式），`entries` 和 `sort` 都没变，也要重新排序。

**修复方向：**

用深比较或缓存多个维度：
```js
let _cachedEntries = null;
let _cachedSort = null;
let _cachedResult = null;

function currentEntries(explorer) {
  if (_cachedEntries === explorer.files && _cachedSort === explorer.sort) return _cachedResult;
  _cachedEntries = explorer.files;
  _cachedSort = explorer.sort;
  _cachedResult = applySort(explorer.files, explorer.sort);
  return _cachedResult;
}
```

---

### 13. Migration 0002 依赖未在 migration 中创建的表 ✅ 已完成

**涉及文件：**
- `migrations/0002_add_notification_indexes.sql`
- `functions/api/lib/notifications.js:4`

**现状：**

`0002_add_notification_indexes.sql`：
```sql
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
```

但 `notifications` 表的 `CREATE TABLE` 语句在 `notifications.js:4` 中（应用代码），不在任何 migration 文件中。

**影响：**

当部署到全新环境时：
1. 执行 migration 0001 → 创建 16 张表
2. 执行 migration 0002 → **失败！** `notifications` 表还不存在
3. 应用代码中的 `CREATE TABLE` 还没运行过

**修复方向：**

在 migration 0002 之前添加 `CREATE TABLE IF NOT EXISTS notifications (...)`，或者创建一个新的 migration 0004 来修正顺序。

---

## 🟡 低优先级

### 14. 代码重复

| 函数 | 位置 A | 位置 B | 说明 |
|------|--------|--------|------|
| `keyExists` | `trash.js:75` | `file-mutations/helpers.js:32` | 检查 key 是否存在，逻辑几乎一样 |
| `positiveNumber` | `auth.js:103` | `download-bursts.js:10` | 解析正整数参数 |
| `isSecureRequest` | `auth.js:23` | `shares.js:72` | 判断是否 HTTPS |
| `cookieAttributes` | `auth.js:30` | `shares.js:76` | 生成 cookie 属性字符串 |
| `runStatement` | `schema.js:169` | `file-index/ensure.js:31` | 执行 D1 语句的包装 |
| `cleanPath` | `file-reads.js:33` | `zip-download.js:17` | 去除首尾斜杠 |
| 表 DDL | `trash.js:21-38` | `schema.js:68-77` | TRASH/SETTINGS 表定义 |
| tag 颜色类 | `admin.css:714` | `share.css:51-99` | 10 个 tag 类完全相同 |
| 通知下拉样式 | `explorer.css:786` | `admin.css:762` | 通知组件样式重复 |

**维护风险：** 如果修了一个地方的 bug，可能忘记修另一个地方。

**修复方向：** 将共享函数提取到 `functions/api/lib/common/` 中，CSS 共享样式提取到独立文件。

---

### 15. 死代码

| 代码 | 位置 | 说明 |
|------|------|------|
| `notifyFileUploaded` 等 5 个函数 | `webhooks.js:444-489` | 已导出但从未被调用，Router 直接使用 `notifyWebhookWithLog` |
| `resolveStorageIdForPath` | `storage.js:135` | 始终返回 `"r2"`，没有调用者，多存储后端的残留代码 |
| `storageQuotaForConfig` | `storage.js:98` | 接受 `storageId` 参数但忽略它 |
| `ensureTrashTable` / `ensureSettingsTable` | `trash.js:44-68` | 与 `schema.js` 中的 `ensureCoreTables` 重复 |
| `fileTypeIcons` | `icons.js:136` | 导出但没有任何文件导入 |
| `webhooks.js` (前端) | `public/js/render/pages/admin/webhooks.js` | 标记为 dead code |

---

### 16. CSS 重复 ✅ 已完成

**`admin.css` 覆盖其他文件的同名类：**

| 类名 | 原始定义 | admin.css 覆盖 |
|------|----------|---------------|
| `.toolbar-tag` | `buttons.css:87`（完整样式） | `admin.css:702`（完全不同的值） |
| `.empty-state` 系列 | `layout.css:76` | `admin.css:726` 全部覆盖 |
| `.input` | `forms.css:18`（min-height: 44px） | `admin.css:3764`（min-height: 36px） |

**暗色模式手动覆盖：**

`explorer.css:1380-1437` 逐个覆盖 Tailwind 工具类：
```css
[data-theme="dark"] .bg-white { background: #1e293b; }
[data-theme="dark"] .bg-slate-50 { background: #0f172a; }
[data-theme="dark"] .text-slate-800 { color: #e2e8f0; }
/* ...几十行... */
```

正确做法是配置 Tailwind：
```js
// tailwind.config.cjs
module.exports = {
  darkMode: ['selector', '[data-theme="dark"]'],
}
```
然后直接用 `dark:bg-slate-900` 等 Tailwind 类，删除手动覆盖。

**`style.css` 顺序问题：**

```css
@import "./css/base.css";      // 自定义 CSS 先加载
@tailwind base;                 // Tailwind 的 reset 后加载，可能覆盖自定义样式
```

应该是 `@tailwind base` 在最前面，然后自定义 CSS，然后 `@tailwind components`，最后 `@tailwind utilities`。

**其他：**
- `admin.css` 有 4058 行，应按标签页拆分
- 硬编码颜色值（如 `#18794e`）应改为 CSS 自定义属性引用
- `.mt-12`、`.mt-6` 等工具类与 Tailwind 重复

---

### 17. Service Worker 问题

**涉及文件：** `public/sw.js`

**无缓存淘汰：** 缓存缩略图和图标但从不删除。用户浏览 1000 个文件夹后，缓存可能有几千个缩略图条目，持续增长。

**无版本管理：** 缓存名硬编码为 `"o-drive-v1"`。更新应用时旧缓存不会被清理。activate handler 只做了 `self.clients.claim()`：
```js
self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());  // 没有清理旧缓存
});
```

**修复方向：**
```js
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});
```

**缩略图缓存无上限：** 应添加 LRU 淘汰或基于条目数量的限制。

---

### 18. HTML 优化

**涉及文件：** `public/index.html`、`public/admin.html`、`public/share.html`

**缺少预加载提示：**
```html
<!-- 应该添加在 <head> 中 -->
<link rel="preload" href="/main.css" as="style">
<link rel="modulepreload" href="/index.js">
```
浏览器看到这些提示后会提前开始下载，而不是解析到标签时才开始。

**`admin.html` 缺少 noindex：** 搜索引擎可能索引管理后台页面。应添加：
```html
<meta name="robots" content="noindex">
```

**缺少 `<meta name="theme-color">`：** 移动浏览器的地址栏颜色无法匹配应用主题。

**缺少 `<meta name="color-scheme">`：** 浏览器在 CSS 加载前无法知道应该用亮色还是暗色的默认滚动条和表单控件。

**无代码分割：** 三个页面都加载完整的 `index.js`，但分享页面不需要文件管理、管理后台等功能的代码。

---

### 19. 事件处理

**涉及文件：**
- `public/js/events/index.js:68-72`
- `public/index.js:459-465`
- `public/js/render/modal.js`

**四重 `closest()` 调用：**

```js
document.addEventListener("click", (event) => {
  fileActions(event);        // 内部做 event.target.closest("[data-action]")
  adminActions(event);       // 又做一次 closest
  uploadActions(event);      // 又做一次
  navigationActions(event);  // 又做一次
});
```

每次点击都遍历 4 次 DOM 树找 `data-action` 属性。

**修复方向：**
```js
document.addEventListener("click", (event) => {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  routeAction(action, el, event);
});
```

**`visibilitychange` 监听器未清理：** `index.js:459-465` 添加了监听器但 `beforeunload` 中没有移除。

**模态框无焦点陷阱：** 键盘用户可以 Tab 键跳出模态框进入背景内容。应该在模态框打开时捕获焦点，Tab 键循环限制在模态框内。

---

### 20. 安全头改进

**涉及文件：** `public/_headers`

**HSTS 缺少 `preload`：**

当前：
```
Strict-Transport-Security: max-age=63072000; includeSubDomains; upgrade-insecure-requests
```

添加 `; preload` 后可以提交到浏览器 HSTS 预加载列表，浏览器会强制 HTTPS，即使用户从未访问过你的站点。

**缺少 `X-Frame-Options: DENY`：** 虽然 CSP 的 `frame-ancestors 'none'` 覆盖了现代浏览器，但旧浏览器不支持 CSP，`X-Frame-Options` 提供纵深防御。

**CSP 中 `style-src 'unsafe-inline'`：** 允许内联样式注入攻击。如果可能，使用 nonce 或 hash 替代。

**JS/CSS 缓存时间过短：** `max-age=3600`（1 小时）。如果文件名包含哈希值或每次部署都会变，可以用 `max-age=31536000, immutable`（1 年）。

**缺少 CSP 报告：** 添加 `report-uri` 或 `report-to` 指令可以在生产环境中检测 CSP 违规。

---

## 附录：推荐实施顺序

| 步骤 | 优化项 | 改动量 | 收益 |
|------|--------|--------|------|
| 1 | R2 copy 替换 ✅ | 2 个文件 | 大文件操作延迟大幅降低 |
| 2 | 密码时序安全 ✅ | 1 个文件 | 安全关键修复 |
| 3 | save-text 字节长度 ✅ | 1 行 | 正确性修复 |
| 4 | Store batchDispatch ✅ | 3 个文件 | 前端最大性能瓶颈 |
| 5 | router.js body 解析去重 ✅ | 5 个文件 | 消除内存浪费 |
| 6 | cleanupLogs 去除自动清理 ✅ | 3 个文件 | 减少 D1 配额消耗 |
| 7 | formatTime 缓存 ✅ | 1 个文件 | 前端渲染性能立竿见影 |
| 8 | selectedKeys → Set ✅ | 2 个文件 | 渲染性能提升 |
| 9 | CSS 去重 + darkMode 配置 ✅ | 4 个文件 | 减少 CSS 体积，可维护性 |
| 10 | Migration 0002 修复 ✅ | 1 个文件 | 新部署正确性 |
