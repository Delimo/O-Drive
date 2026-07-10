# O-Drive 代码审计发现

> 记录时间：2026-07-10。本文档来自一次整体代码评审（文档核对 + 关键链路代码抽查），按当前代码库逐项核实。
> 按 docs 治理约定，本清单属于阶段性过程文档：条目修复并验证后，把仍有价值的结论合并进 `maintenance-handoff.md` 或对应主题文档，然后删除本文件。

## 当前结论

项目整体质量高：架构分层有测试守护、鉴权与 SSRF 防护完整、测试与文档投入扎实。本次评审的核心新发现 IX1（索引级数据丢失隐患）及全部 MEDIUM 项已于 2026-07-10 修复并通过 `npm run check`（269 测试全绿），详见文末"已修复"章节。剩余为中低优先级维护债务。

| 优先级 | 发现 | 严重度 |
| --- | --- | --- |
| 1 | [TS1 分享页缺浏览器测试](#ts1-分享页缺浏览器测试low) | LOW |
| 2 | [BE2 全局限流每请求写一次 D1](#be2-全局限流每请求写一次-d1low) | LOW |
| 3 | [BE3 ACL 缓存 30 秒窗口未文档化](#be3-acl-缓存-30-秒窗口未文档化low) | LOW |
| 4 | [BE5 冷启动逐条执行建表语句](#be5-冷启动逐条执行建表语句low) | LOW |
| 5 | [FE3 无障碍缺系统性审计](#fe3-无障碍缺系统性审计low) | LOW |
| 6 | [FE6 admin 渲染 selector 元组需手工同步](#fe6-admin-渲染-selector-元组需手工同步low) | LOW |
| 7 | [FE7 explorer 状态存在重复字段](#fe7-explorer-状态存在重复字段low) | LOW |
| 8 | [FE8 点击事件广播式分发与重复监听器](#fe8-点击事件广播式分发与重复监听器low) | LOW |
| 9 | [FE10 CSP 阻断内联 onerror，缩略图回退失效](#fe10-csp-阻断内联-onerror缩略图回退失效low) | LOW |
| 10 | [RH1 仓库卫生与版本管理](#rh1-仓库卫生与版本管理low) | LOW（部分修复） |
| 11 | [RH2 lint 仅做语法检查](#rh2-lint-仅做语法检查low) | LOW |

---

## 当前仍待处理

### TS1 分享页缺浏览器测试｜LOW

- 位置：`tests/browser/`（当前只有 `admin-flow.spec.mjs` 和 `home-flow.spec.mjs`）。
- 现状：分享页是唯一面向外部访客的页面，包含密码解锁、文件夹浏览、ZIP 下载、过期/耗尽等多种状态，但没有 Playwright 覆盖。
- 建议：补 `share-flow.spec.mjs`，至少覆盖文件分享打开、密码解锁、文件夹目录浏览三条主路径。

### BE2 全局限流每请求写一次 D1｜LOW

- 位置：`functions/api/lib/rate-limiter.js`（`checkRateLimitD1`）。
- 现状：每个受限路由的请求都会对 `api_rate_limits` 做一次 upsert 写入。
- 影响：D1 免费层每天 10 万行写入额度，活跃实例下限流写入会成为额度大头，并给每个请求增加一次 D1 往返。
- 建议：对只读路由采样限流（如 1/N 请求才写）或放宽窗口粒度；保留写操作路由的严格限流。

### BE3 ACL 缓存 30 秒窗口未文档化｜LOW

- 位置：`functions/api/lib/request-context.js`、`functions/api/lib/protected-paths.js`（缓存 TTL 30 秒，每 isolate 独立）。
- 现状：隐藏路径和受保护路径规则按 isolate 缓存 30 秒，新增规则在其他 isolate 上最多延迟 30 秒生效。
- 影响：刚设置的路径保护存在短暂窗口期，属于可接受的设计取舍，但文档没有记录。
- 建议：在 README 访问控制章节或 `architecture.md` 中记录为已知行为。

### BE5 冷启动逐条执行建表语句｜LOW

- 位置：`functions/api/lib/schema.js`（`runSchemaStatements`、`ensureCoreTables`）。
- 现状：每个 isolate 首个请求会顺序 `await` 执行约 38 条 `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` 语句，每条一次 D1 往返。
- 影响：冷启动首请求额外增加几十次 D1 往返的延迟；表结构稳定后这些语句几乎总是空操作。
- 建议：用 `env.D1.batch()` 把语句合并为一次往返；或维护一个 schema 版本行，冷启动先读版本，一致则完全跳过建表。

### FE3 无障碍缺系统性审计｜LOW

- 位置：`public/js/render/*`（现有约 70 处 `aria-*`/`role` 属性）。
- 现状：有基线但没有系统性验证：弹窗焦点陷阱、文件网格键盘导航、toast 的 `aria-live`、自定义下拉的键盘操作等未确认。
- 建议：做一次键盘走查 + 屏幕阅读器抽查，按结果补齐。

### FE6 admin 渲染 selector 元组需手工同步｜LOW

- 位置：`public/index.js` 的 `selectAdminRenderState()`。
- 现状：后台每个 Tab 的重渲触发字段是约 90 行手工维护的元组列表。给 admin slice 新增字段但忘记加进对应 Tab 的元组时，UI 会静默不更新——这类 bug 没有报错、难以定位。
- 影响：手写 selector 的经典维护陷阱，随 Tab 和字段增长风险上升。
- 建议：把每个 Tab 的字段列表与 Tab 渲染器放在同一文件并一起 review；或在 `tests/architecture.test.mjs` 里加一致性检查（Tab 渲染器引用的 `admin.xxx` 字段必须出现在对应元组中）。

### FE7 explorer 状态存在重复字段｜LOW

- 位置：`public/js/state/slices/explorer-slice.js`。
- 现状：`filter` 与 `filterKind` 并存、`sort` 与 `sortField`/`sortDir` 并存，语义相近但用途不同（旧版快捷筛选/排序 vs 搜索筛选器/列表排序），没有注释说明差异。
- 影响：新维护者容易改错字段或漏改一处。
- 建议：合并或改名以显式区分（如 `quickFilter` vs `searchFilterKind`），至少补注释。

### FE8 点击事件广播式分发与重复监听器｜LOW

- 位置：`public/js/events/index.js`。
- 现状：每次点击顺序调用 `fileActions/adminActions/uploadActions/navigationActions` 四个处理器各自匹配 action 名，模块间 action 名不冲突只靠约定；`cselect-change` 注册了两个独立监听器（一个处理带 `actionChange` 的分支，一个处理 quota-unit 特例）；`data-action2` 的映射表硬编码在点击监听器内部。
- 影响：无正确性问题，属可维护性债务：action 名冲突不会被发现，事件接线分散。
- 建议：改为中央 action → handler 注册表（注册时检测重名冲突），合并 `cselect-change` 监听器，把 `action2` 映射并入注册表。

### FE10 CSP 阻断内联 onerror，缩略图回退失效｜LOW

- 位置：`public/js/render/shared.js`（文件卡片和详情面板的 `<img ... onerror="...">`）；`public/_headers` 的 CSP。
- 现状：CSP 为 `script-src 'self'`，不含 `unsafe-inline`/`unsafe-hashes`，浏览器会拒绝执行 HTML 属性里的内联事件处理器。`shared.js` 有两处用内联 `onerror` 把加载失败的缩略图回退到文件类型图标，这段逻辑在带 CSP 的生产环境中静默失效。
- 影响：缩略图加载失败时显示浏览器破图占位而不是类型图标；同时这是项目里仅存的内联事件处理器，违反自身"不写内联事件"的约定。
- 建议：删除内联 `onerror`，在事件层用 capture 阶段的 `error` 事件委托统一处理（`error` 不冒泡，必须用捕获），失败时把 `img` 替换为对应类型图标。

### RH1 仓库卫生与版本管理｜LOW（部分修复）

- 位置：仓库根目录、git 历史。
- 现状：`debug.log` 已删除并加入 `.gitignore`（2026-07-10）。仍待改进：提交信息全部为 "new"，无法 bisect、blame 或生成 changelog；`package.json` 版本 2.1.0 但没有 tag 和 CHANGELOG。
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
- Webhook 出站 SSRF 防护：强制 HTTPS、拒绝 IP 目标、阻断私网地址和跨主机跳转、可选主机白名单。
- 后端主入口分层：`functions/api/[[path]].js` 仅承担横切职责，声明式路由策略，500 错误细节对非管理员隐藏。
- 前端渲染：细粒度 selector 订阅 + morphdom DOM diff，弹窗内容在整页重渲时被保留，未发现明显的焦点丢失结构；单选详情（`selectedKey`）只重渲详情抽屉，不触发文件网格重渲。
- 自研 store（`create-slice.js`）实现纯净且极小，带 thunk 和批量派发；`loadExplorer` 有 `loadSeq` 过期响应守卫，搜索输入有防抖，事件监听统一用 AbortController 清理。
- 分片上传服务：sha256 秒传检查、localStorage 进度持久化支持跨会话续传、过期 upload 主动 abort、worker 池并发、暂停/取消信号，工程质量高。
- 前端全链路依赖注入（`fetchImpl`/`documentRef`/`windowRef` 等），使 1800+ 行前端测试和 thunk 测试可在 Node 直接运行；Markdown 渲染先转义再解析并拦截危险链接，且有对应 XSS 测试。
- `public/_headers` 的安全响应头完备：严格 CSP（`script-src 'self'`）、HSTS、nosniff、Permissions-Policy、frame-ancestors 拒绝嵌入（但见 FE10 的内联 onerror 冲突）。
- 缩略图链路健康：Cloudflare Image Resizing + R2 结果缓存 + CDN 缓存头 + `loading="lazy"` 懒加载；下载支持 Range 断点续传（206/416 处理正确）。
- 后台 Tab 数据有"为空才加载"的缓存策略，切换 Tab 不会重复拉取，手动刷新按钮另行提供。
- `escapeHtml` 在 render 层使用密度高且实现正确（FE2 是"缺强制"而非"缺使用"）。
- 搜索采用游标分页，单页上限受控。
- 测试夹具 `tests/helpers/make-env.mjs` 对 R2/D1 的模拟质量高，竞态类回归测试（上传改名、multipart 去重）真实有效。

---

## 已修复（2026-07-10，`npm run check` 269 测试全绿）

| 条目 | 修复内容 |
| --- | --- |
| IX1（HIGH） | `rebuildFileIndex()` 改为非破坏性同步：不再 `DELETE FROM file_index`，只 upsert 路径命名对象，并仅清理"object_key 为路径式且 R2 已不存在"的死行（扫描截断时跳过清理）。上传（普通/legacy/multipart 去重）写入 R2 `customMetadata.originalPath` 保留灾备线索。补回归测试：去重上传 → rebuild → 断言索引仍在。 |
| OP1 | README 运维建议新增"数据备份与灾备"章节：`wrangler d1 export` 定期备份、D1 Time Travel 恢复、并说明重建索引已是非破坏性但不能替代备份。 |
| OP2 | 后台系统健康页的"Token密钥"项现区分三种状态：未配置（提示正在用管理员密码签名及其后果）、长度不足 32、正常。 |
| OP3 | 新增 `.github/workflows/ci.yml`：push/PR 时 `npm ci && npm run check`。 |
| FE1 | 构建新增 `scripts/stamp-asset-version.mjs`：按全部前端资源内容 hash 给三个 HTML 的 css/js 引用打 `?v=<hash>`。注意：ES module 的嵌套 import 不携带版本参数，深层模块仍依赖 1 小时 `must-revalidate`；彻底解决需打包（见 RH2/esbuild）。 |
| FE2 | `tests/architecture.test.mjs` 新增守护测试：扫描 render 层模板插值中的纯属性链表达式，未转义即失败；存量 12 处命中均核实为安全并登记白名单。 |
| FE4 | 目录浏览窗口化渲染：一次最多渲染 500 项 + "显示更多"按钮（`displayLimit`，导航/加载时重置）。单次 morphdom diff 有了上界，勾选卡顿随之缓解。服务端分页未做（列表是 R2+D1 双源合并，改造收益低）。 |
| BE4 | preview/download 响应新增 `ETag`（去重对象直接用 object_key 内嵌 sha256，其余用 key+size+uploaded）、`Cache-Control: private, max-age=3600, must-revalidate`，非 Range 请求命中 `If-None-Match` 返回 304。补回归测试。 |
| FE9 | 新增 `public/js/vendor/sha256.js`（增量 SHA-256，FIPS 180-4）：超过 64MB 的文件分块（8MB/块）流式哈希，内存占用恒定；小文件仍走原生 `crypto.subtle`。补 Node crypto 对照测试（含分块不变性）。 |
| BE1 | `adjustStorageObjectRef`/`deleteStorageObjectRecord` 的 catch 补 `console.warn`，引用计数漂移不再无声。 |
| SE1 | 登录用户名/密码比较不再 `&&` 短路，两个 `timingSafeEqual` 都执行完再合并。 |
| FE5 | 搜索防抖回调内实时读取 `store.getState().explorer.path`，防抖窗口内切目录不再把 URL 同步到旧路径。 |
| RH1（部分） | `debug.log` 删除并加入 `.gitignore`。 |

---

## 处理约定

- 修复顺序按上方优先级表执行。
- 每修复一项：补对应回归测试 → 运行 `npm run check` → 在本文件中把该项移入"已修复"备注或直接删除条目。
- 全部处理完后，把仍有维护价值的结论（如 ACL 缓存行为、备份流程）合并进 `maintenance-handoff.md` 或对应主题文档，然后删除本文件并更新 `docs/README.md` 索引。
