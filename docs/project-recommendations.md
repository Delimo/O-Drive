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

