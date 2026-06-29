# 前端维护说明

> 本文档记录 O-Drive 当前前端实现方式和常见功能落点。项目不是 React 应用，前端维护应继续沿用原生 ES Module、字符串模板渲染、自研 store/slice/thunk 和事件委托。

## 入口与启动

三个页面都加载同一个运行时入口：

| 页面 | HTML | `body[data-page]` |
| --- | --- | --- |
| 首页文件管理 | `public/index.html` | `home` |
| 管理后台 | `public/admin.html` | `admin` |
| 分享页 | `public/share.html` | `share` |

运行时入口是 `public/index.js`。它负责：

- 创建 `store` 和 `actions`。
- 创建 API layer、services、thunks、renderers。
- 注册全局事件委托。
- 根据 `page` 渲染首页、后台或分享页。
- 维护 header、modal、toast、uploads 等全局区域。

不要把新业务逻辑直接塞进 `public/index.js`；入口只做装配和跨区域协调。

## 目录分层

| 目录 | 职责 |
| --- | --- |
| `public/js/api/index.js` | 浏览器侧 API 封装，统一处理 JSON、CSRF、上传 URL、下载 URL。 |
| `public/js/state/` | 自研 store、slice、selector 和 thunk。 |
| `public/js/state/slices/` | 同步状态和 action。 |
| `public/js/state/thunks/` | 异步流程、接口调用、跨 slice 编排。 |
| `public/js/render/` | HTML 字符串渲染。 |
| `public/js/events/` | `data-action`、表单、输入、change 等事件委托。 |
| `public/js/services/` | 上传、预览等可复用业务服务。 |
| `public/js/utils/` | 路径、格式化、文本、安全判断等工具。 |
| `public/js/mock/` | `?mock=1` 设计预览和前端测试数据。 |
| `public/js/ui/` | 图标和 UI 常量。 |

## 状态模型

前端状态由 `createRootStore()` 组装，当前主要 slice：

| slice | 文件 | 用途 |
| --- | --- | --- |
| `app` | `public/js/state/slices/app-slice.js` | 页面、角色、CSRF、弹窗、toast、全局启动状态。 |
| `explorer` | `public/js/state/slices/explorer-slice.js` | 当前路径、搜索、筛选、文件列表、回收站、选择、剪贴板。 |
| `admin` | `public/js/state/slices/admin-slice.js` | 后台 Tab、统计、日志、分享、存储、系统、任务、通知。 |
| `share` | `public/js/state/slices/share-slice.js` | 分享页信息、密码状态、目录浏览。 |
| `uploads` | `public/js/state/slices/uploads-slice.js` | 上传队列、进度、暂停、失败、冲突策略。 |

同步状态只放 reducer；异步逻辑放 thunk。thunk 可以调用 API、dispatch 多个 action、打开弹窗、显示 toast。

## 渲染约定

渲染层只读 state 并返回 HTML 字符串：

- 首页：`public/js/render/home.js`
- 后台页：`public/js/render/pages/index.js`
- 后台 Tab：`public/js/render/pages/admin/*`
- 分享页：`public/js/render/pages/admin/shares.js` 中的 `renderSharePage`
- 弹窗：`public/js/render/modal.js`
- 通用文件卡片、面包屑、空状态：`public/js/render/shared.js`
- 上传面板：`public/js/render/uploads.js`

渲染函数不要直接 `fetch`，不要直接修改 state，也不要绑定 DOM 事件。交互通过 `data-action`、`data-form`、`data-binding`、`data-action-change` 等属性交给事件层。

## 事件约定

总入口是 `public/js/events/index.js`，它把事件分发到：

| 文件 | 负责 |
| --- | --- |
| `file-actions.js` | 文件打开、预览、下载、分享、批量操作、回收站操作。 |
| `upload-actions.js` | 上传队列、暂停、恢复、取消、重试。 |
| `navigation-actions.js` | 路径导航、主题、通知铃铛、header 操作。 |
| `admin-actions.js` | 后台 Tab、日志、分享、通知、任务、维护指令。 |
| `ui-actions.js` | 输入、change、表单提交、快捷键、编辑器保存。 |

新增按钮优先使用 `data-action`。新增表单优先使用 `data-form`。输入类控件如果需要实时写状态，使用 `data-action-input` 或 `data-action-change`。

## 常见功能接入流程

### 新增一个浏览器侧接口

1. 在 `public/js/api/index.js` 的对应 API 对象里封装请求。
2. 如果需要新状态，在对应 slice 增加字段和 reducer。
3. 在 `public/js/state/thunks/*` 中组织请求、错误处理和 toast。
4. 在 render 文件输出 UI。
5. 在 events 文件接入 `data-action` 或表单。
6. 补 `tests/frontend.test.mjs` 或核心测试。

