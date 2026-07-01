# O-Drive 大文件优化方案

> 本文记录当前代码库中偏大的核心文件、拆分风险和推荐优化路线。目标是降低后续维护成本，同时保持现有原生 ES Module、自研 store/slice/thunk、Cloudflare Pages Functions 架构不变。

## 背景

当前项目整体分层清晰，测试覆盖也比较扎实，但部分文件已经承担了过多职责。它们短期内还能工作，长期看会带来几个问题：

- 新功能容易继续堆到同一个文件里，形成维护惯性。
- 修改一个小功能时需要阅读大量无关代码，定位成本变高。
- 合并冲突概率上升，尤其是 modal、后台 thunk、回收站和分享功能。
- 测试失败时不容易快速判断问题属于渲染、状态编排还是后端业务逻辑。

本优化不建议引入 React、Ant Design 或 Redux Toolkit，也不建议为了拆分而重构行为。更稳妥的路线是保持现有架构，按业务域逐步拆小。

## 当前重点文件

| 文件 | 当前规模 | 主要职责 | 风险 |
| --- | ---: | --- | --- |
| `public/js/render/modal.js` | 738 行 | 登录、上传确认、分享、预览编辑、删除确认、恢复冲突、维护确认等弹窗渲染 | 弹窗类型继续增加后，条件分支和模板字符串会越来越难维护 |
| `public/js/state/thunks/admin.js` | 825 行 | 后台统计、日志、存储、分享、通知、Webhook、维护任务等异步流程 | 后台 Tab 的异步流程交织，容易出现跨功能副作用 |
| `functions/api/lib/trash.js` | 809 行 | 回收站列表、恢复、批量恢复、彻底删除、清空、保留期和清理 | 文件操作和数据库状态同步复杂，单文件阅读压力大 |
| `functions/api/lib/shares.js` | 770 行 | 管理员分享、公开分享访问、密码校验、过期清理、重新启用 | 公共访问和管理端写操作混在一起，安全边界需要更清晰 |

## 优化原则

1. 保持外部 API 和导出函数兼容。
2. 每次只拆一个业务域，避免同时移动多个高风险文件。
3. 优先抽出纯 helper 和独立渲染函数，再移动有副作用的流程。
4. 拆分后立即运行相关测试，再运行完整 `npm test`。
5. 不做纯机械拆分。每次拆分都应该让文件职责更清楚。
6. 对前端保持现有 `api -> slice -> thunk -> render -> events` 接入顺序。
7. 对后端保持 `functions/api/[[path]].js` 负责横切逻辑，业务模块负责具体行为。

## 推荐拆分顺序

### 第一阶段：拆 `modal.js`

推荐先处理 `public/js/render/modal.js`，因为它主要是渲染逻辑，副作用少，拆分风险相对较低。

建议结构：

```text
public/js/render/modal.js
public/js/render/modals/index.js
public/js/render/modals/select.js
public/js/render/modals/file-modals.js
public/js/render/modals/share-modals.js
public/js/render/modals/preview-editor.js
public/js/render/modals/confirmations.js
public/js/render/modals/admin-modals.js
```

保留 `createModalRenderers()` 作为外部入口。`modal.js` 可以先变成兼容导出文件，内部转发到 `modals/index.js`，这样 `public/index.js` 不需要改动或只做极小改动。

验收标准：

- `createModalRenderers()` 的调用方式不变。
- `tests/frontend.test.mjs` 中 modal 相关断言通过。
- `npm test`、`npm run lint` 通过。
- 视觉行为不变，尤其是预览编辑、分享弹窗、回收站恢复冲突弹窗。

### 第二阶段：拆 `admin.js` thunk

`public/js/state/thunks/admin.js` 适合按后台 Tab 或功能域拆分。

建议结构：

```text
public/js/state/thunks/admin.js
public/js/state/thunks/admin/index.js
public/js/state/thunks/admin/stats.js
public/js/state/thunks/admin/logs.js
public/js/state/thunks/admin/storage.js
public/js/state/thunks/admin/shares.js
public/js/state/thunks/admin/notifications.js
public/js/state/thunks/admin/webhooks.js
public/js/state/thunks/admin/tasks.js
public/js/state/thunks/admin/health.js
```

