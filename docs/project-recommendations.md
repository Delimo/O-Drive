# O-Drive 项目建议

本文记录当前项目的维护建议，作为后续开发、重构和验收的参考。

## 当前判断

O-Drive 当前不是 React 项目，也没有使用 Create React App、Ant Design 或 Redux Toolkit。

现有前端采用：

- 原生 ES Module
- 字符串模板渲染 HTML
- 自研 store、slice 和 thunk
- 基于 `data-action`、`data-form`、`data-binding` 的事件委托
- Tailwind/CSS 源文件构建到 `public/main.css`、`public/explorer.css`、`public/admin.css` 和 `public/share.css`
- Cloudflare Pages 静态资源和 Pages Functions 后端接口

除非单独规划完整迁移，否则不建议局部引入 React、Ant Design 或 Redux Toolkit。

## 优先建议

### 1. 修复文档编码

README 和部分 docs 文件在当前环境中出现乱码。建议统一确认并保存为 UTF-8，避免后续维护者误读部署说明、架构约定和功能说明。

### 2. 保持入口文件职责清晰

`public/index.js` 应继续只负责装配：

- store 和 actions
- API layer
- services
- thunks
- renderers
- 全局事件注册
- 按页面类型渲染 home、admin 或 share

新业务逻辑不要继续塞回入口文件。

### 3. 继续沿用现有分层

新增功能建议按以下位置落点：

| 需求 | 建议位置 |
| --- | --- |
| 浏览器侧 API 请求 | `public/js/api/index.js` |
| 同步状态和 action | `public/js/state/slices/*` |
| 异步流程和跨 slice 编排 | `public/js/state/thunks/*` |
| 页面 HTML 输出 | `public/js/render/*` |
| 点击、输入、表单事件 | `public/js/events/*` |
| 上传、预览等可复用流程 | `public/js/services/*` |
| 路径、格式化、文本工具 | `public/js/utils/*` |

### 4. 沉淀通用 UI 渲染函数

当前 render 层已经有不少重复 HTML 结构。建议继续沉淀通用组件函数，例如：

- 数据表格
- 状态标签
- 空状态
- 工具栏
- 表单行
- 筛选器
- 加载状态

这样可以减少后台页面和分享页面里的重复模板。

### 5. 样式只改源文件

不要直接修改构建产物：

- `public/main.css`
- `public/explorer.css`
- `public/admin.css`
- `public/share.css`

应修改源文件：

- `public/style.css`
- `public/style.explorer.css`
- `public/style.admin.css`
- `public/style.share.css`
- `public/css/**`

修改后运行 `npm run build` 生成最终 CSS。

### 6. 强化测试覆盖

当前 `tests/frontend.test.mjs` 已覆盖部分工具函数和渲染函数。建议继续补充：

- 分享页不同状态渲染
- 后台 Tab 渲染
- 上传队列状态
- 权限状态
- API 错误提示
- 空状态和加载状态

涉及后端行为时优先补 `tests/core.test.mjs`，涉及页面流程时再补 Playwright 测试。

### 7. 统一 API 错误处理

建议继续收敛错误结构和错误展示逻辑：

- 统一 response code 处理
- 统一 `humanError` 文案
- 统一 toast 展示
- thunk 内减少重复判断

这样可以降低后续功能的错误处理分叉。

### 8. 后台页面继续模块化

后台页面已经按 Tab 拆分。后续新增访问控制、审计、配额、任务、通知等能力时，应继续放在 `public/js/render/pages/admin/*`、`public/js/state/thunks/admin.js` 和 `public/js/events/admin-actions.js` 等对应层级里。

### 9. 保护当前工作区改动

当前工作区已有未提交改动。后续开发前建议确认这些改动是否需要保留，避免误覆盖用户已有工作。

## 短期执行清单

1. 确认并修复文档编码。
2. 检查当前未提交变更是否符合预期。
3. 跑 `npm test`。
4. 跑 `npm run build`。
5. 根据测试结果修复现有问题。
6. 再进入新功能开发。

