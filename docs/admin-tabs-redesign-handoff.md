# 后台管理页 Tab 重设计 — 交接指南

> 本文档用于交接给设计师/前端开发者完成 6 个 tab 页面的 UI 改造。

---

## 目录

1. [架构概览](#1-架构概览)
2. [核心原则](#2-核心原则)
3. [文件清单](#3-文件清单)
4. [交互系统：data 属性](#4-交互系统data-属性)
5. [CSS 体系](#5-css-体系)
6. [安全函数](#6-安全函数)
7. [6 个 tab 的数据形状与必留交互](#7-6-个-tab-的数据形状与必留交互)
8. [完整工作示例：shares.js](#8-完整工作示例sharesjs)
9. [设计模式速查](#9-设计模式速查)
10. [状态处理模式](#10-状态处理模式)
11. [开发流程](#11-开发流程)
12. [常见陷阱检查清单](#12-常见陷阱检查清单)

---

## 1. 架构概览

后台管理页有 **6 个 tab**，每个 tab 的内容渲染在独立的文件中。

```
index.js → renderAdminPage()
  └── <div class="toolbar-card">              ← tab 切换按钮（在 explorer-card 外部）
        └── admin-tab-btn × 6
  └── <div class="explorer-card">             ← ★ 固定的滚动容器，不要动！
        └── renderAdminActiveTab()            ← 根据 activeTab 分发
              ├── "overview"  → overview.renderAdminStatsGrid(admin.stats)
              ├── "storage"   → storage.renderStorageSection(admin)
              ├── "shares"    → shares.renderAdminSharesSection(admin)
              ├── "logs"      → logs.renderAdminLogsSection(admin)
              ├── "system"    → system.renderSystemSection(admin)
              └── "webhook"   → webhook.renderWebhookSection(admin)
```

```
public/js/render/pages/index.js       ← tab 路由 + .explorer-card 外层容器（不动）
  ├── admin/overview.js               ← 概览（接收 admin.stats 子集）
  ├── admin/storage.js                ← 存储 + 路径管理
  ├── admin/shares.js                 ← 分享
  ├── admin/logs.js                   ← 日志
  ├── admin/system.js                 ← 系统（健康 + 通知 + 运维 + 任务）
  ├── admin/webhook.js                ← Webhook 管理（独立 tab）
  ├── admin/settings.js               ← ⚡ 组合层（facade），透传子渲染器的方法（⚠️ 未被 index.js 导入，见第 2 节说明）
  ├── admin/components.js             ← 共享 UI 组件工厂
  ├── admin/utils.js                  ← 工具函数工厂（createShareUtils）
  ├── admin/paths.js                  ← 被 settings.js 引用（非独立 tab）
  ├── admin/maintenance.js            ← 被 settings.js 引用（非独立 tab）
  ├── admin/webhooks.js               ← 存在但当前未被引用（死代码，注意与 webhook.js 的区别）
  └── admin/notifications.js          ← 被 settings.js 引用（非独立 tab）
```

渲染函数返回 **纯 HTML 字符串**，注入到 `.explorer-card` 内部。切换 tab 时只有内部 HTML 被替换，`.explorer-card` 本身的 DOM 和 class 不变。

> `settings.js` 只做透传转发（创建 → 导出），**不需要改**。⚠️ 注意：`index.js` **没有导入** `settings.js`，而是直接导入 6 个渲染器。`settings.js` 是一个独立的 facade，其导出的方法（如 `renderAdminHealthSection`、`renderAdminQuotaSection`）可能被其他模块使用，但不参与 tab 路由。

---

## 2. 核心原则

### 不动 `.explorer-card`

`.explorer-card` 在 `index.js` 中定义（约第 142 行和第 163 行各一处），是统一的滚动容器：

```html
<div class="explorer-card flex-1 min-h-0 bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm overflow-y-auto flex flex-col">
  <!-- 当前 tab 的渲染内容 -->
</div>
```

**不要修改** `index.js` 中的 `.explorer-card` 结构和 class，也不要修改它的样式。6 个 tab 的内容都注入在这个容器内部，你只需要修改容器内部的 HTML。

### 工厂函数模式

每个渲染文件都导出一个工厂函数 `createXxxRenderer(deps)`，接收一个公共的 `deps` 依赖对象：

```js
export function createXxxRenderer({
  safeText, escapeHtml, renderEmptyState, renderEmptyStateCompact,
  formatTime, formatRelative, formatBytes, components
})
```

所有渲染函数**返回纯 HTML 字符串**（模板字面量），没有虚拟 DOM，没有 JSX，没有事件绑定。

> 不同文件可能还会收到额外参数。例如 `shares.js` 额外收到 `filterShares`, `getFilterLabel`, `getShareStatusTags`, `getExpiryStatus`, `isShareActive`（来自 `utils.js` 的 `createShareUtils` 工厂）。⚠️ 注意：`index.js` 会传递这些参数，但 `shares.js` 的 `createSharesRenderer` 并非全部解构 — 例如 `isShareActive` 被传递但未被接收（见第 12 节已知问题）。

### 不动 `settings.js`

`settings.js` 是一个**组合层（facade）**，它实例化 5 个子渲染器（不含 `webhook.js`）并把它们的方法扁平导出：

```
settings.js 导出映射：
  renderStorageSection         ← storage.renderStorageSection
  renderSystemSection          ← system.renderSystemSection
  renderPathManagementSection  ← paths.renderPathManagementSection
  renderAdminMaintenanceSection ← maintenance.renderAdminMaintenanceSection
  renderAdminTaskListSection   ← maintenance.renderAdminTaskListSection（⚠️ 此函数在 maintenance.js 中实际不存在，是潜在 bug）
  MAINTENANCE_ACTIONS          ← maintenance.MAINTENANCE_ACTIONS（常量数组，3 项）
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

### 需要修改的文件（6 个核心渲染文件）

每个文件的渲染函数**返回 HTML 字符串**。直接修改函数内部的 HTML 结构、CSS class 和内联样式即可。

- `public/js/render/pages/admin/overview.js` — 概览
- `public/js/render/pages/admin/storage.js` — 存储 + 路径管理
- `public/js/render/pages/admin/shares.js` — 分享
- `public/js/render/pages/admin/logs.js` — 日志
- `public/js/render/pages/admin/system.js` — 系统（健康 + 通知 + 运维 + 任务）
- `public/js/render/pages/admin/webhook.js` — Webhook 管理

### 存在但非独立 tab 的文件

以下文件存在且功能正常，但不在 `ADMIN_TABS` 路由中。它们通过 `settings.js` 被间接引用：

- `public/js/render/pages/admin/paths.js` — 路径管理渲染器（仅通过 settings.js 被引用，storage.js 自行渲染路径管理）
- `public/js/render/pages/admin/maintenance.js` — 运维诊断渲染器（仅通过 settings.js 被引用，system.js 自行渲染运维部分；⚠️ `renderAdminTaskListSection` 在 settings.js 中被重导出但实际不存在）
- `public/js/render/pages/admin/notifications.js` — 通知历史渲染器（仅通过 settings.js 被引用，system.js 自行渲染通知部分）

### CSS 文件

现有 CSS 全部在**一个文件**中（3237 行）：

- **`public/css/pages/admin.css`** — 所有 admin 样式都在这里，包含两套命名体系：
  - `.ap-*` 前缀：基础组件系统（`.ap`, `.ap-grid`, `.ap-card`, `.ap-btn` 等），被 paths.js 和 maintenance.js 使用
  - `.ov-*` 前缀：各 tab 专用样式（`.ov-overview`, `.ov-storage`, `.ov-shares`, `.ov-logs`, `.ov-system`, `.ov-webhook` 等），被 6 个核心 tab 使用
- `public/css/admin/admin.css` — **此路径不存在**，不要引用

新增 CSS class 建议使用 `.ov-{tab}-{组件}` 命名（如 `ov-storage-quota`）。不要修改 `.explorer-card` 的样式。

### 共享组件（按需使用）

`public/js/render/pages/admin/components.js` 提供通用组件（通过 `createAdminComponents({ escapeHtml })` 创建）：

- `renderEmptyCard({ icon, title, description, action })` — 空状态卡片
- `renderLoadingCard({ icon, title, description })` — 加载中卡片
- `renderErrorCard({ icon, error, onRetry })` — 错误卡片（`onRetry` 是 `data-action` 值）
- `renderSectionCard({ title, description, actions, content })` — 带标题和操作按钮的区块卡片
- `renderRefreshButton(action)` — 通用刷新按钮（`data-action={action}`）
- `renderStatusTag({ label, type })` — 状态标签（`type` 可选 `success`/`warning`/`error`/`info`）
- `renderCustomSelect({ id, value, options, actionChange, dataKey, className })` — 自定义下拉选择器（shares 筛选、logs 操作类型筛选）
- `bindCustomSelects(root)` — 绑定自定义下拉事件（页面渲染后调用）
- `renderCustomDatePicker({ id, value, placeholder, actionChange, dataKey, className })` — 自定义日期选择器（logs 日期筛选）
- `bindCustomDatePickers(root)` — 绑定日期选择器事件（页面渲染后调用）

可以复用，也可以自建 UI。注意所有组件返回的是 HTML 字符串，不是 DOM 节点。

### 不需要修改的文件

| 文件 | 原因 |
|------|------|
| `public/js/render/pages/index.js` | tab 路由 + `.explorer-card` 容器定义，不要改 |
| `public/js/render/pages/admin/settings.js` | 纯委托层，透传方法，不要改 |
| `public/js/render/pages/admin/utils.js` | 工具函数工厂（`createShareUtils`），不要改 |
| `public/js/render/pages/admin/components.js` | 按需引用即可，不需要改 |
| `public/js/render/pages/admin/paths.js` | 非独立 tab，被 settings.js 引用，按需改 |
| `public/js/render/pages/admin/maintenance.js` | 非独立 tab，被 settings.js 引用，按需改 |
| `public/js/render/pages/admin/notifications.js` | 非独立 tab，被 settings.js 引用，按需改 |
| `public/js/render/pages/admin/webhooks.js` | 当前未被引用的死代码（注意与 `webhook.js` 的区别），不要改 |
| `public/js/events/admin-actions.js` | 事件处理器（30+ 个 action），不要碰 |
| `public/js/events/ui-actions.js` | 事件处理器（input/change/submit），不要碰 |
| `public/js/events/navigation-actions.js` | 事件处理器（含 `mark-all-notifications-read`），不要碰 |

---

## 4. 交互系统：data 属性

所有交互都基于**事件代理**，不要在 HTML 中绑定 JS 事件（没有 `.addEventListener`、`onclick`）。

### 4.1 data-action — 点击事件

所有点击交互通过 `closest("[data-action]")` 捕获（在 `admin-actions.js` 中）。**不能在 HTML 模板中绑定 JS 事件**。

**全部 data-action 值（来自 admin-actions.js）：**

| 用途 | action 值 | 附带属性 | 所在 tab | 保留？ |
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
| 刷新 | `refresh-admin-maintenance` | — | system | 建议保留 |
| 刷新 | `refresh-admin-notifications` | — | system | 建议保留 |
| 刷新 | `refresh-admin-protected-paths` | — | storage | 建议保留 |
| 刷新 | `refresh-admin-hidden-paths` | — | storage | 建议保留 |
| 刷新 | `refresh-tasks` | — | system | 建议保留 |
| 弹窗 | `show-add-protected-path` | — | storage | **必留** |
| 弹窗 | `show-add-hidden-path` | — | storage | **必留** |
| 弹窗 | `show-edit-storage-quota` | — | storage | **必留** |
| 弹窗 | `show-add-webhook` | — | system | **必留** |
| 弹窗 | `edit-webhook` | `data-id` | system | **必留** |
| 弹窗 | `confirm-delete-share` | `data-key`, `data-name` | shares | **必留** |
| 弹窗 | `confirm-delete-protected-path` | `data-path` | storage | **必留** |
| 弹窗 | `confirm-delete-hidden-path` | `data-path` | storage | **必留** |
| 弹窗 | `confirm-delete-webhook` | `data-id`, `data-name` | system | **必留** |
| 弹窗 | `confirm-maintenance-action` | `data-maintenance-action`, `data-maintenance-label` | overview, system | **必留** |
| 弹窗 | `confirm-cleanup-expired-shares` | — | shares | **必留** |
| 执行 | `execute-delete-share` | `data-key` | admin-actions | 不要直接使用 |
| 执行 | `execute-delete-protected-path` | `data-path` | admin-actions | 不要直接使用 |
| 执行 | `execute-delete-hidden-path` | — | admin-actions | 不要直接使用 |
| 执行 | `execute-delete-webhook` | — | admin-actions | 不要直接使用 |
| 执行 | `execute-cleanup-expired-shares` | — | admin-actions | 不要直接使用 |
| 执行 | `cleanup-expired-shares` | — | admin-actions | 不要直接使用 |
| 执行 | `delete-share` | — | admin-actions | 不要直接使用 |
| 执行 | `execute-maintenance-action` | — | admin-actions | 不要直接使用 |
| 保存 | `save-trash-retention` | — | storage, system | **必留** |
| 保存 | `cleanup-trash-by-retention` | — | storage, system | **必留** |
| 保存 | `save-access-rule` | — | storage | **必留** |
| 复制 | `copy-share-link` | `data-key` | shares | **必留** |
| 分页 | `set-logs-page` | `data-page` | logs | **必留** |
| 筛选 | `set-share-filter` / `set-shares-filter` | `data-filter` | shares | **必留** |
| 筛选 | `filter-shares` | — | shares | 建议保留 |
| 重置筛选 | `reset-shares-filter` | — | shares | 建议保留 |
| 重置筛选 | `reset-logs-filter` | — | logs | 建议保留 |
| 导出 | `export-logs-csv` | — | logs | 可选 |
| 通知 | `mark-all-notifications-read` | — | system | 建议保留 |
| 通知 | `admin-mark-notif-read` | `data-notif-id` | system | 建议保留 |
| 测试 | `test-webhook` | `data-id` | system | 可选 |

**规则：** 可以给按钮加 `style`、`class`、重写 HTML 结构、改按钮文字，**但不能改 `data-action` 的值**。

> **⚠️ 已知问题：** `set-shares-page` 在 `admin-actions.js` 中**没有对应的事件处理器**。shares 页面当前没有实现分页交互。如需分页，需要在 `admin-actions.js` 中添加对应处理。

> `execute-*` 类 action 是弹窗确认后由事件处理器内部触发的，**不要在 HTML 模板中直接使用**。

### 4.1b data-action2 — 次要点击事件

一个按钮可以同时有 `data-action`（主要）和 `data-action2`（次要），点击时两个都会触发。

**当前 `data-action2` 映射表（在 `events/index.js` 中）：**

| action2 值 | 触发效果 |
|-----------|---------|
| `refresh-admin-health` | 重新加载健康状态 |
| `refresh-admin-maintenance` | 重新加载运维快照 |

> ⚠️ `refresh-admin-quota` 作为 `data-action2` 使用时**未被注册**（事件映射表中没有它）。system.js 中的健康刷新按钮使用了 `data-action2="refresh-admin-quota"`，但实际不会触发。如果需要同时刷新配额，需要在 `events/index.js` 的 action2 映射中添加。

### 4.2 data-action-input — 输入事件

| data-action-input | 所在 tab | 附带属性 |
|------------------|---------|---------|
| `set-shares-search` | shares | `value` |
| `set-logs-filter` | logs | `data-key="q"`, `value` |
| `set-logs-filter` | logs | `data-key="ip"`, `value` |
| `set-rule-path` | storage | `value` |
| `set-rule-password` | storage | `value` |
| `set-rule-note` | storage | `value` |

### 4.3 data-action-change — 变更事件

| data-action-change | 所在 tab | 附带属性 |
|-------------------|---------|---------|
| `set-shares-filter` | shares | — |
| `set-logs-filter` | logs | `data-key` (action/ip/from/to) |
| `toggle-rule-hide` | storage | — |
| `toggle-rule-show-name` | storage | — |

### 4.4 data-binding — 数据绑定

| 值 | 所在 tab | 用途 |
|---|---------|------|
| `trash-retention-days` | storage, system | 回收站保留天数 input |

> 通过 `querySelector('[data-binding="trash-retention-days"]')` 读取值。storage.js 和 system.js 共享同一属性名。

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

### 5.2 两套 CSS 命名体系

`admin.css` 中存在两套命名体系：

#### `.ap-*` — 基础组件系统

被 `paths.js`、`maintenance.js` 及部分共享场景使用。

| class | 说明 |
|-------|------|
| `.ap` | 页面根容器 (flex column, gap:4px) |
| `.ap-head` | 标题栏 (flex space-between) |
| `.ap-title` | 页面标题 (15px, 700) |
| `.ap-desc` | 页面副标题 (11px, muted) |
| `.ap-grid` | 12 列 CSS grid，gap:10px |
| `.ap-col-3` ~ `.ap-col-12` | 列宽 |
| `.ap-card` | 卡片 (圆角 10px, border, panel 背景) |
| `.ap-card-head` | 卡片头部 |
| `.ap-card-body` | 卡片内容区 |
| `.ap-lbl` | uppercase 小号标签 |
| `.ap-desc-text` | 灰色说明文字 |
| `.ap-empty-inline` | 内联空状态文字 |
| `.ap-row` | flex 横排 |
| `.ap-btn` / `.ap-btn-sm` / `.ap-btn-primary` / `.ap-btn-danger` / `.ap-btn-ghost` | 按钮系列 |
| `.ap-input` | 统一输入框 |
| `.ap-list` | 列表容器 |
| `.ap-list-row` | 列表条目 |
| `.ap-list-row-main` | 条目主区域 |
| `.ap-list-row-name` | 条目名称 |
| `.ap-list-row-code` | 条目代码/路径 |
| `.ap-list-row-note` | 条目备注 |
| `.ap-badge` / `.ap-badge-ok` / `.ap-badge-warn` / `.ap-badge-error` / `.ap-badge-info` | 徽章 |
| `.ap-table` | 表格 |
| `.ap-td-muted` / `.ap-td-mono` | 单元格样式 |
| `.ap-action-tag` / `.ap-act-danger` / `.ap-act-ok` | 操作标签 |
| `.ap-pagination` | 分页 |

#### `.ov-*` — 6 个核心 tab 专用样式

| class 前缀 | 对应 tab | 说明 |
|-----------|---------|------|
| `.ov-overview-*` | overview | 概览页面布局、统计卡片、环形图、最近上传、维护中心 |
| `.ov-stat-*` | overview | 统计卡片（`.ov-stat-card`, `.ov-stat-icon`, `.ov-stat-body`, `.ov-stat-label`, `.ov-stat-value`） |
| `.ov-section-*` | overview | 内容区块（`.ov-section`, `.ov-section-head`, `.ov-section-title`, `.ov-section-body`） |
| `.ov-recent-*` | overview | 最近上传列表 |
| `.ov-breakdown-*` / `.ov-chart-*` / `.ov-donut-*` | overview | 类型分布图表 |
| `.ov-maint-*` | overview | 维护中心网格 |
| `.ov-storage-*` | storage | 存储管理布局 |
| `.ov-quota-*` | storage | 存储配额卡片 |
| `.ov-trash-*` | storage | 回收站策略 |
| `.ov-rules-*` | storage | 路径规则编辑器和列表 |
| `.ov-shares-*` | shares | 分享管理布局 |
| `.ov-share-*` | shares | 分享条目 |
| `.ov-logs-*` | logs | 日志布局、筛选、表格、分页 |
| `.ov-system-*` | system | 系统管理布局 |
| `.ov-health-*` | system | 组件探针 |
| `.ov-notif-*` | system | 通知面板 |
| `.ov-maintenance-*` | system | 运维指令 |
| `.ov-tasks-*` | system | 后台调度 |
| `.ov-webhook-*` | webhook | Webhook 管理（独立 tab） |
| `.ov-badge-*` | 通用 | 徽章变体（`.ov-badge-ok`, `.ov-badge-error`, `.ov-badge-warn`, `.ov-badge-info`, `.ov-badge-purple`, `.ov-badge-accent`） |
| `.ov-tag` | 通用 | 标签 |
| `.ov-empty-inline` | 通用 | 内联空状态 |
| `.ov-error-*` | 通用 | 错误状态 |

#### 其他 CSS 前缀

| class 前缀 | 说明 |
|-----------|------|
| `.cselect-*` | 自定义下拉选择器组件（约 15 条规则） |
| `.cdate-*` | 自定义日期选择器组件（约 25 条规则） |
| `.admin-*` | Tab 栏样式（`admin-tab-bar`, `admin-tab-btn`, `admin-tab-active`） |
| `.toolbar-*` | 工具栏标签（`.toolbar-tag`） |
| `.tag-*` | 语义标签变体（`.tag-active`, `.tag-expired`, `.tag-soon`, `.tag-unlimited`, `.tag-password` 等） |
| `.empty-*` | 空状态组件（`.empty-state`, `.empty-state-compact`, `.empty-orb`, `.empty-copy`, `.empty-title`） |
| `.notif-*` | 通知下拉面板（遗留样式，保持兼容） |
| `.btn-sm` | 按钮尺寸变体 |
| `.input` | 通用输入框样式 |

### 5.3 新增 CSS 规则

- 新增 CSS class 写在 `public/css/pages/admin.css`（当前 3237 行）
- 建议使用 `.ov-{tab}-{组件}` 命名（如 `ov-storage-quota`）
- 不要修改 `.explorer-card` 的样式
- 不要修改已有的 `.ap-*` 基础组件样式
- 注意 `.cselect-*` 和 `.cdate-*` 是自定义组件样式，修改时需同时更新 `components.js` 中的对应逻辑

---

## 6. 安全函数

| 函数 | 签名 | 正确使用 | 错误使用 |
|------|------|---------|---------|
| `escapeHtml(str)` | `str → string` | `data-action="${escapeHtml(value)}"` | `data-action="${value}"` |
| `safeText(value, fallback)` | `(any, string) → string` | `${safeText(item.name, "未命名")}` | `${item.name \|\| "未命名"}` |
| `formatBytes(n)` | `number → "1.5 MB"` | 数值格式化 | — |
| `formatTime(ts)` | `number → "2024-01-15 14:30"` | 时间戳格式化 | — |
| `formatRelative(ts)` | `number → "3 分钟前"` | 相对时间 | — |

---

## 7. 6 个 tab 的数据形状与必留交互

> **重要：** 每个渲染文件都采用 `export function createXxxRenderer(deps) { ... return { renderXxxSection }; }` 模式，详见第 2 节。`index.js` 通过 `renderAdminActiveTab(admin, tab)` 分发，传入的 `admin` 是整个状态对象。**但 overview 除外**，它接收到的是 `admin.stats`（一个子集）。

### 7.1 overview.js — 概览

**渲染函数：** `renderAdminStatsGrid(stats)` + `renderAdminErrorState(error)`

⚠️ 注意是 `stats` 不是 `admin`，接收的是 `admin.stats` 子集。错误状态由 `index.js` 中的 `renderAdminActiveTab` 调用 `renderAdminErrorState` 处理。

**数据形状：**
```
stats = {
  files:     { count: 1000, totalSizeFormatted: "1.5 GB", folderMarkers: 50 },
  trash:     { count: 10, sizeFormatted: "50 MB" },
  index:     { count: 980, latestUpdatedAt: 1700000000000 },
  shares:    { total: 5 },
  logs:      { count: 500 },
  tasks:     { completed: 42 },
  latest:    [{ key, sizeFormatted, uploaded }],              // 最近 6 条
  breakdown: { "图片": { count: 42 }, "文档": { count: 15 }, ... },
  attention: [{ level: "warning"|"ok"|"info", title, body }], // 系统提醒
  thumbnailsPresent: bool,                                    // 缩略图是否可用
}
```

**必留交互元素：**
- 刷新按钮 `data-action="refresh-admin"`
- 类型分布区刷新按钮 `data-action="refresh-admin"`
- 错误状态下重新加载按钮 `data-action="refresh-admin"`

**状态处理：** 在 `index.js` 的 `renderAdminActiveTab` 中由外层处理 loading / error / 无数据 三种情况，渲染函数只接收已有数据的 `admin.stats`。

---

### 7.2 storage.js — 存储 + 路径管理

**渲染函数：** `renderStorageSection(admin)`

此 tab 合并了存储配额、回收站策略和路径管理（受保护路径 + 隐藏路径）。

**数据形状：**
```
admin = {
  storageConfig: { r2: { name, usedFormatted, quotaFormatted, usedPercent } },
  storageConfigLoading: bool,
  storageConfigError: string | null,
  trashRetention: { days: 7 } | null,
  trashRetentionLoading: bool,
  trashCleanupBusy: bool,
  protectedPaths: [{ path, note, showName }],
  protectedPathsLoading: bool,
  protectedPathsError: string | null,
  hiddenPaths: [{ path, note }],
  hiddenPathsLoading: bool,
  hiddenPathsError: string | null,
}
```

**必留交互元素：**
- 编辑配额按钮 `data-action="show-edit-storage-quota"`
- 回收站输入框 ★ `data-binding="trash-retention-days"`
- 保存按钮 `data-action="save-trash-retention"`
- 强制清理按钮 `data-action="cleanup-trash-by-retention"`
- 保存规则按钮 `data-action="save-access-rule"`
- 删除受保护路径 `data-action="confirm-delete-protected-path"` + `data-path`
- 删除隐藏路径 `data-action="confirm-delete-hidden-path"` + `data-path`

**状态处理（在渲染函数内部）：**
```js
if (storageConfigError)  → 显示错误卡片
if (storageConfigLoading || !storageConfig) → 显示加载
// 正常渲染存储信息 + 回收站设置 + 路径规则编辑器 + 路径规则列表
```

---

### 7.3 shares.js — 分享

**渲染函数：** `renderAdminSharesSection(admin)`

**数据形状：**
```
admin = {
  shares: [{ token, name, path, expiresAt, downloadCount, maxDownloads,
             expired, exhausted, allowPreview, allowDownload,
             hasPassword, lastAccessedAt, lastAccessIp, contentType }],
  shareBusyToken: "abc123" | "",
  shareFilter: "all"|"active"|"expired"|"exhausted"|"password"|"preview"|"download",
  shareSearch: "",
  sharesLoading: bool,
  sharesError: string | null,
}
```

**必留交互元素：**
- 清理过期按钮 `data-action="confirm-cleanup-expired-shares"`
- 搜索输入框 ★ `data-action-input="set-shares-search"`
- 筛选下拉 ★ `data-action-change="set-shares-filter"`（通过 `components.renderCustomSelect` 渲染，非原生 `<select>`；筛选选项在 shares.js 中硬编码，未使用 `getShareFilterOptions`）
- 每个分享项的复制链接 `data-action="copy-share-link"` + `data-key`
- 每个分享项的删除 `data-action="confirm-delete-share"` + `data-key` + `data-name`

**状态处理（在渲染函数内部）：** 加载/错误/空/列表

> **⚠️ 注意：** `shares.js` 不包含分页功能。`set-shares-page` 在 `admin-actions.js` 中没有对应处理器，当前 shares 页面没有分页。

---

### 7.4 logs.js — 日志

**渲染函数：** `renderAdminLogsSection(admin)`

**数据形状：**
```
admin = {
  logs: [{ id, action, path, user, ip, createdAt, detail }],
  logsLoading: bool,
  logsError: string | null,
  logsPage: 1,
  logsTotalPages: 5,
  logsFilter: { q: "", action: "", ip: "", from: "", to: "" },
}
```

**必留交互元素：**
- 搜索输入框 ★ `data-action-input="set-logs-filter" data-key="q"`
- IP 筛选输入框 ★ `data-action-input="set-logs-filter" data-key="ip"`
- 筛选下拉 ★ `data-action-change="set-logs-filter" data-key="action"`（通过 `components.renderCustomSelect` 渲染）
- 日期输入 ★ `data-action-change="set-logs-filter" data-key="from"` / `data-key="to"`（通过 `components.renderCustomDatePicker` 渲染）
- 筛选按钮 `data-action="refresh-admin-logs"`
- 重置筛选 `data-action="reset-logs-filter"`
- 分页按钮 ★ `data-action="set-logs-page"` + `data-page`
- 导出 CSV `data-action="export-logs-csv"`（可选）

---

### 7.5 system.js — 系统（最复杂的 tab）

**渲染函数：** `renderSystemSection(admin)`

此 tab 合并了健康探针、通知面板、运维指令和后台调度。

> **⚠️ 注意：** `system.js` 的 deps 中解构了 `renderEmptyState` 和 `formatBytes`，但两者在函数体内**均未使用**（死依赖）。

**数据形状：**
```
admin = {
  health: {
    db:  { ok: bool, message: "正常" },
    r2:  { ok: bool, message: "正常" },
    env: { adminUsername: bool, adminPassword: bool, tokenSecret: { bound: bool } },
  },
  healthLoading: bool,
  healthError: string | null,
  adminNotifHistory: [{ id, message, read, created_at }],
  adminNotifHistoryLoading: bool,
  notificationsUnread: 3,
  maintenance: { indexCount, trashCount, ... },
  maintenanceLoading: bool,
  maintenanceError: string | null,
  maintenanceBusyAction: "rebuild-index" | "",
  tasks: [{ payload, completed, total, status, createdAt }],
  tasksLoading: bool,
  trashRetention: { days: 7 },
  trashRetentionLoading: bool,
  trashCleanupBusy: bool,
}
```

**必留交互元素：**
- 刷新按钮 `data-action="refresh-admin-health"`（还有 `data-action2="refresh-admin-quota"`）
- 通知：全部已读 `data-action="mark-all-notifications-read"`，单条已读 `data-action="admin-mark-notif-read"` + `data-notif-id`
- 维护操作按钮 ★ `data-action="confirm-maintenance-action"` + `data-maintenance-action` + `data-maintenance-label`
- 回收站输入框 ★ `data-binding="trash-retention-days"`
- 保存按钮 `data-action="save-trash-retention"`
- 按保留天数清理 `data-action="cleanup-trash-by-retention"`
- 后台调度刷新 `data-action="refresh-tasks"`

> **`MAINTENANCE_ACTIONS` 常量：** `system.js` 和 `maintenance.js` 中都定义了 `MAINTENANCE_ACTIONS` 数组（3 项）：
>
> | action | label | danger |
> |--------|-------|--------|
> | `rebuild-index` | 同步元数据库索引 | false |
> | `clear-cache` | 清理缓存数据库 | false |
> | `purge-trash` | 同步清除废弃文件 | true |

---

### 7.6 webhook.js — Webhook 管理

**渲染函数：** `renderWebhookSection(admin)`

此 tab 独立管理 Webhook 回调端点和投递记录。

**deps：** `safeText, escapeHtml, renderEmptyStateCompact, formatTime, components`

**常量：** `EVENT_LABELS` — 10 种事件类型映射（`file.uploaded`, `file.deleted`, `file.purged`, `file.moved`, `file.copied`, `file.renamed`, `folder.created`, `download.burst`, `login.burst`, `share.expired`）

**数据形状：**
```
admin = {
  webhooks: [{ id, name, method, msgtype, url, contentType, events }],
  webhooksLoading: bool,
  webhookDeliveries: [{ event, endpoint, ok, status, duration_ms, created_at }],
  webhookDeliveriesLoading: bool,
}
```

**必留交互元素：**
- 添加按钮 `data-action="show-add-webhook"`
- 刷新按钮 `data-action="refresh-admin-webhooks"`
- 刷新投递 `data-action="refresh-admin-webhook-deliveries"`
- 编辑按钮 `data-action="edit-webhook"` + `data-id`
- 测试按钮 `data-action="test-webhook"` + `data-id`
- 删除按钮 `data-action="confirm-delete-webhook"` + `data-id` + `data-name`

**状态处理（在渲染函数内部）：** 加载/空/列表（webhook 列表 + 投递记录列表）

---

## 8. 完整工作示例：shares.js

以下是一个**完整可运行的 shares.js 重写**，展示了设计替换的完整模式：

```js
export function createSharesRenderer({
  safeText, escapeHtml, renderEmptyStateCompact, formatTime, formatRelative,
  filterShares, getFilterLabel, getShareStatusTags, components
}) {

  function renderShareTags(item) {
    return getShareStatusTags(item)
      .filter(t => t.className !== "tag-password")
      .slice(0, 3)
      .map(t => `<span class="ov-badge ${t.className}">${escapeHtml(t.label)}</span>`)
      .join("");
  }

  function renderAdminSharesSection(admin) {
    const {
      shares = [], shareFilter = "all", shareSearch = "", sharesLoading, sharesError
    } = admin;

    if (sharesError) {
      return components.renderErrorCard({ icon: "", error: sharesError, onRetry: "refresh-admin-shares" });
    }
    if (sharesLoading) {
      return renderEmptyStateCompact("载入中", "拉取外链列表中...", "");
    }

    const filtered = filterShares(shares, shareFilter);
    const filterOptions = [
      { value: "all", label: "全部状态" },
      { value: "active", label: "有效" },
      { value: "expired", label: "已过期" },
      { value: "exhausted", label: "额度耗尽" },
    ];

    return `
      <div class="ov-shares">
        <div class="ov-shares-header">
          <div class="ov-shares-title-group">
            <h2 class="ov-shares-title">分享管理</h2>
            <p class="ov-shares-desc">外链管理</p>
          </div>
          <button class="btn btn-danger btn-sm" type="button" data-action="confirm-cleanup-expired-shares">清理过期</button>
        </div>

        <div class="ov-shares-top">
          <div class="ov-shares-filter">
            <input class="input" type="text"
                   data-action-input="set-shares-search" value="${escapeHtml(shareSearch)}"
                   placeholder="搜索文件名、令牌...">
            ${components.renderCustomSelect({
              value: shareFilter,
              options: filterOptions,
              actionChange: "set-shares-filter",
            })}
          </div>
        </div>

        <div class="ov-shares-content">
          <div class="ov-shares-list">
            ${filtered.length === 0
              ? `<div class="ov-empty-inline">无符合条件的外链</div>`
              : filtered.map(share => {
                  const isExpired = share.expired || (share.expiresAt && share.expiresAt < Date.now());
                  const isExhausted = share.exhausted;
                  const isActive = !isExpired && !isExhausted;

                  return `
                    <div class="ov-share-item">
                      <div class="ov-share-info">
                        <div class="ov-share-main">
                          <span class="ov-share-dot" style="background:${isActive ? '#10b981' : 'var(--danger)'};"></span>
                          <span class="ov-share-name">${safeText(share.name, "未命名资源")}</span>
                          ${renderShareTags(share)}
                        </div>
                        <div class="ov-share-meta">
                          <span>路径: ${escapeHtml(share.path)}</span>
                          <span>下载: ${share.downloadCount}/${share.maxDownloads || "∞"}</span>
                          ${share.expiresAt ? `<span>到期: ${formatTime(share.expiresAt)}</span>` : ""}
                        </div>
                      </div>
                      <div class="ov-share-actions">
                        <button class="btn btn-sm" type="button"
                                data-action="copy-share-link" data-key="${escapeHtml(share.token)}">复制</button>
                        <button class="btn btn-danger btn-sm" type="button"
                                data-action="confirm-delete-share"
                                data-key="${escapeHtml(share.token)}"
                                data-name="${escapeHtml(share.name)}">移除</button>
                      </div>
                    </div>
                  `;
                }).join("")}
          </div>
        </div>
      </div>
    `;
  }

  function renderSharePage() { return ``; }

  return { renderAdminSharesSection, renderSharePage };
}
```

**这个例子展示了：**
- 渲染函数返回纯 HTML 字符串
- 保留所有 `data-action` 值
- 使用 `filterShares()` 过滤数据而非在模板中内联判断
- 使用 `components.renderCustomSelect()` 渲染筛选下拉（非原生 `<select>`）
- 使用 `getShareStatusTags()` 生成状态标签
- 使用 `.ov-*` CSS class + 内联 style 的混搭
- 处理加载/错误/空三种状态
- `safeText()` / `escapeHtml()` 的使用
- `components.renderErrorCard()` 复用

---

## 9. 设计模式速查

### 页面框架模式（`.ov-*` 命名）

```html
<div class="ov-{tab}">
  <div class="ov-{tab}-header">
    <div class="ov-{tab}-title-group">
      <h2 class="ov-{tab}-title">页面标题</h2>
      <p class="ov-{tab}-desc">页面描述</p>
    </div>
    <button class="btn" type="button" data-action="xxx">操作</button>
  </div>
  <!-- 内容区 -->
</div>
```

### 页面框架模式（`.ap-*` 命名，用于 paths/maintenance）

```html
<div class="ap">
  <div class="ap-head">
    <div>
      <h2 class="ap-title">页面标题</h2>
      <p class="ap-desc">页面描述</p>
    </div>
    <button class="ap-btn ap-btn-sm" type="button" data-action="xxx">操作</button>
  </div>
  <div class="ap-grid">
    <div class="ap-card ap-col-6">...</div>
    <div class="ap-card ap-col-6">...</div>
  </div>
</div>
```

### 统计卡片网格模式（overview）

```html
<div class="ov-overview-stats">
  <div class="ov-stat-card">
    <div class="ov-stat-icon" style="background:...;color:...">${icons.xxx}</div>
    <div class="ov-stat-body">
      <span class="ov-stat-label">标签</span>
      <span class="ov-stat-value">数值</span>
      <span class="ov-stat-sub">说明</span>
    </div>
  </div>
  <!-- × 4 -->
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

<!-- 内联空状态 -->
<div class="ov-empty-inline">暂无数据</div>
```

---

## 10. 状态处理模式

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

## 11. 开发流程

1. 选定一个 tab 的渲染文件（建议先挑简单的练手：`logs.js`）
2. 理解当前文件的 `createXxxRenderer(deps)` 工厂函数结构，找出 `deps` 中可用的工具
3. 替换 `renderXxxSection()` 内部的 HTML 模板字符串
4. 保留交互属性（`data-action` / `data-action-input` / `data-action-change` / `data-binding` / `data-form`）
5. 用 `safeText()` 包裹文本内容，用 `escapeHtml()` 包裹属性值
6. 新 CSS class 写在 `public/css/pages/admin.css`（用 `.ov-{tab}-{组件}` 命名）
7. 如果新增了导出函数，确认 `settings.js` 中有对应转发
8. 刷新页面看效果，**不需要重启 dev server**（纯前端 JS）
9. 检查暗色模式、响应式、加载/空/错误状态

---

## 12. 常见陷阱检查清单

### 基本检查

- [ ] 所有 `data-action` 值没有拼错（对照第 4 节完整表格）
- [ ] `data-binding="trash-retention-days"` 的 input 保留了
- [ ] 所有动态文本用了 `safeText()`，所有属性用了 `escapeHtml()`
- [ ] 表单的 `<input name="xxx">` 没有改名
- [ ] `.explorer-card` 没有被修改
- [ ] 新 CSS class 不与现有 class 冲突（用 `.ov-{tab}-` 前缀）
- [ ] 加载/空/错误三种状态都处理了
- [ ] 响应式：`admin.css` 末尾有 `@media (max-width: 1024px)` 和 `(max-width: 768px)`
- [ ] 暗色模式自动适配（CSS 变量），不需要额外代码
- [ ] 没有在模板字符串中绑定事件（没有 `.addEventListener`、`onclick`）
- [ ] 没有在 `renderAdminActiveTab` 之外的地方修改 `index.js`
- [ ] 了解 `.ap-*` 和 `.ov-*` 两套 CSS 命名体系的区别

### 项目特有检查

- [ ] `set-shares-page` ⚠️ `admin-actions.js` 中**没有对应处理器**，shares 没有分页
- [ ] `refresh-admin-quota` ⚠️ 作为 `data-action2` 使用时**未被注册**（system.js 中的健康刷新按钮使用了它，但实际不会触发配额刷新）
- [ ] `overview.js` 接收 `admin.stats`（不是 `admin` 整个对象），其他 tab 都接收 `admin`
- [ ] `shares.js` 中的 `renderSharePage()` 是公共分享页面，**不要动**
- [ ] `shares.js` 中 `isShareActive()` 被调用但**未被导入** — 潜在 bug，使用时需从 deps 中获取或自行定义
- [ ] `maintenance.js` 的 `renderAdminTaskListSection` 在 `settings.js` 中被重导出，但该函数**实际不存在**于 maintenance.js — 潜在 bug
- [ ] 不要直接使用 `execute-*` 类 action（它们是弹窗确认后由事件处理器内部触发的）
- [ ] `createXxxRenderer(deps)` 工厂函数签名保持一致，新增函数需要确认 `settings.js` 中有对应转发
- [ ] CSS 只写在 `public/css/pages/admin.css`，**`public/css/admin/admin.css` 路径不存在**
- [ ] `webhooks.js` 存在但当前未被任何文件导入，是死代码，不要依赖它
- [ ] `settings.js` **未被 index.js 导入** — 它是独立 facade，不参与 tab 路由
