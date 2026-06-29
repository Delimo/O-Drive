# O-Drive 功能扩展 Backlog

> 更新时间：2026-06-29。本文只保留仍未完成或仍值得增强的方向；已经落地的规划不在这里继续展开。

## 已完成背景

以下能力已经进入当前代码，不再作为规划项维护：

- 文件和目录分享。
- 小目录流式 ZIP 下载、大目录后台 `zip_download` 任务。
- R2 内容去重、秒传检查、带 `sha256` 的分片上传、引用计数和孤儿对象维护。
- 站内通知、Webhook 配置、Webhook 投递记录、失败重试、容量阈值告警和失败任务数量告警。

## 推荐优先级

1. 回收站冲突处理和批量体验。
2. 搜索能力增强，尤其是内容检索。
3. 通知筛选和告警规则抽象。
4. 后台 ZIP 结果清理和失败任务重试。

## 回收站增强

当前已经支持删除进入回收站、恢复、永久删除、清空、保留天数清理，以及按路径、类型、删除时间筛选。

建议增强：

- 恢复时遇到同名冲突，允许选择跳过、覆盖或自动重命名。
- 支持批量恢复前预估冲突数量。
- 回收站列表增加更明确的批量操作反馈。
- 管理后台展示预计可清理容量。

涉及模块：

- `functions/api/lib/trash.js`
- `public/js/state/thunks/explorer.js`
- `public/js/render/home.js`
- `public/js/render/modal.js`

## 搜索增强

当前已经支持 D1 `file_index` 元数据索引、名称搜索、scope 范围搜索、类型/大小/修改时间过滤和游标分页。

建议增强：

- 增加全文索引表或外部全文检索方案。
- 支持文本、Markdown、代码文件内容检索。
- 搜索结果展示命中原因，例如文件名、路径或内容命中。
- 管理后台增加索引健康状态和重建入口。

涉及模块：

- `functions/api/lib/file-index/search.js`
- `functions/api/lib/file-index/sync.js`
- `public/js/api/index.js`
- `public/js/state/thunks/explorer.js`

## 通知与告警增强

当前通知中心位于全局 header，后台 Webhooks Tab 负责外部投递配置。

建议增强：

- 增加下载异常频率等剩余可配置告警规则。
- 抽出通用告警规则 helper，统一阈值判断、冷却和通知写入。
- 通知增加 severity：`info`、`warning`、`error`。
- 管理后台支持按事件类型和严重程度筛选通知历史。

涉及模块：

- `functions/api/lib/notifications.js`
- `functions/api/lib/webhooks.js`
- `functions/api/lib/admin-stats.js`
- `public/js/state/thunks/admin.js`
- `public/index.js`

## 后台任务与 ZIP 结果

当前大目录 ZIP 可以后台化，任务完成后写入通知并提供下载结果。

建议增强：

- 增加失败任务重试入口。
- 对超大目录增加最大文件数、最大总大小等硬限制。
- 对 `.system/zip-tasks/...` 结果增加自动清理策略。
- 在系统 Tab 展示 ZIP 结果占用和清理入口。

涉及模块：

- `functions/api/lib/tasks.js`
- `functions/api/lib/zip-download.js`
- `functions/api/lib/admin-maintenance.js`
- `public/js/render/pages/admin/system.js`

## 工程建议

- 新能力优先复用现有 `tasks`、`notifications`、`share_links`、`trash`、`file_index` 和 `storage_objects`。
- 涉及目录递归的能力必须补测试，尤其是大目录、空目录、隐藏路径、受保护路径和 `file_index.object_key !== path` 的场景。
- 搜索先继续强化元数据检索，再单独规划全文索引。
- 规划文档落地后及时删除，避免把已完成内容误当待办。
