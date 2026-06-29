# O-Drive 项目优化审查

> 记录时间：2026-06-29

## 当前结论

项目整体状态良好，核心检查均通过：

- `npm run lint` 通过
- `npm test` 通过，178 个用例通过，1 个跳过
- `npm run build` 通过
- `npm run format:check` 通过

需要优先处理的是浏览器测试老化、后台组件重复绑定事件、前端资源拆分和少量交付层配置清理。

## 优先级建议

### P1：修复后台浏览器测试断言

状态：已完成。

位置：

- `tests/browser/admin-flow.spec.mjs`
- `public/js/render/pages/admin/overview.js`

现象：

后台 Playwright 用例仍等待“后台概览”，但当前页面实际标题是“系统概览”，导致 3 个后台 mock 流程超时失败。

建议：

- 将测试断言同步为当前真实文案“系统概览”
- 或改用更稳定的语义定位，例如 tab、section、data 属性
- 避免用会频繁调整的展示文案作为唯一等待条件

处理记录：

- 已将 `tests/browser/admin-flow.spec.mjs` 中 3 处等待文案从“后台概览”更新为“系统概览”
- 已将后台 Tab 切换从文案按钮定位改为 `[data-tab]` 定位
- 已将维护、健康、分享列表断言改为稳定结构定位，减少文案变更导致的测试老化

### P1：避免后台组件重复绑定 root click

状态：已完成。

位置：

- `public/js/render/pages/admin/components.js`
- `public/index.js`

现象：

`bindCustomSelects(root)` 和 `bindCustomDatePickers(root)` 会在后台页每次 render 后执行。单个控件已有 `_bound` 防重复，但 root 上的 `click` 监听没有防重复：

- `components.js` 中自定义下拉的 root click
- `components.js` 中日期选择器的 root click

建议：

- 给 root 添加独立标记，例如 `_cselectRootBound`、`_cdateRootBound`
- 或把关闭逻辑迁移到统一事件委托层
- 补一个轻量前端测试，验证多次绑定后不会重复触发

处理记录：

- 已在 `bindCustomSelects(root)` 中增加 `_cselectRootBound` 标记，避免重复注册 root click
- 已在 `bindCustomDatePickers(root)` 中增加 `_cdateRootBound` 标记，避免重复注册 root click
- 保留单个控件的 `_bound` 防重复逻辑，改动范围限定在事件绑定层

### P2：拆分 CSS 资源

状态：已完成。

位置：

- `public/style.css`
- `public/main.css`
- `public/css/pages/admin.css`
- `public/index.html`
- `public/admin.html`
- `public/share.html`

原现象：

当前所有页面都加载同一个 `main.css`。其中后台样式源文件 `admin.css` 约 88KB，首页和分享页也会带上后台页面样式。

建议：

- 拆成公共样式和页面样式：
  - `main.css`：tokens、base、components、layout、responsive
  - `explorer.css`：首页文件管理
  - `admin.css`：后台
  - `share.css`：分享页
- 调整 HTML 按页面加载对应 CSS
- 更新构建脚本，分别生成压缩产物

处理记录：

- 已将 `public/style.css` 调整为公共样式入口
- 已新增 `public/style.explorer.css`、`public/style.admin.css`、`public/style.share.css`
- 已更新 `npm run build`，生成 `public/main.css`、`public/explorer.css`、`public/admin.css`、`public/share.css`
- 已更新 `public/index.html`、`public/admin.html`、`public/share.html`，按页面加载对应 CSS
- 构建后体积：`main.css` 约 26KB，`explorer.css` 约 23KB，`admin.css` 约 65KB，`share.css` 约 8KB

### P2：暂不启用 service worker，建议删除或标注为未启用

状态：已完成。

位置：

- `public/sw.js`
- `public/_headers`

现象：

仓库里存在 `public/sw.js`，但项目内未发现注册逻辑。当前缓存策略文件处于闲置状态。

建议：

- 当前阶段不建议启用 service worker
- O-Drive 是文件管理器，文件列表、分享权限、缩略图、受保护路径都比较敏感，缓存策略不严谨时容易造成旧图、旧权限、旧资源版本残留
- 优先方案：删除 `public/sw.js`，并同步清理相关说明
- 保守方案：保留文件但在文档中明确标注“预留未启用”
- 同步清理 `_headers` 中旧路径规则，例如不存在的 `/js/api.js`、`/upload-worker.js`、`/css/admin/admin.css`

如果后续确实需要启用缓存能力，建议只做非常保守的版本：

- 只缓存静态图标，例如 `/icons/*`、`/favicon.svg`
- 暂时不要缓存 `/api/thumbnail/*`
- 每次发布时更新 cache version，例如 `o-drive-v2`
- `activate` 阶段清理旧缓存
- 在入口显式注册，并静默处理注册失败

处理记录：

- 已删除未注册的 `public/sw.js`
- 已从 `public/_headers` 移除旧路径规则：`/css/admin/admin.css`、`/js/api.js`、`/upload-worker.js`

### P2：统一 zip 下载 API 封装

状态：已完成。

位置：

- `public/js/state/thunks/explorer.js`
- `public/js/api/index.js`

现象：

`batchDownloadZip()` 直接调用 `fetch("/api/zip-download")`，绕过了 API layer。原因是该接口既可能返回 `202 JSON`，也可能返回 `blob`。

建议：

- 在 API layer 增加适合下载场景的封装，例如 `apiClient.blob()` 或 `fileApi.downloadZipResponse()`
- thunk 只保留业务分支、toast 和浏览器下载动作
- 保持 CSRF、credentials、错误解析逻辑集中

处理记录：

- 已新增 `apiClient.raw()`，用于需要保留原始 `Response` 的接口
- 已新增 `fileApi.downloadZipResponse(paths)`，统一处理 zip 下载请求的 JSON body、CSRF 和 credentials
- 已将 `batchDownloadZip()` 中的直接 `fetch("/api/zip-download")` 改为调用 API layer

### P3：更新 Browserslist 数据

状态：未完成，需要联网环境或用户明确批准后执行。

现象：

`npm run build` 提示 `caniuse-lite is outdated`。

建议：

- 在可联网环境执行官方更新命令
- 更新后提交 `package-lock.json`

处理记录：

- 已尝试执行 `npx update-browserslist-db@latest`
- 该命令需要访问 npm registry，当前环境的网络审批被系统拒绝，未修改 `package-lock.json`

## 验证记录

本轮优化后已执行：

```bash
npm run lint
npm test
npm run build
npm run format:check
```

结果：

- lint、单元测试、构建、格式检查均通过
- `npm test` 结果：178 个通过，1 个跳过
- `npm run build` 仍提示 Browserslist 数据过期，P3 因联网审批受限未执行
- `npm run test:browser` 中 4 个用例均显示通过，但 Playwright 命令在当前环境收尾阶段未退出并被超时截断
- 已用自控 Playwright smoke 验证：首页 mock、后台概览、系统维护动作、分享列表和页面级 CSS 加载均正常

## 建议处理顺序

1. 修复 `tests/browser/admin-flow.spec.mjs` 的老化断言，并重新跑 `npm run test:browser`
2. 修复 `components.js` 的 root click 重复绑定问题
3. 清理 `_headers` 旧路径和确认 `sw.js` 去留
4. 评估 CSS 拆分方案，分阶段改构建脚本和 HTML 引用
5. 抽象 zip 下载 API 封装，减少 thunk 中的底层请求细节
6. 在可联网环境更新 Browserslist 数据
