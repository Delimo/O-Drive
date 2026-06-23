# 后台管理页 Tab 重设计指南

## 架构概览

后台管理页有 **7 个 tab**，每个 tab 的内容渲染在独立的文件中。

```
public/js/render/pages/index.js       ← tab 路由 + .explorer-card 外层容器（不动）
  ├── admin/overview.js               ← 概览
  ├── admin/storage.js                ← 存储
  ├── admin/shares.js                 ← 分享
  ├── admin/paths.js                  ← 路径
  ├── admin/logs.js                   ← 日志
  ├── admin/maintenance.js            ← 维护
  └── admin/system.js                 ← 系统
```

## 核心原则：不动 `.explorer-card`

`.explorer-card` 在 `index.js:164` 定义，是统一的滚动容器：

```html
<div class="explorer-card flex-1 min-h-0 bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm overflow-y-auto flex flex-col">
  <!-- 当前 tab 的渲染内容 -->
</div>
```

**不要修改** `index.js` 中的 `.explorer-card` 结构和 class。7 个 tab 的内容都注入在这个容器内部。

## 每个 tab 的渲染入口

| Tab | 路由 case | 渲染函数 | 文件 |
|-----|-----------|----------|------|
| 概览 | `"overview"` | `overview.renderAdminStatsGrid(stats)` | `overview.js` |
| 存储 | `"storage"` | `settings.renderStorageSection(admin)` | `storage.js` |
| 分享 | `"shares"` | `shares.renderAdminSharesSection(admin)` | `shares.js` |
| 路径 | `"paths"` | `settings.renderPathManagementSection(admin)` | `paths.js` |
| 日志 | `"logs"` | `logs.renderAdminLogsSection(admin)` | `logs.js` |
| 维护 | `"maintenance"` | `settings.renderAdminMaintenanceSection(admin)` | `maintenance.js` |
| 系统 | `"system"` | `settings.renderSystemSection(admin)` | `system.js` |

> `settings.js` 只是一个透传层，将调用委托给各个子渲染器，不需要修改它。

## 设计时只需要改什么

### 需要修改的文件（7 个核心渲染文件）

- `public/js/render/pages/admin/overview.js`
- `public/js/render/pages/admin/storage.js`
- `public/js/render/pages/admin/shares.js`
- `public/js/render/pages/admin/paths.js`
- `public/js/render/pages/admin/logs.js`
- `public/js/render/pages/admin/maintenance.js`
- `public/js/render/pages/admin/system.js`

每个文件的渲染函数**返回 HTML 字符串**。直接修改函数内部的 HTML 结构、CSS class 和内联样式即可。

### 可选的 CSS 文件

- `public/css/admin/admin.css`
- `public/css/pages/admin.css`

新增 CSS class 写在这两个文件中，不要修改 `.explorer-card` 的样式。

### 共享组件（按需使用）

`public/js/render/pages/admin/components.js` 提供通用组件：

- `renderEmptyCard({ icon, title, description, action })`
- `renderLoadingCard({ icon, title, description })`
- `renderErrorCard({ icon, error, onRetry })`
- `renderSectionCard({ title, description, actions, content })`

可以复用，也可以自建 UI。

## 不需要修改的文件

| 文件 | 原因 |
|------|------|
| `public/js/render/pages/index.js` | tab 路由 + `.explorer-card` 容器定义 |
| `public/js/render/pages/admin/settings.js` | 纯委托层，透传给子渲染器 |
| `public/js/render/pages/admin/utils.js` | 工具函数 |
| `public/js/render/pages/admin/webhooks.js` | 被 system.js 引用 |
| `public/js/render/pages/admin/notifications.js` | 被 system.js 引用 |

## 开发流程建议

1. 在 `overview.js` / `storage.js` 等文件中修改渲染函数，替换内部 HTML
2. 在 `admin.css` 中新增或修改样式 class
3. 刷新后台页面查看效果
4. 不需要重启 dev server（纯前端 JS）