拆分时保持 `createAdminThunks(deps, context)` 这个出口不变。各子模块返回局部 thunk 对象，由 `admin/index.js` 合并。

验收标准：

- `createThunks()` 不需要知道 admin 内部拆分。
- 后台 Tab 数据加载逻辑保持不变。
- `tests/thunks.test.mjs` 和后台相关 `tests/frontend.test.mjs` 断言通过。
- Webhook 测试失败详情、通知轮询、维护任务 busy 状态不回退。

### 第三阶段：拆 `trash.js`

`functions/api/lib/trash.js` 涉及数据库、R2、文件索引和冲突策略，拆分时要更谨慎。

建议结构：

```text
functions/api/lib/trash.js
functions/api/lib/trash/index.js
functions/api/lib/trash/list.js
functions/api/lib/trash/restore.js
functions/api/lib/trash/delete.js
functions/api/lib/trash/retention.js
functions/api/lib/trash/helpers.js
```

优先抽出 helper，例如冲突命名、trash id 处理、条目归组、响应格式化。之后再移动具体 handler。

验收标准：

- `functions/api/lib/router.js` 的 import 可以保持不变，或只从新的 `trash/index.js` 导入同名 handler。
- 回收站列表、恢复预览、批量恢复、彻底删除、清空和保留期清理测试全部通过。
- 特别关注去重对象引用计数、逻辑引用、文件夹恢复和部分失败结果。

### 第四阶段：拆 `shares.js`

`functions/api/lib/shares.js` 同时承担管理端和公开访问逻辑，建议最后拆。

建议结构：

```text
functions/api/lib/shares.js
functions/api/lib/shares/index.js
functions/api/lib/shares/admin.js
functions/api/lib/shares/public.js
functions/api/lib/shares/password.js
functions/api/lib/shares/expiry.js
functions/api/lib/shares/helpers.js
```

拆分重点是明确管理端写操作和公开访问读取逻辑的边界。

验收标准：

- `handleAdminShares()` 和 `handlePublicShare()` 外部导出保持兼容。
- 分享创建、文件夹分享浏览、密码分享、过期保留、重新启用和过期通知测试通过。
- 公开分享路径不能绕过隐藏路径、受保护路径或分享权限。

## 每次拆分建议流程

1. 先记录当前文件导出的函数和被哪些模块引用。
2. 抽出无副作用 helper，保持原文件导出不变。
3. 抽出单一业务域，运行局部测试。
4. 把原文件改成薄入口，统一 re-export 或组合导出。
5. 运行 `npm run lint`、`npm test`、必要时运行 `npm run build`。
6. 如果改到浏览器交互，补跑 Playwright 或至少 mock 模式手动检查。

## 测试建议

| 改动范围 | 最小验证 |
| --- | --- |
| `modal.js` 拆分 | `npm run lint`、`npm test` |
| `admin.js` thunk 拆分 | `npm run lint`、`npm test`，重点看 `tests/thunks.test.mjs` |
| `trash.js` 拆分 | `npm test`，重点看回收站、去重、批量操作测试 |
| `shares.js` 拆分 | `npm test`，重点看分享、密码、过期、文件夹分享测试 |
| 样式或实际页面结构变化 | `npm run build`、`npm run test:browser` |

## 建议里程碑

### Milestone 1

拆分 `modal.js`，把弹窗渲染按功能域移动到 `public/js/render/modals/`。这是收益最快、风险较低的一步。

### Milestone 2

拆分 `admin.js` thunk，让后台统计、通知、Webhook、任务、维护等流程各自成模块。目标是让新增后台 Tab 不再扩大单个 thunk 文件。

### Milestone 3

拆分 `trash.js`，先抽 helper，再拆 handler。目标是让恢复、删除、清理三类流程彼此独立。

### Milestone 4

拆分 `shares.js`，区分管理端和公开访问逻辑。目标是让权限、过期、密码和公开浏览边界更容易审查。

## 预期结果

完成后，大文件会变成少量稳定入口加多个 100 到 250 行左右的小模块。维护者可以根据功能直接进入对应文件，新功能也更容易落在正确位置。项目仍然保持当前轻量架构，不需要引入新的前端框架或状态库。
