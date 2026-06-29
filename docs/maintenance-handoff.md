# O-Drive 维护交接

> 更新时间：2026-06-29。本文是接手入口，只记录当前代码库的实际状态。

## 项目现状

O-Drive 是运行在 Cloudflare Pages 上的轻量云盘，不是 React、Create React App、Ant Design 或 Redux Toolkit 项目。

当前栈：

- 前端：原生 ES Module、字符串模板渲染、自研 store/slice/thunk。
- 样式：Tailwind 输入文件 `public/style.css`，源 CSS 位于 `public/css/`，构建产物是 `public/main.css`。
- 后端：Cloudflare Pages Functions，主入口 `functions/api/[[path]].js`。
- 存储：Cloudflare R2 保存对象，D1 保存配置、日志、索引、分享、任务、通知和存储对象引用。
- 测试：Node test runner 和 Playwright。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run build` | 构建 CSS，并检查 `public/index.js` 语法。 |
| `npm run lint` | 检查 JavaScript 语法。 |
| `npm test` | 运行核心 Node 测试。 |
| `npm run test:browser` | 运行 Playwright 浏览器测试。 |
| `npm run check` | 运行 lint、核心测试和 build。 |
| `npm run dev` | 本地启动 Wrangler Pages dev。 |

## 入口地图

| 区域 | 文件 |
| --- | --- |
| 前端总入口 | `public/index.js` |
| 首页 HTML | `public/index.html` |
| 管理页 HTML | `public/admin.html` |
| 分享页 HTML | `public/share.html` |
| 前端 API 封装 | `public/js/api/index.js` |
| 状态入口 | `public/js/state/index.js` |
| thunk 入口 | `public/js/state/thunks/index.js` |
| 事件入口 | `public/js/events/index.js` |
| 后端 API 入口 | `functions/api/[[path]].js` |
| API 路由分发 | `functions/api/lib/router.js` |
| WebDAV 入口 | `functions/dav/[[path]].js` |

## 近期已落地能力

- R2 内容去重已经实现，不再保留单独方案文档。相关代码在 `functions/api/lib/storage-objects.js`、`functions/api/lib/file-mutations/upload.js`、`functions/api/lib/file-mutations/upload-check.js` 和 `functions/api/lib/file-mutations/multipart.js`。
- `storage_objects` 表已由 `migrations/0007_add_storage_objects.sql` 和 `functions/api/lib/schema.js` 管理。
- 普通上传、秒传检查、带 `sha256` 的分片上传、删除、回收站和维护任务已有测试覆盖。
- 管理后台当前有 6 个 Tab：概览、存储、分享、日志、系统、Webhooks。WebDAV 位于系统 Tab 中，不是独立 Tab。
- 通知中心位于全局 header，下拉列表通过 `notificationApi` 和 `navigation-actions.js` 维护。

## 后续维护提示

- 修改前端功能时按 `api -> slice -> thunk -> render -> events` 的顺序接入。
- 修改样式源文件后运行 `npm run build`，不要只改 `public/main.css`。
- 涉及 R2 真实对象、回收站、ZIP、WebDAV 或分享下载时，必须确认读取链路使用 `file_index.object_key`，不要假设用户路径就是 R2 key。
- 涉及 D1 schema 时同步检查 `migrations/`、`functions/api/lib/schema.js` 和测试 helper。
- 已完成的规划不要长期留在 `docs/`；把仍有维护价值的结论合并到本文或对应说明文档。
