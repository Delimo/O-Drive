# O-Drive 实施路线

## 目标

在不改变现有技术栈的前提下，逐步降低入口文件复杂度、收敛后端路由和权限规则，并补强高风险路径的自动化验证。

## 当前约束

- 项目不是 React/CRA 应用，不局部引入 React、Ant Design 或 Redux Toolkit。
- 前端继续沿用原生 ES Module、字符串模板渲染、自研 store/slice/thunk 和事件委托。
- 新功能优先按 `api -> slice -> thunk -> render -> events -> tests` 的顺序接入。
- 修改源 CSS 后必须运行构建，不能只改构建产物。
- 保持现有 Cloudflare Pages + Functions 部署形态。

## 状态说明

- `[x]` 已完成并通过校验。
- `[~]` 已开始，后续还要继续拆分或补测试。
- `[ ]` 尚未开始。
- `[hold]` 暂缓，等待确认或不适合当前阶段处理。

## 阶段 1：前端入口瘦身

- [x] 将 `public/index.js` 中的 header 渲染拆到 `public/js/render/header.js`。
- [x] 将通知轮询拆到 `public/js/services/notifications.js`。
- [x] 保留 `public/index.js` 的依赖装配、区域调度和启动职责。
- [x] 为 header 渲染、管理员/访客状态、通知轮询暂停恢复补前端测试。

验收标准：

- [x] `public/index.js` 不再直接包含 header HTML 模板。
- [x] 通知轮询可以独立启动、暂停、恢复和停止。
- [x] `node --test tests/frontend.test.mjs` 通过。

## 阶段 2：API 入口策略元数据化

- [x] 新增 `functions/api/lib/route-policy.js`。
- [x] 将 CSRF 写路由规则从 `functions/api/[[path]].js` 抽到 route policy。
- [x] 将全局限流跳过规则抽到 route policy。
- [x] 将大体积上传 body 判定抽到 route policy。
- [x] 将下载、预览、缩略图的受保护目录访问检查抽到 route policy。
- [x] 将登录、登出、公开分享、认证角色查询等入口特殊分支标记到 route policy。
- [x] 将请求方法 body 判定抽到 route policy。
- [x] 将认证失败响应和角色响应封装为明确的入口处理器。
- [x] 为 route policy 补核心测试。

后续可继续：

- [hold] 复查 CSRF 规则与 `router.js` 分发表是否还能进一步合并来源。当前保持分离，避免把安全策略和 handler 分发耦合在同一个结构里。

验收标准：

- [x] `functions/api/[[path]].js` 不再维护 CSRF 前缀数组。
- [x] 入口文件只消费 route policy，不再散落文件访问策略判断。
- [x] `tests/core.test.mjs` 覆盖 CSRF、限流、上传 body、保护路径和特殊入口。

## 阶段 3：后端路由分发表

- [x] 在 `functions/api/lib/router.js` 新增 `ADMIN_ROUTE_DISPATCHERS`。
- [x] 在 `functions/api/lib/router.js` 新增 `PUBLIC_ROUTE_DISPATCHERS`。
- [x] 将简单 admin 精确路由迁入分发表。
- [x] 将 public 的 `zip-download`、`access/unlock`、`search` 迁入分发表。
- [x] 将 trash、上传检查、分片创建/取消、文本保存、文件列表、缩略图等简单路由迁入分发表。
- [x] 将 paste、rename、batch delete、trash delete、mkdir、单文件上传、multipart part/complete 等带 webhook 或 body 检查的 admin 路由提取为包装函数并迁入分发表。
- [x] 将 download/preview 的阻断检查、流式响应和下载突增监控包装后迁入 public 分发表。
- [x] 为分发表元数据补核心测试。

复杂路由迁移状态：

- [x] `/api/paste`：成功后按 copy/move 发送 webhook。
- [x] `/api/files/*` 的 `PUT`：重命名成功后发送 webhook。
- [x] `/api/batch-delete`：删除成功后发送 webhook。
- [x] `/api/trash/delete`：永久删除成功后读取响应数据并发送 purge webhook。
- [x] `/api/mkdir*`：创建成功后读取响应数据并发送 webhook。
- [x] `/api/files*` 的 `POST`：上传成功后读取响应数据并发送 webhook。
- [x] `/api/upload-multipart/part`：需要大体积 body 检查和分片处理。
- [x] `/api/upload-multipart/complete`：完成成功后发送上传 webhook。
- [x] `/api/download/*` 和 `/api/preview/*`：下载前检查阻断规则，下载成功后监控突增并异步通知。

后续可继续：

- [hold] 评估是否把分发表数组拆成独立 `router-routes.js`，让 `router.js` 只保留包装函数和 resolve 函数。当前文件规模仍可控，等下一轮重构再拆更稳。
- [hold] 为分发表匹配函数补更独立的单元测试。当前通过元数据测试和 route smoke 测试覆盖，暂不导出内部 matcher。
- [hold] 复查没有方法限制的历史路由，例如 `/api/batch-delete`，决定是否保持兼容或收紧到 `POST`。这会改变 API 行为，需要单独确认。

验收标准：

- [x] `resolveAdminRoute` 通过分发表处理 admin 路由。
- [x] `resolvePublicRoute` 通过分发表处理 public 路由。
- [x] 简单路由可以通过分发表一眼看到路径、方法和处理器。
- [x] 复杂副作用路由通过命名包装函数保留可读性。

## 阶段 4：测试补强

- [x] 前端 header 渲染和通知轮询已补 `tests/frontend.test.mjs`。
- [x] route policy 已补 `tests/core.test.mjs`。
- [x] router dispatcher 元数据已补 `tests/core.test.mjs`。
- [x] 复杂 webhook 路由已有核心行为测试覆盖，并随分发表迁移复跑通过。
- [x] 下载突增监控已有核心行为测试覆盖，并随分发表迁移复跑通过。
- [x] 为下载/预览保护路径补更聚焦的 route-level 测试。
- [hold] 涉及真实页面流程时补 Playwright 或现有 live check 脚本。本轮主要是后端路由重构，没有新增真实页面流程。

每轮校验命令：

- `node --test tests/core.test.mjs`
- `npm run lint`
- `npm test`
- `npm run format:check`
- `npm run build`

## 阶段 5：收尾和提交前检查

- [hold] 确认 `docs/optimization-review.md` 的删除是否保留。该删除在本轮工作前已经存在，当前未处理。
- [x] 查看 `git status` 和 `git diff --stat`，识别当前工作区改动范围。
- [x] 再跑一次完整校验命令。
- [x] 整理提交说明草稿，按阶段描述前端拆分、route policy、router dispatcher 和测试变更。

提交说明草稿：

- 拆分首页 header 渲染和通知轮询服务。
- 新增 API route policy，集中 CSRF、限流、body、保护路径和特殊入口策略。
- 将 admin/public API 路由迁移为分发表，并用包装函数保留 webhook、上传和下载监控副作用。
- 补充 route policy、dispatcher、保护路径下载/预览和前端渲染相关测试。
- 更新实施路线文档和阶段验收状态。

## 当前进度摘要

- 第一阶段已完成。
- 第二阶段主体已完成，剩余是进一步清理入口细节和规则来源合并。
- 第三阶段主体已完成，简单路由和复杂带副作用路由都已迁入分发表。
- 第四阶段持续进行，当前测试覆盖能保护已完成迁移。
- 第五阶段已完成可在本轮内处理的检查；`docs/optimization-review.md` 删除状态仍需确认。
