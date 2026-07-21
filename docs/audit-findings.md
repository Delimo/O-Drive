# O-Drive 代码审计发现

> 记录时间：2026-07-10。本文档来自一次整体代码评审（文档核对 + 关键链路代码抽查），按当前代码库逐项核实。
> 按 docs 治理约定，本清单属于阶段性过程文档：条目修复并验证后，把仍有价值的结论合并进 `maintenance-handoff.md` 或对应主题文档，然后删除本文件。

## 当前结论

项目整体质量高：架构分层有测试守护、鉴权与 Webhook 出站目标校验较完整、测试与文档投入扎实。截至 2026-07-21，IX1、全部 MEDIUM 项及大部分 LOW 项已经修复；`npm run check` 通过，277 个测试全绿。当前只剩无障碍人工抽查、版本管理习惯和静态分析工具三项低优先级维护债务。

| 优先级 | 发现 | 严重度 |
| --- | --- | --- |
| 1 | [FE3 无障碍仍缺人工审计](#fe3-无障碍仍缺人工审计low) | LOW（部分修复） |
| 2 | [RH1 仓库卫生与版本管理](#rh1-仓库卫生与版本管理low) | LOW（部分修复） |
| 3 | [RH2 lint 仅做语法检查](#rh2-lint-仅做语法检查low) | LOW |

---

## 当前仍待处理

### FE3 无障碍仍缺人工审计｜LOW（部分修复）

- 位置：`public/js/render/*`（现有约 70 处 `aria-*`/`role` 属性）。
- 已完成：弹窗焦点进入、焦点陷阱、Escape 关闭和焦点恢复；自定义下拉的 ARIA 与完整键盘操作；toast live region；按钮类型规范化；图片替代文本架构检查。
- 仍待处理：使用真实屏幕阅读器做人工抽查，并在网络条件允许时按最新版 Web Interface Guidelines 再复核一次。

### RH1 仓库卫生与版本管理｜LOW（部分修复）

- 位置：仓库根目录、git 历史。
- 现状：`debug.log` 已删除并加入 `.gitignore`，根目录已补 `CHANGELOG.md`。仍待改进：近期提交信息普遍缺少可追踪语义；`package.json` 版本 2.1.0 仍没有对应 Git tag。
- 建议：从现在开始写有意义的提交信息（一行中文描述即可）；发版时打 tag。

### RH2 lint 仅做语法检查｜LOW

- 位置：`scripts/check-js-syntax.mjs`（`npm run lint`）。
- 现状：lint 只是对 JS 文件跑 `node --check` 式的语法校验，不做任何静态分析；未使用变量、未定义引用、可疑比较等问题都发现不了。
- 影响：无框架、无类型的代码库本来就更依赖静态检查兜底，目前这层防线基本缺席。
- 建议：引入 ESLint（recommended 规则集即可，零依赖负担在 devDependencies）；更进一步可用 JSDoc 注释 + `tsc --noEmit --checkJs` 做渐进式类型检查，不迁移 TypeScript 也能获得类型安全。与 OP3 的 CI 配合执行。

---

## 需要维护决策

- **界面语言**：全部界面文案为中文，决定了受众边界。若只面向中文用户则无需处理；若希望更广采用，需要规划文案抽离。
- **README 缺截图**：对 UI 产品而言截图/GIF 是最低成本的采用率杠杆，是否补充取决于项目定位（个人使用 vs 开源推广）。

---

## 本次评审核实过无问题的点

以下链路本次抽查过，当前实现是健康的，后续审计可以降低优先级：

- 鉴权栈：HMAC 签名会话 token、HTTPS 下 `__Host-` cookie 前缀、`HttpOnly; SameSite=Strict`、CSRF 常量时间比较、IP 硬锁 + 账号软降速双维度防爆破。
- Webhook 出站目标校验：强制 HTTPS、拒绝 IP 目标、阻断显式私网地址和跨主机跳转、可选主机白名单。Workers 无 DNS 解析接口，无法在请求前发现域名 DNS rebinding 到私网地址，代码中已明确记录这一平台限制。
- 后端主入口分层：`functions/api/[[path]].js` 仅承担横切职责，声明式路由策略，500 错误细节对非管理员隐藏。
- 前端渲染：细粒度 selector 订阅 + morphdom DOM diff，弹窗内容在整页重渲时被保留，未发现明显的焦点丢失结构；单选详情（`selectedKey`）只重渲详情抽屉，不触发文件网格重渲。
- 自研 store（`create-slice.js`）实现纯净且极小，带 thunk 和批量派发；`loadExplorer` 有 `loadSeq` 过期响应守卫，搜索输入有防抖，事件监听统一用 AbortController 清理。
- 分片上传服务：sha256 秒传检查、localStorage 进度持久化支持跨会话续传、过期 upload 主动 abort、worker 池并发、暂停/取消信号，工程质量高。
- 前端全链路依赖注入（`fetchImpl`/`documentRef`/`windowRef` 等），使 1800+ 行前端测试和 thunk 测试可在 Node 直接运行；Markdown 渲染先转义再解析并拦截危险链接，且有对应 XSS 测试。
- `public/_headers` 的安全响应头完备：严格 CSP（`script-src 'self'`）、HSTS、nosniff、Permissions-Policy、frame-ancestors 拒绝嵌入；渲染层已无 CSP 阻断的内联事件处理器。
- 缩略图链路健康：Cloudflare Image Resizing + R2 结果缓存 + CDN 缓存头 + `loading="lazy"` 懒加载；下载支持 Range 断点续传（206/416 处理正确）。
- 大部分后台 Tab 数据有"为空才加载"的缓存策略；日志 Tab 当前会在每次切入时刷新，手动刷新按钮另行提供。
- `escapeHtml` 在 render 层使用密度高且实现正确（FE2 是"缺强制"而非"缺使用"）。
- 搜索采用游标分页，单页上限受控。
- 测试夹具 `tests/helpers/make-env.mjs` 对 R2/D1 的模拟质量高，竞态类回归测试（上传改名、multipart 去重）真实有效。

---

## 已修复（截至 2026-07-21，`npm run check` 277 测试全绿）

| 条目 | 修复内容 |
| --- | --- |
| IX1（HIGH） | `rebuildFileIndex()` 改为非破坏性同步：不再 `DELETE FROM file_index`，只 upsert 路径命名对象，并仅清理"object_key 为路径式且 R2 已不存在"的死行（扫描截断时跳过清理）。上传（普通/legacy/multipart 去重）写入 R2 `customMetadata.originalPath` 保留灾备线索。补回归测试：去重上传 → rebuild → 断言索引仍在。 |
| OP1 | README 运维建议新增"数据备份与灾备"章节：`wrangler d1 export` 定期备份、D1 Time Travel 恢复、并说明重建索引已是非破坏性但不能替代备份。 |
| OP2 | 后台系统健康页的"Token密钥"项现区分三种状态：未配置（提示正在用管理员密码签名及其后果）、长度不足 32、正常。 |
| OP3 | 新增 `.github/workflows/ci.yml`：push/PR 时 `npm ci && npm run check`。 |
| FE1 | 构建新增 `scripts/stamp-asset-version.mjs`：按全部前端资源内容 hash 给三个 HTML 的 css/js 引用打 `?v=<hash>`。注意：ES module 的嵌套 import 不携带版本参数，深层模块仍依赖 1 小时 `must-revalidate`；彻底解决需打包（见 RH2/esbuild）。 |
| FE2 | `tests/architecture.test.mjs` 新增守护测试：扫描 render 层模板插值中的纯属性链表达式，未转义即失败；当前显式登记 4 处已核实的安全插值，其余由安全类型和常量规则覆盖。 |
| FE4 | 目录浏览窗口化渲染：一次最多渲染 500 项 + "显示更多"按钮（`displayLimit`，导航/加载时重置）。单次 morphdom diff 有了上界，勾选卡顿随之缓解。服务端分页未做（列表是 R2+D1 双源合并，改造收益低）。 |
| BE4 | preview/download 响应新增 `ETag`（去重对象直接用 object_key 内嵌 sha256，其余用 key+size+uploaded）、`Cache-Control: private, max-age=3600, must-revalidate`，非 Range 请求命中 `If-None-Match` 返回 304。补回归测试。 |
| FE9 | 新增 `public/js/vendor/sha256.js`（增量 SHA-256，FIPS 180-4）：超过 64MB 的文件分块（8MB/块）流式哈希，内存占用恒定；小文件仍走原生 `crypto.subtle`。补 Node crypto 对照测试（含分块不变性）。 |
| BE1 | `adjustStorageObjectRef`/`deleteStorageObjectRecord` 的 catch 补 `console.warn`，引用计数漂移不再无声。 |
| SE1 | 登录用户名/密码比较不再 `&&` 短路，两个 `timingSafeEqual` 都执行完再合并。 |
| FE5 | 搜索防抖回调内实时读取 `store.getState().explorer.path`，防抖窗口内切目录不再把 URL 同步到旧路径。 |
| BE3 | 已在 `architecture.md` 记录隐藏路径和受保护路径规则按 isolate 缓存 30 秒的已知一致性窗口。 |
| TS1 | 新增 `tests/browser/share-flow.spec.mjs`，覆盖公开文件分享、密码解锁和共享文件夹目录浏览，3 条 Playwright 用例通过。 |
| BE2 | GET/HEAD 路由保留逐请求内存限流，并按每 10 次请求采样写入 D1；写操作仍使用严格 D1 限流。 |
| BE5 | schema 初始化改用 `env.D1.batch()` 批量执行建表和索引语句，减少冷启动 D1 往返。 |
| FE6 | `selectAdminRenderState` 移入后台页面渲染模块，并用字段映射集中维护各 Tab 的订阅状态。 |
| FE7 | 为 Explorer 中语义相近但用途不同的筛选和排序字段补充明确注释。 |
| FE8 | 新增中央 `data-action` 注册表并检测重名，移除广播式四处理器调用，合并重复的 `cselect-change` 监听器。 |
| FE10 | 删除全部内联事件处理器；图片错误统一由 capture `error` 监听回退，hover 效果迁移到 CSS，并增加架构测试防回归。 |
| FE3（部分） | 补齐弹窗焦点管理、自定义下拉键盘操作、toast live region、按钮类型和图片替代文本检查；人工屏幕阅读器抽查仍待完成。 |
| RH1（部分） | 新增根目录 `CHANGELOG.md`；提交规范和 v2.1.0 Git tag 仍待执行。 |

---

## 处理约定

- 修复顺序按上方优先级表执行。
- 每修复一项：补对应回归测试 → 运行 `npm run check` → 在本文件中把该项移入"已修复"备注或直接删除条目。
- 全部处理完后，把仍有维护价值的结论（如 ACL 缓存行为、备份流程）合并进 `maintenance-handoff.md` 或对应主题文档，然后删除本文件并更新 `docs/README.md` 索引。
