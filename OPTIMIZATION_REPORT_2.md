# O-Drive 优化分析报告（第二轮）

> 生成日期：2026-06-25
> 项目版本：v2.1.0
> 前置条件：第一轮 10 项优化已完成

---

## 目录

- [🔴 正确性 Bug](#-正确性-bug)
  - [1. ui-actions.js 中 getEntryPath 未定义](#1-ui-actionsjs-中-getentrypath-未定义)
  - [2. ui-actions.js 中 dispatchToast 未定义](#2-ui-actionsjs-中-dispatchtoast-未定义)
  - [3. navigation-actions.js 中 dispatchToast 未定义](#3-navigation-actionsjs-中-dispatchtoast-未定义)
- [🟠 性能问题](#-性能问题)
  - [4. adminDbStats 用 SELECT * 获取全部 trash 行只为求和](#4-admindbstats-用-select--获取全部-trash-行只为求和)
  - [5. adminDbStats 4 个独立 D1 查询串行执行](#5-admindbstats-4-个独立-d1-查询串行执行)
  - [6. overviewAttention 7+ 个独立 D1 查询串行执行](#6-overviewattention-7-个独立-d1-查询串行执行)
  - [7. handleAdminStats 约 30 行响应组装代码重复](#7-handleadminstats-约-30-行响应组装代码重复)
  - [8. cleanupFileTasks 在每次任务创建和查询时都执行](#8-cleanupfiletasks-在每次任务创建和查询时都执行)
- [🟡 代码质量](#-代码质量)
  - [9. cleanupFileTasks 中 cutoff 变量遮蔽](#9-cleanupfiletasks-中-cutoff-变量遮蔽)
  - [10. handleAdminNotifications 参数顺序不一致](#10-handleadminnotifications-参数顺序不一致)
- [附录：推荐实施顺序](#附录推荐实施顺序)

---

## 🔴 正确性 Bug

### 1. ui-actions.js 中 getEntryPath 未定义 ✅ 已完成

**涉及文件：**
- `public/js/events/ui-actions.js:130`
- `public/js/events/index.js:44`

**现状：**

`registerUiActions` 的函数签名：
```js
export function registerUiActions(documentRef, windowRef, store, actions, thunks) {
```

只有 5 个参数，没有 `getEntryPath`。但在 `handleSubmit` 的 rename 分支中：
```js
if (form === "rename") {
  const modal = store.getState().app.modal;
  const path = modal?.entry ? getEntryPath(modal.entry) : "";  // ❌ getEntryPath is not defined
  store.dispatch(thunks.renameEntry(path, String(data.get("newName") || "").trim()));
  return;
}
```

`getEntryPath` 在 `index.js` 的 `commonDeps` 中存在（第 38 行），但从未传递给 `registerUiActions`（第 44 行）。

**影响：** 用户提交重命名表单时，控制台抛出 `ReferenceError: getEntryPath is not defined`，重命名功能完全不可用。

**修复方向：**

在 `index.js` 中将 `dispatchToast` 和 `getEntryPath` 传递给 `registerUiActions`：
```js
const uiActions = registerUiActions(documentRef, windowRef, store, actions, thunks, { dispatchToast, getEntryPath });
```

并在 `ui-actions.js` 中解构使用：
```js
export function registerUiActions(documentRef, windowRef, store, actions, thunks, deps = {}) {
  const { dispatchToast, getEntryPath } = deps;
```

---

### 2. ui-actions.js 中 dispatchToast 未定义 ✅ 已完成

**涉及文件：**
- `public/js/events/ui-actions.js:184, 190`

**现状：**

在 webhook 表单提交处理中：
```js
if (form === "add-webhook" || form === "edit-webhook") {
  // ...
  } catch {
    dispatchToast("error", "Headers 格式错误，需为有效 JSON");  // ❌ 未定义
    return;
  }
  // ...
  if (!webhook.name || !webhook.url) {
    dispatchToast("error", "名称和 URL 为必填项");  // ❌ 未定义
    return;
  }
}
```

`dispatchToast` 不在 `registerUiActions` 的作用域中。

**影响：** 管理员在 webhook 表单中输入无效 JSON headers 或留空必填字段时，控制台抛出 `ReferenceError`，无法看到友好的错误提示。

**修复方向：** 同 Bug 1，通过 `deps` 参数传入 `dispatchToast`。

---

### 3. navigation-actions.js 中 dispatchToast 未定义 ✅ 已完成

**涉及文件：**
- `public/js/events/navigation-actions.js:70`
- `public/js/events/index.js:43`

**现状：**

`registerNavigationActions` 的函数签名：
```js
export function registerNavigationActions(documentRef, windowRef, store, actions, thunks) {
```

只有 5 个参数，没有 `dispatchToast`。但在 `open-folder-modal` 分支中：
```js
if (action === "open-folder-modal") {
  const state = store.getState();
  if (state.app.role !== "admin") {
    dispatchToast("error", "请先登录管理员账户");  // ❌ 未定义
    return;
  }
  // ...
}
```

**影响：** 非管理员用户点击"新建文件夹"按钮时，控制台抛出 `ReferenceError`，而非显示友好的提示信息。

**修复方向：**

在 `index.js` 中将 `dispatchToast` 传递给 `registerNavigationActions`：
```js
const navigationActions = registerNavigationActions(documentRef, windowRef, store, actions, thunks, dispatchToast);
```

并在 `navigation-actions.js` 中接收：
```js
export function registerNavigationActions(documentRef, windowRef, store, actions, thunks, dispatchToast) {
```

---

## 🟠 性能问题

### 4. adminDbStats 用 SELECT * 获取全部 trash 行只为求和 ✅ 已完成

**涉及文件：** `functions/api/lib/admin-stats.js:87-96`

**现状：**

```js
const trashList = await env.D1.prepare(
  "SELECT * FROM trash ORDER BY trashed_at DESC"
).all();
const trashCount = trashList.results?.length || 0;
const trashSize = (trashList.results || []).reduce(
  (sum, r) => sum + Number(r.size || 0), 0
);
```

`SELECT *` 获取所有列（id, original_key, trash_key, name, kind, size, storage_id, trashed_at），传输大量不必要的数据，然后在 JS 中求和。

**修复方向：**

```js
const trashStats = await env.D1.prepare(
  "SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total FROM trash"
).first();
const trashCount = trashStats?.count || 0;
const trashSize = trashStats?.total || 0;
```

一次查询替代两次，且不传输不需要的列数据。

---

### 5. adminDbStats 4 个独立 D1 查询串行执行 ✅ 已完成

**涉及文件：** `functions/api/lib/admin-stats.js:86-133`

**现状：**

trash 统计、log 统计、task 统计、share 统计等查询各自独立，但串行执行。每个查询都在单独的 try/catch 中。

**修复方向：**

```js
const [trashStats, logStats, taskStats, shareStats] = await Promise.allSettled([
  env.D1.prepare("SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total FROM trash").first(),
  env.D1.prepare("SELECT COUNT(*) as count FROM logs").first(),
  env.D1.prepare("SELECT COUNT(*) as count FROM file_tasks").first(),
  env.D1.prepare("SELECT COUNT(*) as count FROM share_links").first(),
]);
```

`allSettled` 保证单个查询失败不影响其他查询，与当前 try/catch 行为一致。

---

### 6. overviewAttention 7+ 个独立 D1 查询串行执行 ✅ 已完成（含 error observability 修复）

**涉及文件：** `functions/api/lib/admin-stats.js:163-327`

**现状：**

`overviewAttention` 函数依次查询 webhook_deliveries、system_warnings、login_attempts、download_bursts、path_access_attempts，并遍历存储目标调用 `checkStorageQuota`。所有查询相互独立，串行执行导致 admin 首页加载缓慢。

**修复方向：**

将所有独立查询合并为一个 `Promise.allSettled()` 调用，将总延迟从各查询之和降低为最慢单个查询的延迟。

---

### 7. handleAdminStats 约 30 行响应组装代码重复 ✅ 已完成

**涉及文件：** `functions/api/lib/admin-stats.js:22-79`

**现状：**

第 23-43 行和第 54-75 行有几乎完全相同的响应组装逻辑（计算 indexed、dbStats、index、attention 并返回 JSON）。唯一的区别是第一个路径在首次检查时 index 已存在，第二个路径是在 sync 之后。

**修复方向：**

提取为辅助函数：
```js
async function buildStatsResponse(env, indexed, context) {
  const [dbStats, index, attention] = await Promise.allSettled([
    adminDbStats(env),
    indexed,
    overviewAttention(env, context),
  ]);
  return jsonResponse({ indexed: ..., dbStats: ..., index: ..., attention: ... });
}
```

---

### 8. cleanupFileTasks 在每次任务创建和查询时都执行 ✅ 已完成

**涉及文件：** `functions/api/lib/tasks.js:218, 322`

**现状：**

`createFileTask`（第 218 行）和 `getFileTask`（第 322 行）都在执行业务逻辑前调用 `cleanupFileTasks(env)`。每次调用执行 3 条 D1 语句（DELETE by time、SELECT for row-limit cutoff、DELETE by id）。

如果用户频繁查询任务状态（如轮询上传进度），每次查询都会触发清理操作。

**修复方向：**

添加时间节流：
```js
let _lastTaskCleanup = 0;
async function throttledCleanup(env) {
  const now = Date.now();
  if (now - _lastTaskCleanup < 60000) return;  // 1 分钟内只清理一次
  _lastTaskCleanup = now;
  await cleanupFileTasks(env);
}
```

---

## 🟡 代码质量

### 9. cleanupFileTasks 中 cutoff 变量遮蔽 ✅ 已完成

**涉及文件：** `functions/api/lib/tasks.js:53, 62`

**现状：**

```js
async function cleanupFileTasks(env, now = Date.now()) {
  // ...
  const cutoff = now - TASK_RETENTION_MS;           // 第 53 行：外层 cutoff
  await env.D1.prepare("DELETE FROM file_tasks WHERE ...").bind(cutoff).run();
  try {
    const cutoff = await env.D1.prepare(             // 第 62 行：内层 cutoff（遮蔽）
      "SELECT id FROM file_tasks ORDER BY ..."
    ).bind(...).first();
  }
}
```

内层 `const cutoff` 遮蔽外层 `const cutoff`。虽然由于块作用域不会导致 bug，但降低了代码可读性。

**修复方向：**

将内层变量重命名为 `rowCutoff`：
```js
const rowCutoff = await env.D1.prepare(...).first();
```

---

### 10. handleAdminNotifications 参数顺序不一致 ✅ 已完成

**涉及文件：**
- `functions/api/lib/notifications.js:61`
- `functions/api/lib/router.js:149`

**现状：**

所有其他 admin handler 的参数顺序是 `(env, ...)`：
```js
handleAdminStats(env, context)
handleAdminHealth(env)
handleAdminLogs(env, url)
handleHiddenSettings(env, request, method, url, hiddenPaths)
```

但 `handleAdminNotifications` 是 `(request, env)`：
```js
export async function handleAdminNotifications(request, env) {
```

Router 中的调用也是 `handleAdminNotifications(request, env)`（第 149 行），所以功能正常，但不一致。

**修复方向：**

统一为 `(env, request)` 并更新 router 中的调用：
```js
export async function handleAdminNotifications(env, request) {
```

---

## 附录：推荐实施顺序

| 步骤 | 优化项 | 类型 | 改动量 | 收益 |
|------|--------|------|--------|------|
| 1 | Bug 1-3: 修复未定义变量 ✅ | 🔴 Bug | 3 个文件 | 重命名/webhook/创建文件夹功能恢复 |
| 2 | 优化 4: trash SQL 聚合 ✅ | 🟠 性能 | 已合并 | 减少 D1 数据传输 |
| 3 | 优化 5+6: D1 查询并行化 ✅ | 🟠 性能 | 1 个文件 | admin 首页加载提速 |
| 4 | 优化 7: 响应组装去重 ✅ | 🟠 性能 | 1 个文件 | 代码可维护性 |
| 5 | 优化 8: cleanupFileTasks 节流 ✅ | 🟠 性能 | 1 个文件 | 减少任务 API 延迟 |
| 6 | 优化 9-10: 代码质量 ✅ | 🟡 质量 | 3 个文件 | 可读性/一致性 |