## 功能增强建议

### 1. 到期分享重新启用

当前项目已经有“过期分享保留 7 天，超过后自动清理”的机制。可以在后台分享列表中，为“已过期但尚未清理”的分享链接增加“重新启用”操作。

实施状态：已完成。

已实现能力：

- 后台分享列表会为仍在 7 天保留期内的过期分享显示“重新启用”按钮。
- 管理员可以选择新的有效期天数，`0` 表示长期有效。
- 重新启用时保留原 token、路径、密码、预览权限、下载权限和下载计数。
- 重新启用时重置 `expired_notified_at`，确保后续再次过期仍可触发通知。
- 重新启用前会确认原文件或文件夹仍然存在。
- 已补充核心测试和前端渲染测试。

建议行为：

- 保留原 token，不生成新链接。
- 保留原路径、密码、预览权限、下载权限和最大下载次数设置。
- 允许管理员选择新的有效期，例如 7 天、30 天或长期有效。
- 更新 `expires_at` 为新的到期时间。
- 重置 `expired_notified_at`，确保下次再次过期时还能正常触发通知。
- 可选：是否重置 `download_count` 需要谨慎决定，默认建议不重置，避免绕过原来的下载次数限制。

实现位置建议：

- 后端：`functions/api/lib/shares.js`
- 前端 API：`public/js/api/index.js`
- 异步流程：`public/js/state/thunks/share.js`
- 后台分享列表：`public/js/render/pages/admin/shares.js`
- 后台事件：`public/js/events/admin-actions.js`
- 测试：`tests/core.test.mjs`、`tests/frontend.test.mjs`

### 2. 文件夹详情

当前文件有详情面板，文件夹也可以补充更有价值的信息。文件夹详情建议展示：

- 子文件夹数量
- 文件数量
- 总大小
- 最近更新时间
- 当前路径
- 快捷操作：打开、分享、重命名、删除

注意点：

- 文件夹统计不建议只依赖当前页面列表推断，因为分页、搜索、隐藏路径、索引和 R2 实际对象可能导致统计不准。
- 更稳妥的方式是增加一个文件夹统计接口，由后端基于文件索引和存储列表计算。
- 统计接口需要尊重隐藏路径、保留系统路径和权限规则。

实现位置建议：

- 后端统计：`functions/api/lib/file-reads.js` 或独立文件夹统计模块
- 路由分发：`functions/api/lib/router.js`
- 前端 API：`public/js/api/index.js`
- 状态字段：`public/js/state/slices/explorer-slice.js`
- 加载流程：`public/js/state/thunks/explorer.js`
- 详情渲染：`public/js/render/shared.js`
- 测试：`tests/core.test.mjs`、`tests/frontend.test.mjs`

### 3. 文件夹分享入口

项目后端已经具备文件夹分享能力，分享表包含 `target_type`，公共分享页也已经支持文件夹浏览、子文件下载和文件夹 ZIP 下载。当前更需要补齐前端入口和体验。

建议行为：

- 文件夹详情面板显示“分享”按钮。
- 文件夹卡片或列表操作区显示分享入口。
- 分享弹窗根据目标类型显示“分享文件”或“分享文件夹”。
- 后台分享列表继续区分“文件”和“文件夹”。
- 文件夹分享页保留目录浏览，并允许下载整个文件夹 ZIP。

实现位置建议：

- 入口按钮：`public/js/render/shared.js`
- 分享弹窗文案：`public/js/render/modal.js`
- 分享创建流程：`public/js/state/thunks/share.js`
- 事件处理：`public/js/events/file-actions.js`
- 测试：`tests/frontend.test.mjs`、`tests/core.test.mjs`

### 推荐实现顺序

1. 文件夹分享入口。
2. 到期分享重新启用。
3. 文件夹详情统计。

前两个功能主要是补齐已有能力的管理入口和交互，改动相对可控；文件夹详情统计涉及后端统计接口，建议单独实现和验证。
