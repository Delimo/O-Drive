# 后台管理页说明

> 本文档记录当前后台管理页结构和维护约定。

## 当前结构

后台管理页由 `public/js/render/pages/index.js` 统一组装，具体 Tab 内容拆到 `public/js/render/pages/admin/`。

当前有 6 个 Tab：

| Tab | 渲染文件 | 说明 |
| --- | --- | --- |
| `overview` | `admin/overview.js` | 概览、统计、最近内容、维护提示。 |
| `storage` | `admin/storage.js` | 存储配置、路径管理、回收站策略。 |
| `shares` | `admin/shares.js` | 分享链接列表、筛选、复制、删除、过期分享重新启用。 |
| `logs` | `admin/logs.js` | 操作日志、筛选、日期过滤。 |
| `system` | `admin/system.js` | 健康检查、WebDAV 状态、维护任务、后台任务。 |
| `webhook` | `admin/webhook.js` | 通知页，包含 Webhook 配置、投递记录和通知历史。 |

非独立 Tab 但仍在使用的渲染文件：

| 文件 | 使用方 |
| --- | --- |
| `admin/paths.js` | 被 `storage.js` 引用。 |
| `admin/maintenance.js` | 被 `system.js` 引用。 |
| `admin/share-page.js` | 被 `shares.js` 引用，渲染公开分享页。 |
| `admin/components.js` | 后台页共享 UI 组件工厂。 |
| `admin/utils.js` | 分享状态、筛选、文本安全等工具。 |

WebDAV 连接信息由 `admin/system.js` 渲染，后端入口是 `functions/dav/[[path]].js`。

## 渲染约定

- 每个后台渲染文件导出 `createXxxRenderer(deps)` 工厂函数。
- 渲染函数返回 HTML 字符串，不使用 JSX，也不直接绑定 DOM 事件。
- 页面切换通过 `data-action="set-admin-tab"` 和 `data-tab` 交给事件代理处理。
- `.explorer-card` 由 `public/js/render/pages/index.js` 创建，Tab 文件只负责容器内部内容。

## 事件约定

后台点击事件主要在 `public/js/events/admin-actions.js` 中处理。共享点击事件代理在 `public/js/events/index.js`。

常见后台 action：

| action | 用途 |
| --- | --- |
| `refresh-admin` | 刷新概览。 |
| `refresh-admin-storage-config` | 刷新存储配置。 |
| `refresh-admin-shares` | 刷新分享列表。 |
| `refresh-admin-logs` | 刷新日志。 |
| `refresh-admin-health` | 刷新系统健康状态。 |
| `refresh-admin-quota` | 刷新配额状态。 |
| `refresh-admin-maintenance` | 刷新维护快照。 |
| `refresh-admin-notifications` | 刷新通知历史。 |
| `refresh-admin-webhooks` | 刷新 Webhook 配置。 |
| `refresh-admin-webhook-deliveries` | 刷新 Webhook 投递记录。 |
| `copy-share-link` | 复制分享链接。 |
| `confirm-delete-share` | 打开删除分享确认弹窗。 |
| `confirm-reactivate-share` | 打开过期分享重新启用弹窗。 |
| `confirm-cleanup-expired-shares` | 打开清理过期分享确认弹窗。 |
| `execute-cleanup-expired-shares` | 执行过期分享清理。 |
| `save-storage-alert-thresholds` | 保存容量阈值告警规则。 |
| `save-task-alert-thresholds` | 保存失败任务数量告警规则。 |
| `copy-webdav-url` | 复制 WebDAV 地址。 |
| `retry-task` | 重试失败或部分失败的后台任务。 |
| `confirm-maintenance-action` | 打开维护任务确认弹窗。 |
| `execute-maintenance-action` | 执行维护任务。 |

`data-action2` 用于同一个按钮触发第二个刷新动作。目前注册了：

| action2 | 用途 |
| --- | --- |
| `refresh-admin-health` | 额外刷新健康状态。 |
| `refresh-admin-quota` | 额外刷新配额状态。 |
| `refresh-admin-maintenance` | 额外刷新维护快照。 |

## 已知状态

- `shares.js` 当前已经接收并使用 `isShareActive`，并根据 `targetType` 区分文件和文件夹分享。
- 过期但仍在保留期内的分享会显示“重新启用”操作；重新启用弹窗在 `modal.js`，提交逻辑在 `share.js`。
- 公开分享页渲染逻辑位于 `admin/share-page.js`，支持文件分享、文件夹目录浏览、文件夹 ZIP 下载、加载态、缺失态和密码解锁态。
- 当前没有 `settings.js` facade，后台渲染器由 `public/js/render/pages/index.js` 直接组合。
- 分享列表当前主要是筛选和搜索，没有独立分页 action；如果后续需要分页，再补 `set-shares-page` 事件和状态。
- 通知铃铛当前在全局 header 中渲染，下拉列表用于快速查看未读通知。
- 后台通知 Tab 渲染 Webhook 配置、最近投递和通知历史；通知历史可按级别、已读状态和事件筛选。
- 存储对象引用计数维护入口位于系统 Tab，动作定义在 `admin/utils.js`，执行逻辑在 `functions/api/lib/admin-maintenance.js`。

## 维护建议

- 新增后台 Tab 时，优先新增独立的 `admin/{tab}.js`，再在 `ADMIN_TABS` 和 `renderAdminActiveTab()` 中接入。
- 新增交互时优先复用 `data-action`，不要在 HTML 字符串里写内联事件。
- 跨页面通用 UI helper 放进 `public/js/render/components.js`；只服务后台页的组合控件放进 `admin/components.js`；只服务单个 Tab 的样式和结构留在对应 Tab 文件。
- 修改后台布局时同步检查 `public/css/pages/admin.css` 和构建后的 `public/admin.css`、`public/main.css`。
