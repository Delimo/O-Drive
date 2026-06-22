# Changelog

## 2026-06-07

### Added

- 新增公开文件分享功能，管理员可为单个文件创建分享链接。
- 分享链接支持设置有效期、最大下载次数、是否允许在线预览和是否允许下载。
- 新增公开分享页 `/share.html?token=...`，提供文件信息、下载入口和在线预览。
- 管理后台新增“分享链接”页，可查看、复制、删除和手动清理分享记录。
- 新增 Webhook 最近发送记录，后台可查看事件、目标、HTTP 状态、耗时和成功/失败状态。
- 操作日志新增筛选能力，支持关键词、动作、IP 和日期范围。
- Webhook `text` / `markdown` 消息改为面向普通用户的中文事件描述，并使用中国时间展示。
- 新增分享链接、日志筛选、Webhook 发送记录和过期分享保留期相关测试。

### Changed

- 分享链接过期后立即停止访问，但记录会保留 7 天；7 天内可手动删除，超过 7 天后自动清理。
- 达到最大下载次数的分享会立即失效并清理。
- 分享记录只保存 D1 元数据，不复制 R2 文件，删除分享不会留下额外文件副本。
- 管理端分享页、公开分享页和 Webhook 发送记录区域补齐响应式 UI，统一为 O-Drive 现有浅色卡片风格。
- Webhook 文本消息不再显示 `file.deleted`、`webhook.test` 等内部事件名；JSON 格式仍保留机器可读事件字段。
- 管理后台日志动作补充分享相关中文标签。
- 公开分享 API 在登录校验前处理，分享访问不需要登录。
- 上传冲突选择 `skip` 时，不再因为剩余配额不足而错误拒绝跳过。
- 重命名缺失源文件时返回 404，避免误报成功。

### Verified

- `node --check functions/api/lib/shares.js` 通过。
- `node --check functions/api/lib/webhooks.js` 通过。
- `node --check functions/api/lib/admin.js` 通过。
- `node --check functions/api/lib/router.js` 通过。
- `node --check public/js/share-app.js` 通过。
- `node --check public/js/admin-actions.js` 通过。
- `node --test tests/*.test.mjs` 通过，59 个测试全绿。
- 使用本地 mock 服务检查公开分享页、管理端分享页和 Webhook 页面在桌面与移动视口下无横向溢出、无控制台错误。

## 2026-06-06

### Added

- Webhook 通知页面改为“发送设置”表单，支持配置 `url`、`method`、`content_type`、`headers`、`body`、名称和消息格式。
- Webhook 发送逻辑支持自定义 HTTP 方法、自定义请求头和自定义请求体模板。
- Webhook 支持按事件选择触发范围，可单独订阅上传、删除、彻底删除、移动、复制、重命名和新建文件夹。
- Webhook 列表支持编辑已有配置；同一 URL 再保存时会更新原配置，避免重复添加。
- 新增 Webhook 自定义请求设置测试，覆盖 method、content type、headers 和 body 模板。
- 新增 Webhook 事件订阅过滤测试，确认未订阅事件不会发送通知。
- README 重写为完整中文文档，补充 Cloudflare Pages 部署教程、环境变量说明、功能教程、运维建议和常见问题。

### Changed

- Webhook 默认配置仍兼容后台保存过的旧 `{ url, msgtype }` 数据结构；通知入口统一改为后台 Webhook 页面配置，不再读取旧环境变量。
- Webhook `headers` 会按 JSON 对象保存和发送，非法 header 名会被过滤。
- Webhook 自定义 `body` 支持 `{event}`、`{timestamp}`、`{{data.path}}` 等简单模板变量。
- 管理后台 Webhook 页面布局调整为更清晰的发送设置面板，并适配移动端。
- 管理后台概览新增文件索引状态提示，可直接从概览触发重建索引。
- 操作日志补充配额、Webhook、隐藏路径、访问密码和维护操作记录，并完善日志动作中文标签。
- 维护、删除保护、取消隐藏、删除 Webhook 和保存配额等关键操作增加确认提示。
- 移动端上传进度面板在小屏上改为底部面板布局。

### Verified

- `node --check functions/api/lib/webhooks.js` 通过。
- `node --check functions/api/lib/admin.js` 通过。
- `node --check functions/api/lib/protected-paths.js` 通过。
- `node --check public/js/admin-actions.js` 通过。
- `node --check public/js/admin-app.js` 通过。
- `node --check public/js/app.js` 通过。
- `node --check public/js/uploader.js` 通过。
- `node --test tests/*.test.mjs` 通过，44 个测试全绿。

## 2026-05-12

### Added

- 支持选择文件夹上传，并在 R2 中保留原始目录结构。
- 回收站新增筛选能力：按路径/名称、类型和删除日期范围筛选。
- 管理后台新增“维护工具”页面，可查看索引、回收站、日志、访问失败记录和缩略图缓存状态。
- 维护工具支持重建文件索引、清理访问失败记录、清理缩略图缓存。
- 补充维护工具、回收站筛选和文件夹上传目标路径相关测试。

### Changed

- README 改为正常 UTF-8 中文，并补充文件夹上传、回收站筛选和维护工具说明。
- 回收站列表接口 `/api/trash` 支持筛选参数，并返回筛选后的总数。

### Verified

- `node --test tests/*.test.mjs` 通过，33 个测试全绿。
- 所有 `.js` / `.mjs` 文件通过 `node --check`。

## 2026-05-11

### Added

- 本地 Markdown 渲染模块，移除外部 CDN 依赖。
- D1 文件索引，用于加速搜索和后台统计。
- 受保护路径密码错误次数限制。
- PBKDF2 存储新的受保护路径密码，并兼容旧密码记录。
- 路由级登录、上传、列表、搜索烟测。

### Changed

- 收紧 CSP，移除外部脚本源。
- 强化 Markdown HTML 清洗白名单。
- 拆分前端文件类型、消息提示和后端 R2 树操作模块。
- README 修复为 UTF-8 中文。

## 2026-05-10

### Added

- 图片缩略图接口，列表中的图片文件可显示真实缩略图，并使用 Cloudflare 缓存。
- 管理员上传队列：小文件直传，大文件自动分片上传，支持并发、暂停、继续、取消和失败重试。
- 回收站：删除会先进入回收站，支持恢复和彻底删除。
- 搜索、筛选与文件详情面板，便于快速定位和查看文件信息。
- 批量选择体验优化，筛选后全选只作用于当前可见项。
- 最小回归测试，覆盖列表、权限、预览、上传和回收站流程。

### Changed

- 前端页面拆分为独立模块，减少 `index.html` 和 `admin.html` 的体积。
- 后端 Functions 拆分为多个模块，降低单文件维护成本。
- 新增文件路径、列表视图、请求上下文等公共模块。
- 为预览和下载补充 `Range` 支持，适合大文件和媒体文件。
- 上传仍写入当前目录，不引入多用户专属上传路径。
- 补充 Cloudflare Pages 部署说明和上传说明。
