# 后台管理页 Tab 重设计 — 完整开发指南

## 架构概览

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

渲染函数返回 **纯 HTML 字符串**，注入到 `.explorer-card` 内部。切换 tab 时只有内部 HTML 被替换，`.explorer-card` 本身的 DOM 和 class 不变。

> `settings.js` 只做透传转发（创建 → 导出），**不需要改**。

---

## 快速上手：7 步流程

1. 选定一个 tab 的渲染文件（先挑简单的练手：`paths.js`）
2. 替换 `renderXxxSection()` 内部的 HTML 模板字符串
3. 保留交互属性（`data-action` / `data-action-input` / `data-action-change` / `data-binding`）
4. 用 `safeText()` 包裹文本内容，用 `escapeHtml()` 包裹属性值
5. 新 CSS class 写在 `public/css/pages/admin.css`（用 tab 前缀命名）
6. 刷新页面看效果，不需要重启 dev server
7. 检查暗色模式、响应式、加载/空/错误状态

---

## 一、绝对不能动的东西

| 文件 | 原因 |
|------|------|
| `public/js/render/pages/index.js` | tab 路由 + `.explorer-card` 容器定义 |
| `public/js/render/pages/admin/settings.js` | 纯委托层，透传方法 |
| `public/js/render/pages/admin/utils.js` | 工具函数（`safeText` 等） |
| `public/js/render/pages/admin/webhooks.js` | 被 system.js 引用 |
| `public/js/render/pages/admin/notifications.js` | 被 system.js 引用 |
| `public/js/events/admin-actions.js` | 事件处理器，不要碰 |
| `public/js/events/ui-actions.js` | 事件处理器，不要碰 |
| `public/css/admin/admin.css` 中的 `.explorer-card` | 统一容器样式 |

---

## 二、交互系统：data 属性参考

所有交互都基于**事件代理**，不要在 HTML 中绑定 JS 事件。

### data-action — 点击事件

`admin-actions.js` 通过 `closest("[data-action]")` 捕获点击，读取 `dataset.action` 确定行为。

**所有 action 值分类表：**

| 用途分类 | action 值 | 所在文件 | 保留? |
|---------|-----------|---------|-------|
| 刷新 | `refresh-admin` | overview | 建议保留 |
| 刷新 | `refresh-admin-shares` | shares | 建议保留 |
| 刷新 | `refresh-admin-logs` | logs | 建议保留 |
| 刷新 | `refresh-admin-health` | system | 建议保留 |
| 刷新 | `refresh-admin-quota` | system | 建议保留 |
| 刷新 | `refresh-admin-storage-config` | storage | 建议保留 |
| 刷新 | `refresh-admin-webhooks` | system | 建议保留 |
| 刷新 | `refresh-admin-webhook-deliveries` | system | 建议保留 |
| 刷新 | `refresh-admin-maintenance` | maintenance | 建议保留 |
| 刷新 | `refresh-admin-notifications` | system | 建议保留 |
| 弹出弹窗 | `show-edit-storage-quota` | storage | 必留 |
| 弹出弹窗 | `show-add-protected-path` / `show-add-hidden-path` | paths | 必留 |
| 弹出弹窗 | `show-add-webhook` / `edit-webhook` | system | 必留 |
| 弹出弹窗 | `confirm-delete-*`（4 种）| shares/paths/system | 必留 |
| 弹出弹窗 | `confirm-maintenance-action` | overview, maintenance | 必留 |
| 弹出弹窗 | `confirm-cleanup-expired-shares` | shares | 必留 |
| 保存 | `save-trash-retention` | storage, maintenance | 必留 |
| 保存 | `cleanup-trash-by-retention` | storage, maintenance | 必留 |
| 复制 | `copy-share-link` | shares | 必留 |
| 分页 | `set-shares-page` (+ `data-page`) | shares | 必留 |
| 分页 | `set-logs-page` (+ `data-page`) | logs | 必留 |
| 导出 | `export-logs-csv` | logs | 可删 |
| 通知 | `mark-all-notifications-read` | system | 建议保留 |
| 通知 | `admin-mark-notif-read` (+ `data-notif-id`) | system | 建议保留 |
| 测试 | `test-webhook` (+ `data-id`) | system | 可删 |

**规则：** 可以给按钮加 `style`、`class`、重写 HTML 结构、改按钮文字，**但不能改 `data-action` 的值**。

### data-action-input — 输入事件

| data-action-input | 所在文件 | 附带属性 |
|------------------|---------|---------|
| `set-shares-search` | shares | `value` |
| `set-logs-filter` | logs | `data-key="q"`, `value` |

### data-action-change — 变更事件

| data-action-change | 所在文件 | 附带属性 |
|-------------------|---------|---------|
| `set-shares-filter` | shares | - |
| `set-logs-filter` | logs | `data-key` (action/from/to) |

### data-binding — 数据绑定

| 值 | 所在文件 | 用途 |
|---|---------|------|
| `trash-retention-days` | storage, maintenance | 回收站保留天数 input |

> 通过 `querySelector('[data-binding="trash-retention-days"]')` 读取值。**两个文件共享同一属性名。**

### data-form — 表单提交

| 值 | 用途 |
|---|------|
| `add-protected-path` | 添加受保护路径 |
| `add-hidden-path` | 添加隐藏路径 |
| `edit-storage-quota` | 编辑存储配额 |
| `add-webhook` | 添加 webhook |
| `edit-webhook` | 编辑 webhook |

> 表单中的 `<input name="xxx">` 用 `new FormData(event.target).get("xxx")` 读取，**不能改 name**。

