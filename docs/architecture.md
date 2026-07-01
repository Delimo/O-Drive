# O-Drive 架构约定

> 本文档合并前端分层、视觉系统和 API 路由约定，只保留长期维护需要的工程规则。

## 技术栈

O-Drive 当前不是 React 项目，也没有使用 Create React App、Ant Design 或 Redux Toolkit。

当前前端采用：

- 原生 ES Module。
- 字符串模板渲染 HTML。
- 自研轻量 store、slice 和 thunk。
- 基于 `data-action` 的事件委托。
- Tailwind/CSS 源文件构建到 `public/main.css` 和页面级 CSS。
- Cloudflare Pages 静态资源 + Pages Functions。

除非单独规划完整迁移，否则新功能应继续沿用当前架构，不要局部混入 React。

## 前端分层

`public/index.js` 是前端聚合入口，负责装配 store、API、services、thunks、renderers 和全局事件。不要把大量业务逻辑继续塞回入口文件。

常见功能落点：

| 需求 | 推荐位置 |
| --- | --- |
| 新增浏览器侧 API 请求 | `public/js/api/index.js` |
| 新增状态字段和同步 action | `public/js/state/slices/*` |
| 新增异步流程 | `public/js/state/thunks/*` |
| 新增页面 HTML | `public/js/render/*` |
| 新增可复用 UI 片段 | `public/js/render/components.js` |
| 新增点击、输入、表单交互 | `public/js/events/*` |
| 上传、预览等可复用业务流程 | `public/js/services/*` |
| 路径、格式化、文本工具 | `public/js/utils/*` |

渲染层只根据 state 输出 HTML，不直接请求接口，不直接修改全局状态，不绑定 DOM 事件。

事件层只做交互分发，复杂流程交给 thunk。

API 请求集中在 API layer，不要在渲染层或事件层散写 `fetch`。

异步流程中的标准 API 错误判断优先复用 `public/js/state/thunks/errors.js` 的 `assertApiOk()`；需要保留部分完成语义或业务失败详情时使用 helper 选项，不要在各个 thunk 中重复散写分支。

## 新功能接入顺序

1. 在 API layer 增加接口封装。
2. 在 slice 中补状态字段和同步 action。
3. 在 thunk 中组织异步流程。
4. 在 render 中输出 UI。
5. 在 events 中接入交互。
6. 补核心测试；涉及页面流程时再补浏览器测试。

## 事件约定

交互优先使用已有属性模式：

- `data-action`
- `data-action-input`
- `data-action-change`
- `data-form`
- `data-binding`

不要在 HTML 字符串里写 `onclick`，也不要在 render 函数里直接绑定 DOM 事件。

## 样式约定

页面实际引用公共 `public/main.css`，并按入口额外引用页面级 CSS：

- 首页：`public/explorer.css`
- 后台：`public/admin.css`
- 分享页：`public/share.css`

源样式位于：

- `public/style.css`
- `public/style.explorer.css`
- `public/style.admin.css`
- `public/style.share.css`
- `public/css/tokens.css`
- `public/css/base.css`
- `public/css/responsive.css`
- `public/css/components/*`
- `public/css/pages/*`

修改源 CSS 后运行构建生成公共和页面级 CSS 产物。

样式优先使用 `public/css/tokens.css` 中的变量：

- 背景：`--bg`、`--panel`、`--panel-soft`、`--panel-strong`
- 边框：`--line`、`--line-strong`、`--border`
- 文本：`--text`、`--muted`
- 品牌色：`--primary`、`--accent`、`--accent-strong`、`--accent-soft`
- 状态色：`--success`、`--warning`、`--danger`
- 圆角：`--radius-xl`、`--radius-lg`、`--radius-md`、`--radius-sm`
- 阴影：`--shadow`

页面级样式放在 `public/css/pages/*`：

| 页面 | 文件 |
| --- | --- |
| 首页文件浏览 | `public/css/pages/explorer.css` |
| 管理后台 | `public/css/pages/admin.css` |
| 分享页 | `public/css/pages/share.css` |

新增 UI 前先判断能否复用 `.btn`、`.mini-stat`、`.detail-card`、`.data-table-compact` 等现有组件。不要为了单个按钮新增全局按钮类。

HTML 字符串中的常见空状态、详情行和表单反馈优先复用 `public/js/render/components.js`。只服务后台页的组合控件仍放在 `public/js/render/pages/admin/components.js`。

## 后端 API 路由

Cloudflare Pages Functions 的主 API 入口是：

- `functions/api/[[path]].js`

它负责全局横切逻辑：

- 初始化核心表。
- 全局限流。
- 登录、登出、分享公开访问。
- 鉴权和 CSRF 校验。
- 隐藏路径、受保护路径校验。
- 调用路由分发器。

路由分发器是：

- `functions/api/lib/router.js`

业务逻辑放在 `functions/api/lib/*` 对应模块中。不要为了形式拆文件，只有当某类路由继续增长，或一个文件里明显混入多个业务域时，再按业务域拆到 `routes/*-routes.js`。

优先业务域：

- `files`
- `admin`
- `shares`
- `trash`
- `tasks`
- `notifications`
- `maintenance`
- `webhooks`

新增 API 时按顺序判断：

1. 是否已有业务模块可以承载 handler。
2. 是否需要 admin 权限。
3. 是否需要 CSRF。
4. 是否需要路径权限校验。
5. 是否需要 Webhook 或通知。
6. 是否需要写操作日志。
7. 是否需要任务化执行。

## 维护原则

- `public/index.js` 保持入口和依赖装配职责。
- `functions/api/[[path]].js` 保持鉴权、限流、CSRF、路径权限等横切职责。
- 业务逻辑靠近对应业务模块。
- 写操作相关的 Webhook 和通知应靠近业务 handler 或 route wrapper。
- 修改源 CSS 后同步构建 `public/main.css` 和页面级 CSS。
- 新代码要兼容 home、admin、share 三类页面入口差异。
- 架构边界、后台 Tab 接线和 CSS 构建脚本约束由 `tests/architecture.test.mjs` 守护。
- thunk 错误状态和 toast 输出由 `tests/thunks.test.mjs` 补充覆盖。
