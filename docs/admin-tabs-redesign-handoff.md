# 后台管理页 Tab 重设计 — 交接指南

> 本文档合并自 `admin-tabs-redesign.md` 和 `admin-tabs-redesign-guide.md`，用于交接给设计师/前端开发者完成 7 个 tab 页面的 UI 改造。

---

## 目录

1. [架构概览](#1-架构概览)
2. [核心原则](#2-核心原则)
3. [文件清单](#3-文件清单)
4. [交互系统：data 属性](#4-交互系统data-属性)
5. [CSS 体系](#5-css-体系)
6. [图标参考](#6-图标参考)
7. [安全函数](#7-安全函数)
8. [7 个 tab 的数据形状与必留交互](#8-7-个-tab-的数据形状与必留交互)
9. [完整工作示例：paths.js](#9-完整工作示例pathsjs)
10. [设计模式速查](#10-设计模式速查)
11. [状态处理模式](#11-状态处理模式)
12. [开发流程](#12-开发流程)
13. [常见陷阱检查清单](#13-常见陷阱检查清单)

---

## 1. 架构概览

后台管理页有 **7 个 tab**，每个 tab 的内容渲染在独立的文件中。

```
index.js → renderAdminPage()
  └── <div class="toolbar-card">              ← tab 切换按钮（在 explorer-card 外部）
        └── admin-tab-btn × 7
  └── <div class="explorer-card">             ← ★ 固定的滚动容器，不要动！
        └── renderAdminActiveTab()            ← 根据 activeTab 分发
              ├── "overview"    → overview.renderAdminStatsGrid(stats)
              ├── "storage"     → settings.renderStorageSection(admin)
              ├── "shares"      → shares.renderAdminSharesSection(admin)
              ├── "paths"       → settings.renderPathManagementSection(admin)
              ├── "logs"        → logs.renderAdminLogsSection(admin)
              ├── "maintenance" → settings.renderAdminMaintenanceSection(admin)
              └── "system"      → settings.renderSystemSection(admin)
```

```
public/js/render/pages/index.js       ← tab 路由 + .explorer-card 外层容器（不动）
  ├── admin/overview.js               ← 概览（直接调用 overview.renderAdminStatsGrid）
  ├── admin/storage.js                ← 存储（通过 settings.renderStorageSection 调用）
  ├── admin/shares.js                 ← 分享（直接调用 shares.renderAdminSharesSection）
  ├── admin/paths.js                  ← 路径（通过 settings.renderPathManagementSection 调用）
  ├── admin/logs.js                   ← 日志（直接调用 logs.renderAdminLogsSection）
  ├── admin/maintenance.js            ← 维护（通过 settings.renderAdminMaintenanceSection 调用）
  ├── admin/system.js                 ← 系统（通过 settings.renderSystemSection 调用）
  ├── admin/settings.js               ← ⚡ 组合层（facade），透传子渲染器的方法
  ├── admin/components.js             ← 共享 UI 组件工厂
  ├── admin/utils.js                  ← 工具函数工厂（createShareUtils）
  ├── admin/webhooks.js               ← 被 system 引用
  └── admin/notifications.js          ← 被 system 引用
```

渲染函数返回 **纯 HTML 字符串**，注入到 `.explorer-card` 内部。切换 tab 时只有内部 HTML 被替换，`.explorer-card` 本身的 DOM 和 class 不变。

> `settings.js` 只做透传转发（创建 → 导出），**不需要改**。

---

## 2. 核心原则

### 不动 `.explorer-card`

`.explorer-card` 在 `index.js:164` 定义，是统一的滚动容器：

```html
<div class="explorer-card flex-1 min-h-0 bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm overflow-y-auto flex flex-col">
  <!-- 当前 tab 的渲染内容 -->
</div>
```

**不要修改** `index.js` 中的 `.explorer-card` 结构和 class，也不要修改它的样式。7 个 tab 的内容都注入在这个容器内部，你只需要修改容器内部的 HTML。

### 工厂函数模式

每个渲染文件都导出一个工厂函数 `createXxxRenderer(deps)`，接收一个公共的 `deps` 依赖对象：

```js
export function createXxxRenderer({
  icons, safeText, escapeHtml, renderEmptyState, renderEmptyStateCompact,
  formatBytes, formatTime, formatRelative, components
})
```

所有渲染函数**返回纯 HTML 字符串**（模板字面量），没有虚拟 DOM，没有 JSX，没有事件绑定。

> 不同文件可能还会收到额外参数。例如 `shares.js` 额外收到 `filterShares`, `getFilterLabel`, `getShareStatusTags`, `getExpiryStatus`, `isShareActive`（来自 `utils.js` 的 `createShareUtils` 工厂）。

### 不动 `settings.js`

`settings.js` 是一个**组合层（facade）**，它实例化 5 个子渲染器并把它们的方法扁平导出：

```
settings.js 导出映射：
  renderStorageSection         ← storage.renderStorageSection
  renderSystemSection          ← system.renderSystemSection
  renderPathManagementSection  ← paths.renderPathManagementSection
  renderAdminMaintenanceSection ← maintenance.renderAdminMaintenanceSection
  renderAdminTaskListSection   ← maintenance.renderAdminTaskListSection
  MAINTENANCE_ACTIONS          ← maintenance.MAINTENANCE_ACTIONS（常量数组）
  renderAdminNotificationsSection ← notifications.renderAdminNotificationsSection
  renderAdminHealthSection     ← system.renderAdminHealthSection
  renderAdminQuotaSection      ← system.renderAdminQuotaSection
  renderAdminProtectedPathsSection ← paths.renderAdminProtectedPathsSection
  renderAdminHiddenPathsSection    ← paths.renderAdminHiddenPathsSection
  renderAdminStorageSection    ← storage.renderAdminStorageSection
  renderSystemStatusSection    ← system.renderSystemStatusSection
```

**不需要修改 `settings.js`。** 如果你在子渲染器中新增了导出函数，只需要确认 `settings.js` 中已有对应转发；如果没有，记得在合并 PR 前加上。

---

## 3. 文件清单

### 需要修改的文件（7 个核心渲染文件）

每个文件的渲染函数**返回 HTML 字符串**。直接修改函数内部的 HTML 结构、CSS class 和内联样式即可。

- `public/js/render/pages/admin/overview.js`
- `public/js/render/pages/admin/storage.js`
- `public/js/render/pages/admin/shares.js`
- `public/js/render/pages/admin/paths.js`
- `public/js/render/pages/admin/logs.js`
- `public/js/render/pages/admin/maintenance.js`
- `public/js/render/pages/admin/system.js`

### CSS 文件

现有 CSS 全部在**一个文件**中（1623 行）：

- **`public/css/pages/admin.css`** — 所有 admin 样式都在这里，包含两代风格：
  - 旧风格：`.admin-card`, `.mini-stat`, `.hero-strip`, `.data-table-compact`, `.quota-bar`
  - 新风格：`.ov2-hero`, `.sr-usage-track`, `.sr-grid`, `.ov-page` 等 redesign class
- `public/css/admin/admin.css` — **此路径不存在**，不要引用

新增 CSS class 写在这个文件里，命名建议 `{tab缩写}-{组件名}`（如 `sr-usage-track`）。不要修改 `.explorer-card` 的样式。

### 共享组件（按需使用）

`public/js/render/pages/admin/components.js` 提供通用组件（通过 `createAdminComponents({ icons, escapeHtml })` 创建）：

- `renderEmptyCard({ icon, title, description, action })` — 空状态卡片
- `renderLoadingCard({ icon, title, description })` — 加载中卡片
- `renderErrorCard({ icon, error, onRetry })` — 错误卡片（`onRetry` 是 `data-action` 值）
- `renderSectionCard({ title, description, actions, content })` — 带标题和操作按钮的区块卡片
- `renderRefreshButton(action)` — 通用刷新按钮（`data-action={action}`）
- `renderStatusTag({ label, type })` — 状态标签（`type` 可选 `success`/`warning`/`error`/`info`）

可以复用，也可以自建 UI。注意所有组件返回的是 HTML 字符串，不是 DOM 节点。

### 不需要修改的文件

| 文件 | 原因 |
|------|------|
| `public/js/render/pages/index.js` | tab 路由 + `.explorer-card` 容器定义，不要改 |
| `public/js/render/pages/admin/settings.js` | 纯委托层，透传方法，不要改 |
| `public/js/render/pages/admin/utils.js` | 工具函数工厂（`createShareUtils`），不要改 |
| `public/js/render/pages/admin/components.js` | 按需引用即可，不需要改 |
| `public/js/render/pages/admin/webhooks.js` | 被 system.js 引用，不要改 |
| `public/js/render/pages/admin/notifications.js` | 被 system.js 引用，不要改 |
| `public/js/events/admin-actions.js` | 事件处理器（37 个 action），不要碰 |
| `public/js/events/ui-actions.js` | 事件处理器（input/change/submit），不要碰 |
| `public/js/events/navigation-actions.js` | 事件处理器（含 `mark-all-notifications-read`），不要碰 |

---

## 4. 交互系统：data 属性

所有交互都基于**事件代理**，不要在 HTML 中绑定 JS 事件（没有 `.addEventListener`、`onclick`）。

### 4.1 data-action — 点击事件

所有点击交互通过 `closest("[data-action]")` 捕获（在 `admin-actions.js` 中）。**不能在 HTML 模板中绑定 JS 事件**。

**全部 data-action 值（共 40+ 个）：**

| 用途 | action 值 | 附带属性 | 所在文件 | 保留？ |
|------|-----------|---------|---------|-------|
| **tab 切换** | `set-admin-tab` | `data-tab` | index.js | **必留** |
| 刷新 | `refresh-admin` | — | overview | 建议保留 |
| 刷新 | `refresh-admin-shares` | — | shares | 建议保留 |
| 刷新 | `refresh-admin-logs` | — | logs | 建议保留 |
| 刷新 | `refresh-admin-health` | — | system | 建议保留 |
| 刷新 | `refresh-admin-quota` | — | system | 建议保留 |
| 刷新 | `refresh-admin-storage-config` | — | storage | 建议保留 |
| 刷新 | `refresh-admin-webhooks` | — | system | 建议保留 |
| 刷新 | `refresh-admin-webhook-deliveries` | — | system | 建议保留 |
| 刷新 | `refresh-admin-maintenance` | — | maintenance | 建议保留 |
| 刷新 | `refresh-admin-notifications` | — | system | 建议保留 |
| 刷新 | `refresh-admin-protected-paths` | — | paths | 建议保留 |
| 刷新 | `refresh-admin-hidden-paths` | — | paths | 建议保留 |
| 刷新 | `refresh-tasks` | — | maintenance | 建议保留 |
| 弹窗 | `show-add-protected-path` | — | paths | **必留** |
| 弹窗 | `show-add-hidden-path` | — | paths | **必留** |
| 弹窗 | `show-edit-storage-quota` | — | storage | **必留** |
| 弹窗 | `show-add-webhook` | — | system | **必留** |
| 弹窗 | `edit-webhook` | `data-id` | system | **必留** |
| 弹窗 | `confirm-delete-share` | `data-key`, `data-name` | shares | **必留** |
| 弹窗 | `confirm-delete-protected-path` | `data-path` | paths | **必留** |
| 弹窗 | `confirm-delete-hidden-path` | `data-path` | paths | **必留** |
| 弹窗 | `confirm-delete-webhook` | `data-id`, `data-name` | system | **必留** |
| 弹窗 | `confirm-maintenance-action` | `data-maintenance-action`, `data-maintenance-label` | overview, maintenance | **必留** |
| 弹窗 | `confirm-cleanup-expired-shares` | — | shares | **必留** |
| 执行 | `execute-delete-share` | `data-key` | admin-actions | 不要直接使用 |
| 执行 | `execute-delete-protected-path` | `data-path` | admin-actions | 不要直接使用 |
| 执行 | `execute-delete-hidden-path` | — | admin-actions | 不要直接使用 |
| 执行 | `execute-delete-webhook` | — | admin-actions | 不要直接使用 |
| 执行 | `execute-cleanup-expired-shares` | — | admin-actions | 不要直接使用 |
| 执行 | `execute-maintenance-action` | — | admin-actions | 不要直接使用 |
| 保存 | `save-trash-retention` | — | storage, maintenance | **必留** |
| 保存 | `cleanup-trash-by-retention` | — | storage, maintenance | **必留** |
| 复制 | `copy-share-link` | `data-key` | shares | **必留** |
| 分页 | `set-logs-page` | `data-page` | logs | **必留** |
| 分页 | `set-shares-page` | `data-page` | shares | **必留** |
| 导出 | `export-logs-csv` | — | logs | 可删 |
| 通知 | `mark-all-notifications-read` | — | system | 建议保留 |
| 通知 | `admin-mark-notif-read` | `data-notif-id` | system | 建议保留 |
| 测试 | `test-webhook` | `data-id` | system | 可删 |

**规则：** 可以给按钮加 `style`、`class`、重写 HTML 结构、改按钮文字，**但不能改 `data-action` 的值**。

> **⚠️ 已知问题：** `set-shares-page` 在 `admin-actions.js` 中**没有对应的事件处理器**，这是一个已有的 bug。如果你在 shares 页面实现分页，需要在 `admin-actions.js` 中添加对应处理，或者确保分页按钮的交互方式不依赖这个 action。

> `execute-*` 类 action 是弹窗确认后由事件处理器内部触发的，**不要在 HTML 模板中直接使用**。

### 4.1b data-action2 — 次要点击事件

一个按钮可以同时有 `data-action`（主要）和 `data-action2`（次要），点击时两个都会触发。目前用在 system.js 的健康状态刷新按钮上：

```html
<button data-action="refresh-admin-health" data-action2="refresh-admin-quota">
```

**目前 `data-action2` 映射表（在 `events/index.js` 中）：**
- `refresh-admin-health` → 已注册
- `refresh-admin-maintenance` → 已注册

> ⚠️ `refresh-admin-quota` 作为 `data-action2` 使用时**未被注册**（事件映射表中没有它），这是已有的 bug。如果 system.js 需要同时刷新健康和配额，需要修复这个映射。

### 4.2 data-action-input — 输入事件

| data-action-input | 所在文件 | 附带属性 |
|------------------|---------|---------|
| `set-shares-search` | shares | `value` |
| `set-logs-filter` | logs | `data-key="q"`, `value` |

### 4.3 data-action-change — 变更事件

| data-action-change | 所在文件 | 附带属性 |
|-------------------|---------|---------|
| `set-shares-filter` | shares | — |
| `set-logs-filter` | logs | `data-key` (action/from/to) |

### 4.4 data-binding — 数据绑定

| 值 | 所在文件 | 用途 |
|---|---------|------|
| `trash-retention-days` | storage, maintenance | 回收站保留天数 input |

> 通过 `querySelector('[data-binding="trash-retention-days"]')` 读取值。**两个文件共享同一属性名。**

### 4.5 data-form — 表单提交

| 值 | 用途 |
|---|------|
| `add-protected-path` | 添加受保护路径 |
| `add-hidden-path` | 添加隐藏路径 |
| `edit-storage-quota` | 编辑存储配额 |
| `add-webhook` | 添加 webhook |
| `edit-webhook` | 编辑 webhook |

> 表单中的 `<input name="xxx">` 用 `new FormData(event.target).get("xxx")` 读取，**不能改 name**。

---

## 5. CSS 体系

### 5.1 CSS 变量

暗色模式下变量自动切换，**不需要额外处理**。

| 变量 | 亮色示例 | 用途 |
|------|---------|------|
| `var(--text)` | #1e293b | 主文字 |
| `var(--muted)` | #64748b | 次要文字 |
| `var(--panel)` | #ffffff | 面板背景 |
| `var(--panel-soft)` | #f8fafc | 柔和背景 |
| `var(--line)` | #e2e8f0 | 边框 |
| `var(--line-strong)` | #cbd5e1 | 强调边框 |
| `var(--accent)` | #0e7490 | 主题色 |
| `var(--accent-soft)` | rgba(14,116,144,0.08) | 主题柔和 |
| `var(--danger)` | #dc2626 | 危险色 |
| `var(--warning)` | #d97706 | 警告色 |
| `var(--track-bg)` | rgba(148,163,184,0.12) | 进度条轨道 |

### 5.2 核心可复用 class

新增 CSS class 命名建议：`{tab缩写}-{组件名}`，如 `sr-usage-track`（storage）、`ov2-hero`（overview v2）。

| class | 说明 |
|-------|------|
| `.ov-page` | tab 页面根容器 (flex column, gap:8px) |
| `.ov-page-header` | 标题栏 (flex space-between) |
| `.ov-page-title` | 页面 H2 标题 |
| `.ov-page-desc` | 页面副标题 |
| `.admin-grid` | 12 列 CSS grid，gap:14px |
| `.admin-card` | 卡片 (.span-4 ~ .span-12) |
| `.admin-card-header` | 卡片头部 (flex align-center) |
| `.admin-card-icon` | 32x32 圆角图标容器 |
| `.admin-label` | uppercase 小号标签 |
| `.admin-value` | 大号数值 (28px, 800 weight) |
| `.admin-copy` | 灰色说明文字 |
| `.ov2-hero` | 统计卡片网格（默认 4 列，响应式 2→1） |
| `.ov2-hero-card` | 统计卡片 (flex row + icon) |
| `.btn` / `.btn-primary` / `.btn-danger` | 按钮 |
| `.toolbar-btn` | 工具栏按钮 |
| `.badge` / `.badge-success` / `.badge-warning` / `.badge-error` / `.badge-info` | 徽章 |
| `.toolbar-tag` / `.tag-*` | 标签 |
| `.empty-state` / `.empty-state-compact` | 空状态 |
| `.input` | 统一输入框 |
| `.btn-row` | 按钮行 |

---

## 6. 图标参考

所有可用图标来自 `public/js/ui/icons.js`，在渲染函数中用 `icons.xxx` 引用。

Admin 常用图标：

| key | 建议用途 |
|-----|---------|
| `icons.stats` | 数据卡片、概览 |
| `icons.trash` | 回收站相关 |
| `icons.eye` | 可见性、预览 |
| `icons.share` | 分享相关 |
| `icons.grid` | 分类、布局 |
| `icons.bell` | 通知、提醒 |
| `icons.list` | 日志、列表 |
| `icons.lock` | 受保护路径、权限 |
| `icons.search` | 筛选搜索 |
| `icons.refresh` | 刷新按钮 |
| `icons.spinner` | 加载状态 |
| `icons.edit` | 编辑、设置 |
| `icons.link` | webhook、链接 |
| `icons.check` | 完成、有效、已读 |
| `icons.plus` | 添加、新建 |
| `icons.close` | 关闭、无效、删除 |
| `icons.copy` | 复制链接 |
| `icons.download` | 下载、导出 |
| `icons.upload` | 上传 |
| `icons.info` | 信息提示 |
| `icons.more` | 更多操作 |
| `icons.file` | 文件 |
| `icons.folder` | 文件夹 |

还有更多图标可用于文件类型（`icons.js`, `icons.css`, `icons.html`, `icons.json`, `icons.image`, `icons.video`, `icons.audio`, `icons.pdf`, `icons.archive`, `icons.code`, `icons.script`, `icons.cloud`, `icons.save`, `icons.restore`, `icons.pause`, `icons.play`, `icons.moon`, `icons.sun`, `icons.system`, `icons.logout`, `icons.arrowLeft` 等）。

---

## 7. 安全函数

| 函数 | 签名 | 正确使用 | 错误使用 |
|------|------|---------|---------|
| `escapeHtml(str)` | `str → string` | `data-action="${escapeHtml(value)}"` | `data-action="${value}"` |
| `safeText(value, fallback)` | `(any, string) → string` | `${safeText(item.name, "未命名")}` | `${item.name \|\| "未命名"}` |
| `formatBytes(n)` | `number → "1.5 MB"` | 数值格式化 | — |
| `formatTime(ts)` | `number → "2024-01-15 14:30"` | 时间戳格式化 | — |
| `formatRelative(ts)` | `number → "3 分钟前"` | 相对时间 | — |

---

## 8. 7 个 tab 的数据形状与必留交互

> **重要：** 每个渲染文件都采用 `export function createXxxRenderer(deps) { ... return { renderXxxSection }; }` 模式，详见第 2 节。`index.js` 通过 `renderAdminActiveTab(admin, tab)` 分发，传入的 `admin` 是整个状态对象。**但 overview 除外**，它接收到的是 `admin.stats`（一个子集）。

### 8.1 overview.js — 概览

**渲染函数：** `renderAdminStatsGrid(stats)` — ⚠️ 注意是 `stats` 不是 `admin`，接收的是 `admin.stats` 子集

**数据形状：**
```
stats = {
  breakdown: { "图片": { count: 42 }, "文档": { count: 15 }, ... },
  latest:     [{ name, size, sizeFormatted, uploaded }],           // 最近 4 条
  attention:  [{ level: "warning"|"ok"|"info", title, body }],    // 系统提醒
  files:      { count: 1000, totalSizeFormatted: "1.5 GB", folderMarkers: 50 },
  trash:      { count: 10, sizeFormatted: "50 MB", percentOfFiles: 1 },
  index:      { recommendation: "需要重建", count: 980, latestUpdatedAt: 1700000000000 },
  shares:     { total: 5 },
}
```

**必留交互元素：**
- 刷新按钮 `data-action="refresh-admin"`
- 重建索引按钮 `data-action="confirm-maintenance-action"` + `data-maintenance-action="rebuild-index"` + `data-maintenance-label="重建文件索引"`
- 错误状态下重新加载按钮 `data-action="refresh-admin"`

**状态处理：** 在 `index.js:96-110` 由外层处理，渲染函数只接收 `admin.stats`（已有数据时）

> **当前实现提示：** `overview.js` 包含一个内联 SVG 环形图（`renderRingChart`），如果重设计需要保留或替换它。

---

### 8.2 storage.js — 存储

**渲染函数：** `renderStorageSection(admin)`

**数据形状：**
```
admin = {
  storageConfig: { r2: { name, usedFormatted, quotaFormatted, usedPercent, quotaBytes } },
  storageConfigLoading: bool,
  storageConfigError: string | null,
  storageConfigSaving: bool,
  trashRetention: { days: 7 } | null,
  trashRetentionLoading: bool,
  trashCleanupBusy: bool,
}
```

**必留交互元素：**
- 编辑配额按钮 `data-action="show-edit-storage-quota"`
- 回收站输入框 ★ `data-binding="trash-retention-days"`
- 保存按钮 `data-action="save-trash-retention"`

**状态处理（在渲染函数内部）：**
```js
if (storageConfigError)  → 显示错误卡片
if (storageConfigLoading || !storageConfig) → 显示加载
// 正常渲染存储信息 + 回收站设置
```

---

### 8.3 shares.js — 分享

**渲染函数：** `renderAdminSharesSection(admin)`

**数据形状：**
```
admin = {
  shares: [{ token, name, path, expiresAt, downloadCount, maxDownloads,
             expired, exhausted, allowPreview, allowDownload,
             hasPassword, lastAccessedAt, lastAccessIp, contentType }],
  shareBusyToken: "abc123" | "",
  shareFilter: "all"|"active"|"expired"|"exhausted",
  shareSearch: "",
  sharePage: 1,
  sharesLoading: bool,
  sharesError: string | null,
}
```

**必留交互元素：**
- 清理过期按钮 `data-action="confirm-cleanup-expired-shares"`
- 搜索输入框 ★ `data-action-input="set-shares-search"`
- 筛选下拉 ★ `data-action-change="set-shares-filter"`
- 分页按钮 ★ `data-action="set-shares-page"` + `data-page`
- 每个分享项的复制链接 `data-action="copy-share-link"` + `data-key`
- 每个分享项的删除 `data-action="confirm-delete-share"` + `data-key` + `data-name`

**状态处理（在渲染函数内部）：** 加载/错误/空/筛选为空/列表 + 分页

> **⚠️ 注意：** `shares.js` 包含两个函数：（1）`renderAdminSharesSection(admin)` — 后台 tab 内容（在 `.explorer-card` 内），（2）`renderSharePage()` — **公共分享页面**（不在 `.explorer-card` 内，由 index.js 直接导出挂载到其他路由）。**不要修改 `renderSharePage()`**。

---

### 8.4 paths.js — 路径（最简单的 tab）

**渲染函数：** `renderPathManagementSection(admin)`

**数据形状：**
```
admin = {
  protectedPaths: [{ path: "/admin", note: "说明", showName: "管理后台" }],
  protectedPathsLoading: bool,
  protectedPathsError: string | null,
  hiddenPaths: [{ path: "/private" }],
  hiddenPathsLoading: bool,
  hiddenPathsError: string | null,
}
```

**必留交互元素：**
- 添加受保护路径 `data-action="show-add-protected-path"`
- 添加隐藏路径 `data-action="show-add-hidden-path"`
- 删除受保护路径 `data-action="confirm-delete-protected-path"` + `data-path`
- 取消隐藏路径 `data-action="confirm-delete-hidden-path"` + `data-path`

> 建议先拿这个 tab 练手，再处理其他更复杂的 tab。

---

### 8.5 logs.js — 日志

**渲染函数：** `renderAdminLogsSection(admin)`

**数据形状：**
```
admin = {
  logs: [{ id, action, path, user, ip, createdAt, detail }],
  logsLoading: bool,
  logsError: string | null,
  logsPage: 1,
  logsTotalPages: 5,
  logsFilter: { q: "", action: "", from: "", to: "" },
}
```

**必留交互元素：**
- 搜索输入框 ★ `data-action-input="set-logs-filter" data-key="q"`
- 筛选下拉 ★ `data-action-change="set-logs-filter" data-key="action"`
- 日期输入 ★ `data-action-change="set-logs-filter" data-key="from"` / `data-key="to"`
- 分页按钮 ★ `data-action="set-logs-page"` + `data-page`
- 导出 CSV `data-action="export-logs-csv"`（可删）

---

### 8.6 maintenance.js — 维护

**渲染函数：** `renderAdminMaintenanceSection(admin)`

**数据形状：**
```
admin = {
  maintenance: { indexCount, indexTotalSizeFormatted, indexFresh,
                 r2SampleCount, r2SampleTruncated,
                 accessAttemptCount,
                 trashCount,
                 logsCount,
                 taskCount,
                 thumbnailsPresent },
  maintenanceLoading: bool,
  maintenanceError: string | null,
  maintenanceBusyAction: "rebuild-index" | "",
  tasks: [{ payload: { files: [{ name }] }, completed, total, status, createdAt }],
  tasksLoading: bool,
  trashRetention: { days: 7 },
  trashRetentionLoading: bool,
  trashCleanupBusy: bool,
}
```

**必留交互元素：**
- 维护操作按钮 ★ `data-action="confirm-maintenance-action"` + `data-maintenance-action="xxx"` + `data-maintenance-label="xxx"`
- 回收站输入框 ★ `data-binding="trash-retention-days"`
- 保存按钮 `data-action="save-trash-retention"`
- 按保留天数清理 `data-action="cleanup-trash-by-retention"`

> **`MAINTENANCE_ACTIONS` 常量：** `maintenance.js` 中定义了一个 `MAINTENANCE_ACTIONS` 数组，包含所有可用的维护操作配置 `{ action, label, desc, danger }`，由 `settings.js` 重新导出。在设计维护操作按钮时可以参考这个常量生成按钮列表。

---

### 8.7 system.js — 系统（最复杂的 tab）

**渲染函数：** `renderSystemSection(admin)`

**数据形状：**
```
admin = {
  health: { components: { "Database": { status: "ok", message: "正常" }, ... } },
  healthLoading: bool,
  healthError: string | null,
  quota: { used: 1073741824, total: 10737418240, limit: 10737418240 },
  quotaLoading: bool,
  quotaError: string | null,
  adminNotifHistory: [{ id, message, read, created_at }],
  adminNotifHistoryLoading: bool,
  notificationsUnread: 3,
  webhooks: [{ id, name, msgtype, method, url, enabled, events, headers, body, contentType }],
  webhooksLoading: bool,
  webhooksError: string | null,
  webhookDeliveries: [{ event, endpoint, ok, status, error, duration_ms, created_at }],
  webhookDeliveriesLoading: bool,
}
```

**必留交互元素：**
- 刷新按钮 `data-action="refresh-admin-health"`（还有 `data-action2="refresh-admin-quota"`）
- 通知：全部已读 `data-action="mark-all-notifications-read"`，单条已读 `data-action="admin-mark-notif-read"` + `data-notif-id`
- webhook：添加 `data-action="show-add-webhook"`，编辑 `data-action="edit-webhook"` + `data-id`，删除 `data-action="confirm-delete-webhook"` + `data-id` + `data-name`，测试 `data-action="test-webhook"` + `data-id`

---

## 9. 完整工作示例：paths.js

以下是一个**完整可运行的 paths.js 重写**，展示了设计替换的完整模式：

```js
export function createPathsRenderer({
  icons, safeText, escapeHtml, renderEmptyStateCompact, components,
}) {
  function renderPathCard({ icon, iconBg, iconColor, title, addAction, items, emptyMsg, loading, error, deleteAction }) {
    if (loading) return renderEmptyStateCompact("加载中", "正在获取列表...", icons.spinner);
    if (error) return `<div class="empty-state-compact"><p class="empty-copy">${escapeHtml(error)}</p></div>`;
    const listHtml = items.length === 0
      ? `<p class="empty-copy" style="padding:12px 0;text-align:center;color:var(--muted);">${escapeHtml(emptyMsg)}</p>`
      : items.map(item => {
          const path = String(item?.path || item?.folder || "/");
          const note = item?.note || "";
          const name = item?.showName || path;
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;
                        padding:10px 12px;border-radius:8px;background:var(--panel-soft);
                        border:1px solid var(--line);transition:border-color .18s ease;">
              <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1;">
                <span style="width:6px;height:6px;border-radius:50%;background:${iconColor};flex-shrink:0;"></span>
                <span style="font-weight:600;font-size:13px;color:var(--text);">${safeText(name)}</span>
                <span class="toolbar-tag" style="font-size:11px;">${safeText(path)}</span>
              </div>
              <button class="btn btn-danger" type="button"
                      data-action="${escapeHtml(deleteAction)}"
                      data-path="${escapeHtml(path)}"
                      style="min-height:28px;padding:0 8px;font-size:11px;">删除</button>
            </div>
            ${note ? `<div style="font-size:12px;color:var(--muted);margin:4px 0 0 14px;">${escapeHtml(note)}</div>` : ""}
          `;
        }).join("");
    return `
      <div class="admin-card" style="padding:0;">
        <div style="display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line);">
          <div style="width:28px;height:28px;border-radius:6px;display:grid;place-items:center;
                      background:${iconBg};color:${iconColor};flex-shrink:0;">
            ${icon}
          </div>
          <span class="admin-label" style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);flex:1;">${escapeHtml(title)}</span>
          <button class="btn btn-primary" type="button"
                  data-action="${escapeHtml(addAction)}"
                  style="min-height:28px;padding:0 8px;font-size:11px;">添加</button>
        </div>
        <div style="padding:8px 12px;display:flex;flex-direction:column;gap:6px;">${listHtml}</div>
      </div>
    `;
  }

  function renderPathManagementSection(admin) {
    const { protectedPaths, protectedPathsLoading, protectedPathsError } = admin;
    const { hiddenPaths, hiddenPathsLoading, hiddenPathsError } = admin;

    return `
      <div class="ov-page">
        <div class="ov-page-header">
          <div>
            <h2 class="ov-page-title">路径管理</h2>
            <p class="ov-page-desc">管理受保护路径与隐藏路径</p>
          </div>
        </div>
        <div class="admin-grid">
          <div class="span-6">
            ${renderPathCard({
              icon: icons.lock,
              iconBg: "rgba(14,116,144,0.1)",
              iconColor: "#0e7490",
              title: "受保护路径",
              addAction: "show-add-protected-path",
              deleteAction: "confirm-delete-protected-path",
              items: protectedPaths,
              loading: protectedPathsLoading,
              error: protectedPathsError,
              emptyMsg: "还没有设置任何受保护路径。",
            })}
          </div>
          <div class="span-6">
            ${renderPathCard({
              icon: icons.eye,
              iconBg: "rgba(139,92,246,0.1)",
              iconColor: "#8b5cf6",
              title: "隐藏路径",
              addAction: "show-add-hidden-path",
              deleteAction: "confirm-delete-hidden-path",
              items: hiddenPaths,
              loading: hiddenPathsLoading,
              error: hiddenPathsError,
              emptyMsg: "还没有设置任何隐藏路径。",
            })}
          </div>
        </div>
      </div>
    `;
  }

  return {
    renderAdminProtectedPathsSection: renderPathManagementSection,
    renderAdminHiddenPathsSection: renderPathManagementSection,
    renderPathManagementSection,
  };
}
```

**这个例子展示了：**
- 渲染函数返回纯 HTML 字符串
- 保留所有 `data-action` 值
- 使用 CSS 变量 + 内联 style 的混搭
- 处理加载/空/错误三种状态
- 从 `components.js` 到内联写法的自由选择
- `safeText()` / `escapeHtml()` 的使用

---

## 10. 设计模式速查

### 页面框架模式

```html
<div class="ov-page">
  <div class="ov-page-header">
    <div>
      <h2 class="ov-page-title">页面标题</h2>
      <p class="ov-page-desc">页面描述</p>
    </div>
    <button class="btn toolbar-btn" type="button" data-action="xxx">操作</button>
  </div>
  <!-- 内容区 -->
</div>
```

### 统计卡片网格模式

```html
<div class="ov2-hero">
  <div class="ov2-hero-card">
    <div class="ov2-hero-icon" style="background:...;color:...">${icons.xxx}</div>
    <div class="ov2-hero-body">
      <span class="admin-label">标签</span>
      <div class="admin-value">数值</div>
      <div class="admin-copy">说明</div>
    </div>
  </div>
  <!-- × 4 -->
</div>
```

### 布局卡片模式

```html
<div class="admin-grid">
  <div class="admin-card span-7">
    <div class="admin-card-header">
      <div class="admin-card-icon" style="...">${icons.xxx}</div>
      <span class="admin-label">卡片标题</span>
    </div>
    <!-- 卡片内容 -->
  </div>
  <div class="admin-card span-5">
    <!-- ... -->
  </div>
</div>
```

### 空状态模式

```html
<!-- 大空状态 -->
<div class="empty-state">
  <div class="empty-orb">${icons.xxx}</div>
  <p class="empty-copy">描述文字</p>
</div>

<!-- 紧凑空状态 -->
<div class="empty-state-compact">
  <div class="empty-orb">${icons.xxx}</div>
  <h3 class="empty-title">标题</h3>
  <p class="empty-copy">描述</p>
</div>
```

### 列表条目模式

```html
<div style="display:flex;flex-direction:column;gap:4px;">
  <div class="latest-item-compact">
    <div class="status-bar">
      <div class="status-main">
        <span class="status-dot" style="background:var(--accent);"></span>
        <span style="font-weight:600;">名称</span>
        <span class="toolbar-tag">标签</span>
      </div>
      <div><!-- 操作按钮区 --></div>
    </div>
    <div class="latest-copy">辅助信息</div>
  </div>
</div>
```

---

## 11. 状态处理模式

所有 tab 通用的状态处理顺序：

```js
function renderXxxSection(admin) {
  // 1. 错误状态 — 最先判断
  if (error) {
    return components.renderErrorCard({ icon: icons.xxx, error, onRetry: "refresh-xxx" });
    // 或手写:
    // return `<div class="empty-state"><div class="empty-orb">${icons.xxx}</div>
    //         <p class="empty-copy">${escapeHtml(error)}</p>
    //         <button class="btn toolbar-btn" type="button" data-action="refresh-xxx">重试</button></div>`;
  }

  // 2. 加载状态
  if (loading || !data) {
    return renderEmptyStateCompact("加载中", "描述文字", icons.spinner);
  }

  // 3. 空状态
  if (data.length === 0) {
    return renderEmptyStateCompact("暂无数据", "描述文字", icons.xxx);
  }

  // 4. 正常渲染
  return `...`;
}
```

---

## 12. 开发流程

1. 选定一个 tab 的渲染文件（建议先挑简单的练手：`paths.js`）
2. 理解当前文件的 `createXxxRenderer(deps)` 工厂函数结构，找出 `deps` 中可用的工具
3. 替换 `renderXxxSection()` 内部的 HTML 模板字符串
4. 保留交互属性（`data-action` / `data-action-input` / `data-action-change` / `data-binding` / `data-form`）
5. 用 `safeText()` 包裹文本内容，用 `escapeHtml()` 包裹属性值
6. 新 CSS class 写在 `public/css/pages/admin.css`（用 tab 前缀命名）
7. 如果修改了 `shares.js`，注意不要改动 `renderSharePage()` 函数
8. 如果新增了导出函数，确认 `settings.js` 中有对应转发
9. 刷新页面看效果，**不需要重启 dev server**（纯前端 JS）
10. 检查暗色模式、响应式、加载/空/错误状态

---

## 13. 常见陷阱检查清单

### 基本检查

- [ ] 所有 `data-action` 值没有拼错（对照第 4 节完整表格）
- [ ] `data-binding="trash-retention-days"` 的 input 保留了
- [ ] 所有动态文本用了 `safeText()`，所有属性用了 `escapeHtml()`
- [ ] 表单的 `<input name="xxx">` 没有改名
- [ ] 分页按钮的 `data-page` 值动态传递
- [ ] `.explorer-card` 没有被修改
- [ ] 新 CSS class 不与现有 class 冲突（用 tab 前缀）
- [ ] 加载/空/错误三种状态都处理了
- [ ] 响应式：`admin.css` 末尾有 `@media (max-width: 1024px)` 和 `(max-width: 768px)`
- [ ] 暗色模式自动适配（CSS 变量），不需要额外代码
- [ ] 没有在模板字符串中绑定事件（没有 `.addEventListener`、`onclick`）
- [ ] 没有在 `renderAdminActiveTab` 之外的地方修改 `index.js`

### 项目特有检查

- [ ] `set-shares-page` ⚠️ `admin-actions.js` 中**没有对应处理器**，如果 shares 需要分页交互，需要额外修复
- [ ] `refresh-admin-quota` ⚠️ 作为 `data-action2` 使用时**未被注册**，需要修复 `events/index.js` 的 action2 映射
- [ ] `overview.js` 接收 `admin.stats`（不是 `admin` 整个对象），其他 tab 都接收 `admin`
- [ ] `shares.js` 中的 `renderSharePage()` 是公共分享页面，**不要动**
- [ ] 不要直接使用 `execute-*` 类 action（它们是弹窗确认后由事件处理器内部触发的）
- [ ] `createXxxRenderer(deps)` 工厂函数签名保持一致，新增函数需要确认 `settings.js` 中有对应转发
- [ ] CSS 只写在 `public/css/pages/admin.css`，**`public/css/admin/admin.css` 路径不存在**