---

## 三、图标参考

所有可用图标（来自 `public/js/ui/icons.js`），在渲染函数中用 `icons.xxx` 引用：

| key | SVG 内容 | 建议用途 |
|-----|---------|---------|
| `icons.stats` | 柱状图 | 数据卡片、概览 |
| `icons.trash` | 垃圾桶 | 回收站相关 |
| `icons.eye` | 眼睛 | 可见性、预览 |
| `icons.share` | 分享节点 | 分享相关 |
| `icons.grid` | 网格 | 分类、布局 |
| `icons.bell` | 铃铛 | 通知 |
| `icons.list` | 列表 | 日志、列表 |
| `icons.lock` | 锁 | 受保护路径、权限 |
| `icons.search` | 搜索 | 筛选搜索 |
| `icons.refresh` | 刷新箭头 | 刷新按钮 |
| `icons.spinner` | 旋转加载 | 加载状态 |
| `icons.edit` | 铅笔 | 编辑 |
| `icons.link` | 链接 | webhook、链接 |
| `icons.check` | 勾选 | 完成、有效 |
| `icons.plus` | 加号 | 添加 |
| `icons.close` | X | 关闭、无效 |
| `icons.copy` | 复制 | 复制链接 |
| `icons.settings` (未定义，回退用 `icons.edit`) | - | 设置 |
| `icons.download` | 下载 | 下载 |
| `icons.upload` | 上传 | 上传 |
| `icons.info` | 信息圈 | 提示 |
| `icons.more` | 三点 | 更多操作 |
| `icons.file` | 文件 | 文件相关 |
| `icons.folder` | 文件夹 | 文件夹相关 |

---

## 四、CSS 体系

### CSS 变量

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

> 暗色模式下变量自动切换，**不需要额外处理**。

### 核心可复用 class

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
| `.ov2-hero` | 统计卡片网格 (默认 4 列, 响应式 2->1) |
| `.ov2-hero-card` | 统计卡片 (flex row + icon) |
| `.btn` / `.btn-primary` / `.btn-danger` | 按钮 |
| `.toolbar-btn` | 工具栏按钮 |
| `.badge` / `.badge-success` / `.badge-warning` / `.badge-error` / `.badge-info` | 徽章 |
| `.toolbar-tag` / `.tag-*` | 标签 |
| `.empty-state` / `.empty-state-compact` | 空状态 |
| `.input` | 统一输入框 |
| `.btn-row` | 按钮行 |

> 新增 CSS class 命名建议：`{tab缩写}-{组件名}`，如 `sr-usage-track`（storage）、`ov2-hero`（overview v2）

---

## 五、每个 tab 的完整数据形状与必留交互元素

### 1. overview.js

**渲染函数：** `renderAdminStatsGrid(stats)`
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

**加载/空/错误状态：** 在 `index.js:96-110` 由外层处理，渲染函数只接收 `admin.stats`（已有数据时）

---

### 2. storage.js

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

### 3. shares.js

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

> **注意：** 该文件包含 `renderSharePage()`（公共分享页，不在 `.explorer-card` 内），**不要改**。

---

### 4. paths.js

**渲染函数：** `renderPathManagementSection(admin)`（最简单）
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

---

### 5. logs.js

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

### 6. maintenance.js

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

---

### 7. system.js

**渲染函数：** `renderSystemSection(admin)`（最复杂）
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
- 刷新按钮 `data-action="refresh-admin-health"`（注意还有 `data-action2="refresh-admin-quota"`）
- 通知：全部已读 `data-action="mark-all-notifications-read"`，单条已读 `data-action="admin-mark-notif-read"` + `data-notif-id`
- webhook：添加 `data-action="show-add-webhook"`，编辑 `data-action="edit-webhook"` + `data-id`，删除 `data-action="confirm-delete-webhook"` + `data-id` + `data-name`，测试 `data-action="test-webhook"` + `data-id`

---

## 六、安全函数参考

| 函数 | 签名 | 正确使用 | 错误使用 |
|------|------|---------|---------|
| `escapeHtml(str)` | `str → string` | `data-action="${escapeHtml(value)}"` | `data-action="${value}"` |
| `safeText(value, fallback)` | `(any, string) → string` | `${safeText(item.name, "未命名")}` | `${item.name || "未命名"}` |
| `formatBytes(n)` | `number → "1.5 MB"` | 数值格式化 | - |
| `formatTime(ts)` | `number → "2024-01-15 14:30"` | 时间戳格式化 | - |
| `formatRelative(ts)` | `number → "3 分钟前"` | 相对时间 | - |

---

## 七、完整工作示例：重写 paths.js

### 改造前（当前代码路径缩略）

当前 `paths.js` 的 HTML 结构是两栏卡片列表。

### 改造后（卡片式设计示例）

以下是一个**完整可运行的 paths.js 重写**，展示设计替换的完整模式：

```js
export function createPathsRenderer({
  icons, safeText, escapeHtml, renderEmptyStateCompact, components,
}) {
  // ---- 新组件 ----
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
- 保留所有 `data-action` 值（`show-add-protected-path`、`confirm-delete-protected-path` 等）
- 使用 CSS 变量 + 内联 style 的混搭
- 处理加载/空/错误三种状态
- 从 `components.js` 到内联写法的自由选择
- `safeText()` / `escapeHtml()` 的使用

---

## 八、设计模式速查

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

## 九、状态处理模式（所有 tab 通用）

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

## 十、常见陷阱检查清单

- [ ] 所有 `data-action` 值没有拼错（对照本指南第二节）
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