### 新增后台 Tab

1. 在 `public/js/render/pages/admin/{tab}.js` 新建渲染器。
2. 在 `public/js/render/pages/index.js` 引入并加入 `ADMIN_TABS`。
3. 在 `renderAdminActiveTab()` 中分发。
4. 在 `public/js/state/thunks/admin.js` 的 `loadTabData()` 中按需加载数据。
5. 在 `public/js/events/admin-actions.js` 接入交互。

### 新增首页文件功能

1. API 封装放 `fileApi`、`trashApi` 或 `shareApi`。
2. 状态字段放 `explorer-slice.js`。
3. 异步流程放 `explorer.js`、`maintenance.js` 或 `share.js`。
4. UI 放 `home.js`、`shared.js` 或 `modal.js`。
5. 点击事件放 `file-actions.js`，输入/表单放 `ui-actions.js`。

## 当前关键工作流

### 目录浏览与搜索

- `loadExplorer()` 决定走目录、回收站或搜索。
- 普通目录调用 `fileApi.list()`。
- 搜索调用 `fileApi.search()`，支持名称、路径、元数据筛选和小型文本内容命中。
- 搜索结果的命中原因在 `item.searchHit`，由 `shared.js` 渲染到文件卡片。
- 加载更多搜索结果走 `loadMoreSearchResults()`。

### 文件预览与文本编辑

- 打开预览走 `previewEntry()`。
- `services/index.js` 的 `previewService` 判断内容模式并创建 modal。
- 文本预览通过 `fileApi.previewText()` 读取。
- 管理员编辑文本后走 `savePreviewText()` 和 `/api/save-text/...`。

### 上传

- 文件选择由 `events/index.js` 监听 `#upload-input` 和 `#folder-upload-input`。
- 上传确认弹窗在 `modal.js`。
- 上传队列逻辑在 `state/thunks/upload.js`。
- 普通上传走 `fileApi.uploadWithProgress()`。
- 大文件走 `uploadService.multipartUpload()`。
- 上传前会计算 `sha256` 并调用 `fileApi.uploadCheck()`，支持秒传和分片去重。
- 上传冲突策略由 `uploads.conflictMode` 和弹窗内 `conflictMode` 控制。

### 通知

- header 通知铃铛由 `public/index.js` 渲染。
- 通知列表通过 `notificationApi.list()` 加载。
- 通知支持 `severity: info | warning | error`。
- 后台通知 Tab 中的通知历史支持按级别、已读状态和事件筛选。
- Webhook 是通知 Tab 里的外部投递通道，最近投递记录与通知历史并列展示。
- 新通知提醒音和浏览器通知在 `state/thunks/admin.js`。

### 后台任务

- 后台任务 API 是 `taskApi`。
- 系统 Tab 渲染任务列表、进度、ZIP 下载结果和重试按钮。
- 失败或部分失败的非上传任务可通过 `retryTask()` 重试。
- 上传任务由浏览器侧上传队列重试，不走后台任务重试。

## 样式与构建

源 CSS 位于：

- `public/style.css`
- `public/style.explorer.css`
- `public/style.admin.css`
- `public/style.share.css`
- `public/css/tokens.css`
- `public/css/base.css`
- `public/css/components/*`
- `public/css/pages/*`
- `public/css/responsive.css`

HTML 实际引用公共 `public/main.css`，并按页面引用 `public/explorer.css`、`public/admin.css` 或 `public/share.css`。修改源 CSS 后必须运行：

```bash
npm run build
```

新增后台样式优先放 `public/css/pages/admin.css`，新增首页样式优先放 `public/css/pages/explorer.css`。通用按钮、表单、卡片、弹窗样式放 `public/css/components/*`。

## 测试建议

| 改动 | 推荐测试 |
| --- | --- |
| 工具函数、渲染输出、状态选择器 | `tests/frontend.test.mjs` |
| API 行为、D1/R2 逻辑、任务、通知 | `tests/core.test.mjs` |
| 页面流程 | `tests/browser/*.spec.mjs` |
| 样式或入口构建 | `npm run build` |

常用验证：

```bash
npm test
npm run build
npm run lint
```

## 注意事项

- 不要局部引入 React、Ant Design 或 Redux Toolkit。
- 不要在 HTML 字符串中写内联 `onclick`。
- 不要在 render 层直接请求接口。
- 不要只改 `public/main.css` 或页面级 CSS 产物；它们都会被构建覆盖。
- 新状态要兼容 home、admin、share 三种页面入口。
- 涉及文件读取时不要假设用户路径就是 R2 key，应尊重后端 `file_index.object_key` 模型。
